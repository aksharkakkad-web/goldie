// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GoldieRecorder } = require('../lib/browser/goldie/goldie-recorder');
function harness(getStream) {
    let stopped = 0, requests = 0, creates = 0;
    const stream = { getTracks: () => [{ stop() { stopped++; } }] };
    const timers = new Map();
    const media = { state: 'inactive', mimeType: 'audio/webm;codecs=opus',
        start() { this.state = 'recording'; },
        stop() { this.state = 'inactive'; },
        complete(text = 'final chunk') {
            this.ondataavailable?.({ data: new Blob([text]) }); this.onstop?.();
        }
    };
    const recorder = new GoldieRecorder({
        getStream: async () => { requests++; return getStream ? getStream() : stream; },
        createRecorder: () => { creates++; return media; },
        schedule: (callback, ms) => { assert.equal(ms, 30000); timers.set(1, callback); return 1; },
        clear: id => timers.delete(id)
    });
    return { recorder, media, stream, timers, get stopped() { return stopped; }, get requests() { return requests; }, get creates() { return creates; } };
}
test('Send waits for final chunk, releases mic immediately and repeated clicks share one result', async () => {
    const h = harness(); await h.recorder.start(); await h.recorder.start();
    assert.equal(h.requests, 1);
    const first = h.recorder.finish(); assert.equal(h.recorder.finish(), first);
    assert.equal(h.recorder.state.status, 'stopping'); assert.equal(h.stopped, 1);
    h.media.complete(); const clip = await first;
    assert.equal(await clip.blob.text(), 'final chunk'); assert.equal(h.recorder.state.status, 'ready');
    assert.equal(await h.recorder.finish(), clip); assert.equal(h.timers.size, 0); h.recorder.dispose();
});
test('30 seconds stops and waits ready without sending or restarting', async () => {
    const h = harness(); await h.recorder.start(); h.timers.get(1)();
    assert.equal(h.recorder.state.status, 'stopping'); assert.equal(h.stopped, 1);
    h.media.complete(); assert.equal(h.recorder.state.status, 'ready'); assert.equal(h.requests, 1); h.recorder.dispose();
});
test('cancel during OS permission stops late tracks without starting capture', async () => {
    let resolve; const h = harness(() => new Promise(done => { resolve = done; }));
    const start = h.recorder.start(); h.recorder.cancel(); resolve(h.stream); await start;
    assert.equal(h.stopped, 1); assert.equal(h.creates, 0); assert.equal(h.recorder.state.status, 'idle'); h.recorder.dispose();
});
test('cancel while stopping discards the clip and ignores late recorder callbacks', async () => {
    const h = harness(); await h.recorder.start(); const lateStop = h.media.onstop;
    const pending = h.recorder.finish(); h.recorder.cancel(); lateStop();
    assert.equal(await pending, undefined); assert.equal(h.recorder.state.status, 'idle'); assert.equal(h.stopped, 1); h.recorder.dispose();
});
test('denied permission uses safe text and never echoes OS details', async () => {
    const h = harness(() => { throw new Error('private machine details'); }); await h.recorder.start();
    assert.equal(h.recorder.state.status, 'error'); assert.doesNotMatch(h.recorder.state.error, /private/); h.recorder.dispose();
});
test('runtime errors, empty recordings and excessive bytes release tracks', async () => {
    for (const fail of [h => h.media.onerror(), h => h.media.complete(''), h => h.media.ondataavailable({ data: new Blob([new Uint8Array(2097153)]) })]) {
        const h = harness(); await h.recorder.start(); fail(h);
        assert.equal(h.recorder.state.status, 'error'); assert.equal(h.stopped, 1); assert.equal(h.timers.size, 0); h.recorder.dispose();
    }
});
test('blur, pagehide, hidden document and disposal clean up lifecycle listeners and pending permission', async () => {
    const old = { window: global.window, document: global.document };
    global.window = new EventTarget(); global.document = new EventTarget(); global.document.hidden = false;
    try {
        for (const event of ['blur', 'pagehide', 'visibilitychange']) {
            const h = harness(); await h.recorder.start();
            if (event === 'visibilitychange') { global.document.hidden = true; global.document.dispatchEvent(new Event(event)); }
            else { global.window.dispatchEvent(new Event(event)); }
            assert.equal(h.recorder.state.status, 'idle'); assert.equal(h.stopped, 1); h.recorder.dispose();
        }
        let resolve; const h = harness(() => new Promise(done => { resolve = done; }));
        const pending = h.recorder.start(); h.recorder.dispose(); resolve(h.stream); await pending;
        assert.equal(h.stopped, 1); assert.equal(h.creates, 0); await h.recorder.start(); assert.equal(h.requests, 1);
    } finally { global.window = old.window; global.document = old.document; }
});
