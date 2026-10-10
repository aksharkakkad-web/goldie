// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { checkGoldieHealth } = require('../lib/node/goldie-health');

async function withServer(handler, run) {
    const server = http.createServer(handler);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        await run(`http://127.0.0.1:${server.address().port}`);
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
}

test('accepts a real healthy response and always requests /health', async () => {
    await withServer((req, res) => {
        assert.equal(req.url, '/health');
        res.end('{"ok":true}');
    }, async address => assert.equal((await checkGoldieHealth(address)).connected, true));
});

for (const [name, status, body] of [
    ['unhealthy', 200, '{"ok":false}'],
    ['malformed', 200, '<html>error</html>'],
    ['null', 200, 'null'],
    ['wrong type', 200, '{"ok":"true"}'],
    ['unexpected fields', 200, '{"ok":true,"unexpected":true}'],
    ['oversized', 200, ' '.repeat(5000)],
    ['server error', 500, '{"ok":true}'],
    ['redirect', 302, '{"ok":true}']
]) {
    test(`rejects ${name} health responses`, async () => {
        await withServer((_req, res) => {
            res.writeHead(status);
            res.end(body);
        }, async address => assert.equal((await checkGoldieHealth(address)).connected, false));
    });
}

test('times out even if the service never finishes sending its body', async () => {
    await withServer((_req, res) => {
        res.writeHead(200);
        res.write('{');
    }, async address => {
        const started = Date.now();
        const result = await checkGoldieHealth(address, 50);
        assert.equal(result.connected, false);
        assert.match(result.message, /too long/);
        assert.ok(Date.now() - started < 1000);
    });
});

test('reports unavailable after a connection is refused', async () => {
    let closedAddress;
    await withServer((_req, res) => res.end(), async address => { closedAddress = address; });
    assert.equal((await checkGoldieHealth(closedAddress)).connected, false);
});

test('rejects nonlocal, credential-bearing, and non-HTTP addresses before requesting', async () => {
    for (const address of ['https://localhost:8000', 'http://example.com', 'http://localhost:8000/private',
        'http://user:secret@localhost:8000', 'http://localhost:8000?token=secret', 'invalid']) {
        const result = await checkGoldieHealth(address);
        assert.equal(result.connected, false);
        assert.match(result.message, /GOLDIE_BACKEND_URL/);
        assert.ok(!result.message.includes('secret'));
    }
});
