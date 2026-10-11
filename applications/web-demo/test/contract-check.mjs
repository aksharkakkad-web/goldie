// Optional local integration check. Models and speech are controlled, NOT live AI evidence.
// GOLDIE_CONTRACT_BACKEND_ROOT must point to an already built Stage 3 checkout.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createDemoServer } from '../server.mjs';
import { HttpApi } from '../src/api.js';
import { DemoController } from '../src/controller.js';
import { createJudgeBridge } from '../deploy/bridge.mjs';
import { createJudgeHandler } from '../deploy/handler.mjs';

const backendRoot = process.env.GOLDIE_CONTRACT_BACKEND_ROOT;
if (!backendRoot) { throw new Error('Set GOLDIE_CONTRACT_BACKEND_ROOT to the built Stage 3 backend checkout. No credentials are needed.'); }
const require = createRequire(import.meta.url);
const { buildApp } = require(resolve(backendRoot, 'backend/lib/src/app.js'));
const { loadConfig } = require(resolve(backendRoot, 'backend/lib/src/config.js'));
const directory = await mkdtemp(join(tmpdir(), 'goldie-web-contract-'));
const listen = async server => { await new Promise(r => server.listen(0, '127.0.0.1', r)); return `http://127.0.0.1:${server.address().port}`; };
const close = server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
const voice = createServer((req, res) => { req.resume(); res.writeHead(200, { 'content-type': 'audio/mpeg' }); res.end('ID3controlled-contract-audio'); });
let backend; let web; let bridge;
const judgeMode = process.env.GOLDIE_CONTRACT_JUDGE === '1';
try {
    const voiceUrl = await listen(voice);
    const provider = {
        identity: 'controlled-web-contract-check',
        async plan() { return { shouldOffer: true, reason: 'Useful architecture', estimatedSeconds: 180,
            phases: ['frontend', 'api'].map(phaseId => ({ id: phaseId, title: phaseId, objective: 'Understand trust boundaries', description: 'Form to server', whyNow: 'Relevant to the supplied example', sourceStatus: 'general', depth: 'foundation', prerequisiteIds: [] })) }; },
        async teach() { return { explanation: 'Validate on the server because a client can bypass the browser form.', groundingStatus: 'conceptual' }; },
        async ask() { return { answer: 'The server must validate every incoming request.' }; },
        async practice() { return { questions: [1, 2, 3].map(n => ({ id: `q${n}`, question: `Reason about trust boundary ${n}.`, modelAnswer: 'Only server checks protect server data.' })) }; }
    };
    backend = await buildApp(loadConfig({ GOLDIE_DATA_DIR: directory, ELEVENLABS_API_KEY: 'controlled-test-key', ELEVENLABS_BASE_URL: voiceUrl }), provider);
    await backend.listen({ host: '127.0.0.1', port: 0 });
    const backendUrl = `http://127.0.0.1:${backend.server.address().port}`;
    const headers = {};
    if (judgeMode) {
        const token = 'controlled-contract-bridge-not-a-real-secret';
        bridge = await createJudgeBridge({ backendUrl, token, usageFile: join(directory, 'judge-usage.json') });
        const bridgeUrl = await listen(bridge);
        const handler = createJudgeHandler({ username: 'judge', password: 'controlled-contract-password', bridgeToken: token,
            bridgeUrl: 'https://controlled.trycloudflare.com', fetcher: (url, options) => fetch(`${bridgeUrl}${new URL(url).pathname}`, options) });
        web = createServer(handler);
        headers.authorization = `Basic ${Buffer.from('judge:controlled-contract-password').toString('base64')}`;
    } else { web = createDemoServer({ backendUrl }); }
    const webUrl = await listen(web);
    const api = new HttpApi((path, options) => fetch(`${webUrl}${path}`, { ...options, headers: { ...options.headers, ...headers } }));
    const media = { playing: false, subscribe() {}, load(track) { this.selected = track; this[track] = true; }, select(track) { this.selected = track; }, async play() { this.playing = true; }, pause() { this.playing = false; }, clear() { this.playing = false; this.lesson = false; }, cancelRecording() {} };
    const controller = new DemoController(api, media);
    await controller.prepare(); assert.equal(controller.state.error, '');
    await controller.accept(); assert.equal(controller.state.error, ''); assert.equal(controller.state.session.phases.length, 2);
    const sessionId = controller.state.session.sessionId;
    const answer = await api.request('/api/ask', { sessionId, phaseId: 'frontend', question: 'Why validate again?', handoff: controller.context.handoff, requestId: 'controlled-question' });
    assert.equal(answer.kind, 'answer');
    await api.request(`/api/sessions/${sessionId}/actions`, { actionId: 'controlled-resume', action: 'resume' });
    await controller.mark('phase_completed'); await controller.practice();
    assert.equal(controller.state.error, ''); assert.equal(controller.state.batches.frontend.questions.length, 3);
    await controller.continuePhase(); await controller.mark('phase_completed');
    assert.equal(controller.state.session.status, 'completed');
    await controller.practice(); assert.equal(controller.state.error, ''); assert.equal(controller.state.batches.api.questions.length, 3);
    await controller.continuePhase(); await controller.review(); assert.equal(controller.state.view, 'review');
    assert.equal((await api.request(`/api/sessions/${sessionId}`)).status, 'completed');
    if (judgeMode) {
        const usage = JSON.parse(await readFile(join(directory, 'judge-usage.json'), 'utf8'));
        assert.ok(usage.characters > 0 && usage.characters <= 12000);
    }
    console.log(`PASS: actual Stage 3 HTTP routes -> ${judgeMode ? 'protected judge bridge/gateway' : 'web proxy'} -> browser adapter/controller; offer, session, teaching, controlled speech, conversation, phase actions, closed-session practice and review. Zero paid calls.`);
} finally {
    if (web) await close(web);
    if (bridge) await close(bridge);
    if (backend) await backend.close();
    await close(voice);
    // Only this test-created temporary data directory is removed.
    await rm(directory, { recursive: true, force: true });
}
