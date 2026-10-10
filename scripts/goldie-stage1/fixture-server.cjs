// Client diagnostics ONLY. Uses the real prepared backend/contracts, never ElevenLabs.
// Optional --audio=/absolute/test.mp3 replays that file for every clip; it is not live speech.
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { buildApp } = require('../../backend/lib/src/app');
const { loadConfig } = require('../../backend/lib/src/config');

(async () => {
    const audioPath = process.argv.find(arg => arg.startsWith('--audio='))?.slice(8);
    let bytes;
    if (audioPath) {
        if (!path.isAbsolute(audioPath)) throw new Error('Use an absolute local test MP3 path.');
        const stat = await fs.stat(audioPath);
        if (!stat.isFile() || stat.size < 3 || stat.size > 2 * 1024 * 1024) throw new Error('Test MP3 must be a file below 2 MiB.');
        bytes = await fs.readFile(audioPath);
    }
    let failSpeech = process.argv.includes('--fail-speech-once');
    const provider = http.createServer((_req, res) => {
        if (failSpeech) { failSpeech = false; res.writeHead(503); res.end(); return; }
        res.writeHead(200, { 'content-type': 'audio/mpeg' });
        res.end(bytes);
    });
    await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'goldie-client-fixture-'));
    const app = await buildApp(loadConfig({
        GOLDIE_DATA_DIR: dataDir, GOLDIE_BACKEND_PORT: '8788',
        ELEVENLABS_API_KEY: bytes ? 'local-test-only' : undefined,
        ELEVENLABS_BASE_URL: `http://127.0.0.1:${provider.address().port}`
    }));
    let failTeach = process.argv.includes('--fail-teach-once');
    app.addHook('onRequest', async (req, reply) => {
        if (failTeach && req.url === '/api/teach') {
            failTeach = false;
            return reply.code(503).send({ error: { code: 'TEST_FAILURE', message: 'Explicit local diagnostic failure.', retryable: true } });
        }
    });
    await app.listen({ host: '127.0.0.1', port: 8788 });
    console.log('TEST ONLY: actual prepared backend on 127.0.0.1:8788; no live provider calls.');
    console.log(bytes ? 'Audio is a supplied test MP3 replay, NOT live lesson/answer synthesis.' : 'Text-only: speech intentionally unavailable.');
    console.log(`Diagnostic state retained at ${dataDir}`);
    const stop = async () => {
        await app.close();
        provider.closeAllConnections();
        await new Promise(resolve => provider.close(resolve));
    };
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
})().catch(() => { console.error('Client diagnostic server could not start. Build the backend and check the local MP3/port.'); process.exitCode = 1; });
