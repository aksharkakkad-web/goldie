// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fileDialogPath = require.resolve('@theia/filesystem/lib/browser/file-dialog/file-dialog-service');
require.cache[fileDialogPath] = { id: fileDialogPath, filename: fileDialogPath, loaded: true, exports: { FileDialogService: class {} } };
const { renderWidget } = require('./goldie-widget-test-utils.cjs');
const phase = { id: 'p0', title: 'API boundaries', objective: 'Understand the boundary.', description: 'A useful explanation.' };
const session = { sessionId: 's1', projectId: 'demo', status: 'learning', phases: [phase], activePhaseId: 'p0',
    completedIds: [], skippedIds: [], alreadyKnowIds: [], lastEvaluatedRevision: 0, questionHistory: [] };
const lesson = { view: 'lesson', busy: false, phaseIndex: 0, statuses: { p0: 'pending' }, audioState: 'paused', session,
    explanation: { explanation: 'A useful explanation.', contentId: 'lesson-p0' } };

test('active lesson offers voice-only Ask Goldie with no typed composer or microphone check', () => {
    const html = renderWidget(lesson, { detailsOpen: true });
    assert.match(html, /Ask Goldie/); assert.doesNotMatch(html, /A useful explanation/);
    assert.doesNotMatch(html, /<textarea[^>]*goldie-question/); assert.doesNotMatch(html, /Microphone check|Test microphone/);
});

test('recording and ready states expose Send and Cancel while progression controls are disabled', () => {
    for (const [status, copy] of [['recording', /Listening/], ['ready', /Recording ready/]]) {
        const html = renderWidget(lesson, { detailsOpen: true, recorderState: { status } });
        assert.match(html, copy); assert.match(html, /Send question/); assert.match(html, /Cancel/);
        assert.match(html, /<button disabled="">Skip phase<\/button>/);
        assert.doesNotMatch(html, /Test microphone|Preview recording|Discard recording/);
    }
});

test('submitting hides duplicate Send, keeps Cancel, and shows local transcription status', () => {
    const html = renderWidget({ ...lesson, view: 'question', busy: true, operation: 'transcribe' },
        { detailsOpen: true, recorderState: { status: 'ready' } });
    assert.match(html, /Transcribing on this device/); assert.match(html, /Cancel/); assert.doesNotMatch(html, /Send question/);
});

test('speech failure retains a readable answer only in explicitly opened details, without a question transcript', () => {
    const state = { ...lesson, view: 'question', question: 'Why keep an API boundary?',
        answer: { kind: 'answer', answer: 'It keeps callers independent.', contentId: 'answer-1', resumePhaseId: 'p0' },
        error: 'Audio could not play.', audioState: 'error', retryable: true };
    const html = renderWidget(state, { detailsOpen: true });
    assert.doesNotMatch(html, /Why keep an API boundary/);
    assert.match(html, /Saved answer/); assert.match(html, /It keeps callers independent/);
    assert.doesNotMatch(renderWidget(state), /It keeps callers independent/);
    assert.match(html, /Retry answer audio/);
    assert.doesNotMatch(html, /<textarea/);
});
test('compact orb keeps Send and Cancel visible without opening a text drawer', () => {
    const html = renderWidget({ ...lesson, view: 'question' }, { recorderState: { status: 'recording' } });
    assert.match(html, /Send question/); assert.match(html, /Cancel/);
    assert.doesNotMatch(html, /goldie-details-drawer|goldie-answer|goldie-explanation/);
});
test('voice navigation names Return, Replay, Skip and optional practice explicitly', () => {
    const question = renderWidget({ ...lesson, view: 'question' });
    assert.match(question, />Return to lesson</);
    assert.doesNotMatch(question, />Skip section</);
    const html = renderWidget(lesson);
    assert.match(html, />Replay section</); assert.match(html, />Skip section</); assert.match(html, /Finish &amp; practice/);
});
test('question state does not automatically open details or record another question', () => {
    const { createWidget } = require('./goldie-widget-test-utils.cjs');
    const widget = createWidget(lesson); widget.update = () => {};
    widget.recorder = { start: () => assert.fail('No automatic recording') };
    widget.receiveLessonState({ ...lesson, view: 'question', answer: { kind: 'answer', answer: 'Hidden answer.' } });
    assert.equal(widget.detailsOpen, false);
});

test('speaking and returning from practice show the voice orb without the details drawer', () => {
    const { createWidget } = require('./goldie-widget-test-utils.cjs');
    const widget = createWidget(lesson, { detailsOpen: true }); widget.update = () => {};
    widget.receiveLessonState({ ...lesson, audioState: 'playing' });
    assert.equal(widget.detailsOpen, false);
    widget.lessonState = { ...lesson, view: 'practice' }; widget.detailsOpen = true;
    widget.receiveLessonState({ ...lesson, audioState: 'paused' });
    assert.equal(widget.detailsOpen, false);
});

test('practice choice and recap expose explicit practice entry for completed phases', () => {
    const completed = { ...session, status: 'completed', activePhaseId: undefined, completedIds: ['p0'] };
    let html = renderWidget({ ...lesson, view: 'practice', session: completed, practicePhaseId: 'p0', practiceAvailable: true }, { detailsOpen: true });
    assert.match(html, /PHASE COVERED/); assert.match(html, />Practice</); assert.match(html, />Continue</); assert.doesNotMatch(html, /Your reasoning/);
    html = renderWidget({ ...lesson, view: 'recap', session: completed, statuses: { p0: 'heard' }, recap: { recap: 'Done.', lastEvaluatedRevision: 1 } },
        { detailsOpen: true });
    assert.match(html, /Practice a covered topic/); assert.match(html, /API boundaries/);
});
