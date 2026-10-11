import test from 'node:test';
import assert from 'node:assert/strict';
import { mentorView, highlight, nextStep, processingLabel } from '../src/view.js';

test('processing copy describes real stages without invented completion or timing', () => {
    assert.equal(processingLabel('offer'), 'Preparing your lesson…');
    assert.equal(processingLabel('teaching'), 'Preparing this explanation…');
    assert.equal(processingLabel('voice'), 'Preparing voice…');
    assert.equal(processingLabel('thinking'), 'Thinking through your question…');
    assert.equal(processingLabel('playback'), 'Starting audio…');
    assert.equal(processingLabel('unknown'), 'Getting Goldie ready…');
    assert.doesNotMatch(processingLabel('voice'), /%|seconds|ready to talk/i);
});
test('panel content does not duplicate the loader or tell users to load during processing', () => {
    const state = { view: 'lesson', busy: true, session: { phases: [{ id: 'p1' }] } };
    const html = mentorView(state, true, { id: 'p1', title: 'Boundary' });
    assert.doesNotMatch(html, /Goldie is working|Load the explanation when/);
    assert.doesNotMatch(html, /Your explanation will appear here/);
});

test('spoken lessons keep controls but do not render the title, objective or explanation', () => {
    const phase = { id: 'p1', title: 'Connecting the Client Form to the Server API', objective: 'Understand client-side form submissions.' };
    const state = { view: 'lesson', busy: false, explanation: 'Welcome! Let us explore how your client form connects.', session: { phases: [phase] } };
    for (const details of [false, true]) {
        const html = mentorView(state, true, phase, details);
        assert.doesNotMatch(html, /Connecting the Client|Understand client-side|Welcome!|Read full explanation|Hide full explanation/);
        assert.match(html, /Phase 1 of 1/);
        assert.match(html, /data-action="covered"/);
        assert.match(html, /data-action="familiar"/);
        assert.match(html, /data-action="end"/);
        assert.doesNotMatch(html, /Mark read/);
    }
    assert.doesNotMatch(nextStep(state, true).message, /read/i);
});

test('source tokens never become executable HTML', () => {
    const html = highlight('<img src=x onerror="alert(1)">');
    assert.doesNotMatch(html, /<img/); assert.match(html, /&lt;img/);
});
test('voice questions keep Cancel available during permission and processing', () => {
    for (const recording of ['permission', 'recording', 'ready', 'processing', 'idle']) {
        const state = { view: 'question', busy: true, recording, turns: [] };
        const html = mentorView(state, true);
        const cancel = html.match(/<button\b[^>]*data-action="cancel"[^>]*>/)?.[0];
        assert.ok(cancel, `Cancel must be visible while ${recording}`);
        assert.doesNotMatch(cancel, /\bdisabled\b/, `Cancel must work while ${recording}`);
    }
});
test('voice answers have no transcript panel and offer explicit return after playback ends', () => {
    const state = { view: 'question', busy: false, recording: 'idle', answerFinished: true,
        question: 'Private spoken question?', answer: 'A very long spoken answer.',
        turns: [{ question: 'Private spoken question?', answer: 'A very long spoken answer.' }] };
    const html = mentorView(state, true);
    assert.doesNotMatch(html, /Private spoken question|A very long spoken answer|conversation-turns|You asked|Stay with the idea|Conversation<\/span>/);
    assert.match(html, /Ready to go back to the lesson\?/);
    assert.match(html, /data-action="resume"/);
    assert.match(html, /data-action="followup"/);
    assert.doesNotMatch(mentorView({ ...state, answerFinished: false }, true), /Ready to go back/);
});
test('same question ID in different phases has independent response and reveal state', () => {
    const state = { view: 'review', batches: {
        first: { phaseId: 'first', questions: [{ id: 'q1', question: 'One?', modelAnswer: 'First answer' }] },
        second: { phaseId: 'second', questions: [{ id: 'q1', question: 'Two?', modelAnswer: 'Second answer' }] }
    }, session: { phases: [{ id: 'first', title: 'First' }, { id: 'second', title: 'Second' }] },
    drafts: { 'first:q1': 'First response' }, revealed: new Set(['first:q1']) };
    const html = mentorView(state, true);
    assert.match(html, /First response/); assert.match(html, /First answer/);
    assert.doesNotMatch(html, /Second answer/);
    assert.match(html, /data-draft="second:q1"/);
});
test('next-step guidance moves from replay to acceptance and optional practice without starting actions', () => {
    assert.equal(nextStep({ view: 'idle' }, false).target, '#replay-action');
    assert.equal(nextStep({ view: 'idle' }, true).target, '[data-action="prepare"]');
    assert.equal(nextStep({ view: 'offer' }, true).target, '[data-action="accept"]');
    assert.equal(nextStep({ view: 'gate' }, true).target, '[data-action="practice"]');
    assert.match(nextStep({ view: 'gate' }, true).message, /optional/i);
    assert.equal(nextStep({ view: 'question', recording: 'recording' }, true).target, '[data-action="send"]');
    assert.equal(nextStep({ view: 'question', recording: 'processing' }, true).target, null);
    assert.equal(nextStep({ view: 'lesson', busy: true }, true).target, null);
    assert.equal(nextStep({ view: 'idle' }, false, true).target, null);
    assert.equal(nextStep({ view: 'recap', batches: { phase: {} } }, true).target, '[data-action="review"]');
    assert.equal(nextStep({ view: 'recap', batches: {} }, true).target, '[data-action="reset"]');
});
