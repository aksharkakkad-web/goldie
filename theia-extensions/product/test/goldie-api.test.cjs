// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createGoldieApi } = require('../lib/node/goldie-api');
const { RpcProxyFactory } = require('@theia/core/lib/common/messaging/proxy-factory');

test('safe backend error semantics survive the actual Theia RPC error codec without leaking response messages', async () => {
    for (const [code, retryable, pattern] of [
        ['SPEECH_NOT_CONFIGURED', false, /configure.*backend/i],
        ['SPEECH_AUTH_FAILED', false, /credentials.*backend/i],
        ['SPEECH_TIMEOUT', true, /timed out/i],
        ['SPEECH_UNAVAILABLE', false, /unavailable/i]
    ]) {
        await withServer((_req, res) => {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { code, retryable, message: 'provider-key-secret /private/path' } }));
        }, async address => {
            await assert.rejects(createGoldieApi(address).speech({ sessionId: 'session', contentId: 'content' }), error => {
                const codec = new RpcProxyFactory();
                assert.doesNotMatch(error.toJson().stack, /goldie-api\.(?:js|ts)|\/Users\/|provider-key-secret|private\/path/);
                const restored = codec.deserializeError(new Error('captured'), codec.serializeError(error));
                assert.equal(restored.code, retryable ? -32002 : -32001);
                assert.equal(restored.data.apiCode, code);
                assert.match(restored.message, pattern);
                assert.doesNotMatch(JSON.stringify(restored.toJson()), /provider-key-secret|private\/path/);
                return true;
            });
        });
    }
});

test('unknown, malformed and oversized API errors stay generic and bounded', async () => {
    for (const body of [
        JSON.stringify({ error: { code: 'PRIVATE_SECRET', retryable: false, message: 'provider-key-secret' } }),
        JSON.stringify({ error: { code: 'SPEECH_AUTH_FAILED', retryable: 'false', message: 'provider-key-secret' } }),
        'provider-key-secret'.repeat(2000)
    ]) {
        await withServer((_req, res) => {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(body);
        }, async address => {
            await assert.rejects(createGoldieApi(address).offer(offer), error => {
                assert.match(error.message, /could not finish/);
                assert.doesNotMatch(error.message, /secret/);
                return true;
            });
        });
    }
});

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
const session = { sessionId: 'session', projectId: 'project', snapshotRevision: 2,
    phases: [{ id: 'phase', title: 'Functions', objective: 'Understand functions', description: 'A lesson' }],
    status: 'learning', activePhaseId: 'phase', completedIds: [], skippedIds: [], alreadyKnowIds: [], lastEvaluatedRevision: 2, questionHistory: [] };
const audioId = 'a'.repeat(64);
const speechInput = { sessionId: 'session', contentId: 'content' };
const metadata = { audioId, audioUrl: `/api/audio/${audioId}`, mimeType: 'audio/mpeg' };
const cases = [
    ['offer', '/api/offer', offer, { shouldOffer: true, previewTopics: ['functions'], offerId: 'offer' }],
    ['startSession', '/api/sessions', { offerId: 'offer', revision: 2, handoff: 'changes', profile: {} },
        session],
    ['teach', '/api/teach', { sessionId: 'session', phaseId: 'phase', handoff: 'changes', profile: {}, detail: 'standard' },
        { explanation: 'A function groups instructions.', groundingStatus: 'conceptual', contentId: 'content' }],
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
    const requests = [];
    await withServer((req, res) => {
        requests.push([req.method, req.url]);
        if (req.method === 'POST') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(metadata));
        } else {
            res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
            res.end(bytes);
        }
    }, async address => {
        const result = await createGoldieApi(address).speech(speechInput);
        assert.equal(result.mimeType, 'audio/mpeg');
        assert.deepEqual(Buffer.from(result.dataBase64, 'base64'), bytes);
        assert.deepEqual(requests, [['POST', '/api/speech'], ['GET', `/api/audio/${audioId}`]]);
    });
});

for (const [name, type, body] of [
    ['missing type', undefined, 'audio'],
    ['JSON', 'application/json', '{}'],
    ['empty audio', 'audio/mpeg', ''],
    ['oversized audio', 'audio/mpeg', Buffer.alloc(2 * 1024 * 1024 + 1)]
]) {
    test(`rejects ${name} speech`, async () => {
        await withServer((req, res) => {
            if (req.method === 'POST') {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(metadata));
                return;
            }
            if (type) { res.setHeader('Content-Type', type); }
            res.end(body);
        }, async address => assert.rejects(createGoldieApi(address).speech(speechInput), /invalid response/));
    });
}

test('speech uses its own deadline', async () => {
    await withServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.write('{');
    }, async address => assert.rejects(createGoldieApi(address, { speechTimeoutMs: 40 }).speech(speechInput), /too long/));
});

test('audio GET is bounded by a whole-body deadline and never follows redirects', async () => {
    for (const stalled of [true, false]) {
        let requests = 0;
        await withServer((req, res) => {
            requests++;
            if (req.method === 'POST') {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(metadata));
            } else if (stalled) {
                res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
                res.write('audio');
            } else {
                res.writeHead(302, { Location: 'http://example.com/secret' });
                res.end('secret');
            }
        }, async address => {
            await assert.rejects(createGoldieApi(address, { timeoutMs: 40 }).speech(speechInput), stalled ? /too long/ : /could not finish/);
            assert.equal(requests, 2);
        });
    }
});

test('session retrieval and idempotent actions validate the current contract', async () => {
    const requests = [];
    await withServer((req, res) => {
        requests.push([req.method, req.url]);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(session));
    }, async address => {
        const api = createGoldieApi(address);
        assert.deepEqual(await api.getSession('session'), session);
        assert.deepEqual(await api.action('session', { actionId: 'a1', action: 'pause' }), session);
        assert.deepEqual(requests, [['GET', '/api/sessions/session'], ['POST', '/api/sessions/session/actions']]);
        await assert.rejects(api.getSession(''), /invalid/);
        await assert.rejects(api.action('session', { actionId: 'a2', action: 'skip' }), /invalid/);
    });
});

test('never follows a speech URL supplied by metadata or accepts mismatched identifiers', async () => {
    for (const audioUrl of ['http://example.com/secret', '/api/audio/' + 'b'.repeat(64), '/api/audio/../../secret']) {
        let requests = 0;
        await withServer((_req, res) => {
            requests++;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ...metadata, audioUrl }));
        }, async address => {
            await assert.rejects(createGoldieApi(address).speech(speechInput), /invalid response/);
            assert.equal(requests, 1);
        });
    }
});

test('connection failures produce safe actionable errors', async () => {
    let address;
    await withServer((_req, res) => res.end(), async value => { address = value; });
    await assert.rejects(createGoldieApi(address).offer(offer), /Start the local teaching service/);
});
