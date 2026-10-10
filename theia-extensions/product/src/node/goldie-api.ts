// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT

import * as http from 'http';
import {
    OfferRequestSchema, OfferResponseSchema, SessionRequestSchema, SessionResponseSchema,
    TeachRequestSchema, TeachResponseSchema, AskRequestSchema, AskResponseSchema,
    CompleteRequestSchema, CompleteResponseSchema, SpeechRequestSchema
} from '@goldie/contracts';
import { GoldieService, GoldieSpeech } from '../common/goldie-service';
import { checkGoldieHealth } from './goldie-health';

const MAX_JSON_BYTES = 1024 * 1024;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const INVALID_RESPONSE = 'The teaching service returned an invalid response. Try again.';

interface Schema<T> {
    safeParse(value: unknown): { success: true; data: T } | { success: false };
}

export interface GoldieApiOptions {
    timeoutMs?: number;
    speechTimeoutMs?: number;
}

function deadline(value: number | undefined, fallback: number): number {
    return value !== undefined && Number.isFinite(value) ? Math.max(1, Math.min(60000, value)) : fallback;
}

function localEndpoint(address: string, path: string): URL {
    try {
        const url = new URL(address);
        if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
            || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
            throw new Error();
        }
        url.pathname = path;
        return url;
    } catch {
        throw new Error('Set GOLDIE_BACKEND_URL to a local HTTP address, then restart the IDE.');
    }
}

/** The renderer supplies contract payloads only; the server owns the fixed local destination. */
export function createGoldieApi(address: string, options: GoldieApiOptions = {}): GoldieService {
    const timeout = deadline(options.timeoutMs, 15000);
    const speechTimeout = deadline(options.speechTimeoutMs, 30000);

    async function post<T>(path: string, input: unknown, schema: Schema<T>, audio: boolean): Promise<{ body: Buffer; mimeType: string }> {
        const endpoint = localEndpoint(address, path);
        let body: string;
        try {
            const parsed = schema.safeParse(input);
            if (!parsed.success) {
                throw new Error();
            }
            body = JSON.stringify(parsed.data);
            if (Buffer.byteLength(body) > MAX_JSON_BYTES) {
                throw new Error();
            }
        } catch {
            throw new Error('The lesson request is invalid or too large.');
        }

        return new Promise((resolve, reject) => {
            let finished = false;
            const finish = (error?: string, result?: { body: Buffer; mimeType: string }): void => {
                if (finished) { return; }
                finished = true;
                clearTimeout(timer);
                if (error) { reject(new Error(error)); } else { resolve(result!); }
            };
            const request = http.request(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Accept: audio ? 'audio/*' : 'application/json' }
            }, response => {
                if (response.statusCode !== 200) {
                    finish(response.statusCode === 404
                        ? 'This teaching endpoint is not ready yet. Try again when the teaching service is updated.'
                        : 'The teaching service could not finish this request. Try again.');
                    response.destroy();
                    return;
                }
                const mimeType = (response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
                const validType = audio ? /^audio\/[a-z0-9][a-z0-9.+-]*$/.test(mimeType) : mimeType === 'application/json';
                if (!validType) {
                    finish(INVALID_RESPONSE);
                    response.destroy();
                    return;
                }
                const chunks: Buffer[] = [];
                let bytes = 0;
                response.on('data', (chunk: Buffer) => {
                    bytes += chunk.length;
                    if (bytes > (audio ? MAX_AUDIO_BYTES : MAX_JSON_BYTES)) {
                        finish(INVALID_RESPONSE);
                        response.destroy();
                    } else { chunks.push(chunk); }
                });
                response.on('end', () => {
                    if (!bytes) { finish(INVALID_RESPONSE); } else { finish(undefined, { body: Buffer.concat(chunks), mimeType }); }
                });
                response.on('error', () => finish('The teaching service disconnected. Try again.'));
                response.on('aborted', () => finish('The teaching service disconnected. Try again.'));
            });
            const timer = setTimeout(() => {
                finish('The teaching service took too long to respond. Try again.');
                request.destroy();
            }, audio ? speechTimeout : timeout);
            request.on('error', () => finish('Start the local teaching service, then retry.'));
            request.end(body);
        });
    }

    async function json<I, O>(path: string, input: I, requestSchema: Schema<I>, responseSchema: Schema<O>): Promise<O> {
        const response = await post(path, input, requestSchema, false);
        try {
            const parsed = responseSchema.safeParse(JSON.parse(response.body.toString('utf8')));
            if (parsed.success) { return parsed.data; }
        } catch { /* Never expose remote response bodies or validation details. */ }
        throw new Error(INVALID_RESPONSE);
    }

    return {
        checkHealth: () => checkGoldieHealth(address),
        offer: input => json('/api/offer', input, OfferRequestSchema, OfferResponseSchema),
        startSession: input => json('/api/sessions', input, SessionRequestSchema, SessionResponseSchema),
        teach: input => json('/api/teach', input, TeachRequestSchema, TeachResponseSchema),
        ask: input => json('/api/ask', input, AskRequestSchema, AskResponseSchema),
        complete: input => json('/api/complete', input, CompleteRequestSchema, CompleteResponseSchema),
        speech: async input => {
            const response = await post('/api/speech', input, SpeechRequestSchema, true);
            const speech: GoldieSpeech = { mimeType: response.mimeType, dataBase64: response.body.toString('base64') };
            return speech;
        }
    };
}
