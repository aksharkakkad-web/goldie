import test from 'node:test';
import assert from 'node:assert/strict';
import { mentorView, highlight } from '../src/view.js';

test('source tokens never become executable HTML', () => {
    const html = highlight('<img src=x onerror="alert(1)">');
    assert.doesNotMatch(html, /<img/); assert.match(html, /&lt;img/);
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
