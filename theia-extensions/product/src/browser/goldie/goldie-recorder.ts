// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
export interface GoldieRecording {
    readonly blob: Blob;
    readonly mimeType: string;
}
export interface GoldieRecorderState {
    readonly status: 'idle' | 'permission' | 'recording' | 'stopping' | 'ready' | 'error';
    readonly error?: string;
}
export interface GoldieRecorderEnvironment {
    getStream(): Promise<MediaStream>;
    createRecorder(stream: MediaStream): MediaRecorder;
    schedule(callback: () => void, milliseconds: number): ReturnType<typeof setTimeout>;
    clear(timer: ReturnType<typeof setTimeout>): void;
}
const maxBytes = 2 * 1024 * 1024;
const browserEnvironment: GoldieRecorderEnvironment = {
    getStream: () => navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
    createRecorder: stream => {
        const mimeType = ['audio/webm;codecs=opus', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
        if (!mimeType) { throw new Error('Unsupported recording format'); }
        return new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
    },
    schedule: (callback, milliseconds) => setTimeout(callback, milliseconds),
    clear: timer => clearTimeout(timer)
};

/** Explicit, memory-only capture. Cancel invalidates even a pending OS permission result. */
export class GoldieRecorder {
    private current: GoldieRecorderState = { status: 'idle' };
    private readonly listeners = new Set<(state: GoldieRecorderState) => void>();
    private generation = 0;
    private disposed = false;
    private stream?: MediaStream;
    private recorder?: MediaRecorder;
    private timer?: ReturnType<typeof setTimeout>;
    private chunks: Blob[] = [];
    private size = 0;
    private clip?: GoldieRecording;
    private finishing?: Promise<GoldieRecording | undefined>;
    private resolveFinish?: (clip: GoldieRecording | undefined) => void;
    private readonly blur = (): void => { this.cancel(); };
    private readonly hidden = (): void => { if (globalThis.document?.hidden) { this.cancel(); } };

    constructor(private readonly environment: GoldieRecorderEnvironment = browserEnvironment) {
        globalThis.window?.addEventListener('blur', this.blur);
        globalThis.window?.addEventListener('pagehide', this.blur);
        globalThis.document?.addEventListener('visibilitychange', this.hidden);
    }
    get state(): GoldieRecorderState { return this.current; }
    subscribe(listener: (state: GoldieRecorderState) => void): () => void {
        this.listeners.add(listener);
        listener(this.current);
        return () => this.listeners.delete(listener);
    }
    async start(): Promise<void> {
        if (this.disposed || ['permission', 'recording', 'stopping'].includes(this.current.status)) { return; }
        this.cancel();
        const token = ++this.generation;
        this.update({ status: 'permission' });
        try {
            const stream = await this.environment.getStream();
            if (this.disposed || token !== this.generation) { this.stopTracks(stream); return; }
            this.stream = stream;
            const recorder = this.environment.createRecorder(stream);
            this.recorder = recorder;
            recorder.ondataavailable = event => {
                if (token !== this.generation || !event.data.size) { return; }
                this.size += event.data.size;
                if (this.size > maxBytes) { this.fail('The recording is too large. Try a shorter question.'); return; }
                this.chunks.push(event.data);
            };
            recorder.onerror = () => { if (token === this.generation) { this.fail('Microphone recording failed. Try recording again.'); } };
            recorder.onstop = () => {
                if (token !== this.generation) { return; }
                this.clearTimer();
                this.releaseRecorder();
                if (!this.size) { this.fail('No audio was captured. Try recording again.'); return; }
                this.clip = { blob: new Blob(this.chunks, { type: recorder.mimeType }), mimeType: recorder.mimeType };
                this.chunks = [];
                this.update({ status: 'ready' });
                this.resolveFinish?.(this.clip);
                this.resolveFinish = undefined;
            };
            recorder.start(250);
            this.update({ status: 'recording' });
            this.timer = this.environment.schedule(() => { this.finish(); }, 30000);
        } catch {
            if (token === this.generation && !this.disposed) {
                this.fail('Microphone unavailable. Allow microphone access in macOS settings, or connect a microphone and try again.');
            }
        }
    }
    finish(): Promise<GoldieRecording | undefined> {
        if (this.current.status === 'ready') { return Promise.resolve(this.clip); }
        if (this.finishing) { return this.finishing; }
        if (this.current.status !== 'recording' || !this.recorder) { return Promise.resolve(undefined); }
        this.finishing = new Promise(resolve => { this.resolveFinish = resolve; });
        const pending = this.finishing;
        this.clearTimer();
        this.update({ status: 'stopping' });
        try {
            this.recorder.stop();
            // Release the device immediately; the recorder still delivers its final data/stop events.
            if (this.stream) { this.stopTracks(this.stream); this.stream = undefined; }
        } catch { this.fail('Could not finish recording. Try recording again.'); }
        return pending;
    }
    cancel(): void {
        this.generation++;
        this.clearTimer();
        this.releaseRecorder();
        this.resolveFinish?.(undefined);
        this.resolveFinish = undefined;
        this.finishing = undefined;
        this.clip = undefined;
        this.chunks = [];
        this.size = 0;
        this.update({ status: 'idle' });
    }
    dispose(): void {
        this.cancel();
        this.disposed = true;
        globalThis.window?.removeEventListener('blur', this.blur);
        globalThis.window?.removeEventListener('pagehide', this.blur);
        globalThis.document?.removeEventListener('visibilitychange', this.hidden);
        this.listeners.clear();
    }
    private fail(error: string): void { this.cancel(); this.update({ status: 'error', error }); }
    private clearTimer(): void {
        if (this.timer !== undefined) { this.environment.clear(this.timer); this.timer = undefined; }
    }
    private stopTracks(stream: MediaStream): void { for (const track of stream.getTracks()) { track.stop(); } }
    private releaseRecorder(): void {
        const recorder = this.recorder;
        this.recorder = undefined;
        if (recorder) {
            // DOM event-handler properties require null to remove a callback.
            /* eslint-disable no-null/no-null */
            recorder.ondataavailable = null;
            recorder.onstop = null;
            recorder.onerror = null;
            /* eslint-enable no-null/no-null */
            if (recorder.state !== 'inactive') { try { recorder.stop(); } catch { /* Tracks are released below. */ } }
        }
        if (this.stream) { this.stopTracks(this.stream); this.stream = undefined; }
    }
    private update(state: GoldieRecorderState): void {
        if (this.disposed) { return; }
        this.current = Object.freeze(state);
        for (const listener of this.listeners) { listener(this.current); }
    }
}
