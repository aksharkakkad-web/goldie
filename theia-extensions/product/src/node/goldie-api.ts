// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT

import * as http from 'http';
import {
    OfferRequestSchema, OfferResponseSchema, SessionRequestSchema, SessionResponseSchema,
    TeachRequestSchema, TeachResponseSchema, AskRequestSchema, AskResponseSchema,
    CompleteRequestSchema, CompleteResponseSchema, SpeechRequestSchema, SpeechResponseSchema,
    IdentifierSchema, SessionActionRequestSchema, ApiErrorResponseSchema,
    PracticeBatchSchema, PracticeResponseSchema, PracticeGenerateRequestSchema, TranscribeRequestSchema, TranscribeResponseSchema
} from '@goldie/contracts';
import { ApplicationError } from '@theia/core/lib/common/application-error';
import { GOLDIE_NONRETRYABLE_ERROR_CODE, GOLDIE_RETRYABLE_ERROR_CODE, GoldieService, GoldieSpeech } from '../common/goldie-service';
import { checkGoldieHealth } from './goldie-health';
import { loadGoldieHandoff } from './goldie-context';
import { inspectGoldieWorkspaceHandoff } from './goldie-workspace-handoff';

const MAX_JSON_BYTES = 1024 * 1024;
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const INVALID_RESPONSE = 'The teaching service returned an invalid response. Try again.';
// Never forward provider/body messages, even when the API error shape is valid.
const SAFE_ERRORS: Readonly<Record<string, string>> = {
    REQUEST_CONFLICT: 'This request ID belongs to different content. Start a new question.',
    QUESTION_BUSY: 'Goldie is answering another question. Wait or retry manually.',
    QUESTION_STALE: 'The lesson changed while answering. Ask again or resume the current phase.',
    EXPLANATION_REQUIRED: 'Load the phase explanation before asking or practicing.',
    PRACTICE_NOT_AVAILABLE: 'Practice is available for covered phases only, not skipped or self-reported familiar phases.',
    TRANSCRIPTION_NOT_CONFIGURED: 'Configure local Whisper, base.en and FFmpeg in the backend, then re-record or resume.',
    INVALID_RECORDING: 'Record valid WebM audio of at most 2 MiB, then send again.',
    RECORDING_TOO_LONG: 'Recordings are limited to 30 seconds. Re-record a shorter question.',
    TRANSCRIPTION_EMPTY: 'No speech was recognized. Re-record or resume the lesson.',
    TRANSCRIPTION_TOO_LONG: 'The transcript was too long. Re-record a shorter question.',
    TRANSCRIPTION_FAILED: 'Local transcription failed. Re-record, retry manually or resume.',
    TRANSCRIPTION_TIMEOUT: 'Local transcription timed out. Re-record a shorter question or resume.',
    TRANSCRIPTION_BUSY: 'Local transcription is busy. Retry manually when it finishes.',
    TRANSCRIPTION_STALE: 'The lesson changed during transcription. Re-record or resume.',
    GEMINI_NOT_CONFIGURED: 'Teaching is not configured. Configure Gemini in the backend, then try again.',
    GEMINI_AUTH_FAILED: 'Teaching credentials were rejected. Correct Gemini credentials in the backend, then try again.',
    GEMINI_QUOTA: 'Teaching quota is unavailable. Retry manually later.',
    GEMINI_TIMEOUT: 'Teaching generation timed out. Retry when the service is ready.',
    GEMINI_UNAVAILABLE: 'Teaching is temporarily unavailable. Retry when the service is ready.',
    GEMINI_INVALID_OUTPUT: 'Teaching returned an unusable lesson. Retry manually.',
    GEMINI_BUSY: 'Teaching is busy. Retry manually when generation finishes.',
    GEMINI_REQUEST_REJECTED: 'Teaching rejected the request. Check the backend model configuration.',
    GEMINI_CONTEXT_CHANGED: 'This lesson uses a different model or prompt version. Restore its backend configuration to generate more content.',
    CONTEXT_CONFLICT: 'The handoff changed after this offer. Load the current context and prepare a new lesson.',
    SPEECH_NOT_CONFIGURED: 'Speech is not configured. Configure credentials in the backend; text is still available.',
    SPEECH_AUTH_FAILED: 'Speech credentials were rejected. Correct credentials in the backend; text is still available.',
    SPEECH_QUOTA: 'Speech credits are unavailable. Text is still available; retry manually after credits are restored.',
    SPEECH_UNAVAILABLE: 'Speech is unavailable. Text is still available.',
    SPEECH_TIMEOUT: 'Speech generation timed out. Text is still available.',
    SPEECH_BUSY: 'Speech is busy. Text is still available; retry when playback is idle.',
    INVALID_AUDIO: 'Speech returned invalid audio. Text is still available.',
    INVALID_AUDIO_CACHE: 'Cached audio needs backend repair. Text is still available.',
    AUDIO_CACHE_UNAVAILABLE: 'Audio cache is unavailable. Text is still available.',
    ACTIVE_SESSION: 'This project already has an active lesson. Finish it in its owning window, then prepare a new lesson.',
    REVISION_ALREADY_ACCEPTED: 'This project revision already has an accepted lesson. Restore it in its owning window, or load changed context for a new lesson.',
    NO_LESSON_OFFER: 'This evaluation did not offer a lesson. Load meaningful engineering context and prepare a new lesson.',
    SESSION_NOT_FOUND: 'The saved lesson is no longer available. Check the backend data directory.',
    OFFER_NOT_FOUND: 'The lesson offer is no longer available. Check the backend data directory.',
    SESSION_CLOSED: 'This lesson is already closed. Restore its recap.',
    PHASE_CONFLICT: 'The lesson phase changed. Restore the saved lesson.',
    STATE_CONFLICT: 'Resume the lesson before marking the phase complete.',
    ACTION_CONFLICT: 'This action ID was already used for another action. Restore the saved lesson.',
    REVISION_CONFLICT: 'This offer revision cannot be accepted. Load the current context and prepare a new lesson.',
    INCOMPLETE_SESSION: 'Finish, skip, or mark familiarity with each phase before completion.',
    HISTORY_LIMIT: 'Local lesson history is full. End the lesson and ask for backend maintenance.'
};

interface Schema<T> {
    safeParse(value: unknown): { success: true; data: T } | { success: false };
}

export interface GoldieApiOptions {
    timeoutMs?: number;
    speechTimeoutMs?: number;
    teachingTimeoutMs?: number;
    transcriptionTimeoutMs?: number;
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
    const teachingTimeout = deadline(options.teachingTimeoutMs, 30000);
    const transcriptionTimeout = deadline(options.transcriptionTimeoutMs, 40000);

    async function request<T>(path: string, input: unknown, schema: Schema<T> | undefined, audio: boolean,
        timeoutMs = timeout, maxRequestBytes = 64 * 1024): Promise<{ body: Buffer; mimeType: string }> {
        const endpoint = localEndpoint(address, path);
        let body: string | undefined;
        try {
            if (schema) {
                const parsed = schema.safeParse(input);
                if (!parsed.success) { throw new Error(); }
                body = JSON.stringify(parsed.data);
                if (Buffer.byteLength(body) > maxRequestBytes) { throw new Error(); }
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

    async function json<I, O>(path: string, input: I, requestSchema: Schema<I> | undefined, responseSchema: Schema<O>,
        timeoutMs = timeout, maxRequestBytes = 64 * 1024): Promise<O> {
        const response = await request(path, input, requestSchema, false, timeoutMs, maxRequestBytes);
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

    function practicePath(sessionId: string, phaseId: string): string {
        const parsed = IdentifierSchema.safeParse(phaseId);
        if (!parsed.success) { throw new Error('The practice phase is invalid.'); }
        return `${sessionPath(sessionId)}/phases/${encodeURIComponent(parsed.data)}/practice`;
    }

    function validSession<T extends { phases: { id: string }[]; activePhaseId?: string; status: string;
        completedIds: string[]; skippedIds: string[]; alreadyKnowIds: string[];
        questionHistory: { resumePhaseId: string }[] }>(session: T): T {
        const ids = session.phases.map(phase => phase.id);
        const terminal = [...session.completedIds, ...session.skippedIds, ...session.alreadyKnowIds];
        const firstPending = ids.find(id => !terminal.includes(id));
        const closed = session.status === 'completed' || session.status === 'dismissed';
        if (!ids.length || new Set(ids).size !== ids.length
            || new Set(terminal).size !== terminal.length || terminal.some(id => !ids.includes(id))
            || (session.activePhaseId !== undefined && !ids.includes(session.activePhaseId))
            || (!closed && session.activePhaseId !== firstPending)
            || (session.status === 'completed' && firstPending !== undefined)
            || session.questionHistory.some(item => !ids.includes(item.resumePhaseId))) {
            throw new Error(INVALID_RESPONSE);
        }
        return session;
    }

    return {
        loadHandoff: loadGoldieHandoff,
        inspectWorkspaceHandoff: inspectGoldieWorkspaceHandoff,
        checkHealth: () => checkGoldieHealth(address),
        offer: async input => {
            const offer = await json('/api/offer', input, OfferRequestSchema, OfferResponseSchema, teachingTimeout);
            if (offer.shouldOffer ? !offer.offerId || !offer.previewTopics.length
                : offer.offerId !== undefined || offer.previewTopics.length > 0) { throw new Error(INVALID_RESPONSE); }
            return offer;
        },
        startSession: async input => {
            const session = await json('/api/sessions', input, SessionRequestSchema, SessionResponseSchema);
            return validSession(session);
        },
        getSession: async sessionId => validSession(await json(sessionPath(sessionId), undefined, undefined, SessionResponseSchema)),
        action: async (sessionId, input) => validSession(await json(`${sessionPath(sessionId)}/actions`, input, SessionActionRequestSchema, SessionResponseSchema)),
        teach: input => json('/api/teach', input, TeachRequestSchema, TeachResponseSchema, teachingTimeout),
        ask: input => json('/api/ask', input, AskRequestSchema, AskResponseSchema, teachingTimeout),
        transcribe: input => json('/api/transcribe', input, TranscribeRequestSchema, TranscribeResponseSchema, transcriptionTimeout, 3 * 1024 * 1024),
        getPractice: (sessionId, phaseId) => json(practicePath(sessionId, phaseId), undefined, undefined, PracticeResponseSchema),
        generatePractice: (sessionId, phaseId) => json(practicePath(sessionId, phaseId), {}, PracticeGenerateRequestSchema, PracticeBatchSchema, teachingTimeout),
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
