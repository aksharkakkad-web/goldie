// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { expect } from 'chai';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { TranscribeRequest } from '@goldie/contracts';
import * as exported from '../src/app';

interface Transcriber { transcribe(request: TranscribeRequest): Promise<{ text: string }> }
interface Options { ffmpegBin?: string; whisperBin?: string; modelPath?: string; timeoutMs?: number; tempRoot?: string }
type Constructor = new (options: Options, authorize: (s: string, p: string) => Promise<string>) => Transcriber;
const execute = promisify(execFile);
async function errorCode(work: Promise<unknown>, code: string): Promise<void> {
    let caught: unknown; try { await work; } catch (error) { caught = error; }
    expect(caught).to.have.property('code', code);
    expect(JSON.stringify(caught)).not.to.match(/PRIVATE|recording.webm|output.json/);
}

describe('private local transcription', function (): void {
    this.timeout(10000);
    let directory: string;
    let options: Options;
    let audio: string;
    let token: string;
    function create(overrides: Options = {}): Transcriber {
        const constructor = (exported as unknown as Record<string, Constructor>).LocalTranscriber;
        expect(constructor, 'local transcriber exported for composition').not.to.equal(undefined);
        return new constructor({ ...options, ...overrides }, async (s, p) => {
            if (s !== 'accepted' || p !== 'active') { throw Object.assign(new Error('Not accepted'), { code: 'PHASE_CONFLICT' }); }
            return token;
        });
    }
    const input = (dataBase64: string, requestId = 'voice-1'): TranscribeRequest => ({
        sessionId: 'accepted', phaseId: 'active', requestId, mimeType: 'audio/webm', dataBase64
    });
    async function whisper(script: string): Promise<void> {
        await writeFile(options.whisperBin!, `#!${process.execPath}\n${script}`, { mode: 0o700 });
    }
    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'goldie-transcribe-test-'));
        options = { ffmpegBin: process.env.GOLDIE_FFMPEG_BIN ?? execFileSync('which', ['ffmpeg'], { encoding: 'utf8' }).trim(),
            whisperBin: join(directory, 'whisper'), modelPath: join(directory, 'model.bin'), tempRoot: directory };
        await writeFile(options.modelPath!, 'controlled local model');
        await whisper("const fs = require('node:fs'); const prefix = process.argv[process.argv.indexOf('-of') + 1]; "
            + "fs.writeFileSync(prefix + '.json', JSON.stringify({ transcription: [{ text: 'Why validate at the API?' }] }));");
        const filename = join(directory, 'fixture.webm');
        await execute(options.ffmpegBin!, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', '-c:a', 'libopus', filename]);
        audio = (await readFile(filename)).toString('base64'); token = 'stable';
    });
    afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
    it('normalizes locally, deduplicates matching intents briefly, rejects collisions and removes private job files', async () => {
        const transcriber = create();
        const [first, duplicate] = await Promise.all([transcriber.transcribe(input(audio)), transcriber.transcribe(input(audio))]);
        expect(first).to.deep.equal({ text: 'Why validate at the API?' });
        expect(duplicate).to.deep.equal(first);
        await whisper('process.exit(1);');
        expect(await transcriber.transcribe(input(audio))).to.deep.equal(first);
        await errorCode(transcriber.transcribe(input(audio + 'AAAA')), 'REQUEST_CONFLICT');
        await errorCode(transcriber.transcribe(input(Buffer.from('different').toString('base64'))), 'REQUEST_CONFLICT');
        expect((await readdir(directory)).filter(p => p.startsWith('goldie-voice-'))).to.deep.equal([]);
    });
    it('authorizes accepted active phase before invoking tools and rechecks before returning', async () => {
        const transcriber = create();
        await errorCode(transcriber.transcribe({ ...input(audio), sessionId: 'unknown' }), 'PHASE_CONFLICT');
        await whisper("const fs = require('node:fs'); setTimeout(() => { const prefix = process.argv[process.argv.indexOf('-of') + 1]; "
            + "fs.writeFileSync(prefix + '.json', JSON.stringify({ transcription: [{ text: 'late answer' }] })); }, 150);");
        const pending = transcriber.transcribe(input(audio));
        setTimeout(() => token = 'changed', 80);
        await errorCode(pending, 'TRANSCRIPTION_STALE');
    });
    it('bounds decoded size, rejects malformed media and measures overlong decoded audio', async () => {
        const transcriber = create();
        await errorCode(transcriber.transcribe(input(Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64'))), 'INVALID_RECORDING');
        await errorCode(transcriber.transcribe(input('not base64')), 'INVALID_RECORDING');
        await errorCode(transcriber.transcribe(input(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0]).toString('base64'))), 'INVALID_RECORDING');
        const filename = join(directory, 'long.webm');
        await execute(options.ffmpegBin!, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=31', '-c:a', 'libopus', filename]);
        await errorCode(transcriber.transcribe(input((await readFile(filename)).toString('base64'), 'long')), 'RECORDING_TOO_LONG');
    });
    it('validates a full-size upload without regex stack exhaustion and rejects decoded silence before recognition', async () => {
        const transcriber = create();
        const largest = Buffer.alloc(2 * 1024 * 1024);
        Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).copy(largest);
        await errorCode(transcriber.transcribe(input(largest.toString('base64'), 'largest')), 'INVALID_RECORDING');
        const silence = join(directory, 'silence.webm');
        await execute(options.ffmpegBin!, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '0.2', '-c:a', 'libopus', silence]);
        await errorCode(transcriber.transcribe(input((await readFile(silence)).toString('base64'), 'silence')), 'TRANSCRIPTION_EMPTY');
    });
    it('returns actionable errors for missing tools, silence, excessive output, failed processes and timeout; always cleans up', async () => {
        await errorCode(create({ whisperBin: '/PRIVATE/not-installed' }).transcribe(input(audio)), 'TRANSCRIPTION_NOT_CONFIGURED');
        await whisper("const fs = require('node:fs'); fs.writeFileSync(process.argv[process.argv.indexOf('-of') + 1] + '.json', JSON.stringify({ transcription: [] }));");
        await errorCode(create().transcribe(input(audio)), 'TRANSCRIPTION_EMPTY');
        await whisper("const fs = require('node:fs'); fs.writeFileSync(process.argv[process.argv.indexOf('-of') + 1] + '.json', "
            + "JSON.stringify({ transcription: [{text: 'x'.repeat(1001)}] }));");
        await errorCode(create().transcribe(input(audio)), 'TRANSCRIPTION_TOO_LONG');
        await whisper("process.stderr.write('PRIVATE subprocess text'); process.exit(1);");
        await errorCode(create().transcribe(input(audio)), 'TRANSCRIPTION_FAILED');
        await whisper('setTimeout(() => {}, 10000);');
        await errorCode(create({ timeoutMs: 100 }).transcribe(input(audio)), 'TRANSCRIPTION_TIMEOUT');
        expect((await readdir(directory)).filter(p => p.startsWith('goldie-voice-'))).to.deep.equal([]);
    });
    it('permits only one distinct transcription job at a time', async () => {
        await whisper("const fs = require('node:fs'); setTimeout(() => fs.writeFileSync(process.argv[process.argv.indexOf('-of') + 1] + '.json', "
            + "JSON.stringify({ transcription: [{text: 'done'}] })), 150);");
        const transcriber = create();
        const pending = transcriber.transcribe(input(audio));
        await errorCode(transcriber.transcribe(input(audio, 'second')), 'TRANSCRIPTION_BUSY');
        expect(await pending).to.deep.equal({ text: 'done' });
    });
});
