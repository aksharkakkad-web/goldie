// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { TranscribeRequest, TranscribeResponse } from '@goldie/contracts';
import { z } from 'zod';
import { ApiError } from './errors';

export interface TranscriptionOptions {
    ffmpegBin?: string; whisperBin?: string; modelPath?: string;
    timeoutMs?: number; tempRoot?: string;
}
const MAX_AUDIO = 2 * 1024 * 1024;
const MAX_WAV = 1000000;
const MAX_RESULT = 65536;
function failure(code: string, message: string, retryable = false, status = 422): ApiError {
    return new ApiError(status, code, message, retryable);
}
function invalid(): ApiError { return failure('INVALID_RECORDING', 'Record valid WebM audio of at most 2 MiB, then send again.'); }

function decode(value: string): Buffer {
    if (typeof value !== 'string' || value.length > Math.ceil(MAX_AUDIO / 3) * 4
        || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) { throw invalid(); }
    const bytes = Buffer.from(value, 'base64');
    if (!bytes.length || bytes.length > MAX_AUDIO || bytes.toString('base64') !== value) { throw invalid(); }
    return bytes;
}

/** Inspect actual normalized PCM, never a renderer-supplied duration. */
function inspectWav(wav: Buffer): void {
    if (wav.length < 44 || wav.length > MAX_WAV || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') { throw invalid(); }
    let format = false;
    let samples: Buffer | undefined;
    for (let offset = 12; offset + 8 <= wav.length;) {
        const size = wav.readUInt32LE(offset + 4);
        const start = offset + 8;
        if (size > wav.length - start) { throw invalid(); }
        const id = wav.toString('ascii', offset, offset + 4);
        if (id === 'fmt ') {
            format = size >= 16 && wav.readUInt16LE(start) === 1 && wav.readUInt16LE(start + 2) === 1
                && wav.readUInt32LE(start + 4) === 16000 && wav.readUInt32LE(start + 8) === 32000
                && wav.readUInt16LE(start + 12) === 2 && wav.readUInt16LE(start + 14) === 16;
        }
        if (id === 'data') { if (samples) { throw invalid(); } samples = wav.subarray(start, start + size); }
        offset = start + size + (size % 2);
    }
    if (!format || !samples?.length || samples.length % 2) { throw invalid(); }
    if (samples.length / 32000 > 30) { throw failure('RECORDING_TOO_LONG', 'Recordings are limited to 30 seconds. Re-record a shorter question.'); }
    let energy = 0;
    for (let offset = 0; offset < samples.length; offset += 2) { energy += Math.pow(samples.readInt16LE(offset) / 32768, 2); }
    if (Math.sqrt(energy / (samples.length / 2)) < 0.0001) { throw failure('TRANSCRIPTION_EMPTY', 'No speech was detected. Re-record your question.'); }
}

/** No shell, inherited output, network input, automatic installation, or cloud service. */
function run(binary: string, args: string[], signal: AbortSignal, error: ApiError): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) { reject(error); return; }
        const child = spawn(binary, args, { shell: false, stdio: 'ignore', signal, killSignal: 'SIGKILL' });
        let spawnFailed = false;
        child.on('error', () => { spawnFailed = true; });
        // Wait for close (including after abort) so files are not removed under a running process.
        child.on('close', code => code === 0 && !spawnFailed && !signal.aborted ? resolve() : reject(error));
    });
}

interface CachedTranscript { fingerprint: string; token: string; expires: number; result: TranscribeResponse }
export class LocalTranscriber {
    private active?: { key: string; fingerprint: string; token: string; promise: Promise<TranscribeResponse> };
    private cache = new Map<string, CachedTranscript>();

    constructor(private options: TranscriptionOptions, private authorize: (sessionId: string, phaseId: string) => Promise<string>) { }

    async transcribe(request: TranscribeRequest): Promise<TranscribeResponse> {
        request = { ...request };
        const token = await this.authorize(request.sessionId, request.phaseId);
        const audio = decode(request.dataBase64);
        const key = JSON.stringify([request.sessionId, request.requestId]);
        const fingerprint = createHash('sha256').update(JSON.stringify([request.phaseId, request.mimeType])).update(audio).digest('hex');
        const now = Date.now();
        for (const [id, entry] of this.cache) { if (entry.expires <= now) { this.cache.delete(id); } }
        const cached = this.cache.get(key);
        if (cached && cached.fingerprint !== fingerprint) { throw failure('REQUEST_CONFLICT', 'This request ID was already used for different content.', false, 409); }
        if (cached && cached.token === token) { return { ...cached.result }; }
        if (this.active?.key === key) {
            if (this.active.fingerprint !== fingerprint) { throw failure('REQUEST_CONFLICT', 'This request ID was already used for different content.', false, 409); }
            if (this.active.token !== token) { throw failure('TRANSCRIPTION_STALE', 'The lesson changed. Re-record or resume.', true, 409); }
            return this.active.promise;
        }
        if (this.active) { throw failure('TRANSCRIPTION_BUSY', 'Local transcription is busy. Retry manually when it finishes.', true, 503); }
        if (request.mimeType !== 'audio/webm' || audio.subarray(0, 4).toString('hex') !== '1a45dfa3') { throw invalid(); }
        const promise = this.process(audio, request, token);
        this.active = { key, fingerprint, token, promise };
        try {
            const result = await promise;
            if (this.cache.size >= 100) { this.cache.delete(this.cache.keys().next().value!); }
            this.cache.set(key, { fingerprint, token, expires: Date.now() + 5 * 60 * 1000, result });
            return { ...result };
        } finally { this.active = undefined; }
    }

    private async process(audio: Buffer, request: TranscribeRequest, token: string): Promise<TranscribeResponse> {
        const controller = new AbortController();
        const timeout = Math.max(1, Math.min(30000, this.options.timeoutMs ?? 30000));
        const timer = setTimeout(() => controller.abort(), timeout);
        let directory: string | undefined;
        try {
            await this.dependencies();
            directory = await mkdtemp(join(this.options.tempRoot ?? tmpdir(), 'goldie-voice-'));
            const recording = join(directory, 'recording.webm');
            const wav = join(directory, 'normalized.wav');
            const prefix = join(directory, 'output');
            await writeFile(recording, audio, { mode: 0o600, flag: 'wx' });
            await run(this.options.ffmpegBin!, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file',
                '-i', recording, '-map', '0:a:0', '-vn', '-sn', '-dn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le',
                '-t', '31', '-fs', String(MAX_WAV), wav], controller.signal, invalid());
            if ((await stat(wav)).size > MAX_WAV) { throw invalid(); }
            inspectWav(await readFile(wav));
            await run(this.options.whisperBin!, ['-m', this.options.modelPath!, '-f', wav, '-l', 'en', '-nt', '-np', '-oj', '-of', prefix],
                controller.signal, failure('TRANSCRIPTION_FAILED', 'Local transcription failed. Re-record or retry manually.', true, 503));
            if ((await stat(`${prefix}.json`)).size > MAX_RESULT) { throw failure('TRANSCRIPTION_TOO_LONG', 'The transcript was too long. Re-record a shorter question.'); }
            const output = z.object({ transcription: z.array(z.object({ text: z.string() })).max(1000) }).parse(JSON.parse(await readFile(`${prefix}.json`, 'utf8')));
            const text = output.transcription.map(segment => segment.text).join(' ').replace(/\s+/g, ' ').trim();
            if (!text || /^(?:\[blank_audio\]|\[silence\]|\(silence\))$/i.test(text)) {
                throw failure('TRANSCRIPTION_EMPTY', 'No speech was recognized. Re-record your question.');
            }
            if (text.length > 1000) { throw failure('TRANSCRIPTION_TOO_LONG', 'The transcript was too long. Re-record a shorter question.'); }
            if (await this.authorize(request.sessionId, request.phaseId) !== token) {
                throw failure('TRANSCRIPTION_STALE', 'The lesson changed during transcription. Re-record or resume.', true, 409);
            }
            return { text };
        } catch (error) {
            if (controller.signal.aborted) { throw failure('TRANSCRIPTION_TIMEOUT', 'Local transcription timed out. Re-record a shorter question or resume.', true, 504); }
            if (error instanceof ApiError) { throw error; }
            if (error && typeof error === 'object' && 'code' in error && ['SESSION_CLOSED', 'PHASE_CONFLICT'].includes(String(error.code))) {
                throw failure('TRANSCRIPTION_STALE', 'The lesson changed during transcription. Re-record or resume.', true, 409);
            }
            throw failure('TRANSCRIPTION_FAILED', 'Local transcription failed. Check the configured local tools and retry manually.', true, 503);
        } finally {
            clearTimeout(timer);
            // The only removal target is the fresh directory owned by this job.
            if (directory) { await rm(directory, { recursive: true, force: true }); }
        }
    }

    private async dependencies(): Promise<void> {
        try {
            for (const binary of [this.options.ffmpegBin, this.options.whisperBin]) {
                if (!binary || !isAbsolute(binary) || !(await stat(binary)).isFile()) { throw new Error(); }
                await access(binary, constants.X_OK);
            }
            const model = this.options.modelPath;
            if (!model || !isAbsolute(model) || !(await stat(model)).isFile()) { throw new Error(); }
            await access(model, constants.R_OK);
        } catch {
            throw failure('TRANSCRIPTION_NOT_CONFIGURED', 'Configure local whisper.cpp v1.9.5, base.en and FFmpeg paths in the backend. No cloud fallback is used.', false, 503);
        }
    }
}
