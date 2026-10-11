// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, '../..');
const modules = new Set(['app', 'view', 'controller', 'api', 'media', 'scenario', 'orb']);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };
const route = /^\/api\/(offer|sessions|teach|ask|complete|speech|transcribe|sessions\/[\w-]+(?:\/actions|\/phases\/[\w-]+\/practice)?|audio\/[a-f0-9]{64})$/;

export function createDemoServer({ backendUrl = '' } = {}) {
    let upstream;
    if (backendUrl) {
        upstream = new URL(backendUrl);
        if (upstream.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(upstream.hostname)
            || upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash) {
            throw new Error('The demo backend must be an HTTP loopback origin.');
        }
    }
    return createServer(async (req, res) => {
        const json = (status, code, message) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { code, message, retryable: status === 503 } })); };
        res.setHeader('x-content-type-options', 'nosniff');
        res.setHeader('referrer-policy', 'no-referrer');
        res.setHeader('cache-control', 'no-store');
        res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
        try {
            const port = req.socket.localPort;
            const expectedHosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
            if (!expectedHosts.includes(req.headers.host)) { json(403, 'HOST_FORBIDDEN', 'Open the local demo URL.'); return; }
            if (req.headers.origin && !expectedHosts.map(host => `http://${host}`).includes(req.headers.origin)) {
                json(403, 'ORIGIN_FORBIDDEN', 'Use this demo from its local browser page.'); return;
            }
            const path = new URL(req.url, `http://${req.headers.host}`).pathname;
            if (path === '/demo-config' && req.method === 'GET') {
                let reachable = false;
                if (upstream) {
                    try {
                        const health = await fetch(new URL('/health', upstream), { signal: AbortSignal.timeout(1500), redirect: 'error' });
                        reachable = health.ok && (await health.json()).ok === true;
                    } catch { /* Local availability, not provider validation or a paid request. */ }
                }
                res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ connected: Boolean(upstream), reachable })); return;
            }
            if (route.test(path)) {
                if (!['GET', 'POST'].includes(req.method)) { json(405, 'METHOD_NOT_ALLOWED', 'Unsupported request.'); return; }
                if (!upstream) { json(503, 'DEMO_BACKEND_UNAVAILABLE', 'The live mentor is not connected. The coding replay still works.'); return; }
                const max = path === '/api/transcribe' ? 3 * 1024 * 1024 : 64 * 1024;
                let size = 0; const chunks = [];
                for await (const chunk of req) {
                    size += chunk.length;
                    if (size > max) { json(413, 'TOO_LARGE', 'The request exceeds the demo limit.'); return; }
                    chunks.push(chunk);
                }
                const response = await fetch(new URL(path, upstream), {
                    method: req.method, redirect: 'error', signal: AbortSignal.timeout(40000),
                    headers: { 'content-type': 'application/json' },
                    ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {})
                });
                const bytes = Buffer.from(await response.arrayBuffer());
                if (bytes.length > 16 * 1024 * 1024) { json(502, 'RESPONSE_TOO_LARGE', 'The service returned too much data.'); return; }
                res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json' });
                res.end(bytes); return;
            }
            if (req.method !== 'GET') { json(404, 'NOT_FOUND', 'Not found.'); return; }
            if (path === '/orb-shaders.js') {
                const source = await readFile(resolve(repo, 'theia-extensions/product/src/browser/goldie/gradient-orb.tsx'), 'utf8');
                const vertex = source.match(/const vertexShader = \/\* glsl \*\/ `([\s\S]*?)`;/)?.[1];
                const fragment = source.match(/const fragmentShader = \/\* glsl \*\/ `([\s\S]*?)`;/)?.[1];
                if (!vertex || !fragment) { throw new Error('Missing orb shader'); }
                res.setHeader('content-type', types['.js']);
                res.end(`// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT\nexport const vertexShader=${JSON.stringify(vertex)};\nexport const fragmentShader=${JSON.stringify(fragment)};`); return;
            }
            let file;
            if (path === '/' || path === '/index.html') { file = resolve(root, 'index.html'); }
            if (path === '/style.css') { file = resolve(root, 'style.css'); }
            const name = path.match(/^\/src\/([a-z-]+)\.js$/)?.[1];
            if (modules.has(name)) { file = resolve(root, `src/${name}.js`); }
            if (path === '/assets/goldie.png' || path === '/favicon.ico') { file = resolve(repo, 'theia-extensions/product/src/browser/icons/goldie/icon-dark.png'); }
            if (!file) { json(404, 'NOT_FOUND', 'Not found.'); return; }
            const content = await readFile(file);
            res.setHeader('content-type', types[extname(file)]); res.end(content);
        } catch {
            if (!res.headersSent) { json(503, 'SERVICE_UNAVAILABLE', 'The local mentor could not respond. Retry manually or continue browsing.'); }
            else { res.end(); }
        }
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const server = createDemoServer({ backendUrl: process.env.GOLDIE_DEMO_BACKEND_URL });
    const port = Number(process.env.GOLDIE_DEMO_PORT ?? 4317);
    server.listen(port, '127.0.0.1', () => console.log(`Goldie web demo: http://127.0.0.1:${server.address().port}\nLive mentor: ${process.env.GOLDIE_DEMO_BACKEND_URL ? 'configured' : 'not connected (coding replay available)'}`));
}
