// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fileDialogPath = require.resolve('@theia/filesystem/lib/browser/file-dialog/file-dialog-service');
require.cache[fileDialogPath] = { id: fileDialogPath, filename: fileDialogPath, loaded: true, exports: { FileDialogService: class {} } };
const { renderWidget, createWidget } = require('./goldie-widget-test-utils.cjs');
const idle = { view: 'idle', busy: false, phaseIndex: 0, statuses: {}, audioState: 'idle' };
const connected = { connected: true, workspaceName: 'Team app', workspaceUri: 'file:///team-app', revision: 12,
    status: 'Watching Codex handoff updates.' };
const offer = { ...idle, view: 'offer', offer: { shouldOffer: true, previewTopics: ['API boundaries'] } };

test('disconnected setup offers project connection and preserves manual handoff loading', () => {
    const html = renderWidget(idle, { detailsOpen: true });
    assert.match(html, /Connect this project/);
    assert.match(html, /Load handoff/);
    assert.match(html, /\.goldie\/HANDOFF\.md/);
    assert.doesNotMatch(html, />Disconnect</);
});

test('connected setup names project and current revision and hides manual replacement', () => {
    const html = renderWidget(idle, { detailsOpen: true, workspaceState: connected });
    assert.match(html, /Team app/);
    assert.match(html, /Watching Codex handoff updates/);
    assert.match(html, /Current handoff · Revision 12/);
    assert.match(html, />Disconnect</);
    assert.doesNotMatch(html, />Connect this project<|Load handoff/);
});

test('pending updates wait for the current lesson or offer to end before exposing latest-build action', () => {
    const workspaceState = { ...connected, pendingRevision: 14 };
    const active = renderWidget(offer, { detailsOpen: true, workspaceState, canChangeContext: false });
    assert.match(active, /A newer build is ready · Revision 14/);
    assert.match(active, /Your current lesson stays in place/);
    assert.doesNotMatch(active, /Learn about latest build/);
    const ready = renderWidget(idle, { detailsOpen: true, workspaceState });
    assert.match(ready, /Learn about latest build/);
    const compact = renderWidget(offer, { workspaceState, canChangeContext: false });
    assert.doesNotMatch(compact, /New build ready · View details/);
    assert.doesNotMatch(compact, /Learn about latest build/);
});

test('project controls are disabled while a lesson request is busy, but an offer remains visible', () => {
    const html = renderWidget({ ...offer, busy: true }, { detailsOpen: true, workspaceState: connected, canChangeContext: false });
    assert.match(html, /<button class="theia-button secondary" disabled="">Disconnect<\/button>/);
    assert.match(html, /LESSON READY/);
    assert.match(html, /API boundaries/);
});

test('project errors show safe text in details and an actionable compact error notice', () => {
    const workspaceState = { ...connected, error: 'Could not read this project handoff. Try connecting again. <script>' };
    const html = renderWidget(idle, { detailsOpen: true, workspaceState });
    assert.match(html, /role="alert">Could not read this project handoff/);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    const compact = renderWidget(idle, { workspaceState });
    assert.match(compact, /Open error details/);
});

test('new offer opens details without starting audio or focusing the editor', () => {
    const widget = createWidget(idle);
    let updates = 0;
    widget.update = () => updates++;
    widget.lessonController.acceptOffer = () => assert.fail('Offer must remain opt-in');
    widget.lessonController.playPause = () => assert.fail('Offer must not start audio');
    widget.node = { focus: () => assert.fail('Offer must not steal focus') };
    widget.receiveLessonState(offer);
    assert.equal(widget.detailsOpen, true);
    assert.equal(widget.lessonState, offer);
    assert.equal(updates, 1);
    widget.detailsOpen = false;
    widget.receiveLessonState({ ...offer, busy: true });
    assert.equal(widget.detailsOpen, false, 'Later updates do not reopen manually closed details');
});

test('workspace change cancels capture while preserving the current lesson', () => {
    const widget = createWidget(offer, { workspaceState: connected });
    let cancellations = 0;
    widget.cancelCapture = () => cancellations++;
    widget.update = () => {};
    widget.lessonController.endSession = () => assert.fail('Workspace changes must preserve the lesson');
    widget.receiveWorkspaceState({ ...connected, revision: 13 });
    assert.equal(cancellations, 0);
    widget.receiveWorkspaceState({ connected: false, workspaceUri: 'file:///other-app', status: 'Connect this project.' });
    assert.equal(cancellations, 1);
    assert.equal(widget.lessonState, offer);
});

test('connected primary control requests latest handoff rather than reusing a stale context', async () => {
    const widget = createWidget({ ...idle, context: { name: 'Team app' } }, { workspaceState: connected });
    let latest = 0;
    widget.workspaceConnection.learnLatest = async () => latest++;
    widget.lessonController.checkOffer = () => assert.fail('Connected workspace must refresh its context');
    await widget.handlePrimaryControl();
    assert.equal(latest, 1);
});


test('widget uses the shared controller and releases subscribers without restoring or disposing the lesson', () => {
    const widget = createWidget(idle);
    let lessonUnsubscribed = 0;
    let workspaceUnsubscribed = 0;
    let recorderUnsubscribed = 0;
    const lesson = { state: offer, subscribe(listener) { listener(offer); return () => lessonUnsubscribed++; },
        restore: () => assert.fail('Restoration belongs to the connection lifecycle'),
        dispose: () => assert.fail('Closing the widget must keep the shared lesson alive') };
    widget.title = {};
    widget.node = {};
    widget.addClass = () => {};
    widget.update = () => {};
    widget.cancelCapture = () => {};
    widget.checkConnection = () => {};
    widget.recorder = { subscribe(listener) { listener({ status: 'idle' }); return () => recorderUnsubscribed++; }, dispose() {} };
    widget.workspaceConnection = { lesson, state: connected, subscribe(listener) { listener(connected); return () => workspaceUnsubscribed++; } };
    widget.init();
    assert.equal(widget.lessonController, lesson);
    assert.equal(widget.detailsOpen, false, 'Reopened orb remains compact; offer is available through Play and details');
    assert.equal(widget.workspaceState, connected);
    widget.dispose();
    assert.equal(lessonUnsubscribed, 1);
    assert.equal(workspaceUnsubscribed, 1);
    assert.equal(recorderUnsubscribed, 1);
});
