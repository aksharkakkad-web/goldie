// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
const { test } = require('node:test');
const assert = require('node:assert/strict');
const schemas = require('@goldie/contracts');
const { GoldieLessonController } = require('../lib/browser/goldie/goldie-lesson-controller');
const { GoldieAudioPlayer } = require('../lib/browser/goldie/goldie-audio-player');
// Replace the file picker desktop host before real widget modules are loaded.
const fileDialogPath = require.resolve('@theia/filesystem/lib/browser/file-dialog/file-dialog-service');
require.cache[fileDialogPath] = { id: fileDialogPath, filename: fileDialogPath, loaded: true, exports: { FileDialogService: class {} } };

// Replace only the browser media device and external service; player/controller are real.
class MediaElement {
    static instances = [];
    currentTime = 0; ended = false; listeners = {}; plays = 0;
    constructor(url) { this.url = url; MediaElement.instances.push(this); }
    addEventListener(event, listener) { (this.listeners[event] ??= []).push(listener); }
    emit(event) { if (event === 'ended') { this.ended = true; } for (const listener of this.listeners[event] ?? []) { listener(); } }
    async play() { this.plays++; this.emit('play'); }
    pause() { this.emit('pause'); }
    removeAttribute() {}
    load() {}
}
global.Audio = MediaElement;
const clone = value => structuredClone(value);
const speech = { mimeType: 'audio/mpeg', dataBase64: 'YQ==' };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settled(controller) { for (let i = 0; i < 30 && controller.state.busy; i++) { await tick(); } }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function memory() {
    const values = new Map();
    return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function setup(count = 3, storage = memory()) {
    const phases = Array.from({ length: count }, (_, index) => ({ id: `p${index}`, title: `Phase ${index}`, objective: 'Understand architecture', description: 'A conceptual explanation.' }));
    let session = { sessionId: 's1', projectId: 'goldie-reference', snapshotRevision: 1, phases, status: 'learning',
        ...(count ? { activePhaseId: 'p0' } : {}), completedIds: [], skippedIds: [], alreadyKnowIds: [], lastEvaluatedRevision: 0, questionHistory: [] };
    const calls = { offer: [], start: [], teach: [], ask: [], action: [], speech: [], complete: [], get: [] };
    const applied = new Map();
    const service = {
        async offer(request) { schemas.OfferRequestSchema.parse(request); calls.offer.push(clone(request)); return { shouldOffer: true, offerId: 'o1', previewTopics: ['Frontend', 'API', 'Database'], estimatedSeconds: 165 }; },
        async startSession(request) { schemas.SessionRequestSchema.parse(request); calls.start.push(clone(request)); return clone(session); },
        async getSession(id) { assert.equal(id, 's1'); calls.get.push(id); return clone(session); },
        async teach(request) { schemas.TeachRequestSchema.parse(request); calls.teach.push(clone(request)); return { explanation: `${request.detail === 'expanded' ? 'More' : 'Explain'} ${request.phaseId}`, groundingStatus: 'conceptual', contentId: `${request.phaseId}-${request.detail}` }; },
        async ask(request) {
            schemas.AskRequestSchema.parse(request); calls.ask.push(clone(request)); session.status = 'asking';
            const answer = { kind: 'answer', answer: `Answer ${request.question}`, resumePhaseId: request.phaseId, contentId: 'answer-1', supportedQuestions: ['What is an API?'] };
            session.questionHistory.push({ question: request.question, answer: answer.answer, resumePhaseId: request.phaseId }); return answer;
        },
        async action(id, request) {
            assert.equal(id, 's1'); schemas.SessionActionRequestSchema.parse(request); calls.action.push(clone(request));
            if (applied.has(request.actionId)) { assert.deepEqual(request, applied.get(request.actionId)); return clone(session); }
            applied.set(request.actionId, clone(request));
            if (request.action === 'pause') { session.status = 'paused'; }
            else if (request.action === 'resume') { session.status = 'learning'; }
            else {
                assert.equal(request.phaseId, session.activePhaseId);
                if (request.action === 'phase_completed') { assert.equal(session.status, 'learning'); session.completedIds.push(request.phaseId); }
                if (request.action === 'skip') { session.skippedIds.push(request.phaseId); }
                if (request.action === 'already_know') { session.alreadyKnowIds.push(request.phaseId); }
                session.activePhaseId = phases[phases.findIndex(phase => phase.id === request.phaseId) + 1]?.id;
            }
            return clone(session);
        },
        async speech(request) { schemas.SpeechRequestSchema.parse(request); calls.speech.push(clone(request)); return speech; },
        async complete(request) { schemas.CompleteRequestSchema.parse(request); calls.complete.push(clone(request)); session.status = request.status; session.lastEvaluatedRevision = 1; return { recap: 'Server recap: completed, skipped and self-reported familiarity.', lastEvaluatedRevision: 1 }; }
    };
    const audio = new GoldieAudioPlayer();
    const controller = new GoldieLessonController(service, audio, storage);
    if (controller.canChangeContext) { controller.setContext('# Example app\nBuild a team management app with forms, permissions and a database.', 'beginner', 'Team management'); }
    return { controller, audio, service, calls, storage, session: () => session, setSession: value => { session = schemas.SessionResponseSchema.parse(value); } };
}
async function start(controller) { await controller.checkOffer(); await controller.acceptOffer(); }
function clip() { return MediaElement.instances.at(-1); }

test('explicit Replay rewinds the same section without generating or changing phase progress', async () => {
    const { controller, calls } = setup(); await start(controller);
    const original = clip(); original.currentTime = 21.5;
    await controller.playPause();
    await controller.replayPhase();
    assert.equal(clip(), original); assert.equal(original.currentTime, 0);
    assert.equal(controller.state.phaseIndex, 0); assert.deepEqual(controller.state.session.completedIds, []);
    assert.equal(calls.teach.length, 1); assert.equal(calls.speech.length, 1); controller.dispose();
});

test('explicit selector offers without speech and decline never accepts', async () => {
    const { controller, calls } = setup(); await controller.checkOffer();
    assert.equal(calls.offer[0].referenceLessonId, undefined); assert.equal(calls.offer[0].revision, 1);
    controller.declineOffer(); assert.equal(controller.state.view, 'idle'); assert.equal(calls.start.length, 0); assert.equal(calls.speech.length, 0); controller.dispose();
});
test('accepted lesson requests standard text then speech by content ID', async () => {
    const { controller, calls } = setup(); await start(controller);
    assert.equal(calls.teach[0].detail, 'standard'); assert.deepEqual(calls.speech[0], { sessionId: 's1', contentId: 'p0-standard' });
    assert.equal(controller.state.statuses.p0, 'pending'); controller.dispose();
});
test('natural end offers practice before continuing;  skip, familiarity and recap remain authoritative', async () => {
    const { controller, calls } = setup(); await start(controller); clip().emit('ended'); await settled(controller);
    assert.equal(controller.state.phaseIndex, 1); assert.equal(controller.state.statuses.p0, 'heard');
    assert.equal(controller.state.view, 'practice'); await controller.continueAfterPractice();
    await controller.skipPhase(); await controller.markFamiliar();
    assert.deepEqual(controller.state.statuses, { p0: 'heard', p1: 'skipped', p2: 'familiar' });
    assert.deepEqual(calls.action.map(action => action.action), ['phase_completed', 'pause', 'resume', 'skip', 'already_know']);
    assert.equal(controller.state.view, 'recap'); assert.equal(controller.state.session.status, 'completed');
    assert.equal(controller.state.recap.recap, 'Server recap: completed, skipped and self-reported familiarity.'); controller.dispose();
});
test('pause/resume changes server status and retains exact original clip position', async () => {
    const { controller, calls } = setup(); await start(controller); const original = clip(); original.currentTime = 12.5;
    await controller.playPause(); assert.equal(controller.state.session.status, 'paused');
    original.emit('ended'); await tick(); assert.equal(controller.state.phaseIndex, 0); original.ended = false;
    await controller.playPause(); assert.equal(controller.state.session.status, 'learning');
    assert.equal(clip(), original); assert.equal(original.currentTime, 12.5);
    assert.deepEqual(calls.action.map(action => action.action), ['pause', 'resume']); controller.dispose();
});
test('question and expanded add-on preserve lesson clip and explicitly resume server', async () => {
    const { controller, calls } = setup(); await start(controller); const original = clip(); original.currentTime = 17;
    await controller.askQuestion('What is an API?'); const answer = clip();
    assert.equal(controller.state.session.status, 'asking'); assert.notEqual(answer, original);
    answer.emit('ended'); await tick(); assert.equal(controller.state.phaseIndex, 0);
    assert.deepEqual(calls.speech[1], { sessionId: 's1', contentId: 'answer-1' });
    await controller.resumeLesson(); assert.equal(original.currentTime, 17); assert.equal(original.plays, 2);
    await controller.explainMore(); assert.equal(calls.teach[1].detail, 'expanded'); assert.equal(controller.state.addOn.explanation, 'More p0');
    assert.equal(controller.state.explanation.explanation, 'Explain p0'); assert.deepEqual(calls.speech[2], { sessionId: 's1', contentId: 'p0-expanded' });
    await controller.resumeLesson(); assert.equal(original.currentTime, 17); assert.equal(original.plays, 3);
    assert.equal(calls.teach.filter(call => call.detail === 'standard').length, 1); controller.dispose();
});
test('lost action response retries the same ID and blocks different navigation intent', async () => {
    const { controller, calls, service } = setup(); await start(controller); const action = service.action; let lose = true;
    service.action = async (...args) => { const response = await action(...args); if (lose) { lose = false; throw new Error('Response lost'); } return response; };
    await controller.skipPhase(); assert.equal(controller.state.phaseIndex, 0); assert.ok(controller.state.retryable);
    await controller.markFamiliar(); assert.equal(calls.action.length, 1); await controller.retry();
    assert.equal(calls.action[0].actionId, calls.action[1].actionId); assert.equal(controller.state.phaseIndex, 1);
    assert.equal(controller.state.statuses.p0, 'skipped'); assert.equal(controller.state.statuses.p1, 'pending'); controller.dispose();
});
test('lost pause response retains ID and retries the question after server pause', async () => {
    const { controller, calls, service } = setup(); await start(controller); const action = service.action; let lose = true;
    service.action = async (...args) => { const response = await action(...args); if (lose) { lose = false; throw new Error('Pause response lost'); } return response; };
    await controller.askQuestion('What is an API?'); assert.equal(calls.ask.length, 0); await controller.retry();
    assert.equal(calls.action[0].actionId, calls.action[1].actionId); assert.equal(controller.state.answer.contentId, 'answer-1');
    assert.equal(controller.state.session.status, 'asking'); controller.dispose();
});
test('speech failure retains text and manual Play retries content without inventing progress', async () => {
    const { controller, calls, service } = setup(); const real = service.speech; service.speech = async () => { throw new Error('Voice unavailable'); };
    await start(controller); assert.equal(controller.state.explanation.explanation, 'Explain p0'); assert.equal(controller.state.error, 'Voice unavailable');
    assert.equal(controller.state.statuses.p0, 'pending'); service.speech = real; await controller.playPause();
    assert.equal(controller.state.audioState, 'playing'); assert.equal(calls.teach.length, 1);
    assert.deepEqual(calls.speech[0], { sessionId: 's1', contentId: 'p0-standard' }); controller.dispose();
});
for (const status of ['learning', 'paused', 'asking']) {
    test(`restore ${status} uses saved active phase and progress without autoplay`, async () => {
        const fixture = setup(); await start(fixture.controller); fixture.controller.dispose(); const restored = setup(3, fixture.storage);
        restored.setSession({ ...restored.session(), status, activePhaseId: 'p2', completedIds: ['p0'], skippedIds: ['p1'] });
        const before = MediaElement.instances.length; await restored.controller.restore();
        assert.equal(restored.controller.state.phaseIndex, 2); assert.deepEqual(restored.controller.state.statuses, { p0: 'heard', p1: 'skipped', p2: 'pending' });
        assert.equal(restored.calls.teach.length, 0); assert.equal(restored.calls.speech.length, 0); assert.equal(MediaElement.instances.length, before);
        await restored.controller.playPause(); assert.equal(restored.controller.state.session.status, 'learning'); assert.equal(restored.controller.state.audioState, 'playing');
        restored.controller.dispose();
    });
}
test('unavailable restored session stays recoverable without silently creating another', async () => {
    const fixture = setup(); await start(fixture.controller); fixture.controller.dispose(); const restored = setup(3, fixture.storage); const get = restored.service.getSession;
    restored.service.getSession = async () => { throw new Error('Saved session unavailable'); };
    await restored.controller.restore(); await restored.controller.checkOffer();
    assert.equal(restored.calls.offer.length, 0); assert.equal(restored.calls.start.length, 0); assert.ok(restored.controller.state.error); assert.ok(restored.controller.state.retryable);
    restored.service.getSession = get; await restored.controller.retry(); assert.equal(restored.controller.state.session.sessionId, 's1'); restored.controller.dispose();
});
test('restore final progress or terminal sessions retrieves recap without speech', async () => {
    for (const status of ['learning', 'completed', 'dismissed']) {
        const fixture = setup(1); await start(fixture.controller); fixture.controller.dispose(); const restored = setup(1, fixture.storage);
        restored.setSession({ ...restored.session(), status, activePhaseId: undefined, completedIds: ['p0'] }); await restored.controller.restore();
        assert.equal(restored.controller.state.view, 'recap'); assert.equal(restored.calls.speech.length, 0);
        assert.equal(restored.calls.complete[0].status, status === 'dismissed' ? 'dismissed' : 'completed'); restored.controller.dispose();
    }
});
test('late lesson events after skip do not advance or change audio of the new phase', async () => {
    const { controller, calls } = setup(); await start(controller); const old = clip(); await controller.skipPhase();
    old.emit('ended'); old.emit('play'); old.emit('error'); await tick();
    assert.equal(controller.state.phaseIndex, 1); assert.equal(controller.state.audioState, 'playing'); assert.deepEqual(calls.action.map(value => value.action), ['skip']); controller.dispose();
});
test('end cancels pending speech and retains server partial recap', async () => {
    const { controller, service } = setup(); const pendingSpeech = deferred(); service.speech = () => pendingSpeech.promise;
    await controller.checkOffer(); const pending = controller.acceptOffer(); while (!controller.state.explanation && controller.state.busy) { await tick(); }
    assert.ok(controller.state.explanation); const before = MediaElement.instances.length; await controller.endSession(); pendingSpeech.resolve(speech); await pending;
    assert.equal(controller.state.view, 'recap'); assert.equal(controller.state.session.status, 'dismissed'); assert.equal(controller.state.statuses.p0, 'pending');
    assert.equal(MediaElement.instances.length, before); controller.dispose();
});
test('end waits for in-flight question mutation and ignores its late answer', async () => {
    const { controller, service, calls } = setup(); await start(controller); const pendingAsk = deferred(); const ask = service.ask;
    service.ask = async request => { await pendingAsk.promise; return ask(request); };
    const pending = controller.askQuestion('What is an API?'); for (let i = 0; i < 30 && controller.state.session.status !== 'paused' && controller.state.busy; i++) { await tick(); }
    assert.equal(controller.state.session.status, 'paused'); await tick(); const ending = controller.endSession(); await tick(); assert.equal(calls.complete.length, 0);
    pendingAsk.resolve(); await pending; await ending; assert.equal(controller.state.session.status, 'dismissed'); assert.equal(controller.state.view, 'recap');
    assert.equal(calls.speech.length, 1); controller.dispose();
});
test('failed final closure preserves completed intent even when End retries it', async () => {
    const { controller, service, calls } = setup(1); await start(controller); const complete = service.complete; let lose = true;
    service.complete = async request => { const response = await complete(request); if (lose) { lose = false; throw new Error('Recap response lost'); } return response; };
    await controller.nextPhase(); assert.ok(controller.state.error); await controller.endSession();
    assert.deepEqual(calls.complete.map(value => value.status), ['completed', 'completed']); assert.equal(controller.state.view, 'recap'); controller.dispose();
});
test('Find another lesson preserves context revision after closure', async () => {
    const { controller, calls } = setup(1); await start(controller); await controller.checkOffer(); assert.equal(calls.offer.length, 1);
    await controller.endSession(); await controller.checkOffer(); assert.equal(calls.offer[1].revision, 1); assert.equal(calls.offer[1].referenceLessonId, undefined); controller.dispose();
});
test('dispose invalidates pending responses and releases player resources', async () => {
    const { controller, service } = setup(); const response = deferred(); service.offer = () => response.promise; let notifications = 0; controller.subscribe(() => notifications++);
    const pending = controller.checkOffer(); controller.dispose(); const before = notifications;
    response.resolve({ shouldOffer: true, offerId: 'o1', previewTopics: [], estimatedSeconds: 165 }); await pending;
    assert.equal(notifications, before); assert.equal(controller.state.view, 'idle');
});

test('real player publishes current clip timing and ignores released clip updates', async () => {
    const { controller } = setup(); await start(controller); const old = clip(); old.currentTime = 9; old.duration = 46;
    old.emit('timeupdate'); assert.equal(controller.state.audioPosition, 9); assert.equal(controller.state.audioDuration, 46);
    await controller.skipPhase(); old.currentTime = 20; old.emit('timeupdate'); assert.equal(controller.state.audioPosition, 0); controller.dispose();
});

test('real widget preserves offer and lesson controls without transcript or explanation bodies', async () => {
    const { renderWidget } = require('./goldie-widget-test-utils.cjs');
    const { controller } = setup(); await controller.checkOffer();
    const clean = renderWidget(controller.state); assert.doesNotMatch(clean, /handoff and knowledge level/i);
    const offer = renderWidget(controller.state, { detailsOpen: true });
    assert.match(offer, /handoff and knowledge level/i); assert.match(offer, /3 min/);
    await controller.acceptOffer(); const lesson = renderWidget(controller.state);
    assert.doesNotMatch(lesson, /Explain more/);
    const lessonDetails = renderWidget(controller.state, { detailsOpen: true });
    assert.match(lessonDetails, /Explain more/); assert.match(lessonDetails, /Mark covered/);
    assert.doesNotMatch(lessonDetails, /Explain p0/);
    assert.match(lessonDetails, /Conceptual/); assert.doesNotMatch(lessonDetails, /mastered/i);
    await controller.askQuestion('What is an API?'); const answer = renderWidget(controller.state);
    assert.doesNotMatch(answer, /Supported questions/);
    const answerDetails = renderWidget(controller.state, { detailsOpen: true });
    assert.doesNotMatch(answerDetails, /You could ask next|What is an API/);
    assert.match(answerDetails, /Pause answer audio|Play answer audio/); controller.dispose();
});

test('new narrow dock gets readable width while restored user width is respected', async () => {
    const { viewContribution } = require('./goldie-widget-test-utils.cjs');
    const fresh = viewContribution({ restored: false, width: 144 }); await fresh.onDidInitializeLayout();
    assert.deepEqual(fresh.resizes, [[304, 'right']]);
    const saved = viewContribution({ restored: true, width: 240 }); await saved.onDidInitializeLayout(); assert.deepEqual(saved.resizes, []);
    const wide = viewContribution({ restored: false, width: 500 }); await wide.onDidInitializeLayout(); assert.deepEqual(wide.resizes, []);
});

test('failed teach after skip retries content without advancing another phase', async () => {
    const { controller, calls, service } = setup(); await start(controller); const teach = service.teach;
    service.teach = async () => { throw new Error('Text unavailable'); }; await controller.skipPhase();
    assert.equal(controller.state.phaseIndex, 1); service.teach = teach; await controller.retry();
    assert.equal(controller.state.phaseIndex, 1); assert.equal(controller.state.explanation.contentId, 'p1-standard');
    assert.deepEqual(calls.action.map(value => value.action), ['skip']); controller.dispose();
});

test('released answer events after resume cannot mark the lesson ended', async () => {
    const { controller, calls } = setup(); await start(controller); await controller.askQuestion('What is an API?'); const answer = clip();
    await controller.resumeLesson(); answer.emit('ended'); answer.emit('play'); await tick();
    assert.equal(controller.state.view, 'lesson'); assert.equal(controller.state.phaseIndex, 0); assert.equal(controller.state.audioState, 'playing');
    assert.equal(calls.action.filter(value => value.action === 'phase_completed').length, 0); controller.dispose();
});

test('mark read from a paused lesson explicitly resumes before server completion', async () => {
    const { controller, calls } = setup(); await start(controller); await controller.playPause(); await controller.nextPhase();
    assert.equal(controller.state.phaseIndex, 1); assert.equal(controller.state.statuses.p0, 'heard');
    assert.deepEqual(calls.action.map(value => value.action), ['pause', 'resume', 'phase_completed', 'pause']); controller.dispose();
});

test('ending after a lost skip response derives the recap progress from server', async () => {
    const { controller, calls, service } = setup(); await start(controller); const action = service.action;
    service.action = async (...args) => { await action(...args); throw new Error('Lost response'); };
    await controller.skipPhase(); assert.equal(controller.state.statuses.p0, 'pending'); await controller.endSession();
    assert.equal(controller.state.view, 'recap'); assert.equal(controller.state.statuses.p0, 'skipped');
    assert.deepEqual(calls.action.map(value => value.action), ['skip']); controller.dispose();
});

test('natural end while the play promise settles still completes exactly one phase', async () => {
    const { controller, calls } = setup(); const play = MediaElement.prototype.play;
    let first = true;
    MediaElement.prototype.play = async function () { await play.call(this); if (first) { first = false; this.emit('ended'); } };
    try {
        await start(controller); await settled(controller);
        assert.equal(controller.state.phaseIndex, 1); assert.deepEqual(calls.action.map(value => value.action), ['phase_completed', 'pause']);
    } finally { MediaElement.prototype.play = play; controller.dispose(); }
});

test('pending acceptance survives disposal before its response and restores without audio', async () => {
    const { controller, service, calls, storage } = setup(); const startSession = service.startSession; const delay = deferred();
    service.startSession = async request => { const session = await startSession(request); await delay.promise; return session; };
    await controller.checkOffer(); const pending = controller.acceptOffer();
    for (let i = 0; i < 30 && !calls.start.length; i++) { await tick(); }
    assert.deepEqual(JSON.parse(storage.getItem('goldie.lesson-recovery.v2')), { version: 2, offerId: 'o1', revision: 1, context: controller.state.context });
    controller.dispose(); service.startSession = startSession;
    const restored = new GoldieLessonController(service, new GoldieAudioPlayer(), storage);
    await restored.restore(); delay.resolve(); await pending;
    assert.equal(restored.state.session.sessionId, 's1'); assert.equal(restored.state.restored, true);
    assert.equal(restored.state.audioState, 'paused'); assert.equal(calls.start.length, 2); assert.deepEqual(calls.start[0], calls.start[1]);
    assert.equal(calls.teach.length, 0); assert.equal(calls.speech.length, 0);
    assert.deepEqual(JSON.parse(storage.getItem('goldie.lesson-recovery.v2')), { version: 2, sessionId: 's1', revision: 1, context: controller.state.context }); restored.dispose();
});

test('lost acceptance response recovers the same session after restart without autoplay', async () => {
    const { controller, service, calls, storage } = setup(); const startSession = service.startSession;
    service.startSession = async request => { await startSession(request); throw new Error('Acceptance response lost'); };
    await start(controller); assert.ok(controller.state.error); assert.equal(controller.state.session, undefined);
    controller.dispose(); service.startSession = startSession;
    const restored = new GoldieLessonController(service, new GoldieAudioPlayer(), storage); await restored.restore();
    assert.equal(restored.state.session.sessionId, 's1'); assert.equal(calls.start.length, 2); assert.deepEqual(calls.start[0], calls.start[1]);
    assert.equal(calls.offer.length, 1); assert.equal(calls.teach.length, 0); assert.equal(calls.speech.length, 0); restored.dispose();
});

test('unavailable recovery storage prevents acceptance until the user can retry saving', async () => {
    const storage = memory(); const save = storage.setItem;
    const { controller, calls } = setup(3, storage); storage.setItem = () => { throw new Error('Storage unavailable'); }; await start(controller);
    assert.equal(calls.start.length, 0); assert.match(controller.state.error, /save.*recover/i); assert.equal(controller.state.retryable, true);
    storage.setItem = save; await controller.retry(); assert.equal(controller.state.session.sessionId, 's1'); controller.dispose();
});

test('failed session-reference replacement retains the persisted pending offer for recovery', async () => {
    const storage = memory(); const save = storage.setItem; let writes = 0;
    storage.setItem = (...args) => { if (++writes === 3) { throw new Error('Disk full'); } save(...args); };
    const { controller, service, calls } = setup(3, storage); await start(controller);
    assert.deepEqual(JSON.parse(storage.getItem('goldie.lesson-recovery.v2')), { version: 2, offerId: 'o1', revision: 1, context: controller.state.context });
    assert.match(controller.state.error, /save/i); controller.dispose(); const speechBefore = calls.speech.length;
    const restored = new GoldieLessonController(service, new GoldieAudioPlayer(), storage); await restored.restore();
    assert.equal(restored.state.session.sessionId, 's1'); assert.equal(calls.start.length, 2); assert.equal(calls.speech.length, speechBefore); restored.dispose();
});

test('safe nonretryable RPC failures display their message without retry controls or retry work', async () => {
    const { renderWidget } = require('./goldie-widget-test-utils.cjs');
    const { controller, service, calls } = setup(); await start(controller);
    let attempts = 0;
    service.speech = async () => { attempts++; throw Object.assign(new Error('Speech is not configured.'), { code: -32001, data: { apiCode: 'SPEECH_UNAVAILABLE' } }); };
    await controller.askQuestion('What is an API?'); assert.equal(controller.state.retryable, false);
    const failureDetails = renderWidget(controller.state, { detailsOpen: true });
    assert.equal(controller.state.error, 'Speech is not configured.'); assert.doesNotMatch(failureDetails, /Retry last request/);
    assert.match(failureDetails, /Play answer audio/); assert.doesNotMatch(failureDetails, /Retry answer audio/);
    await controller.retry(); assert.equal(attempts, 1); assert.equal(calls.ask.length, 1); controller.dispose();
});

test('nonretryable lesson speech offers explicit Play after correction without advertising Retry', async () => {
    const { renderWidget } = require('./goldie-widget-test-utils.cjs'); const { controller, service } = setup();
    const speak = service.speech; let attempts = 0;
    service.speech = async () => { attempts++; throw Object.assign(new Error('Speech is not configured.'), { code: -32001 }); };
    await start(controller); const markup = renderWidget(controller.state, { detailsOpen: true });
    assert.match(markup, /Play lesson audio/); assert.doesNotMatch(markup, /Retry lesson audio/); assert.doesNotMatch(markup, /Retry last request/);
    await controller.retry(); assert.equal(attempts, 1); service.speech = speak; await controller.playPause();
    assert.equal(controller.state.audioState, 'playing'); controller.dispose();
});

test('live context goes unchanged to offer, acceptance, teach, ask and completion', async () => {
    const { controller, calls } = setup(); const snapshot = controller.state.context;
    await start(controller); await controller.askQuestion('What is an API?'); await controller.endSession();
    for (const request of [calls.offer[0], calls.start[0], calls.teach[0]]) {
        assert.equal(request.handoff, snapshot.handoff); assert.deepEqual(request.profile, snapshot.profile);
        assert.equal(request.referenceLessonId, undefined);
    }
    assert.equal(calls.offer[0].projectId, 'goldie-stage2-sample');
    assert.equal(calls.ask[0].handoff, snapshot.handoff); assert.equal(calls.complete[0].handoff, snapshot.handoff);
    assert.equal(calls.complete[0].currentRevision, snapshot.revision); controller.dispose();
});
test('revision changes only with handoff or profile, survives restart, and declined retries do not create speech', async () => {
    const { controller, calls, storage, service } = setup(); const snapshot = controller.state.context;
    controller.setContext(snapshot.handoff, 'beginner', 'Renamed'); assert.equal(controller.state.context.revision, 1);
    controller.setKnowledgeLevel('intermediate'); assert.equal(controller.state.context.revision, 2);
    controller.setContext(`${snapshot.handoff}\nStatus: implemented`, 'intermediate'); assert.equal(controller.state.context.revision, 3);
    await controller.checkOffer(); controller.declineOffer(); await controller.checkOffer(); controller.declineOffer();
    assert.deepEqual(calls.offer.map(value => value.revision), [3, 3]); assert.equal(calls.start.length, 0); assert.equal(calls.speech.length, 0);
    const latest = controller.state.context; controller.dispose();
    const restored = new GoldieLessonController(service, new GoldieAudioPlayer(), storage);
    assert.deepEqual(restored.state.context, latest); restored.setContext(latest.handoff, 'intermediate');
    assert.equal(restored.state.context.revision, 3); restored.setKnowledgeLevel('beginner'); assert.equal(restored.state.context.revision, 4); restored.dispose();
});
test('context changes are blocked during requests, offers, active lessons, questions and pending recovery', async () => {
    const { controller, service, storage } = setup(); const original = controller.state.context; const offer = service.offer; const delay = deferred();
    service.offer = async request => { await delay.promise; return offer(request); };
    const finding = controller.checkOffer(); assert.equal(controller.state.operation, 'offer');
    assert.throws(() => controller.setContext('Changed', 'intermediate')); delay.resolve(); await finding;
    assert.equal(controller.canChangeContext, false); assert.throws(() => controller.setKnowledgeLevel('intermediate'));
    await controller.acceptOffer(); assert.throws(() => controller.setContext('Changed', 'intermediate'));
    await controller.askQuestion('What is an API?'); assert.throws(() => controller.setContext('Changed', 'intermediate'));
    assert.deepEqual(controller.state.context, original); controller.dispose();
    const restored = new GoldieLessonController(service, new GoldieAudioPlayer(), storage);
    assert.equal(restored.canChangeContext, false); assert.throws(() => restored.setContext('Changed', 'intermediate'));
    await restored.restore(); assert.equal(restored.canChangeContext, false); await restored.endSession(); assert.equal(restored.canChangeContext, true);
    restored.setContext('A different task', 'intermediate', 'New'); assert.equal(restored.state.view, 'idle'); assert.equal(restored.state.session, undefined);
    assert.equal(restored.state.context.revision, 2); restored.dispose();
});
for (const count of [1, 2, 5]) {
    test(`arbitrary IDs and ${count} phases use the server roadmap`, async () => {
        const fixture = setup(count); const session = fixture.session(); const ids = Array.from({ length: count }, (_, index) => `concept-${index * 7 + 13}`);
        // setup action fixture uses its original phases array; mutate that shared fixture array in place.
        session.phases.forEach((phase, index) => { phase.id = ids[index]; }); session.activePhaseId = ids[0];
        await start(fixture.controller);
        for (const id of ids) {
            assert.equal(fixture.controller.state.session.activePhaseId, id); await fixture.controller.nextPhase();
            assert.equal(fixture.controller.state.view, 'practice'); await fixture.controller.continueAfterPractice();
        }
        assert.equal(fixture.controller.state.view, 'recap'); assert.deepEqual(Object.keys(fixture.controller.state.statuses), ids);
        assert.ok(Object.values(fixture.controller.state.statuses).every(status => status === 'heard')); fixture.controller.dispose();
    });
}
test('speech retry after acceptance does not create another session or regenerate teaching', async () => {
    const { controller, calls, service } = setup(); const speech = service.speech; let failed = false;
    service.speech = async request => { if (!failed) { failed = true; throw new Error('Temporary speech failure'); } return speech(request); };
    await start(controller); await controller.retry();
    assert.equal(calls.start.length, 1); assert.equal(calls.teach.length, 1); assert.equal(controller.state.audioState, 'playing'); controller.dispose();
});
test('malformed pending snapshot and legacy pending acceptance remain preserved without unsafe replay', async () => {
    for (const [key, value] of [
        ['goldie.lesson-recovery.v2', { version: 2, offerId: 'accepted', revision: 1, context: { handoff: '', profile: { level: 'beginner' } } }],
        ['goldie.reference-session.v1', { offerId: 'prepared', revision: 1 }]
    ]) {
        const storage = memory(); storage.setItem(key, JSON.stringify(value)); const fixture = setup(3, storage);
        assert.equal(fixture.controller.canChangeContext, false); await fixture.controller.restore(); await fixture.controller.checkOffer();
        assert.match(fixture.controller.state.error, /preserved/); assert.equal(storage.getItem(key), JSON.stringify(value));
        assert.equal(fixture.calls.start.length, 0); assert.equal(fixture.calls.offer.length, 0); fixture.controller.dispose();
    }
});
test('no loaded handoff cannot call live endpoints; confirmed legacy session still restores without autoplay', async () => {
    const fixture = setup(); const empty = new GoldieLessonController(fixture.service, new GoldieAudioPlayer(), memory());
    await empty.checkOffer(); assert.equal(fixture.calls.offer.length, 0); assert.match(empty.state.error, /Load a handoff/); empty.dispose(); fixture.controller.dispose();
    const legacy = memory(); legacy.setItem('goldie.reference-session.v1', JSON.stringify({ sessionId: 's1', revision: 1 }));
    const restored = new GoldieLessonController(fixture.service, new GoldieAudioPlayer(), legacy); await restored.restore();
    assert.equal(restored.state.session.sessionId, 's1'); assert.equal(restored.state.context, undefined); assert.equal(restored.state.audioState, 'paused');
    assert.equal(fixture.calls.teach.length, 0); assert.equal(fixture.calls.speech.length, 0); restored.dispose();
});

for (const apiCode of ['CONTEXT_CONFLICT', 'REVISION_CONFLICT', 'OFFER_NOT_FOUND', 'ACTIVE_SESSION', 'REVISION_ALREADY_ACCEPTED', 'NO_LESSON_OFFER']) {
    test(`confirmed ${apiCode} archives acceptance and returns an idle usable panel`, async () => {
        const { controller, service, calls, storage } = setup(); const original = controller.state.context;
        service.startSession = async request => {
            calls.start.push(clone(request));
            throw Object.assign(new Error('This offer cannot be accepted.'), { code: -32001, data: { apiCode } });
        };
        await start(controller);
        assert.equal(controller.state.view, 'idle'); assert.equal(controller.state.error, 'This offer cannot be accepted.');
        assert.equal(controller.state.offer, undefined);
        assert.equal(controller.state.retryable, false); assert.equal(controller.canChangeContext, true);
        assert.equal(storage.getItem('goldie.lesson-recovery.v2'), 'null');
        assert.deepEqual(JSON.parse(storage.getItem('goldie.rejected-acceptance.v2')), [
            { version: 2, offerId: 'o1', revision: 1, context: original, apiCode }
        ]);
        controller.setContext('Build an event-driven API', 'intermediate', 'Event API'); await controller.checkOffer();
        assert.equal(calls.offer.length, 2); assert.equal(calls.offer[1].revision, 2); assert.equal(calls.offer[1].handoff, 'Build an event-driven API');
        assert.equal(calls.get.length, 0); assert.equal(calls.start.length, 1); controller.dispose();
    });
}
for (const failure of [new Error('Network response lost'), { code: -32001, data: { apiCode: 'AUTH_REQUIRED' } },
    { code: -32001, data: { apiCode: 'UNEXPECTED_PROVIDER_ERROR' } }, { code: -32002, data: { apiCode: 'CONTEXT_CONFLICT' } }]) {
    test(`uncertain acceptance failure ${failure.message ?? failure.data.apiCode} preserves exact pending snapshot`, async () => {
        const { controller, service, calls, storage } = setup(); const startSession = service.startSession;
        service.startSession = async request => { await startSession(request); throw failure; };
        await start(controller); const saved = storage.getItem('goldie.lesson-recovery.v2'); const snapshot = controller.state.context;
        assert.deepEqual(JSON.parse(saved), { version: 2, offerId: 'o1', revision: 1, context: snapshot });
        assert.equal(storage.getItem('goldie.rejected-acceptance.v2'), null);
        controller.declineOffer(); assert.equal(controller.canChangeContext, false); controller.dispose(); service.startSession = startSession;
        const restored = new GoldieLessonController(service, new GoldieAudioPlayer(), storage); await restored.restore();
        assert.deepEqual(calls.start[1], calls.start[0]); assert.equal(restored.state.session.sessionId, 's1');
        assert.equal(calls.offer.length, 1); assert.equal(calls.teach.length, 0); assert.equal(calls.speech.length, 0); restored.dispose();
    });
}

test('same-window retry after a lost acceptance response restores the exact session without autoplay', async () => {
    const { controller, service, calls } = setup(); const accept = service.startSession; let lose = true;
    service.startSession = async request => { const response = await accept(request);
        if (lose) { lose = false; throw new Error('Accepted response lost'); } return response; };
    await start(controller); assert.equal(controller.state.session, undefined);
    await controller.retry();
    assert.deepEqual(calls.start[1], calls.start[0]);
    assert.equal(controller.state.session.sessionId, 's1'); assert.equal(controller.state.restored, true);
    assert.equal(controller.state.audioState, 'paused');
    assert.equal(calls.teach.length, 0); assert.equal(calls.speech.length, 0);
    controller.dispose();
});
test('failed rejection archive preserves pending acceptance for safe recovery', async () => {
    const { controller, service, storage } = setup(); const write = storage.setItem;
    storage.setItem = (key, value) => { if (key === 'goldie.rejected-acceptance.v2') { throw new Error('Disk full'); } write(key, value); };
    service.startSession = async () => { throw Object.assign(new Error('Conflict'), { code: -32001, data: { apiCode: 'CONTEXT_CONFLICT' } }); };
    await start(controller); assert.match(controller.state.error, /recovery data is preserved/);
    assert.equal(JSON.parse(storage.getItem('goldie.lesson-recovery.v2')).offerId, 'o1');
    controller.declineOffer(); assert.equal(controller.canChangeContext, false); controller.dispose();
});

test('failed rejection tombstone preserves exact acceptance and permits a safe archival retry', async () => {
    const { controller, service, storage } = setup(); const write = storage.setItem;
    storage.setItem = (key, value) => { if (key === 'goldie.lesson-recovery.v2' && value === 'null') { throw new Error('Disk full'); } write(key, value); };
    service.startSession = async () => { throw Object.assign(new Error('Offer rejected'), { code: -32001, data: { apiCode: 'ACTIVE_SESSION' } }); };
    await start(controller);
    assert.match(controller.state.error, /recovery data is preserved/);
    const pending = storage.getItem('goldie.lesson-recovery.v2');
    assert.equal(JSON.parse(pending).offerId, 'o1');
    assert.equal(controller.canChangeContext, false);
    storage.setItem = write; await controller.retry();
    assert.equal(storage.getItem('goldie.lesson-recovery.v2'), 'null');
    assert.equal(controller.state.view, 'idle'); assert.equal(controller.canChangeContext, true);
    assert.equal(JSON.parse(storage.getItem('goldie.rejected-acceptance.v2')).length, 1);
    controller.dispose();
});

for (const newer of ['acceptance', 'session', 'same-offer-different-context', 'corrupt']) {
    test(`rejected acceptance never retires a newer ${newer} recovery record from another window`, async () => {
        const { controller, service, storage } = setup(); const gate = deferred();
        service.startSession = async () => { await gate.promise;
            throw Object.assign(new Error('Offer rejected'), { code: -32001, data: { apiCode: 'CONTEXT_CONFLICT' } }); };
        await controller.checkOffer(); const accepting = controller.acceptOffer();
        const original = JSON.parse(storage.getItem('goldie.lesson-recovery.v2'));
        const replacement = newer === 'corrupt' ? '{preserve-this-data' : JSON.stringify(newer === 'session'
            ? { version: 2, sessionId: 'other-session', revision: 2, context: { ...original.context, revision: 2 } }
            : { ...original, offerId: newer === 'acceptance' ? 'other-offer' : original.offerId,
                context: { ...original.context, handoff: 'Newer context from the other window.' } });
        storage.setItem('goldie.lesson-recovery.v2', replacement); gate.resolve(); await accepting;
        assert.equal(storage.getItem('goldie.lesson-recovery.v2'), replacement);
        assert.equal(JSON.parse(storage.getItem('goldie.rejected-acceptance.v2'))[0].offerId, 'o1');
        assert.equal(controller.state.view, 'idle'); assert.equal(controller.canChangeContext, true);
        controller.dispose();
    });
}


test('voice preparation pauses before capture and retains original clip/time through explicit resume', async () => {
    const { controller, calls } = setup(); await start(controller); const original = clip(); original.currentTime = 17.25;
    const prepare = controller.prepareVoiceQuestion();
    assert.equal(controller.state.view, 'question'); assert.equal(controller.state.audioState, 'paused');
    assert.equal(await prepare, true); assert.equal(calls.ask.length, 0);
    await controller.askQuestion('Why is this design useful?'); const answer = clip(); answer.emit('ended');
    assert.equal(controller.state.phaseIndex, 0); await controller.resumeLesson();
    assert.equal(original.currentTime, 17.25); assert.equal(original.plays, 2);
    assert.equal(calls.teach.length, 1); assert.equal(calls.speech.length, 2); controller.dispose();
});
test('failed server pause prevents microphone preparation without losing progress', async () => {
    const { controller, service } = setup(); await start(controller); const original = clip(); original.currentTime = 17.25;
    service.action = async () => { throw new Error('Pause failed'); };
    assert.equal(await controller.prepareVoiceQuestion(), false);
    assert.equal(original.currentTime, 17.25); assert.equal(controller.state.phaseIndex, 0); controller.dispose();
});

const recording = () => ({ blob: new Blob(['audio'], {type:'audio/webm;codecs=opus'}), mimeType:'audio/webm;codecs=opus' });
test('voice lost answer response retries exact intent and speech failure retries only speech', async () => {
    const {controller, service, calls} = setup(); await start(controller); const original = clip(); original.currentTime = 17.25;
    let transcribes=0; const requests=[]; let lost=true; let voiceFail=true; const ask=service.ask; const speak=service.speech;
    service.transcribe=async request => { schemas.TranscribeRequestSchema.parse(request); transcribes++; assert.equal(request.mimeType,'audio/webm'); return {text:'An unseen question'}; };
    const answers=new Map(); service.ask=async request => { requests.push(clone(request)); let answer=answers.get(request.requestId); if(!answer){ answer=await ask(request); answers.set(request.requestId,answer); } if(lost){lost=false;throw new Error('Lost response');} return answer; };
    service.speech=async request => { if(request.contentId==='answer-1' && voiceFail){voiceFail=false;throw new Error('Speech unavailable');} return speak(request); };
    assert.equal(await controller.prepareVoiceQuestion(),true); await controller.submitVoiceQuestion(recording());
    assert.equal(controller.state.question,'An unseen question'); assert.ok(controller.state.error); await controller.retry();
    assert.equal(controller.state.answer.kind,'answer'); assert.ok(controller.state.error); await controller.retry();
    assert.deepEqual(requests[0],requests[1]); assert.equal(calls.ask.length,1); assert.equal(transcribes,1);
    await controller.resumeLesson(); assert.equal(original.currentTime,17.25); assert.equal(original.plays,2); controller.dispose();
});
test('cancelled voice transcription ignores late text and never asks', async () => {
    const {controller, service, calls} = setup(); await start(controller); const pending=deferred(); service.transcribe=()=>pending.promise;
    await controller.prepareVoiceQuestion(); const sending=controller.submitVoiceQuestion(recording()); await tick(); controller.cancelVoiceQuestion();
    pending.resolve({text:'Discard this'}); await sending; assert.equal(calls.ask.length,0); assert.equal(controller.state.question,undefined); controller.dispose();
});
test('phase practice is explicit, cached and local, including final closed session', async () => {
    const {controller,service,calls}=setup(1); await start(controller); let reads=0, generates=0;
    service.getPractice=async()=>{reads++;return null;}; service.generatePractice=async()=>{generates++;return {practiceId:'b',phaseId:'p0',questions:[0,1,2].map(i=>({id:'q'+i,question:'Question '+i,modelAnswer:'Answer '+i}))};};
    await controller.nextPhase(); assert.equal(controller.state.view,'practice'); assert.equal(controller.state.session.status,'completed'); assert.equal(generates,0);
    await controller.openPractice(); controller.practice.answer('My answer'); controller.practice.reveal(); await controller.continueAfterPractice();
    assert.equal(controller.state.view,'recap'); await controller.openPractice('p0'); assert.equal(controller.practice.response,'My answer'); assert.ok(controller.practice.modelAnswer);
    assert.equal(reads,1); assert.equal(generates,1); assert.equal(calls.teach.length,1); assert.equal(calls.complete.length,1); controller.dispose();
});
test('voice follow-up gets a new intent without replacing the original lesson clip', async () => {
    const {controller,service,calls}=setup(); await start(controller); const original=clip(); original.currentTime=9.5;
    let n=0; service.transcribe=async()=>({text:'Question '+(++n)});
    await controller.prepareVoiceQuestion(); await controller.submitVoiceQuestion(recording());
    await controller.prepareVoiceQuestion(); await controller.submitVoiceQuestion(recording());
    assert.equal(calls.ask.length,2); assert.notEqual(calls.ask[0].requestId,calls.ask[1].requestId);
    await controller.resumeLesson(); assert.equal(original.currentTime,9.5); assert.equal(calls.teach.length,1); controller.dispose();
});
test('lost transcription retries one request ID; duplicate Send and end suppress late results', async () => {
    const {controller,service,calls}=setup(); await start(controller); const requests=[]; let lost=true;
    service.transcribe=async request=>{requests.push(clone(request)); if(lost){lost=false;throw new Error('Lost transcription');} return {text:'Why validate?'};};
    await controller.prepareVoiceQuestion(); await controller.submitVoiceQuestion(recording()); await controller.retry();
    assert.deepEqual(requests[0],requests[1]); assert.equal(calls.ask.length,1);
    await controller.prepareVoiceQuestion(); const gate=deferred(); service.transcribe=()=>gate.promise;
    const pending=controller.submitVoiceQuestion(recording()); await tick(); await controller.submitVoiceQuestion(recording());
    await controller.endSession(); gate.resolve({text:'Late text'}); await pending;
    assert.equal(calls.ask.length,1); assert.equal(controller.state.view,'recap'); controller.dispose();
});
test('nonverbal Whisper annotations never generate an answer and preserve lesson position', async () => {
    const {controller, service, calls}=setup(); await start(controller); const original=clip(); original.currentTime=12.5;
    service.transcribe=async()=>({text:'(indistinct) [MUSIC PLAYING]'});
    await controller.prepareVoiceQuestion(); await controller.submitVoiceQuestion(recording());
    assert.equal(calls.ask.length,0); assert.equal(original.currentTime,12.5); assert.equal(controller.state.retryable,false);
    assert.match(controller.state.error,/clear question/); controller.dispose();
});
test('a real question in parentheses remains a valid voice intent', async () => {
    const {controller, service, calls}=setup(); await start(controller);
    service.transcribe=async()=>({text:'(Why validate the title on the server?)'});
    await controller.prepareVoiceQuestion(); await controller.submitVoiceQuestion(recording());
    assert.equal(calls.ask.length,1); assert.equal(calls.ask[0].question,'(Why validate the title on the server?)');
    assert.equal(controller.state.error,undefined); controller.dispose();
});
