// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GoldiePractice } = require('../lib/browser/goldie/goldie-practice');
const questions = () => Array.from({ length: 3 }, (_, i) => ({ id: `q${i}`, question: `Why ${i}?`, modelAnswer: `Because ${i}.` }));
test('responses stay local across navigation; model answers require explicit reveal', () => {
    const input = questions(); const practice = new GoldiePractice(input);
    assert.equal(practice.modelAnswer, undefined); practice.answer('My reasoning'); practice.reveal();
    assert.equal(practice.modelAnswer, 'Because 0.'); practice.move(1);
    assert.equal(practice.response, ''); assert.equal(practice.modelAnswer, undefined); practice.move(0);
    assert.equal(practice.response, 'My reasoning'); assert.equal(practice.modelAnswer, 'Because 0.');
    input[0].question = 'mutated'; assert.equal(practice.current.question, 'Why 0?');
    practice.clear(); assert.equal(practice.response, ''); assert.equal(practice.modelAnswer, undefined);
});
test('invalid counts, duplicate IDs and empty or oversized content are rejected', () => {
    for (const data of [[], questions().slice(1), [...questions(), ...questions()],
        questions().map(q => ({ ...q, id: 'same' })), questions().map(q => ({ ...q, modelAnswer: '' })),
        questions().map(q => ({ ...q, question: 'a'.repeat(2001) }))]) {
        assert.throws(() => new GoldiePractice(data));
    }
});
test('response length and navigation stay bounded', () => {
    const practice = new GoldiePractice(questions()); practice.answer('x'.repeat(2100)); assert.equal(practice.response.length, 2000);
    for (const index of [-1, 3, NaN, 1.5]) { practice.move(index); assert.equal(practice.position, 0); }
});

test('real practice component renders typed response and reveals no answer before explicit action', () => {
    const React = require('react'); const { renderToStaticMarkup } = require('react-dom/server');
    const { GoldiePracticeView } = require('../lib/browser/goldie/goldie-practice-view');
    const practice = new GoldiePractice(questions());
    const render = () => renderToStaticMarkup(React.createElement(GoldiePracticeView, { practice, onUpdate() {}, onContinue() {} }));
    assert.match(render(), /Show model answer/); assert.doesNotMatch(render(), /Because 0/);
    practice.answer('Local reasoning'); practice.reveal();
    assert.match(render(), /Local reasoning/); assert.match(render(), /Because 0/);
    assert.match(render(), /Exit practice &amp; continue lesson/); assert.doesNotMatch(render(), /<audio/);
});
