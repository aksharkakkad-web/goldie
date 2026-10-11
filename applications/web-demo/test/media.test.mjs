import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserMedia } from '../src/media.js';

function setup() {
    let stopped = 0; let recorder; let timer;
    const stream = { getTracks: () => [{ stop: () => stopped++ }] };
    class Recorder extends EventTarget {
        static isTypeSupported() { return true; }
        state = 'inactive';
        constructor() { super(); recorder = this; }
        start() { this.state = 'recording'; }
        stop() {
            if (this.state === 'inactive') return;
            this.state = 'inactive';
            const event = new Event('dataavailable'); event.data = new Blob(['abcdefghi']); this.dispatchEvent(event);
            this.dispatchEvent(new Event('stop'));
        }
    }
    const env = { navigator: { mediaDevices: { getUserMedia: async () => stream } }, MediaRecorder: Recorder,
        setTimeout: fn => { timer = fn; return 1; }, clearTimeout: () => {}, addEventListener() {}, removeEventListener() {} };
    const media = new BrowserMedia(env);
    return { media, env, stream, get stopped() { return stopped; }, get recorder() { return recorder; }, limit: () => timer() };
}
test('duration limit stops tracks and produces a sendable recording without submitting', async () => {
    const f = setup(); const events = []; f.media.subscribe(event => events.push(event));
    await f.media.startRecording(); f.limit();
    assert.ok(f.stopped > 0); assert.equal(f.recorder.state, 'inactive');
    assert.equal(await f.media.recordingData(), 'YWJjZGVmZ2hp');
    assert.deepEqual(events, ['recording-ready']);
});
test('canceled late permission releases microphone without constructing a recorder', async () => {
    const f = setup(); let resolve;
    f.env.navigator.mediaDevices.getUserMedia = () => new Promise(r => { resolve = r; });
    const pending = f.media.startRecording(); f.media.cancelRecording(); resolve(f.stream); await pending;
    assert.ok(f.stopped > 0); assert.equal(f.recorder, undefined);
    await assert.rejects(f.media.recordingData(), /record/i);
});
test('oversize recording stops capture and cannot be uploaded', async () => {
    const f = setup(); await f.media.startRecording();
    const event = new Event('dataavailable'); event.data = new Blob([new Uint8Array(2 * 1024 * 1024 + 1)]); f.recorder.dispatchEvent(event);
    assert.ok(f.stopped > 0); await assert.rejects(f.media.recordingData(), /shorter/i);
});
test('microphone denial is actionable and cancellation discards recorded bytes', async () => {
    const f = setup(); f.env.navigator.mediaDevices.getUserMedia = async () => { throw new Error('permission denied'); };
    await assert.rejects(f.media.startRecording(), /microphone/i);
    const g = setup(); await g.media.startRecording(); g.media.stopRecording(); g.media.cancelRecording();
    await assert.rejects(g.media.recordingData(), /record/i);
});
