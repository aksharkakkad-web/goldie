// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { apiMethod, bodyBytes, responseBytes, matches, failure, fail, json, security } from './http.mjs';

/** Only this bounded, authenticated bridge is exposed by the temporary tunnel. */
export async function createJudgeBridge({ backendUrl, token, usageFile, characterLimit = 12000, requestLimit = 500 } = {}) {
    const backend = new URL(backendUrl);
    if (backend.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(backend.hostname)
        || backend.username || backend.password || backend.pathname !== '/' || backend.search || backend.hash) { throw new Error('Use a loopback backend.'); }
    if (!token || token.length < 32 || !usageFile || !isAbsolute(usageFile)) { throw new Error('Configure a strong bridge token and absolute usage file.'); }
    if (![characterLimit, requestLimit].every(value => Number.isSafeInteger(value) && value > 0)) { throw new Error('Use positive integer demo limits.'); }
    let usage = { characters: 0, requests: 0 };
    try { usage = JSON.parse(await readFile(usageFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') { throw new Error('Demo usage is unreadable; refusing to reset the budget.'); } }
    if (![usage.characters, usage.requests].every(value => Number.isSafeInteger(value) && value >= 0)) { throw new Error('Demo usage is invalid.'); }
    await mkdir(dirname(usageFile), { recursive: true, mode: 0o700 });
    const content = new Map(); let reservation = Promise.resolve(); let inFlight = 0;
    const reserve = characters => {
        const next = reservation.then(async () => {
            if (usage.characters + characters > characterLimit) { throw failure(429, 'DEMO_VOICE_BUDGET', 'The shared demo voice budget is reached. You can still read and finish the lesson.'); }
            if (usage.requests >= requestLimit) { throw failure(429, 'DEMO_REQUEST_BUDGET', 'The shared judging request limit is reached. Ask the team before continuing.'); }
            const updated = { characters: usage.characters + characters, requests: usage.requests + 1 };
            await writeFile(`${usageFile}.pending`, JSON.stringify(updated), { mode: 0o600 });
            await rename(`${usageFile}.pending`, usageFile); usage = updated;
        });
        reservation = next.catch(() => {}); return next;
    };
    return createServer(async (req, res) => {
        security(res); let counted = false;
        try {
            if (!matches(req.headers.authorization, `Bearer ${token}`)) { throw failure(401, 'UNAUTHORIZED', 'Use the protected Goldie judging website.'); }
            if (req.headers.origin) { throw failure(403, 'ORIGIN_FORBIDDEN', 'Direct browser access is not allowed.'); }
            const path = new URL(req.url, 'http://bridge.local').pathname;
            if (!(path === '/health' && req.method === 'GET') && !apiMethod(path, req.method)) { throw failure(404, 'NOT_FOUND', 'Not found.'); }
            const bytes = req.method === 'POST' ? await bodyBytes(req, path) : undefined;
            let body;
            if (bytes) { try { body = JSON.parse(bytes.toString()); } catch { throw failure(400, 'INVALID_REQUEST', 'Invalid JSON request.'); } }
            if (req.method === 'POST') {
                if (inFlight >= 2) { throw failure(429, 'DEMO_BUSY', 'Two demo requests are already processing. Please wait, then retry manually.'); }
                inFlight++; counted = true;
                let characters = 0;
                if (path === '/api/speech') {
                    const text = content.get(`${body?.sessionId}:${body?.contentId}`);
                    if (!text) { throw failure(409, 'CONTENT_NOT_PREPARED', 'Load this explanation again before requesting its voice.'); }
                    characters = text.length;
                }
                // Conservative: attempts/cache hits count too; reserve before any paid call.
                await reserve(characters);
            }
            const upstream = await fetch(new URL(path, backend), { method: req.method, redirect: 'error', signal: AbortSignal.timeout(40000),
                headers: { 'content-type': 'application/json' }, ...(bytes ? { body: bytes } : {}) });
            const result = await responseBytes(upstream);
            if (upstream.ok && ['/api/teach', '/api/ask'].includes(path)) {
                const data = JSON.parse(result.toString()); const text = path === '/api/teach' ? data.explanation : data.answer;
                if (typeof data.contentId === 'string' && typeof text === 'string' && text.length <= 20000) { content.set(`${body?.sessionId}:${data.contentId}`, text); }
            }
            res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' }); res.end(result);
        } catch (error) { if (!res.headersSent) { fail(res, error); } else { res.end(); } }
        finally { if (counted) { inFlight--; } }
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        const filename = process.env.GOLDIE_JUDGE_CONFIG;
        if (!filename || !isAbsolute(filename)) { throw new Error('Missing configuration.'); }
        const config = JSON.parse(await readFile(filename, 'utf8'));
        const server = await createJudgeBridge(config);
        server.listen(config.port ?? 8798, '127.0.0.1', () => console.log('Protected Goldie judge bridge listening on loopback. No paid startup requests.'));
        const stop = () => { server.closeAllConnections(); server.close(); };
        process.once('SIGINT', stop); process.once('SIGTERM', stop);
    } catch { console.error('Judge bridge could not start. Check private config, saved usage, backend and free port.'); process.exitCode = 1; }
}
