// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { createRequire } from 'node:module';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDemoServer } from './server.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Starts owned local processes only. Startup performs no model or speech requests. */
export async function startConnectedDemo({ backendRoot, envFile, backendPort = 8797, webPort = 4317,
    dataDir = resolve(repo, 'backend/.data/web-demo') } = {}) {
    if (!backendRoot) { throw new Error('Set GOLDIE_DEMO_BACKEND_ROOT to an already built Stage 3 checkout.'); }
    envFile ??= resolve(backendRoot, 'backend/.env');
    if (![backendRoot, envFile, dataDir].every(isAbsolute)) { throw new Error('Backend, environment and data paths must be absolute.'); }
    for (const port of [backendPort, webPort]) {
        if (!Number.isInteger(port) || port < 1 || port > 65535) { throw new Error('Use valid local port numbers.'); }
    }
    const requireBackend = createRequire(resolve(backendRoot, 'backend/package.json'));
    const parsed = requireBackend('dotenv').parse(await readFile(envFile));
    const { loadConfig } = requireBackend('./lib/src/config.js');
    const { buildApp } = requireBackend('./lib/src/app.js');
    const config = loadConfig({ ...parsed, ...process.env, GOLDIE_BACKEND_HOST: '127.0.0.1',
        GOLDIE_BACKEND_PORT: String(backendPort), GOLDIE_DATA_DIR: dataDir });
    if (!config.geminiApiKey || !config.elevenLabsApiKey) { throw new Error('The saved server environment needs Gemini and ElevenLabs credentials.'); }
    for (const [path, mode] of [[config.whisperBin, constants.X_OK], [config.ffmpegBin, constants.X_OK], [config.whisperModelPath, constants.R_OK]]) {
        if (!path || !isAbsolute(path)) { throw new Error('Configure the existing absolute local Whisper/model/FFmpeg paths before starting.'); }
        await access(path, mode);
    }
    const app = await buildApp(config);
    const backendUrl = `http://127.0.0.1:${backendPort}`;
    const server = createDemoServer({ backendUrl });
    try {
        await app.listen({ host: '127.0.0.1', port: backendPort });
        await new Promise((resolveListen, reject) => {
            server.once('error', reject); server.listen(webPort, '127.0.0.1', resolveListen);
        });
    } catch (error) { await app.close(); throw error; }
    return { backendUrl, webUrl: `http://127.0.0.1:${webPort}`, dataDir,
        async close() { await new Promise(done => { server.closeAllConnections(); server.close(done); }); await app.close(); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        const demo = await startConnectedDemo({ backendRoot: process.env.GOLDIE_DEMO_BACKEND_ROOT,
            envFile: process.env.GOLDIE_DEMO_ENV_FILE, backendPort: Number(process.env.GOLDIE_DEMO_BACKEND_PORT ?? 8797),
            webPort: Number(process.env.GOLDIE_DEMO_PORT ?? 4317), dataDir: process.env.GOLDIE_DEMO_DATA_DIR });
        console.log(`Goldie website: ${demo.webUrl}\nIsolated backend: ${demo.backendUrl}\nNo paid requests on startup. Voice generation remains enabled for explicit lesson use.`);
        const stop = async () => { await demo.close(); };
        process.once('SIGINT', stop); process.once('SIGTERM', stop);
    } catch { console.error('Connected demo could not start. Check the built Stage 3 checkout, saved environment, local transcription paths and free ports. No provider test was run.'); process.exitCode = 1; }
}
