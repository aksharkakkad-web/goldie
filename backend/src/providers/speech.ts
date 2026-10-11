// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { z } from 'zod';

export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
export const SPEECH_SETTINGS = { stability: 0.5, similarity_boost: 0.75 };
export const SPEECH_OUTPUT_FORMAT = 'mp3_44100_128';

export interface SpeechOptions {
    apiKey?: string;
    baseUrl: string;
    voiceId: string;
    modelId: string;
    timeoutMs: number;
}

export class SpeechProviderError extends Error {
    constructor(readonly code: string, message: string, readonly retryable: boolean) {
        super(message);
    }
}

export function isMp3(bytes: Buffer): boolean {
    return bytes.length >= 3 && (bytes.subarray(0, 3).toString('ascii') === 'ID3'
        || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
}

async function isQuotaError(response: Response): Promise<boolean> {
    if (!response.body) { return false; }
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    try {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) { break; }
            size += chunk.value.byteLength;
            if (size > 16384) { await reader.cancel(); return false; }
            chunks.push(Buffer.from(chunk.value));
        }
        const parsed = z.object({ detail: z.object({ status: z.string() }) }).safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        return parsed.success && parsed.data.detail.status === 'quota_exceeded';
    } catch (error) {
        if (error instanceof SyntaxError) { return false; }
        throw error;
    }
}

export async function synthesizeSpeech(text: string, options: SpeechOptions): Promise<Buffer> {
    if (!text.trim() || text.length > 4000) {
        throw new SpeechProviderError('INVALID_SPEECH_TEXT', 'Speech text must contain between 1 and 4000 characters.', false);
    }
    const key = options.apiKey?.trim();
    if (!key) {
        throw new SpeechProviderError('SPEECH_NOT_CONFIGURED', 'Speech is not configured. Set ELEVENLABS_API_KEY in the backend.', false);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
        const baseUrl = options.baseUrl.replace(/\/+$/, '');
        const response = await fetch(`${baseUrl}/v1/text-to-speech/${encodeURIComponent(options.voiceId)}?output_format=${SPEECH_OUTPUT_FORMAT}`, {
            method: 'POST',
            redirect: 'error',
            headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
            body: JSON.stringify({ text, model_id: options.modelId, voice_settings: SPEECH_SETTINGS }),
            signal: controller.signal
        });
        if (!response.ok) {
            if (await isQuotaError(response)) {
                throw new SpeechProviderError('SPEECH_QUOTA', 'Speech credits are unavailable. Text is still available; retry manually after credits are restored.', true);
            }
            if (response.status === 401 || response.status === 403) {
                throw new SpeechProviderError('SPEECH_AUTH_FAILED', 'Speech provider rejected the configured credentials.', false);
            }
            throw new SpeechProviderError('SPEECH_UNAVAILABLE', 'Speech provider is unavailable. Text is still available.',
                response.status === 429 || response.status >= 500);
        }
        const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        const length = response.headers.get('content-length');
        if (mime !== 'audio/mpeg' || Number(length) > MAX_AUDIO_BYTES || !response.body) {
            await response.body?.cancel();
            throw new SpeechProviderError('INVALID_AUDIO', 'Speech provider returned invalid audio. Text is still available.', true);
        }
        const chunks: Buffer[] = [];
        let size = 0;
        const reader = response.body.getReader();
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) {
                break;
            }
            size += chunk.value.byteLength;
            if (size > MAX_AUDIO_BYTES) {
                await reader.cancel();
                throw new SpeechProviderError('INVALID_AUDIO', 'Speech provider returned invalid audio. Text is still available.', true);
            }
            chunks.push(Buffer.from(chunk.value));
        }
        const bytes = Buffer.concat(chunks);
        if (!isMp3(bytes)) {
            throw new SpeechProviderError('INVALID_AUDIO', 'Speech provider returned invalid audio. Text is still available.', true);
        }
        return bytes;
    } catch (error) {
        if (error instanceof SpeechProviderError) {
            throw error;
        }
        if (controller.signal.aborted) {
            throw new SpeechProviderError('SPEECH_TIMEOUT', 'Speech generation timed out. Text is still available.', true);
        }
        throw new SpeechProviderError('SPEECH_UNAVAILABLE', 'Speech provider could not be reached. Text is still available.', true);
    } finally {
        clearTimeout(timeout);
    }
}
