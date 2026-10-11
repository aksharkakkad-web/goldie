// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
export class BrowserMedia {
    constructor(env = globalThis) {
        this.env = env; this.tracks = new Map(); this.listeners = new Set(); this.selected = 'lesson';
        this.playing = false; this.level = 0; this.generation = 0; this.captureGeneration = 0;
        this.onBlur = () => { if (this.stream || this.recorder || this.permissionPending) { this.cancelRecording(); this.emit('recording-canceled'); } };
        env.addEventListener?.('blur', this.onBlur);
    }
    get lesson() { return this.tracks.get('lesson'); }
    get position() { return this.tracks.get('lesson')?.audio.currentTime ?? 0; }
    get caption() {
        const entry = this.tracks.get(this.selected);
        if (!entry?.played || !entry.sentences.length) { return ''; }
        const { currentTime, duration } = entry.audio;
        const progress = Number.isFinite(duration) && duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
        const target = progress * entry.textLength;
        let end = 0;
        for (const sentence of entry.sentences) {
            end += sentence.length;
            if (target < end) { return sentence; }
        }
        return entry.sentences.at(-1);
    }
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    emit(event) { for (const fn of this.listeners) { fn(event); } }
    load(track, speech, text = '') {
        this.release(track); this.select(track);
        const audio = new this.env.Audio(speech.audioUrl); audio.preload = 'none';
        // The MP3 API has no alignment timestamps. Estimate sentence boundaries
        // from text length and the actual clip duration, never a wall-clock timer.
        const sentences = [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)].map(item => item.segment.trim()).filter(Boolean);
        const entry = { audio, sentences, textLength: sentences.reduce((sum, sentence) => sum + sentence.length, 0), played: false }; this.tracks.set(track, entry);
        let previousCaption = '';
        for (const event of ['timeupdate', 'loadedmetadata', 'seeked']) {
            audio.addEventListener(event, () => {
                if (this.tracks.get(track) !== entry || this.selected !== track) { return; }
                const caption = this.caption;
                if (caption !== previousCaption) { previousCaption = caption; this.emit('caption'); }
            });
        }
        audio.addEventListener('ended', () => { if (this.tracks.get(track) === entry && this.selected === track) { this.pause(); this.emit('ended'); } });
        audio.addEventListener('error', () => { if (this.tracks.get(track) === entry) { this.pause(); this.emit('audio-error'); } });
    }
    select(track) { this.pause(); this.selected = track; }
    async play() {
        const entry = this.tracks.get(this.selected); if (!entry) { throw new Error('Load this explanation before playing audio.'); }
        const generation = ++this.generation;
        try {
            if (this.env.AudioContext) {
                this.context ??= new this.env.AudioContext();
                if (this.context.state === 'suspended') { await this.context.resume(); }
                if (generation !== this.generation) { return; }
                if (!entry.source) {
                    entry.analyser = this.context.createAnalyser(); entry.analyser.fftSize = 1024;
                    entry.source = this.context.createMediaElementSource(entry.audio);
                    entry.source.connect(entry.analyser); entry.analyser.connect(this.context.destination);
                    entry.samples = new Float32Array(entry.analyser.fftSize);
                }
            }
            if (entry.audio.ended) { entry.audio.currentTime = 0; }
            await entry.audio.play();
            if (generation !== this.generation) { entry.audio.pause(); return; }
            entry.played = true; this.playing = true; this.emit('playing'); this.meter(entry);
        } catch { throw Object.assign(new Error('Audio could not play. Try Play again, skip or finish this lesson.'), { retryable: true }); }
    }
    meter(entry) {
        if (!entry.analyser) { return; }
        let previous;
        const frame = time => {
            if (!this.playing || this.tracks.get(this.selected) !== entry) { return; }
            entry.analyser.getFloatTimeDomainData(entry.samples);
            const rms = Math.sqrt(entry.samples.reduce((sum, v) => sum + v * v, 0) / entry.samples.length);
            const target = rms <= 0.012 ? 0 : Math.pow(Math.min(1, (rms - 0.012) / 0.208), 0.72);
            const dt = previous === undefined ? 1 / 60 : Math.min(0.1, (time - previous) / 1000); previous = time;
            this.level += (target - this.level) * (1 - Math.exp(-dt / (target > this.level ? 0.035 : 0.26)));
            this.frame = this.env.requestAnimationFrame(frame);
        };
        this.frame = this.env.requestAnimationFrame(frame);
    }
    pause() {
        this.generation++; this.playing = false; this.level = 0;
        if (this.frame !== undefined) { this.env.cancelAnimationFrame?.(this.frame); this.frame = undefined; }
        this.tracks.get(this.selected)?.audio.pause(); this.emit('paused');
    }
    release(track) {
        const entry = this.tracks.get(track); if (!entry) { return; }
        this.tracks.delete(track); entry.audio.pause(); entry.audio.removeAttribute('src'); entry.audio.load();
        entry.source?.disconnect(); entry.analyser?.disconnect();
    }
    clear() { this.pause(); for (const track of [...this.tracks.keys()]) { this.release(track); } }
    async startRecording() {
        this.cancelRecording();
        const generation = ++this.captureGeneration;
        const recorderType = 'audio/webm';
        if (!this.env.navigator?.mediaDevices?.getUserMedia || !this.env.MediaRecorder?.isTypeSupported(recorderType)) {
            throw new Error('Microphone recording needs a compatible browser on localhost or HTTPS. Continue the lesson without questions.');
        }
        this.permissionPending = true;
        let stream;
        try { stream = await this.env.navigator.mediaDevices.getUserMedia({ audio: true }); }
        catch { this.permissionPending = false; throw new Error('Microphone access was not allowed. Allow it in your browser or continue the lesson.'); }
        this.permissionPending = false;
        if (generation !== this.captureGeneration) { stream.getTracks().forEach(track => track.stop()); return; }
        this.stream = stream; this.chunks = []; this.recordedSize = 0; this.tooLarge = false;
        try {
            this.recorder = new this.env.MediaRecorder(stream, { mimeType: recorderType });
            const recorder = this.recorder;
            this.stopped = new Promise(resolve => { this.resolveStop = resolve; });
            recorder.addEventListener('dataavailable', event => {
                if (generation !== this.captureGeneration) { return; }
                this.recordedSize += event.data.size;
                if (this.recordedSize > 2 * 1024 * 1024) { this.tooLarge = true; this.stopRecording(); }
                else if (event.data.size) { this.chunks.push(event.data); }
            });
            recorder.addEventListener('stop', () => { this.releaseStream(); this.resolveStop?.(); });
            recorder.addEventListener('error', () => { this.cancelRecording(); this.emit('recording-canceled'); });
            recorder.start(250);
            this.meterMicrophone(stream);
            this.timer = this.env.setTimeout(() => this.stopRecording(), 30000);
        } catch { this.cancelRecording(); throw new Error('The microphone could not start recording. Continue the lesson or try again.'); }
    }
    meterMicrophone(stream) {
        if (!this.env.AudioContext || !this.env.requestAnimationFrame) { return; }
        try {
            this.context ??= new this.env.AudioContext();
            void Promise.resolve(this.context.resume?.()).catch(() => {});
            this.microphoneSource = this.context.createMediaStreamSource(stream);
            this.microphoneAnalyser = this.context.createAnalyser();
            this.microphoneAnalyser.fftSize = 1024;
            this.microphoneSource.connect(this.microphoneAnalyser);
            const samples = new Float32Array(this.microphoneAnalyser.fftSize);
            let previous;
            const frame = time => {
                if (this.stream !== stream) { return; }
                this.microphoneAnalyser.getFloatTimeDomainData(samples);
                const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
                const target = rms <= 0.012 ? 0 : Math.pow(Math.min(1, (rms - 0.012) / 0.208), 0.72);
                const dt = previous === undefined ? 1 / 60 : Math.min(0.1, (time - previous) / 1000); previous = time;
                this.level += (target - this.level) * (1 - Math.exp(-dt / (target > this.level ? 0.035 : 0.26)));
                this.microphoneFrame = this.env.requestAnimationFrame(frame);
            };
            this.microphoneFrame = this.env.requestAnimationFrame(frame);
        } catch {
            // Recording still works when a browser cannot expose an input analyser.
            this.stopMicrophoneMeter();
        }
    }
    stopMicrophoneMeter() {
        if (this.microphoneFrame !== undefined) { this.env.cancelAnimationFrame?.(this.microphoneFrame); this.microphoneFrame = undefined; }
        this.microphoneSource?.disconnect(); this.microphoneAnalyser?.disconnect();
        this.microphoneSource = null; this.microphoneAnalyser = null; this.level = 0;
    }
    releaseStream() {
        this.stopMicrophoneMeter();
        this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    }
    stopRecording() {
        this.env.clearTimeout(this.timer);
        const recorder = this.recorder;
        if (recorder?.state === 'recording') { recorder.stop(); }
        this.releaseStream(); this.emit('recording-ready');
    }
    async recordingData() {
        if (!this.recorder || !this.stopped) { throw new Error('Record a question first.'); }
        await this.stopped;
        if (this.tooLarge) { throw new Error('The recording is too large. Cancel and record a shorter question.'); }
        if (!this.chunks?.length) { throw new Error('No recording is available. Record a question first.'); }
        const bytes = new Uint8Array(await new Blob(this.chunks, { type: 'audio/webm' }).arrayBuffer());
        let text = ''; for (let i = 0; i < bytes.length; i += 8192) { text += String.fromCharCode(...bytes.subarray(i, i + 8192)); }
        return btoa(text);
    }
    cancelRecording() {
        this.captureGeneration++; this.permissionPending = false; this.env.clearTimeout(this.timer);
        if (this.recorder?.state === 'recording') { this.recorder.stop(); }
        this.releaseStream(); this.resolveStop?.(); this.recorder = null; this.stopped = null; this.chunks = [];
    }
    dispose() { this.clear(); this.cancelRecording(); this.env.removeEventListener?.('blur', this.onBlur); void this.context?.close(); this.listeners.clear(); }
}
