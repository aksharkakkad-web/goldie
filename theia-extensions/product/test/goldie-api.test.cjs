// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createGoldieApi } = require('../lib/node/goldie-api');

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

const offer = { projectId: 'project', revision: 2, handoff: 'changes', profile: {} };
const cases = [
    ['offer', '/api/offer', offer, { shouldOffer: true, previewTopics: ['functions'], offerId: 'offer' }],
    ['startSession', '/api/sessions', { offerId: 'offer', revision: 2, handoff: 'changes', profile: {} },
        { sessionId: 'session', snapshotRevision: 2, phases: [{ id: 'phase', title: 'Functions', objective: 'Understand functions', description: 'A lesson' }] }],
    ['teach', '/api/teach', { sessionId: 'session', phaseId: 'phase', handoff: 'changes', profile: {} },
        { explanation: 'A function groups instructions.', groundingStatus: 'conceptual' }],
    ['ask', '/api/ask', { sessionId: 'session', phaseId: 'phase', question: 'Why?', handoff: 'changes' },
        { kind: 'needs_sources', sourceQueries: ['main.ts'], resumePhaseId: 'phase' }],
    ['complete', '/api/complete', { sessionId: 'session', status: 'completed', currentRevision: 2, handoff: 'changes', learningState: {} },
        { recap: 'Learned functions', lastEvaluatedRevision: 2 }]
];

for (const [method, path, input, output] of cases) {
    test(`${method} posts its contract and validates its response`, async () => {
        await withServer((req, res) => {
            assert.equal(req.method, 'POST');
            assert.equal(req.url, path);
            assert.equal(req.headers['content-type'], 'application/json');
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                assert.deepEqual(JSON.parse(body), input);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(output));
            });
        }, async address => assert.deepEqual(await createGoldieApi(address)[method](input), output));
    });
    test(`${method} rejects an invalid response`, async () => {
        await withServer((_req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.end('{"secret":"never reveal"}');
        }, async address => {
            await assert.rejects(createGoldieApi(address)[method](input), error => {
                assert.match(error.message, /invalid response/);
                assert.ok(!error.message.includes('secret'));
                return true;
            });
        });
    });
}

test('rejects invalid and oversized requests before contacting the server', async () => {
    let requests = 0;
    await withServer((_req, res) => { requests++; res.end(); }, async address => {
        const api = createGoldieApi(address);
        await assert.rejects(api.offer({ ...offer, revision: -1 }), /request is invalid/);
        await assert.rejects(api.offer({ ...offer, handoff: 'x'.repeat(1024 * 1024) }), /request is invalid/);
        await assert.rejects(api.speech({ text: '' }), /request is invalid/);
        assert.equal(requests, 0);
    });
});

test('only accepts a configured local root HTTP URL', async () => {
    for (const address of ['https://localhost:8787', 'http://example.com', 'http://localhost:8787/private',
        'http://user:secret@localhost:8787', 'http://localhost:8787?secret=value', 'bad']) {
        await assert.rejects(createGoldieApi(address).offer(offer), error => {
            assert.match(error.message, /GOLDIE_BACKEND_URL/);
            assert.ok(!error.message.includes('secret'));
            return true;
        });
    }
});

for (const [status, pattern] of [[404, /not ready yet/], [500, /could not finish/], [302, /could not finish/]]) {
    test(`handles HTTP ${status} without exposing remote errors or following redirects`, async () => {
        let requests = 0;
        await withServer((_req, res) => {
            requests++;
            res.writeHead(status, { Location: 'http://example.com', 'Content-Type': 'application/json' });
            res.end('provider-key-secret');
        }, async address => {
            await assert.rejects(createGoldieApi(address).offer(offer), error => {
                assert.match(error.message, pattern);
                assert.ok(!error.message.includes('secret'));
                return true;
            });
            assert.equal(requests, 1);
        });
    });
}

for (const [name, type, body] of [
    ['malformed JSON', 'application/json', '{'],
    ['unexpected fields', 'application/json', '{"shouldOffer":false,"previewTopics":[],"extra":true}'],
    ['wrong content type', 'text/html', '<html>secret</html>'],
    ['oversized JSON', 'application/json', 'x'.repeat(1024 * 1024 + 1)]
]) {
    test(`rejects ${name}`, async () => {
        await withServer((_req, res) => {
            res.setHeader('Content-Type', type);
            res.end(body);
        }, async address => assert.rejects(createGoldieApi(address).offer(offer), /invalid response/));
    });
}

test('deadline covers a response that never finishes', async () => {
    await withServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.write('{');
    }, async address => {
        const start = Date.now();
        await assert.rejects(createGoldieApi(address, { timeoutMs: 40 }).offer(offer), /too long/);
        assert.ok(Date.now() - start < 1000);
    });
});

test('speech returns exact audio bytes encoded for local RPC', async () => {
    const bytes = Buffer.from([0, 255, 127, 10, 42]);
    await withServer((req, res) => {
        assert.equal(req.url, '/api/speech');
        res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
        res.end(bytes);
    }, async address => {
        const result = await createGoldieApi(address).speech({ text: 'Hello' });
        assert.equal(result.mimeType, 'audio/mpeg');
        assert.deepEqual(Buffer.from(result.dataBase64, 'base64'), bytes);
    });
});

for (const [name, type, body] of [
    ['missing type', undefined, 'audio'],
    ['JSON', 'application/json', '{}'],
    ['empty audio', 'audio/mpeg', ''],
    ['oversized audio', 'audio/mpeg', Buffer.alloc(8 * 1024 * 1024 + 1)]
]) {
    test(`rejects ${name} speech`, async () => {
        await withServer((_req, res) => {
            if (type) { res.setHeader('Content-Type', type); }
            res.end(body);
        }, async address => assert.rejects(createGoldieApi(address).speech({ text: 'Hello' }), /invalid response/));
    });
}

test('speech uses its own deadline', async () => {
    await withServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
        res.write('audio');
    }, async address => assert.rejects(createGoldieApi(address, { speechTimeoutMs: 40 }).speech({ text: 'Hello' }), /too long/));
});

test('connection failures produce safe actionable errors', async () => {
    let address;
    await withServer((_req, res) => res.end(), async value => { address = value; });
    await assert.rejects(createGoldieApi(address).offer(offer), /Start the local teaching service/);
});
