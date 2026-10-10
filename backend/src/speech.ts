// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { AudioIdSchema, SpeechRequest, SpeechResponse } from '@goldie/contracts';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { ApiError } from './errors';
import { isMp3, MAX_AUDIO_BYTES, SpeechOptions, SPEECH_OUTPUT_FORMAT, SPEECH_SETTINGS, SpeechProviderError, synthesizeSpeech } from './providers/speech';

/** Disk cache and in-flight deduplication for the single local backend process. */
export class SpeechService {
    private readonly inflight = new Map<string, Promise<void>>();

    constructor(
        private readonly directory: string,
        private readonly options: SpeechOptions,
        private readonly publishedText: (sessionId: string, contentId: string) => Promise<string>
    ) {}

    async create(request: SpeechRequest): Promise<SpeechResponse> {
        // Authorization precedes both cache hits and provider access.
        const text = await this.publishedText(request.sessionId, request.contentId);
        const audioId = createHash('sha256').update(JSON.stringify({
            text, voiceId: this.options.voiceId, modelId: this.options.modelId,
            settings: SPEECH_SETTINGS, format: SPEECH_OUTPUT_FORMAT, provider: this.options.baseUrl
        })).digest('hex');
        let pending = this.inflight.get(audioId);
        if (!pending) {
            if (this.inflight.size >= 4) {
                throw new ApiError(503, 'SPEECH_BUSY', 'Speech is busy. Text is still available; retry when playback is idle.', true);
            }
            pending = this.ensureAudio(audioId, text);
            this.inflight.set(audioId, pending);
        }
        try {
            await pending;
        } finally {
            if (this.inflight.get(audioId) === pending) {
                this.inflight.delete(audioId);
            }
        }
        return { audioId, audioUrl: `/api/audio/${audioId}`, mimeType: 'audio/mpeg' };
    }

    async audio(audioId: string): Promise<Buffer> {
        if (!AudioIdSchema.safeParse(audioId).success) {
            throw new ApiError(400, 'INVALID_REQUEST', 'Invalid audio identifier.');
        }
        const cached = await this.readAudio(audioId);
        if (!cached) {
            throw new ApiError(404, 'NOT_FOUND', 'Audio is not available.');
        }
        return cached;
    }

    private async readAudio(audioId: string): Promise<Buffer | undefined> {
        let handle;
        try {
            handle = await open(path.join(this.directory, audioId + '.mp3'), 'r');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return undefined;
            }
            throw new ApiError(503, 'AUDIO_CACHE_UNAVAILABLE', 'Audio cache could not be read. Text is still available.', true);
        }
        try {
            const stats = await handle.stat();
            if (!stats.isFile() || stats.size < 3 || stats.size > MAX_AUDIO_BYTES) {
                throw new Error('Invalid audio cache size');
            }
            const bytes = Buffer.alloc(stats.size);
            let offset = 0;
            while (offset < bytes.length) {
                const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
                if (!bytesRead) {
                    throw new Error('Incomplete cached audio');
                }
                offset += bytesRead;
            }
            if (!isMp3(bytes)) {
                throw new Error('Invalid audio cache');
            }
            return bytes;
        } catch {
            // Do not silently spend credits to repair malformed disk contents.
            throw new ApiError(503, 'INVALID_AUDIO_CACHE', 'Cached audio is invalid. Text is still available.', false);
        } finally {
            await handle.close();
        }
    }

    private async ensureAudio(audioId: string, text: string): Promise<void> {
        if (await this.readAudio(audioId)) {
            return;
        }
        const temporary = path.join(this.directory, `${audioId}.${randomUUID()}.tmp`);
        let created = false;
        try {
            // Ensure the cache is writable before requesting paid synthesis.
            await mkdir(this.directory, { recursive: true, mode: 0o700 });
            await writeFile(temporary, '', { flag: 'wx', mode: 0o600 });
            created = true;
            const bytes = await synthesizeSpeech(text, this.options);
            await writeFile(temporary, bytes, { mode: 0o600 });
            await rename(temporary, path.join(this.directory, audioId + '.mp3'));
        } catch (error) {
            if (error instanceof ApiError || error instanceof SpeechProviderError) {
                throw error;
            }
            throw new ApiError(503, 'AUDIO_CACHE_UNAVAILABLE', 'Audio cache could not be updated. Text is still available.', true);
        } finally {
            if (created) {
                await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
                    if (error.code !== 'ENOENT') {
                        throw new ApiError(503, 'AUDIO_CACHE_UNAVAILABLE', 'Audio cache could not be updated. Text is still available.', true);
                    }
                });
            }
        }
    }
}
