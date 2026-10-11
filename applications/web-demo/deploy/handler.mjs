// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiMethod, bodyBytes, responseBytes, failure, fail, json, security } from './http.mjs';
const assets = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']], ['/index.html', ['index.html', 'text/html; charset=utf-8']],
    ['/style.css', ['style.css', 'text/css; charset=utf-8']], ['/orb-shaders.js', ['orb-shaders.js', 'text/javascript; charset=utf-8']],
    ['/assets/goldie.png', ['assets/goldie.png', 'image/png']], ['/favicon.ico', ['assets/goldie.png', 'image/png']],
    ...['app', 'view', 'controller', 'api', 'media', 'scenario', 'orb'].map(name => [`/src/${name}.js`, [`src/${name}.js`, 'text/javascript; charset=utf-8']])
]);

export function createJudgeHandler({ bridgeUrl, bridgeToken,
    publicDir = resolve(dirname(fileURLToPath(import.meta.url)), 'public'), fetcher = globalThis.fetch } = {}) {
    if (!bridgeToken || bridgeToken.length < 32) { throw new Error('Missing bridge credentials.'); }
    const bridge = new URL(bridgeUrl);
    if (bridge.protocol !== 'https:' || !/^[a-z0-9-]+\.trycloudflare\.com$/.test(bridge.hostname)
        || bridge.port || bridge.pathname !== '/' || bridge.username || bridge.password || bridge.search || bridge.hash) { throw new Error('Use the approved HTTPS tunnel origin.'); }
    return async (req, res) => {
        security(res);
        try {
            const url = new URL(req.url, 'https://judge.local');
            const path = url.searchParams.has('__goldie_path') ? `/${url.searchParams.get('__goldie_path')}` : url.pathname;
            if (req.headers.origin && req.headers.origin !== `https://${req.headers.host}`) { throw failure(403, 'ORIGIN_FORBIDDEN', 'Use the Goldie judging website.'); }
            if (path === '/demo-config' && req.method === 'GET') {
                let reachable = false;
                try {
                    const health = await fetcher(new URL('/health', bridge), { headers: { authorization: `Bearer ${bridgeToken}` }, redirect: 'error', signal: AbortSignal.timeout(8000) });
                    reachable = health.ok && (await health.json()).ok === true;
                } catch { /* Availability only: no paid provider request. */ }
                json(res, 200, { connected: true, reachable }); return;
            }
            if (apiMethod(path, req.method)) {
                const bytes = req.method === 'POST' ? await bodyBytes(req, path) : undefined;
                const upstream = await fetcher(new URL(path, bridge), { method: req.method, redirect: 'error', signal: AbortSignal.timeout(40000),
                    headers: { 'content-type': 'application/json', authorization: `Bearer ${bridgeToken}` }, ...(bytes ? { body: bytes } : {}) });
                const result = await responseBytes(upstream);
                res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' }); res.end(result); return;
            }
            const asset = assets.get(path);
            if (!asset || req.method !== 'GET') { throw failure(404, 'NOT_FOUND', 'Not found.'); }
            const content = await readFile(resolve(publicDir, asset[0]));
            res.writeHead(200, { 'content-type': asset[1] }); res.end(content);
        } catch (error) { if (!res.headersSent) { fail(res, error); } else { res.end(); } }
    };
}
let handler;
export default async function judge(req, res) {
    try {
        handler ??= createJudgeHandler({ bridgeUrl: process.env.GOLDIE_JUDGE_BRIDGE_URL, bridgeToken: process.env.GOLDIE_JUDGE_BRIDGE_TOKEN });
        await handler(req, res);
    } catch { security(res); console.error('Goldie judge gateway configuration unavailable.'); fail(res, new Error()); }
}
