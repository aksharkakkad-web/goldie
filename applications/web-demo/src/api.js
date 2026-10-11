// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
export class HttpApi {
    constructor(fetcher = globalThis.fetch.bind(globalThis)) { this.fetcher = fetcher; }
    async request(path, body, signal) {
        if (!/^\/api\/[a-zA-Z0-9/_-]+$/.test(path)) { throw new Error('Invalid API path.'); }
        let response;
        try {
            response = await this.fetcher(path, { method: body === undefined ? 'GET' : 'POST',
                headers: { 'content-type': 'application/json' },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(40000)]) : AbortSignal.timeout(40000) });
        } catch (error) {
            if (signal?.aborted) { throw error; }
            throw Object.assign(new Error('The local mentor did not respond. Retry manually or keep browsing.'), { retryable: true });
        }
        let data; try { data = await response.json(); } catch { /* Never expose raw provider/HTML errors. */ }
        if (!response.ok) {
            const stage3 = response.status === 404 && (path.includes('/practice') || path === '/api/transcribe');
            const message = stage3 ? 'Stage 3 is not connected yet. You can continue the lesson without this feature.'
                : typeof data?.error?.message === 'string' ? data.error.message.slice(0, 300) : 'The mentor could not complete this request.';
            throw Object.assign(new Error(message), { retryable: Boolean(data?.error?.retryable ?? response.status >= 500), code: data?.error?.code });
        }
        if (path === '/api/speech' && (!/^\/api\/audio\/[a-f0-9]{64}$/.test(data?.audioUrl) || data.mimeType !== 'audio/mpeg')) {
            throw new Error('The service returned invalid speech data.');
        }
        if (path === '/api/sessions' || /\/actions$/.test(path)) {
            if (!data?.sessionId || !Array.isArray(data.phases) || !Array.isArray(data.completedIds)
                || !Array.isArray(data.skippedIds) || !Array.isArray(data.alreadyKnowIds)
                || !data.phases.every(p => typeof p.id === 'string' && typeof p.title === 'string' && typeof p.objective === 'string')) {
                throw new Error('The service returned invalid lesson data.');
            }
        }
        if (path.endsWith('/practice') && data !== null) {
            const qs = data?.questions;
            if (!data?.phaseId || !Array.isArray(qs) || qs.length < 3 || qs.length > 5
                || !qs.every(q => typeof q.id === 'string' && typeof q.question === 'string' && typeof q.modelAnswer === 'string')
                || new Set(qs.map(q => q.id)).size !== qs.length) { throw new Error('The service returned invalid practice data.'); }
        }
        if (data === undefined) { throw new Error('The service returned invalid data.'); }
        return data;
    }
}
