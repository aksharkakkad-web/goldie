// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { buildApp } = require('../../../backend/lib/src/app');
const { loadConfig } = require('../../../backend/lib/src/config');
const { createGoldieApi } = require('../lib/node/goldie-api');
const { GoldieLessonController } = require('../lib/browser/goldie/goldie-lesson-controller');

test('two windows reject conflicting acceptance safely without disturbing the owning lesson', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'goldie-two-windows-'));
    const provider = { identity: 'controlled-two-windows-v1', async plan() {
        return { shouldOffer: true, reason: 'Architecture teaching', estimatedSeconds: 60, phases: [{ id: 'boundary', title: 'Trust boundary',
            objective: 'Understand trust boundaries', description: 'Conceptual teaching.', whyNow: 'Relevant architecture',
            depth: 'working', sourceStatus: 'planned', prerequisiteIds: [] }] };
    }, async teach() { return { explanation: 'Conceptual trust boundary.', groundingStatus: 'conceptual' }; } };
    let app, owner, contender, restored;
    const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; };
    const audio = () => ({ subscribe: () => () => {}, clear() {}, dispose() {}, pause() {}, load() { assert.fail('No configured speech'); },
        select() {}, async play() { assert.fail('No configured speech'); } });
    try {
        app = await buildApp(loadConfig({ GOLDIE_DATA_DIR: dataDir }), provider);
        const api = createGoldieApi(await app.listen({ host: '127.0.0.1', port: 0 }));
        const contenderStorage = storage();
        owner = new GoldieLessonController(api, audio(), storage()); contender = new GoldieLessonController(api, audio(), contenderStorage);
        owner.setContext('Plan a team API with membership permissions.', 'beginner');
        contender.setContext('Plan a team API with membership permissions.', 'intermediate');
        await owner.checkOffer(); await contender.checkOffer();
        const rejected = { version: 2, offerId: contender.state.offer.offerId, revision: 1, context: contender.state.context };
        await owner.acceptOffer(); const ownerSession = await api.getSession(owner.state.session.sessionId);
        await contender.acceptOffer();
        assert.equal(contender.state.view, 'idle'); assert.equal(contender.canChangeContext, true);
        assert.equal(contender.state.retryable, false); assert.match(contender.state.error, /owning window/i);
        assert.deepEqual(await api.getSession(ownerSession.sessionId), ownerSession);
        assert.equal(contenderStorage.getItem('goldie.lesson-recovery.v2'), 'null');
        await owner.endSession();
        // Replay the other window's stale offer after the owner closes the revision.
        contenderStorage.setItem('goldie.lesson-recovery.v2', JSON.stringify(rejected));
        restored = new GoldieLessonController(api, audio(), contenderStorage); await restored.restore();
        assert.equal(restored.state.view, 'idle'); assert.equal(restored.canChangeContext, true);
        assert.equal(restored.state.retryable, false); assert.match(restored.state.error, /already.*accepted/i);
        assert.equal((await api.getSession(ownerSession.sessionId)).status, 'dismissed');
        restored.setContext('Add runtime validation for team input.', 'beginner'); await restored.checkOffer();
        assert.equal(restored.state.view, 'offer');
        const saved = JSON.parse(await fs.readFile(path.join(dataDir, 'sessions.json'), 'utf8'));
        assert.equal(saved.sessions.length, 1);
    } finally {
        owner?.dispose(); contender?.dispose(); restored?.dispose(); await app?.close();
        await fs.rm(dataDir, { recursive: true, force: true });
    }
});

for (const count of [7, 12]) {
    test(`${count}-phase generated roadmap survives real transport, actions, backend restart and full recap`, async () => {
        const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'goldie-large-roadmap-'));
        const phases = Array.from({ length: count }, (_, i) => ({ id: `concept-${i + 1}`, title: `Concept ${i + 1}`,
            objective: 'Understand one engineering responsibility', description: 'Controlled large-roadmap test data.',
            whyNow: 'Required by the controlled test task', depth: 'working', sourceStatus: 'planned', prerequisiteIds: [] }));
        const provider = { identity: 'controlled-large-roadmap-v1', async plan() {
            return { shouldOffer: true, reason: 'Controlled engineering task', estimatedSeconds: count * 60, phases };
        }, async teach() { return { explanation: 'Controlled conceptual teaching.', groundingStatus: 'conceptual' }; } };
        const config = loadConfig({ GOLDIE_DATA_DIR: dataDir });
        let app;
        try {
            app = await buildApp(config, provider);
            let api = createGoldieApi(await app.listen({ host: '127.0.0.1', port: 0 }));
            const offer = await api.offer({ projectId: 'large-task', revision: 1, handoff: 'Controlled larger architecture task.' });
            assert.equal(offer.previewTopics.length, 3);
            let session = await api.startSession({ offerId: offer.offerId, revision: 1 });
            assert.equal(session.phases.length, count);
            assert.equal((await api.startSession({ offerId: offer.offerId, revision: 1 })).sessionId, session.sessionId);
            session = await api.action(session.sessionId, { actionId: 'completed-1', action: 'phase_completed', phaseId: 'concept-1' });
            await app.close(); app = await buildApp(config, provider);
            api = createGoldieApi(await app.listen({ host: '127.0.0.1', port: 0 }));
            session = await api.getSession(session.sessionId);
            assert.equal(session.phases.length, count);
            assert.equal(session.activePhaseId, 'concept-2');
            assert.deepEqual(session.completedIds, ['concept-1']);
            session = await api.action(session.sessionId, { actionId: 'skip-2', action: 'skip', phaseId: 'concept-2' });
            for (let i = 3; i <= count; i++) {
                session = await api.action(session.sessionId, { actionId: `familiar-${i}`, action: 'already_know', phaseId: `concept-${i}` });
            }
            assert.equal(session.activePhaseId, undefined);
            const recap = await api.complete({ sessionId: session.sessionId, status: 'completed', currentRevision: 1 });
            assert.match(recap.recap, /Covered: Concept 1/);
            assert.match(recap.recap, /Skipped: Concept 2/);
            assert.match(recap.recap, /not demonstrated mastery/);
            assert.match(recap.recap, new RegExp(`Concept ${count}`));
            session = await api.getSession(session.sessionId);
            assert.equal(session.status, 'completed');
            assert.equal(session.alreadyKnowIds.length, count - 2);
        } finally {
            await app?.close();
            await fs.rm(dataDir, { recursive: true, force: true });
        }
    });
}

for (const lost of [false, true]) {
    test(`interrupted acceptance recovers through real HTTP without autoplay (${lost ? 'lost response' : 'disposed before response'})`, { timeout: 15000 }, async () => {
        const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'goldie-acceptance-'));
        const app = await buildApp(loadConfig({ GOLDIE_DATA_DIR: dataDir }));
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        let committed;
        const accepted = new Promise(resolve => { committed = resolve; });
        let first = true;
        let teachingRequests = 0;
        app.addHook('onSend', async (request, reply, payload) => {
            if (request.url === '/api/teach' || request.url === '/api/speech') { teachingRequests++; }
            if (first && request.method === 'POST' && request.url === '/api/sessions') {
                first = false;
                committed(JSON.parse(payload)); // Handler has committed; interrupt only its HTTP response.
                await gate;
                if (lost) { reply.raw.destroy(); }
            }
            return payload;
        });
        let original, restored;
        try {
            const api = createGoldieApi(await app.listen({ host: '127.0.0.1', port: 0 }));
            // Stage 1 backend fixture is selected only at this test boundary, never in the live controller.
            const preparedApi = { ...api, offer: request => api.offer({ ...request, referenceLessonId: 'webapp-architecture' }) };
            const values = new Map();
            const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
            const audio = { subscribe: () => () => {}, clear() {}, dispose() {}, pause() {},
                load() { assert.fail('Restore must not load audio'); }, select() {}, async play() { assert.fail('Restore must not play audio'); } };
            original = new GoldieLessonController(preparedApi, audio, storage);
            original.setContext('Illustrative architecture handoff for Stage 1 regression.', 'beginner', 'HANDOFF.md');
            await original.checkOffer();
            const pending = original.acceptOffer();
            const savedSession = await accepted;
            assert.equal(JSON.parse(values.get('goldie.lesson-recovery.v2')).offerId, original.state.offer.offerId);
            if (!lost) { original.dispose(); }
            release();
            await pending;
            original.dispose();
            restored = new GoldieLessonController(preparedApi, audio, storage);
            await restored.restore();
            assert.equal(restored.state.error, undefined);
            assert.equal(restored.state.session.sessionId, savedSession.sessionId);
            assert.equal(restored.state.session.activePhaseId, 'frontend');
            assert.equal(restored.state.restored, true);
            assert.equal(restored.state.audioState, 'paused');
            assert.equal(teachingRequests, 0);
            const persisted = JSON.parse(await fs.readFile(path.join(dataDir, 'sessions.json'), 'utf8'));
            assert.equal(persisted.sessions.length, 1);
            assert.equal(JSON.parse(values.get('goldie.lesson-recovery.v2')).sessionId, savedSession.sessionId);
        } finally {
            release();
            original?.dispose(); restored?.dispose();
            await app.close();
            await fs.rm(dataDir, { recursive: true, force: true });
        }
    });
}

test('Theia transport completes a persisted real-backend journey with separately fetched speech', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'goldie-transport-'));
    let providerCalls = 0;
    const provider = http.createServer((_req, res) => {
        providerCalls++;
        res.writeHead(200, { 'content-type': 'audio/mpeg' });
        res.end('ID3controlled-test-bytes');
    });
    await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
    const config = loadConfig({ GOLDIE_DATA_DIR: dataDir, ELEVENLABS_API_KEY: 'test-only-secret',
        ELEVENLABS_BASE_URL: `http://127.0.0.1:${provider.address().port}` });
    let app;
    try {
        app = await buildApp(config);
        let api = createGoldieApi(await app.listen({ host: '127.0.0.1', port: 0 }));
        const offer = await api.offer({ projectId: 'reference', revision: 1, referenceLessonId: 'webapp-architecture' });
        assert.equal(offer.shouldOffer, true);
        assert.equal(providerCalls, 0);
        let session = await api.startSession({ offerId: offer.offerId, revision: 1 });
        assert.deepEqual(session.phases.map(p => p.id), ['frontend', 'backend', 'database']);
        const lesson = await api.teach({ sessionId: session.sessionId, phaseId: 'frontend', detail: 'standard' });
        assert.equal(providerCalls, 0);
        const speech = await api.speech({ sessionId: session.sessionId, contentId: lesson.contentId });
        assert.equal(speech.mimeType, 'audio/mpeg');
        assert.equal(Buffer.from(speech.dataBase64, 'base64').toString(), 'ID3controlled-test-bytes');
        await api.speech({ sessionId: session.sessionId, contentId: lesson.contentId });
        assert.equal(providerCalls, 1);
        await api.action(session.sessionId, { actionId: 'pause', action: 'pause' });
        const answer = await api.ask({ sessionId: session.sessionId, phaseId: 'frontend', question: 'What is an API?' });
        assert.equal(answer.resumePhaseId, 'frontend');
        await api.speech({ sessionId: session.sessionId, contentId: answer.contentId });
        assert.equal(providerCalls, 2);
        await api.action(session.sessionId, { actionId: 'resume', action: 'resume' });
        const completed = { actionId: 'heard', action: 'phase_completed', phaseId: 'frontend' };
        session = await api.action(session.sessionId, completed);
        assert.equal(session.activePhaseId, 'backend');
        assert.equal((await api.action(session.sessionId, completed)).activePhaseId, 'backend');
        await app.close();
        app = await buildApp(config);
        api = createGoldieApi(await app.listen({ host: '127.0.0.1', port: 0 }));
        session = await api.getSession(session.sessionId);
        assert.equal(session.activePhaseId, 'backend');
        assert.deepEqual(session.completedIds, ['frontend']);
        session = await api.action(session.sessionId, { actionId: 'skip', action: 'skip', phaseId: 'backend' });
        assert.equal(session.activePhaseId, 'database');
        session = await api.action(session.sessionId, { actionId: 'know', action: 'already_know', phaseId: 'database' });
        const recap = await api.complete({ sessionId: session.sessionId, status: 'completed', currentRevision: 1 });
        assert.match(recap.recap, /Covered:/);
        assert.match(recap.recap, /not demonstrated mastery/);
        session = await api.getSession(session.sessionId);
        assert.equal(session.status, 'completed');
        assert.deepEqual(session.skippedIds, ['backend']);
        assert.deepEqual(session.alreadyKnowIds, ['database']);
    } finally {
        if (app) await app.close();
        provider.closeAllConnections();
        await new Promise(resolve => provider.close(resolve));
        await fs.rm(dataDir, { recursive: true, force: true });
    }
});
