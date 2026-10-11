// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { estimatedSentence } = require('../lib/browser/goldie/goldie-captions');
const fileDialogPath = require.resolve('@theia/filesystem/lib/browser/file-dialog/file-dialog-service');
require.cache[fileDialogPath] = { id: fileDialogPath, filename: fileDialogPath, loaded: true, exports: { FileDialogService: class {} } };
const { renderWidget } = require('./goldie-widget-test-utils.cjs');

test('sentence captions follow the actual media position across pause and resume', () => {
    const text = 'First sentence. Second sentence.';
    assert.equal(estimatedSentence(text, 0, 30), 'First sentence.');
    assert.equal(estimatedSentence(text, 20, 30), 'Second sentence.');
    assert.equal(estimatedSentence(text, 0, 30), 'First sentence.');
    assert.equal(estimatedSentence(text, 30, 30), 'Second sentence.');
    assert.equal(estimatedSentence(text, 99, 30), 'Second sentence.');
    for (const duration of [0, NaN, Infinity]) { assert.equal(estimatedSentence(text, 0, duration), undefined); }
    assert.equal(estimatedSentence(undefined, 0, 30), undefined);
    assert.ok(estimatedSentence('word '.repeat(100), 0, 30).split(/\s+/).length <= 28);
});

test('orb shows one spoken sentence, switches to answer captions, and hides stale captions during capture', () => {
    const base = { view: 'lesson', busy: false, phaseIndex: 0, statuses: {}, audioState: 'paused',
        audioPosition: 0, audioDuration: 30, explanation: { explanation: 'First sentence. Second sentence.' } };
    const html = renderWidget(base);
    assert.match(html, /First sentence/); assert.doesNotMatch(html, /Second sentence|goldie-details-drawer/);
    const question = { ...base, view: 'question', answer: { kind: 'answer', answer: 'Answer sentence.' } };
    assert.match(renderWidget(question), /Answer sentence/); assert.doesNotMatch(renderWidget(question), /First sentence/);
    assert.doesNotMatch(renderWidget(question, { recorderState: { status: 'recording' } }), /Answer sentence/);
    assert.doesNotMatch(renderWidget({ ...base, busy: true }), /First sentence/);
});
