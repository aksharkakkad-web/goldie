// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT

import * as http from 'http';
import {
    OfferRequestSchema, OfferResponseSchema, SessionRequestSchema, SessionResponseSchema,
    TeachRequestSchema, TeachResponseSchema, AskRequestSchema, AskResponseSchema,
    CompleteRequestSchema, CompleteResponseSchema, SpeechRequestSchema, SpeechResponseSchema,
    IdentifierSchema, SessionActionRequestSchema, ApiErrorResponseSchema
} from '@goldie/contracts';
import { ApplicationError } from '@theia/core/lib/common/application-error';
import { GOLDIE_NONRETRYABLE_ERROR_CODE, GOLDIE_RETRYABLE_ERROR_CODE, GoldieService, GoldieSpeech } from '../common/goldie-service';
import { checkGoldieHealth } from './goldie-health';

const MAX_JSON_BYTES = 1024 * 1024;
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const INVALID_RESPONSE = 'The teaching service returned an invalid response. Try again.';
// Never forward provider/body messages, even when the API error shape is valid.
const SAFE_ERRORS: Readonly<Record<string, string>> = {
    SPEECH_NOT_CONFIGURED: 'Speech is not configured. Configure credentials in the backend; text is still available.',
    SPEECH_AUTH_FAILED: 'Speech credentials were rejected. Correct credentials in the backend; text is still available.',
    SPEECH_UNAVAILABLE: 'Speech is unavailable. Text is still available.',
    SPEECH_TIMEOUT: 'Speech generation timed out. Text is still available.',
    SPEECH_BUSY: 'Speech is busy. Text is still available; retry when playback is idle.',
    INVALID_AUDIO: 'Speech returned invalid audio. Text is still available.',
    INVALID_AUDIO_CACHE: 'Cached audio needs backend repair. Text is still available.',
    AUDIO_CACHE_UNAVAILABLE: 'Audio cache is unavailable. Text is still available.',
    ACTIVE_SESSION: 'This project already has an active lesson. Restore the saved lesson.',
    SESSION_NOT_FOUND: 'The saved lesson is no longer available. Check the backend data directory.',
    OFFER_NOT_FOUND: 'The lesson offer is no longer available. Check the backend data directory.',
    SESSION_CLOSED: 'This lesson is already closed. Restore its recap.',
    PHASE_CONFLICT: 'The lesson phase changed. Restore the saved lesson.',
    STATE_CONFLICT: 'Resume the lesson before marking the phase complete.',
    ACTION_CONFLICT: 'This action ID was already used for another action. Restore the saved lesson.',
    REVISION_CONFLICT: 'Accept the revision shown in the lesson offer.',
    INCOMPLETE_SESSION: 'Finish, skip, or mark familiarity with each phase before completion.',
    HISTORY_LIMIT: 'Local lesson history is full. End the lesson and ask for backend maintenance.'
};

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

    async function request<T>(path: string, input: unknown, schema: Schema<T> | undefined, audio: boolean, timeoutMs = timeout): Promise<{ body: Buffer; mimeType: string }> {
        const endpoint = localEndpoint(address, path);
        let body: string | undefined;
        try {
            if (schema) {
                const parsed = schema.safeParse(input);
                if (!parsed.success) { throw new Error(); }
                body = JSON.stringify(parsed.data);
                if (Buffer.byteLength(body) > 64 * 1024) { throw new Error(); }
            }
        } catch {
            throw new Error('The lesson request is invalid or too large.');
        }

        return new Promise((resolve, reject) => {
            let finished = false;
            const finish = (error?: string | Error, result?: { body: Buffer; mimeType: string }): void => {
                if (finished) { return; }
                finished = true;
                clearTimeout(timer);
                if (error) { reject(typeof error === 'string' ? new Error(error) : error); } else { resolve(result!); }
            };
            const outgoing = http.request(endpoint, {
                method: body === undefined ? 'GET' : 'POST',
                headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }),
                    Accept: audio ? 'audio/mpeg' : 'application/json' }
            }, response => {
                if (response.statusCode !== 200) {
                    const fallback = response.statusCode === 404
                        ? 'This teaching endpoint or saved lesson is not ready yet or no longer available. Try again when the teaching service is updated.'
                        : response.statusCode === 409 ? 'The lesson state changed. Restore the saved lesson and retry the action.'
                            : 'The teaching service could not finish this request. Try again.';
                    if ((response.statusCode ?? 0) < 400 || (response.headers['content-type'] || '').split(';')[0].trim() !== 'application/json') {
                        finish(fallback);
                        response.destroy();
                        return;
                    }
                    let errorBytes = 0;
                    const errorChunks: Buffer[] = [];
                    response.on('data', (chunk: Buffer) => {
                        errorBytes += chunk.length;
                        if (errorBytes > 16 * 1024) { finish(fallback); response.destroy(); } else { errorChunks.push(chunk); }
                    });
                    response.on('end', () => {
                        try {
                            const parsed = ApiErrorResponseSchema.safeParse(JSON.parse(Buffer.concat(errorChunks).toString('utf8')));
                            const safeMessage = parsed.success && Object.prototype.hasOwnProperty.call(SAFE_ERRORS, parsed.data.error.code)
                                ? SAFE_ERRORS[parsed.data.error.code] : undefined;
                            if (parsed.success && safeMessage) {
                                finish(ApplicationError.fromJson(parsed.data.error.retryable ? GOLDIE_RETRYABLE_ERROR_CODE : GOLDIE_NONRETRYABLE_ERROR_CODE,
                                    { message: safeMessage, data: { apiCode: parsed.data.error.code }, stack: 'Goldie teaching request failed.' }));
                                return;
                            }
                        } catch { /* Invalid and unknown error bodies remain generic. */ }
                        finish(fallback);
                    });
                    response.on('error', () => finish(fallback));
                    response.on('aborted', () => finish(fallback));
                    return;
                }
                const mimeType = (response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
                const validType = mimeType === (audio ? 'audio/mpeg' : 'application/json');
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
                outgoing.destroy();
            }, timeoutMs);
            outgoing.on('error', () => finish('Start the local teaching service, then retry.'));
            outgoing.end(body);
        });
    }

    async function json<I, O>(path: string, input: I, requestSchema: Schema<I> | undefined, responseSchema: Schema<O>, timeoutMs = timeout): Promise<O> {
        const response = await request(path, input, requestSchema, false, timeoutMs);
        try {
            const parsed = responseSchema.safeParse(JSON.parse(response.body.toString('utf8')));
            if (parsed.success) { return parsed.data; }
        } catch { /* Never expose remote response bodies or validation details. */ }
        throw new Error(INVALID_RESPONSE);
    }

    function sessionPath(sessionId: string): string {
        const parsed = IdentifierSchema.safeParse(sessionId);
        if (!parsed.success) { throw new Error('The lesson request is invalid or too large.'); }
        return `/api/sessions/${encodeURIComponent(parsed.data)}`;
    }

    return {
        checkHealth: () => checkGoldieHealth(address),
        offer: input => json('/api/offer', input, OfferRequestSchema, OfferResponseSchema),
        startSession: input => json('/api/sessions', input, SessionRequestSchema, SessionResponseSchema),
        getSession: async sessionId => json(sessionPath(sessionId), undefined, undefined, SessionResponseSchema),
        action: async (sessionId, input) => json(`${sessionPath(sessionId)}/actions`, input, SessionActionRequestSchema, SessionResponseSchema),
        teach: input => json('/api/teach', input, TeachRequestSchema, TeachResponseSchema),
        ask: input => json('/api/ask', input, AskRequestSchema, AskResponseSchema),
        complete: input => json('/api/complete', input, CompleteRequestSchema, CompleteResponseSchema),
        speech: async input => {
            const metadata = await json('/api/speech', input, SpeechRequestSchema, SpeechResponseSchema, speechTimeout);
            // Never fetch a caller-supplied URL, even when its shape looks valid.
            if (metadata.audioUrl !== `/api/audio/${metadata.audioId}`) { throw new Error(INVALID_RESPONSE); }
            const response = await request(`/api/audio/${metadata.audioId}`, undefined, undefined, true);
            const speech: GoldieSpeech = { mimeType: response.mimeType, dataBase64: response.body.toString('base64') };
            return speech;
        }
    };
}
