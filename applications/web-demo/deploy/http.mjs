// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { createHash, timingSafeEqual } from 'node:crypto';

export function matches(actual, expected) {
    const hash = value => createHash('sha256').update(String(value ?? '')).digest();
    return Boolean(expected) && timingSafeEqual(hash(actual), hash(expected));
}
export function apiMethod(path, method) {
    if (method === 'POST') { return /^\/api\/(offer|sessions|teach|ask|complete|speech|transcribe|sessions\/[\w-]+\/actions|sessions\/[\w-]+\/phases\/[\w-]+\/practice)$/.test(path); }
    return method === 'GET' && /^\/api\/(sessions\/[\w-]+(?:\/phases\/[\w-]+\/practice)?|audio\/[a-f0-9]{64})$/.test(path);
}
export function failure(status, code, message) { return Object.assign(new Error(message), { status, code }); }
export function json(res, status, data) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
export function fail(res, error) {
    json(res, error.status ?? 503, { error: { code: error.code ?? 'SERVICE_UNAVAILABLE',
        message: error.status ? error.message : 'The demo backend could not respond. Ask the team to check the connection.', retryable: !error.status } });
}
export function security(res) {
    res.setHeader('cache-control', 'private, no-store'); res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
}
export async function bodyBytes(req, path) {
    const limit = path === '/api/transcribe' ? 3 * 1024 * 1024 : 64 * 1024;
    let size = 0; const chunks = [];
    for await (const chunk of req) {
        size += chunk.length;
        if (size > limit) { throw failure(413, 'TOO_LARGE', 'The request exceeds the demo limit.'); }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}
export async function responseBytes(response, limit = 4 * 1024 * 1024) {
    const chunks = []; let size = 0;
    for await (const chunk of response.body ?? []) {
        size += chunk.length;
        if (size > limit) { throw failure(502, 'RESPONSE_TOO_LARGE', 'The response exceeds the demo limit. Try a shorter explanation.'); }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}
