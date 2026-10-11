import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJudgeBridge } from '../deploy/bridge.mjs';
import { createJudgeHandler } from '../deploy/handler.mjs';
import { buildJudgeOutput } from '../deploy/build.mjs';

const token = 'controlled-bridge-token-not-a-real-secret';
const basic = `Basic ${Buffer.from('judge:test-passcode').toString('base64')}`;
async function serve(t, server) {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    return `http://127.0.0.1:${server.address().port}`;
}
async function folder(t) {
    const dir = await mkdtemp(join(tmpdir(), 'goldie-judge-test-'));
    t.after(() => rm(dir, { recursive: true, force: true })); return dir;
}
async function fixture(t, limit = 20) {
    const calls = [];
    const upstream = await serve(t, createServer(async (req, res) => {
        const chunks = []; for await (const chunk of req) { chunks.push(chunk); }
        calls.push({ path: req.url, headers: req.headers });
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(req.url === '/api/teach' ? { explanation: 'Ten chars.', contentId: 'c1' }
            : req.url === '/health' ? { ok: true } : { ok: true, audioUrl: `/api/audio/${'a'.repeat(64)}` }));
    }));
    const usageFile = join(await folder(t), 'usage.json');
    const bridge = await createJudgeBridge({ backendUrl: upstream, token, usageFile, characterLimit: limit });
    const url = await serve(t, bridge);
    const post = (path, body) => fetch(url + path, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { calls, usageFile, url, post, upstream };
}
test('tunnel bridge denies unauthorized, cross-origin and unknown routes before backend access', async t => {
    const f = await fixture(t);
    assert.equal((await fetch(f.url + '/health')).status, 401);
    assert.equal((await fetch(f.url + '/health', { headers: { authorization: `Bearer ${token}`, origin: 'https://evil.example' } })).status, 403);
    assert.equal((await f.post('/api/not-a-route', {})).status, 404);
    assert.equal((await fetch(f.url + '/backend/.env', { headers: { authorization: `Bearer ${token}` } })).status, 404);
    assert.equal(f.calls.length, 0);
    assert.equal((await f.post('/api/offer', { handoff: 'x'.repeat(65537) })).status, 413);
    assert.equal(f.calls.length, 0);
});
test('bridge never forwards secrets and refuses unknown speech content', async t => {
    const f = await fixture(t);
    assert.equal((await f.post('/api/speech', { sessionId: 's1', contentId: 'unknown' })).status, 409);
    assert.equal(f.calls.length, 0);
    assert.equal((await f.post('/api/teach', { sessionId: 's1', phaseId: 'p1' })).status, 200);
    assert.equal(f.calls[0].headers.authorization, undefined); assert.equal(f.calls[0].headers.origin, undefined);
});
test('voice budget reserves before synthesis, persists across restart, and fails closed', async t => {
    const f = await fixture(t, 15);
    await f.post('/api/teach', { sessionId: 's1', phaseId: 'p1' });
    assert.equal((await f.post('/api/speech', { sessionId: 's1', contentId: 'c1' })).status, 200);
    const denied = await f.post('/api/speech', { sessionId: 's1', contentId: 'c1' });
    assert.equal(denied.status, 429); assert.match((await denied.json()).error.message, /voice budget/);
    assert.equal(f.calls.filter(call => call.path === '/api/speech').length, 1);
    assert.equal(JSON.parse(await readFile(f.usageFile, 'utf8')).characters, 10);
    const next = await createJudgeBridge({ backendUrl: f.upstream, token, usageFile: f.usageFile, characterLimit: 15 });
    const url = await serve(t, next);
    const post = (path, body) => fetch(url + path, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    await post('/api/teach', { sessionId: 's1', phaseId: 'p1' });
    assert.equal((await post('/api/speech', { sessionId: 's1', contentId: 'c1' })).status, 429);
});
test('parallel speech requests cannot race through the shared budget', async t => {
    const f = await fixture(t, 15); await f.post('/api/teach', { sessionId: 's1', phaseId: 'p1' });
    const responses = await Promise.all([f.post('/api/speech', { sessionId: 's1', contentId: 'c1' }), f.post('/api/speech', { sessionId: 's1', contentId: 'c1' })]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 429]);
    assert.equal(f.calls.filter(call => call.path === '/api/speech').length, 1);
});
test('corrupt usage is not reset on restart and request limits stop generation', async t => {
    const dir = await folder(t); const usageFile = join(dir, 'usage.json');
    await writeFile(usageFile, '{invalid');
    await assert.rejects(createJudgeBridge({ backendUrl: 'http://127.0.0.1:8797', token, usageFile }), /refusing to reset/);
    await writeFile(usageFile, JSON.stringify({ characters: 0, requests: 500 }));
    const bridge = await createJudgeBridge({ backendUrl: 'http://127.0.0.1:1', token, usageFile });
    const url = await serve(t, bridge);
    const response = await fetch(url + '/api/offer', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: '{}' });
    assert.equal(response.status, 429); assert.equal((await response.json()).error.code, 'DEMO_REQUEST_BUDGET');
});
test('deployed function serves actual packaged assets and mapped original paths behind auth', async t => {
    const output = join(await folder(t), 'output'); await buildJudgeOutput(output);
    const handler = createJudgeHandler({ username: 'judge', password: 'test-passcode', bridgeToken: token,
        bridgeUrl: 'https://controlled.trycloudflare.com', publicDir: join(output, 'functions/judge.func/public') });
    const url = await serve(t, createServer(handler));
    const root = await fetch(url + '/judge?__goldie_path=', { headers: { authorization: basic } });
    assert.equal(root.status, 200); assert.match(await root.text(), /Goldie learning panel/);
    const shader = await fetch(url + '/judge?__goldie_path=orb-shaders.js', { headers: { authorization: basic } });
    assert.equal(shader.status, 200); assert.match(await shader.text(), /uniform float audioLevel/);
    assert.equal((await fetch(url + '/judge?__goldie_path=../handler.mjs', { headers: { authorization: basic } })).status, 404);
});
test('Vercel package includes only public assets and reviewed function code, never repo or keys', async t => {
    const output = join(await folder(t), 'output'); await buildJudgeOutput(output);
    const files = await readdir(output, { recursive: true });
    assert.ok(files.includes('functions/judge.func/public/index.html'));
    assert.ok(files.includes('functions/judge.func/public/assets/goldie.png'));
    assert.ok(files.includes('functions/judge.func/public/orb-shaders.js'));
    assert.ok(!files.some(file => /\.env|backend|node_modules|\.git|test\//.test(file)));
    const config = JSON.parse(await readFile(join(output, 'config.json'), 'utf8'));
    assert.equal(config.version, 3); assert.equal(config.routes[0].dest, '/judge?__goldie_path=$1');
    assert.match(await readFile(join(output, 'functions/judge.func/public/orb-shaders.js'), 'utf8'), /uniform float audioLevel/);
});
test('Vercel handler protects all files with judge auth and proxies only to the fixed bridge', async t => {
    const calls = [];
    const handler = createJudgeHandler({ username: 'judge', password: 'test-passcode', bridgeUrl: 'https://controlled.trycloudflare.com', bridgeToken: token,
        publicDir: join(await folder(t), 'public'), fetcher: async (url, options) => {
            calls.push({ url: String(url), options }); return Response.json({ ok: true });
        } });
    const url = await serve(t, createServer(handler));
    assert.equal((await fetch(url + '/')).status, 401);
    assert.equal((await fetch(url + '/api/offer', { method: 'POST', headers: { authorization: basic, origin: 'https://evil.example' }, body: '{}' })).status, 403);
    assert.equal(calls.length, 0);
    const response = await fetch(url + '/api/offer', { method: 'POST', headers: { authorization: basic, cookie: 'never-forward=x' }, body: '{}' });
    assert.equal(response.status, 200); assert.equal(calls[0].url, 'https://controlled.trycloudflare.com/api/offer');
    assert.equal(calls[0].options.headers.authorization, `Bearer ${token}`);
    assert.equal(calls[0].options.headers.cookie, undefined);
    const health = await (await fetch(url + '/demo-config', { headers: { authorization: basic } })).json();
    assert.deepEqual(health, { connected: true, reachable: true });
    assert.equal(calls.at(-1).url, 'https://controlled.trycloudflare.com/health');
    assert.equal((await fetch(url + '/.env', { headers: { authorization: basic } })).status, 404);
});
test('Vercel handler fails closed for missing credentials or unsafe upstream configuration', () => {
    assert.throws(() => createJudgeHandler({}), /credentials/);
    assert.throws(() => createJudgeHandler({ username: 'judge', password: 'x', bridgeToken: token, bridgeUrl: 'https://evil.example' }), /tunnel/);
});
