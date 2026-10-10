// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GoldieLessonController } = require('../lib/browser/goldie/goldie-lesson-controller');

class FakeAudio {
    tracks = {};
    track = 'lesson';
    plays = 0;
    loads = 0;
    disposed = false;
    subscribe(listener) { this.listener = listener; return () => { this.listener = undefined; }; }
    load(track) { this.loads++; this.tracks[track] = { position: 0 }; this.select(track); }
    select(track) { this.pause(); this.track = track; }
    async play() { assert.ok(this.tracks[this.track]); this.plays++; this.emit('playing'); }
    pause() { this.emit('paused'); }
    clear() { this.tracks = {}; }
    dispose() { this.disposed = true; this.clear(); }
    emit(state) { this.listener?.(state, this.track); }
}
function setup(count = 3) {
    const audio = new FakeAudio();
    const calls = { speech: [], complete: [], teach: [] };
    const phases = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, title: `Phase ${i}`, objective: 'Learn', description: 'Description' }));
    const service = {
        async offer() { return { shouldOffer: true, offerId: 'o1', previewTopics: ['Authentication'] }; },
        async startSession() { return { sessionId: 's1', snapshotRevision: 1, phases }; },
        async teach(request) { calls.teach.push(request); return { explanation: `Explain ${request.phaseId}`, groundingStatus: 'conceptual' }; },
        async ask(request) { return { kind: 'answer', answer: `Answer ${request.question}`, resumePhaseId: request.phaseId }; },
        async speech(request) { calls.speech.push(request); return { mimeType: 'audio/mpeg', dataBase64: 'YQ==' }; },
        async complete(request) { calls.complete.push(request); return { recap: 'Your recap', lastEvaluatedRevision: 1 }; }
    };
    const controller = new GoldieLessonController(service, audio);
    return { controller, audio, service, calls };
}
async function start(controller) { await controller.checkOffer(); await controller.acceptOffer(); }

test('decline never starts a session or audio', async () => {
    const { controller, audio, calls } = setup();
    await controller.checkOffer();
    controller.declineOffer();
    assert.equal(controller.state.view, 'idle');
    assert.equal(controller.state.session, undefined);
    assert.equal(audio.plays, 0);
    assert.deepEqual(calls.speech, []);
});

test('questions use separate audio and resume exact lesson position without refetching', async () => {
    const { controller, audio, calls } = setup();
    await start(controller);
    const original = audio.tracks.lesson;
    original.position = 12.5;
    await controller.askQuestion('Why sessions?');
    assert.equal(controller.state.view, 'question');
    assert.equal(controller.state.phaseIndex, 0);
    assert.equal(audio.track, 'answer');
    await controller.resumeLesson();
    assert.equal(audio.tracks.lesson, original);
    assert.equal(original.position, 12.5);
    assert.equal(audio.track, 'lesson');
    assert.equal(calls.teach.length, 1);
    assert.equal(calls.speech.length, 2);
});

test('heard, skipped, and self-reported familiarity remain distinct in completion', async () => {
    const { controller, audio, calls } = setup();
    await start(controller);
    assert.equal(controller.state.statuses.p0, 'pending');
    await controller.playPause();
    assert.equal(controller.state.audioState, 'paused');
    await controller.playPause();
    audio.emit('ended');
    assert.equal(controller.state.statuses.p0, 'heard');
    await controller.nextPhase();
    await controller.skipPhase();
    await controller.markFamiliar();
    assert.equal(controller.state.view, 'recap');
    assert.deepEqual(calls.complete[0].learningState.phases, { p0: 'heard', p1: 'skipped', p2: 'familiar' });
    assert.equal(calls.complete[0].status, 'completed');
});

test('advancing and ending unplayed phases never records them as heard', async () => {
    const { controller, calls } = setup(2);
    await start(controller);
    await controller.nextPhase();
    await controller.endSession();
    assert.deepEqual(calls.complete[0].learningState.phases, { p0: 'pending', p1: 'pending' });
    assert.equal(calls.complete[0].status, 'dismissed');
});

test('zero-phase sessions remain safe and can complete', async () => {
    const { controller, calls } = setup(0);
    await start(controller);
    assert.equal(controller.state.view, 'lesson');
    assert.equal(calls.teach.length, 0);
    await controller.nextPhase();
    assert.equal(controller.state.view, 'recap');
});

test('provider failure retains text and Play retries speech', async () => {
    const { controller, service, calls } = setup(1);
    const speech = service.speech;
    service.speech = async () => { throw new Error('Voice unavailable'); };
    await start(controller);
    assert.equal(controller.state.explanation.explanation, 'Explain p0');
    assert.equal(controller.state.error, 'Voice unavailable');
    assert.equal(controller.state.busy, false);
    service.speech = speech;
    await controller.playPause();
    assert.equal(controller.state.audioState, 'playing');
    assert.equal(controller.state.error, undefined);
    assert.equal(calls.teach.length, 1);
});

test('failed teach and question requests can be retried and do not advance phase', async () => {
    const { controller, service } = setup();
    const teach = service.teach;
    service.teach = async () => { throw new Error('Teach unavailable'); };
    await start(controller);
    service.teach = teach;
    await controller.playPause();
    const ask = service.ask;
    service.ask = async () => { throw new Error('Question unavailable'); };
    await controller.askQuestion('Why?');
    assert.equal(controller.state.error, 'Question unavailable');
    assert.equal(controller.state.phaseIndex, 0);
    service.ask = ask;
    await controller.askQuestion('Why?');
    assert.equal(controller.state.answer.kind, 'answer');
    await controller.resumeLesson();
    assert.equal(controller.state.view, 'lesson');
});

test('dispose ignores pending responses and releases audio/listeners', async () => {
    const { controller, service, audio } = setup();
    let resolve;
    service.offer = () => new Promise(done => { resolve = done; });
    let notifications = 0;
    controller.subscribe(() => notifications++);
    const pending = controller.checkOffer();
    controller.dispose();
    const before = notifications;
    resolve({ shouldOffer: true, offerId: 'late', previewTopics: [] });
    await pending;
    assert.equal(notifications, before);
    assert.equal(controller.state.view, 'idle');
    assert.equal(audio.disposed, true);
});

test('end cancels a pending speech response and reports truthful recap', async () => {
    const { controller, service, audio } = setup();
    let resolve;
    service.speech = () => new Promise(done => { resolve = done; });
    await controller.checkOffer();
    const pending = controller.acceptOffer();
    while (!resolve) { await new Promise(done => setImmediate(done)); }
    await controller.endSession();
    resolve({ mimeType: 'audio/mpeg', dataBase64: 'YQ==' });
    await pending;
    assert.equal(controller.state.view, 'recap');
    assert.equal(audio.loads, 0);
    assert.equal(controller.state.statuses.p0, 'pending');
});

test('completion failure can retry without losing phase learning state', async () => {
    const { controller, service, audio, calls } = setup(1);
    await start(controller);
    audio.emit('ended');
    const complete = service.complete;
    service.complete = async () => { throw new Error('Recap unavailable'); };
    await controller.endSession();
    assert.equal(controller.state.error, 'Recap unavailable');
    assert.equal(controller.state.busy, false);
    service.complete = complete;
    await controller.endSession();
    assert.equal(controller.state.recap.recap, 'Your recap');
    assert.deepEqual(calls.complete[0].learningState.phases, { p0: 'heard' });
});

test('media error allows speech retry without losing explanation', async () => {
    const { controller, audio, calls } = setup(1);
    await start(controller);
    audio.emit('error');
    assert.equal(controller.state.audioState, 'error');
    await controller.playPause();
    assert.equal(calls.speech.length, 2);
    assert.equal(controller.state.explanation.explanation, 'Explain p0');
});
