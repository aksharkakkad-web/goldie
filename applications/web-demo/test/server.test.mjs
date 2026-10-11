import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createDemoServer } from '../server.mjs';

async function serve(t, server) {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    return `http://127.0.0.1:${server.address().port}`;
}
test('serves shader from merged desktop source and blocks repository/secret access', async t => {
    const url = await serve(t, createDemoServer());
    const shader = await fetch(`${url}/orb-shaders.js`);
    assert.equal(shader.status, 200);
    assert.match(await shader.text(), /uniform float audioLevel/);
    assert.equal((await fetch(`${url}/.env`)).status, 404);
    assert.equal((await fetch(`${url}/backend/.env`)).status, 404);
    assert.equal((await fetch(`${url}/src/%2e%2e%2fserver.mjs`)).status, 404);
});
test('missing backend is explicit and external POST origins are rejected', async t => {
    const url = await serve(t, createDemoServer());
    assert.equal((await fetch(`${url}/api/offer`, { method: 'POST', body: '{}' })).status, 503);
    assert.equal((await fetch(`${url}/api/offer`, { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' })).status, 403);
    assert.equal((await fetch(`${url}/api/not-a-route`)).status, 404);
});
test('proxy preserves bounded API payloads without forwarding cookies or credentials', async t => {
    let observed;
    const upstream = await serve(t, createServer(async (req, res) => {
        const chunks = []; for await (const chunk of req) { chunks.push(chunk); }
        observed = { headers: req.headers, body: Buffer.concat(chunks).toString() };
        res.setHeader('content-type', 'application/json'); res.end('{"ok":true}');
    }));
    const url = await serve(t, createDemoServer({ backendUrl: upstream }));
    const response = await fetch(`${url}/api/offer`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'secret=x', authorization: 'secret' }, body: '{"revision":1}' });
    assert.equal(response.status, 200);
    assert.equal(observed.body, '{"revision":1}');
    assert.equal(observed.headers.cookie, undefined);
    assert.equal(observed.headers.authorization, undefined);
    assert.equal((await fetch(`${url}/api/offer`, { method: 'POST', body: 'x'.repeat(65537) })).status, 413);
});
test('refuses non-loopback proxy targets', () => {
    assert.throws(() => createDemoServer({ backendUrl: 'https://example.com' }), /loopback/);
});
