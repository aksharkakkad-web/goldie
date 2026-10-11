import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoController } from '../src/controller.js';
import { BrowserMedia } from '../src/media.js';

const phase = id => ({ id, title: `Topic ${id}`, objective: 'Understand the boundary', description: 'A coherent explanation.' });
function setup(count = 3) {
    const calls = [];
    const session = { sessionId: 's1', projectId: 'p1', snapshotRevision: 1, phases: Array.from({ length: count }, (_, i) => phase(`p${i + 1}`)), activePhaseId: 'p1', status: 'learning', completedIds: [], skippedIds: [], alreadyKnowIds: [], questionHistory: [], lastEvaluatedRevision: 1 };
    const batch = { practiceId: 'batch1', phaseId: 'p1', questions: [1, 2, 3].map(n => ({ id: `q${n}`, question: `Reason about boundary ${n}?`, modelAnswer: 'Keep credentials on the server.' })) };
    const api = { request: async (path, body) => {
        calls.push({ path, body });
        if (path === '/api/offer') return { shouldOffer: true, offerId: 'o1', previewTopics: ['Boundaries'] };
        if (path === '/api/sessions') return structuredClone(session);
        if (path === '/api/teach') return { explanation: 'The server validates requests.', groundingStatus: 'conceptual', contentId: 'c1' };
        if (path === '/api/speech') return { mimeType: 'audio/mpeg', audioId: 'a'.repeat(64), audioUrl: `/api/audio/${'a'.repeat(64)}` };
        if (path.endsWith('/actions')) {
            if (body.action === 'pause') session.status = 'paused';
            else if (body.action === 'resume') session.status = 'learning';
            else {
                session[body.action === 'phase_completed' ? 'completedIds' : body.action === 'skip' ? 'skippedIds' : 'alreadyKnowIds'].push(body.phaseId);
                session.activePhaseId = session.phases[session.phases.findIndex(p => p.id === body.phaseId) + 1]?.id;
            }
            return structuredClone(session);
        }
        if (path === '/api/complete') { session.status = body.status; return { recap: 'You covered the server boundary.', lastEvaluatedRevision: 1 }; }
        if (path.endsWith('/practice')) return body ? batch : null;
        if (path === '/api/transcribe') return { text: 'Why validate again?' };
        if (path === '/api/ask') return { kind: 'answer', answer: 'The browser is not a trusted boundary.', contentId: 'answer1', resumePhaseId: 'p1' };
        throw new Error(`Unexpected ${path}`);
    } };
    const media = { playing: false, selected: 'lesson', position: 12, level: 0,
        subscribe(fn) { this.listener = fn; return () => {}; },
        async load(track, speech) { this[track] = speech; this.selected = track; },
        async play() { this.playing = true; }, pause() { this.playing = false; },
        select(track) { this.selected = track; }, clear() { this.playing = false; },
        async startRecording() { this.capturing = true; }, stopRecording() { this.capturing = false; },
        cancelRecording() { this.capturing = false; }, async recordingData() { return 'YWJjZGVm'; }
    };
    return { controller: new DemoController(api, media), api, media, calls, session };
}
async function start(f) { await f.controller.prepare(); await f.controller.accept(); }
const settle = () => new Promise(resolve => setImmediate(resolve));
function deferRequest(f, target) {
    const original = f.api.request; let release;
    const pending = new Promise(resolve => { release = resolve; });
    f.api.request = async (path, body) => { if (path === target) { await pending; } return original(path, body); };
    return release;
}

test('processing follows actual offer, explanation and voice work and clears only when playback is ready', async () => {
    const f = setup(); const stages = [];
    f.controller.subscribe(state => { if (state.busy) { stages.push(state.processing); } });
    const release = deferRequest(f, '/api/speech');
    let playbackReady;
    f.media.play = () => new Promise(resolve => { playbackReady = () => { f.media.playing = true; resolve(); }; });
    const pending = start(f); await settle();
    assert.equal(f.controller.state.processing, 'voice'); assert.equal(f.controller.state.busy, true);
    assert.ok(stages.includes('offer')); assert.ok(stages.includes('teaching'));
    release(); await settle();
    assert.equal(f.controller.state.processing, 'playback'); assert.equal(f.controller.state.busy, true);
    playbackReady(); await pending;
    assert.equal(f.controller.state.processing, null); assert.equal(f.controller.state.busy, false);
    assert.equal(f.controller.state.playing, true);
});
test('question processing distinguishes recording, transcription, thinking and answer voice', async () => {
    const f = setup(); await start(f); await f.controller.questionStart();
    const stages = []; f.controller.subscribe(state => { if (state.busy) { stages.push(state.processing); } });
    const release = deferRequest(f, '/api/ask');
    const pending = f.controller.questionSend(); await settle();
    assert.equal(f.controller.state.processing, 'thinking'); assert.equal(f.controller.state.busy, true);
    assert.equal(f.controller.state.turns[0].question, 'Why validate again?');
    assert.equal(f.controller.state.turns[0].answer, '');
    assert.ok(stages.includes('recording')); assert.ok(stages.includes('transcription'));
    release(); await pending;
    assert.ok(stages.includes('voice')); assert.equal(f.controller.state.processing, null);
});
test('processing ends on a provider error and returns on explicit retry', async () => {
    const f = setup(); const original = f.api.request; let fail = true;
    f.api.request = (path, body) => path === '/api/offer' && fail
        ? Promise.reject(Object.assign(new Error('Temporarily unavailable'), { retryable: true })) : original(path, body);
    await f.controller.prepare();
    assert.equal(f.controller.state.busy, false); assert.equal(f.controller.state.processing, null);
    assert.match(f.controller.state.error, /Temporarily/);
    fail = false; await f.controller.retry();
    assert.equal(f.controller.state.view, 'offer'); assert.equal(f.controller.state.processing, null);
});
test('Cancel clears processing and a late canceled answer cannot clear a newer loader', async () => {
    const f = setup(); await start(f); await f.controller.questionStart();
    const releaseAnswer = deferRequest(f, '/api/ask');
    const canceled = f.controller.questionSend(); await settle();
    assert.equal(f.controller.state.processing, 'thinking');
    f.controller.questionCancel(); assert.equal(f.controller.state.processing, null);
    const releaseTeach = deferRequest(f, '/api/teach');
    const next = f.controller.continuePhase(); await settle();
    assert.equal(f.controller.state.processing, 'teaching');
    releaseAnswer(); await canceled;
    assert.equal(f.controller.state.processing, 'teaching'); assert.equal(f.controller.state.busy, true);
    releaseTeach(); await next; assert.equal(f.controller.state.processing, null);
});
test('microphone permission and generated versus cached practice have honest processing stages', async () => {
    const f = setup(); await start(f); let grant;
    f.media.startRecording = () => new Promise(resolve => { grant = resolve; });
    const pending = f.controller.questionStart(); await settle();
    assert.equal(f.controller.state.processing, 'microphone');
    grant(); await pending; assert.equal(f.controller.state.processing, null);
    f.controller.questionCancel(); await f.controller.mark('phase_completed');
    const stages = []; f.controller.subscribe(state => { if (state.busy) { stages.push(state.processing); } });
    await f.controller.practice();
    assert.ok(stages.includes('practice-cache')); assert.ok(stages.includes('practice'));
    assert.equal(f.controller.state.processing, null);
});

test('construct/decline do not call providers or start audio', async () => {
    const f = setup(); assert.equal(f.calls.length, 0); f.controller.decline();
    assert.equal(f.calls.length, 0); assert.equal(f.media.playing, false);
});
test('accept uses supplied handoff and handles more than three phases', async () => {
    const f = setup(8); await start(f);
    assert.equal(f.controller.state.session.phases.length, 8);
    assert.equal(f.calls.find(c => c.path === '/api/sessions').body.referenceLessonId, undefined);
    assert.match(f.calls[0].body.handoff, /prepared replay of a real local Codex build/i);
    assert.equal(f.controller.state.view, 'lesson'); assert.equal(f.media.playing, true);
});
test('coverage waits at Practice / Continue without generating or starting next clip', async () => {
    const f = setup(); await start(f); const before = f.calls.length;
    await f.controller.mark('phase_completed');
    assert.equal(f.controller.state.view, 'gate'); assert.equal(f.media.playing, false);
    assert.equal(f.calls.slice(before).filter(c => c.path.endsWith('/practice') || c.path === '/api/teach').length, 0);
    await f.controller.continuePhase(); assert.equal(f.controller.phase.id, 'p2');
});
test('skip and self-reported familiarity bypass practice and remain distinct', async () => {
    const f = setup(); await start(f);
    await f.controller.mark('skip'); await f.controller.mark('already_know');
    assert.deepEqual(f.controller.state.session.skippedIds, ['p1']);
    assert.deepEqual(f.controller.state.session.alreadyKnowIds, ['p2']);
    assert.equal(f.controller.phase.id, 'p3');
    assert.equal(f.calls.filter(c => c.path.endsWith('/practice')).length, 0);
});
test('practice is cached and reveal/final review never call the backend', async () => {
    const f = setup(1); await start(f); await f.controller.mark('phase_completed');
    assert.equal(f.controller.state.session.status, 'completed');
    await f.controller.practice(); const before = f.calls.length;
    f.controller.reveal('q1'); f.controller.setDraft('q1', 'My own answer');
    await f.controller.practice(); f.controller.review();
    assert.equal(f.calls.length, before); assert.equal(f.controller.state.drafts.q1, 'My own answer');
    assert.ok(f.controller.state.revealed.has('q1'));
    assert.equal(f.controller.state.session.status, 'completed');
});
test('uncovered practice is rejected without a generation call', async () => {
    const f = setup(); await start(f); const before = f.calls.length;
    await f.controller.practice('p2'); assert.equal(f.calls.length, before);
});
test('unseen recorded question uses transcription and explicit exact-clip resume', async () => {
    const f = setup(); await start(f); f.media.position = 12;
    await f.controller.questionStart(); assert.equal(f.media.capturing, true); assert.equal(f.media.playing, false);
    await f.controller.questionSend(); assert.equal(f.controller.state.answer, 'The browser is not a trusted boundary.');
    assert.equal(f.media.selected, 'answer');
    await f.controller.questionResume(); assert.equal(f.media.selected, 'lesson'); assert.equal(f.media.position, 12);
    assert.equal(f.calls.filter(c => c.path === '/api/ask').length, 1);
});
test('spoken follow-ups preserve conversation history and resume the original lesson once', async () => {
    const f = setup(); await start(f);
    let count = 0;
    const original = f.api.request;
    f.api.request = (path, body) => {
        if (path === '/api/transcribe') return Promise.resolve({ text: ++count === 1 ? 'Why validate titles?' : 'What if the title is too long?' });
        if (path === '/api/ask') return Promise.resolve({ kind: 'answer', answer: count === 1 ? 'The server is the trusted boundary.' : 'The API rejects titles above 120 characters.', contentId: `answer${count}`, resumePhaseId: 'p1' });
        return original(path, body);
    };
    await f.controller.questionStart(); await f.controller.questionSend();
    assert.equal(f.controller.state.turns.length, 1);
    await f.controller.questionFollowup(); await f.controller.questionSend();
    assert.deepEqual(f.controller.state.turns.map(turn => turn.question), ['Why validate titles?', 'What if the title is too long?']);
    assert.equal(f.calls.filter(call => call.path.endsWith('/actions') && call.body.action === 'pause').length, 1);
    await f.controller.questionResume();
    assert.equal(f.controller.state.view, 'lesson'); assert.equal(f.media.selected, 'lesson');
});
test('canceling a follow-up retains the answered thread and stops capture', async () => {
    const f = setup(); await start(f); await f.controller.questionStart(); await f.controller.questionSend();
    await f.controller.questionFollowup(); f.controller.questionCancel();
    assert.equal(f.controller.state.view, 'question');
    assert.equal(f.controller.state.turns.length, 1);
    assert.equal(f.media.capturing, false);
});
test('canceling a retried follow-up removes only its pending turn and ignores the late answer', async () => {
    const f = setup(); await start(f); await f.controller.questionStart(); await f.controller.questionSend();
    await f.controller.questionFollowup();
    const original = f.api.request; let attempts = 0; let resolve;
    f.api.request = (path, body) => {
        if (path !== '/api/ask') { return original(path, body); }
        if (++attempts === 1) { return Promise.reject(Object.assign(new Error('Try manually'), { retryable: true })); }
        return new Promise(done => { resolve = done; });
    };
    await f.controller.questionSend();
    assert.equal(f.controller.state.turns.length, 1);
    const retry = f.controller.retry(); await settle();
    assert.equal(f.controller.state.turns.length, 2);
    f.controller.questionCancel();
    assert.equal(f.controller.state.turns.length, 1);
    resolve({ kind: 'answer', answer: 'Late answer', contentId: 'late', resumePhaseId: 'p1' }); await retry;
    assert.equal(f.controller.state.turns.length, 1);
    assert.equal(f.controller.state.turns[0].answer, 'The browser is not a trusted boundary.');
    assert.equal(f.media.playing, false);
});
test('late microphone permission after Cancel cannot reopen recording', async () => {
    const f = setup(); await start(f);
    let resolve; f.media.startRecording = () => new Promise(r => { resolve = r; });
    const pending = f.controller.questionStart();
    await new Promise(r => setImmediate(r)); f.controller.questionCancel(); resolve(); await pending;
    assert.equal(f.controller.state.view, 'lesson'); assert.equal(f.controller.state.recording, 'idle');
});
test('the same microphone control starts, sends and starts a follow-up without resuming the lesson', async () => {
    const f = setup(); await start(f);
    await f.controller.questionStart();
    assert.equal(f.controller.state.recording, 'recording');
    await f.controller.questionStart();
    assert.equal(f.controller.state.turns.length, 1);
    assert.equal(f.controller.state.turns[0].answer, 'The browser is not a trusted boundary.');
    assert.equal(f.controller.state.recording, 'idle');
    await f.controller.questionStart();
    assert.equal(f.controller.state.recording, 'recording');
    assert.equal(f.media.playing, false);
    assert.equal(f.media.position, 12);
    assert.equal(f.calls.filter(call => call.body?.action === 'resume').length, 0);
});
test('microphone startup failure offers another recording without a stuck permission state', async () => {
    const f = setup(); await start(f);
    f.media.startRecording = async () => { throw new Error('Microphone access was not allowed.'); };
    await f.controller.questionStart();
    assert.match(f.controller.state.error, /Microphone/);
    assert.equal(f.controller.state.recording, 'idle');
    f.media.startRecording = async () => { f.media.capturing = true; };
    await f.controller.questionStart();
    assert.equal(f.controller.state.error, '');
    assert.equal(f.controller.state.recording, 'recording');
    assert.equal(f.media.capturing, true);
});
test('an ended answer asks for explicit return without advancing or auto-resuming the lesson', async () => {
    const f = setup(); await start(f); await f.controller.questionStart(); await f.controller.questionSend();
    assert.equal(f.controller.state.answerFinished, false);
    const calls = f.calls.length;
    f.media.playing = false; f.media.listener('ended');
    assert.equal(f.controller.state.answerFinished, true);
    assert.equal(f.controller.state.view, 'question');
    assert.equal(f.calls.length, calls);
    await f.controller.questionResume();
    assert.equal(f.controller.state.view, 'lesson');
    assert.equal(f.media.selected, 'lesson'); assert.equal(f.media.position, 12);
});
for (const outcome of ['resolve', 'reject']) {
    test(`an old microphone ${outcome} cannot cancel a newer recording`, async () => {
        const f = setup(); await start(f);
        let resolve; let reject;
        f.media.startRecording = () => new Promise((yes, no) => { resolve = yes; reject = no; });
        const pending = f.controller.questionStart(); await settle();
        f.controller.questionCancel();
        f.media.startRecording = async () => { f.media.capturing = true; };
        await f.controller.questionStart();
        if (outcome === 'resolve') { resolve(); } else { reject(new Error('Old permission denied.')); }
        await pending;
        assert.equal(f.media.capturing, true);
        assert.equal(f.controller.state.recording, 'recording');
    });
}
test('a needs-sources answer stays visible as a limitation rather than implying spoken playback', async () => {
    const f = setup(); await start(f); await f.controller.questionStart();
    const original = f.api.request;
    f.api.request = (path, body) => path === '/api/ask' ? Promise.resolve({ kind: 'needs_sources' }) : original(path, body);
    const before = f.calls.filter(call => call.path === '/api/speech').length;
    await f.controller.questionSend();
    assert.match(f.controller.state.error, /cannot inspect/i);
    assert.equal(f.controller.state.answer, '');
    assert.equal(f.media.playing, false);
    assert.equal(f.calls.filter(call => call.path === '/api/speech').length, before);
});
test('failed follow-up speech cannot display or replay the previous answer clip', async () => {
    const f = setup();
    const realMedia = new BrowserMedia({ clearTimeout,
        Audio: class extends EventTarget {
            currentTime = 0; duration = 30; ended = false;
            async play() {} pause() {} load() {} removeAttribute() {}
        } });
    realMedia.startRecording = async () => {};
    realMedia.stopRecording = () => {};
    realMedia.recordingData = async () => 'YWJjZGVm';
    f.controller.dispose(); f.controller = new DemoController(f.api, realMedia);
    await start(f); await f.controller.questionStart(); await f.controller.questionSend();
    assert.equal(realMedia.caption, 'The browser is not a trusted boundary.');
    const original = f.api.request;
    f.api.request = (path, body) => path === '/api/ask'
        ? Promise.resolve({ kind: 'answer', answer: 'A completely different follow-up answer.', contentId: 'answer2', resumePhaseId: 'p1' })
        : path === '/api/speech' ? Promise.reject(Object.assign(new Error('Speech unavailable.'), { retryable: true })) : original(path, body);
    await f.controller.questionStart(); await f.controller.questionSend();
    assert.equal(f.controller.state.answer, 'A completely different follow-up answer.');
    assert.equal(realMedia.caption, '');
    assert.equal(realMedia.tracks.has('answer'), false);
    assert.match(f.controller.state.error, /Speech unavailable/);
});
test('speech failure still allows coverage and recap', async () => {
    const f = setup(1); const original = f.api.request;
    f.api.request = (path, body) => path === '/api/speech' ? Promise.reject(Object.assign(new Error('Speech unavailable.'), { retryable: true })) : original(path, body);
    await start(f); assert.match(f.controller.state.explanation, /server validates/);
    await f.controller.mark('phase_completed'); await f.controller.continuePhase();
    assert.equal(f.controller.state.view, 'recap');
});
test('duplicate sends share one operation and canceled answers cannot autoplay', async () => {
    const f = setup(); await start(f); await f.controller.questionStart();
    const original = f.api.request; let resolve;
    f.api.request = (path, body) => path === '/api/ask' ? new Promise(r => { resolve = r; }) : original(path, body);
    const first = f.controller.questionSend(); await f.controller.questionSend();
    await new Promise(r => setImmediate(r)); f.controller.questionCancel();
    resolve({ kind: 'answer', answer: 'Late answer', contentId: 'late', resumePhaseId: 'p1' }); await first;
    assert.equal(f.controller.state.answer, ''); assert.equal(f.controller.state.turns.length, 0); assert.equal(f.media.playing, false);
});
test('skipping a paused phase resumes server state before next spoken phase', async () => {
    const f = setup(); await start(f); await f.controller.playPause();
    assert.equal(f.controller.state.session.status, 'paused');
    await f.controller.mark('skip');
    assert.equal(f.controller.state.session.status, 'learning');
    assert.equal(f.controller.phase.id, 'p2'); assert.equal(f.media.playing, true);
});
test('restoration recovers a lost acceptance without generating or autoplaying', async () => {
    const f = setup(); const saved = { context: f.controller.context, offer: { offerId: 'o1' }, acceptancePending: true };
    f.controller.persistence = { load: () => saved, save() {} };
    await f.controller.restore();
    assert.equal(f.controller.state.session?.sessionId, 's1');
    assert.equal(f.media.playing, false);
    assert.equal(f.calls.filter(c => ['/api/teach', '/api/offer', '/api/speech'].includes(c.path)).length, 0);
});
test('restored final review loads only cached batches and never generates', async () => {
    const f = setup(1); await start(f); await f.controller.mark('phase_completed');
    await f.controller.continuePhase(); f.controller.state.cachedPracticePhaseIds = ['p1']; const original = f.api.request;
    f.api.request = (path, body) => path.endsWith('/practice') && body === undefined
        ? Promise.resolve({ practiceId: 'cached', phaseId: 'p1', questions: [1, 2, 3].map(n => ({ id: `q${n}`, question: 'Why?', modelAnswer: 'Because.' })) }) : original(path, body);
    const before = f.calls.length; await f.controller.review();
    assert.equal(f.controller.state.view, 'review'); assert.equal(f.controller.state.batches.p1.practiceId, 'cached');
    assert.equal(f.calls.length, before);
});
test('saving resumed progress preserves the restored practice index before review loads', async () => {
    const f = setup(); await start(f); await f.controller.mark('phase_completed');
    let saved = { context: f.controller.context, sessionId: 's1', practicePhaseIds: ['p1'] };
    f.controller.persistence = { load: () => saved, save: value => { saved = value; } };
    const original = f.api.request;
    f.api.request = (path, body) => path === '/api/sessions/s1' ? Promise.resolve(structuredClone(f.session)) : original(path, body);
    await f.controller.restore();
    await f.controller.playPause();
    assert.deepEqual(saved.practicePhaseIds, ['p1']);
});
test('cancel during asynchronous recording conversion prevents even transcription', async () => {
    const f = setup(); await start(f); await f.controller.questionStart(); let resolve;
    f.media.recordingData = () => new Promise(r => { resolve = r; });
    const pending = f.controller.questionSend(); f.controller.questionCancel(); resolve('YWJjZGVm'); await pending;
    assert.equal(f.calls.filter(c => c.path === '/api/transcribe').length, 0);
    assert.equal(f.controller.state.view, 'lesson');
});
test('failed next-phase teaching cannot replay the previous phase content', async () => {
    const f = setup(); await start(f); const original = f.api.request; let fail = true;
    f.api.request = (path, body) => path === '/api/teach' && body.phaseId === 'p2' && fail
        ? Promise.reject(Object.assign(new Error('Teaching unavailable'), { retryable: true })) : original(path, body);
    await f.controller.mark('skip'); assert.match(f.controller.state.error, /Teaching unavailable/);
    fail = false; const before = f.calls.length; await f.controller.playPause();
    assert.ok(f.calls.slice(before).some(c => c.path === '/api/teach' && c.body.phaseId === 'p2'));
});
