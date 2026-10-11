// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fileDialogPath = require.resolve('@theia/filesystem/lib/browser/file-dialog/file-dialog-service');
require.cache[fileDialogPath] = { id: fileDialogPath, filename: fileDialogPath, loaded: true, exports: { FileDialogService: class {} } };
const { renderWidget } = require('./goldie-widget-test-utils.cjs');
const state = { view: 'idle', busy: false, phaseIndex: 0, statuses: {}, audioState: 'idle' };
test('native widget includes honest local microphone check without pretending backend is ready', () => {
    const html = renderWidget(state, { detailsOpen: true });
    assert.match(html, /Microphone check/); assert.match(html, /Test microphone/);
    assert.match(html, /Question sending is waiting for the Stage 3 backend/);
    assert.doesNotMatch(html, /autoplay/);
});

test('recording and ready states expose stop/discard and never autoplay', () => {
    let html = renderWidget(state, { detailsOpen: true, recorderState: { status: 'recording' } });
    assert.match(html, /Stop recording/); assert.match(html, /Discard recording/); assert.doesNotMatch(html, /Test microphone/);
    html = renderWidget(state, { detailsOpen: true, recorderState: { status: 'ready' } });
    assert.match(html, /Preview recording/); assert.match(html, /Discard recording/); assert.doesNotMatch(html, /autoplay/);
});
