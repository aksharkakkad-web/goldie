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
test('microphone energy moves the orb level and stops when recording ends', async () => {
    const f = setup(); let frame; let canceled = 0; let disconnected = 0;
    const analyser = { fftSize: 1024, getFloatTimeDomainData(samples) { samples.fill(0.3); }, disconnect() { disconnected++; } };
    f.env.AudioContext = class {
        resume() { return Promise.resolve(); }
        createMediaStreamSource() { return { connect() {}, disconnect() { disconnected++; } }; }
        createAnalyser() { return analyser; }
    };
    f.env.requestAnimationFrame = callback => { frame = callback; return 7; };
    f.env.cancelAnimationFrame = () => { canceled++; };
    await f.media.startRecording();
    frame(0);
    assert.ok(f.media.level > 0, 'live microphone energy should animate the orb');
    f.media.stopRecording();
    assert.equal(f.media.level, 0);
    assert.ok(canceled > 0);
    assert.equal(disconnected, 2);
    assert.ok(f.stopped > 0);
});
test('captions follow the selected audio position and preserve the lesson sentence across interruption', async () => {
    const f = setup();
    f.env.Audio = class extends EventTarget {
        currentTime = 0; duration = 10; ended = false;
        async play() {} pause() {} removeAttribute() {} load() {}
    };
    f.media.load('lesson', { audioUrl: '/lesson.mp3' }, 'First point. Second idea.');
    assert.equal(f.media.caption, '');
    await f.media.play();
    assert.equal(f.media.caption, 'First point.');
    const lessonAudio = f.media.lesson.audio;
    lessonAudio.currentTime = 7;
    const events = []; f.media.subscribe(event => events.push(event));
    lessonAudio.dispatchEvent(new Event('timeupdate'));
    assert.equal(f.media.caption, 'Second idea.');
    assert.ok(events.includes('caption'));
    f.media.pause();
    f.media.load('answer', { audioUrl: '/answer.mp3' }, 'An answer. Another thought.');
    assert.equal(f.media.caption, '');
    await f.media.play(); assert.equal(f.media.caption, 'An answer.');
    f.media.select('lesson'); await f.media.play();
    assert.equal(lessonAudio.currentTime, 7);
    assert.equal(f.media.caption, 'Second idea.');
    f.media.clear(); assert.equal(f.media.caption, '');
});
test('captions do not race ahead before duration is known or combine separate sentences', async () => {
    const f = setup();
    f.env.Audio = class extends EventTarget {
        currentTime = 0; duration = NaN; ended = false;
        async play() {} pause() {} removeAttribute() {} load() {}
    };
    f.media.load('lesson', { audioUrl: '/lesson.mp3' }, 'Use version 1.5. Validate inputs! Save safely?');
    await f.media.play();
    assert.equal(f.media.caption, 'Use version 1.5.');
    f.media.lesson.audio.duration = 12; f.media.lesson.audio.currentTime = 11;
    assert.equal(f.media.caption, 'Save safely?');
});
