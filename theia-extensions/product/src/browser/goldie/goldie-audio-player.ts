// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import type { GoldieSpeech } from '../../common/goldie-service';
import { smoothAudioLevel, waveformLevel } from './goldie-audio-level';

export type GoldieAudioState = 'idle' | 'playing' | 'paused' | 'ended' | 'error';
export type GoldieAudioTrack = 'lesson' | 'answer';
export interface GoldieAudioProgress { position: number; duration: number; }
export interface GoldieAudioAdapter {
    readonly audioLevelRef?: { current: number };
    subscribe(listener: (state: GoldieAudioState, track: GoldieAudioTrack, progress?: GoldieAudioProgress) => void): () => void;
    load(track: GoldieAudioTrack, speech: GoldieSpeech): void;
    select(track: GoldieAudioTrack): void;
    play(): Promise<void>;
    pause(): void;
    seek?(position: number): void;
    clear(): void;
    dispose(): void;
}

/** Retain the lesson element while an answer plays, including its playback position. */
export class GoldieAudioPlayer implements GoldieAudioAdapter {
    readonly audioLevelRef = { current: 0 };
    private readonly tracks = new Map<GoldieAudioTrack, {
        audio: HTMLAudioElement; url: string; source?: MediaElementAudioSourceNode; analyser?: AnalyserNode; samples?: Float32Array<ArrayBuffer>;
    }>();
    private readonly listeners = new Set<(state: GoldieAudioState, track: GoldieAudioTrack, progress?: GoldieAudioProgress) => void>();
    private active: GoldieAudioTrack = 'lesson';
    private context?: AudioContext;
    private meterFrame?: number;
    private disposed = false;
    private playbackGeneration = 0;

    subscribe(listener: (state: GoldieAudioState, track: GoldieAudioTrack, progress?: GoldieAudioProgress) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    load(track: GoldieAudioTrack, speech: GoldieSpeech): void {
        const mime = speech.mimeType.toLowerCase().split(';')[0].trim();
        if (!['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/webm'].includes(mime)) {
            throw new Error('Speech returned an unsupported audio format.');
        }
        const binary = atob(speech.dataBase64);
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
        if (!bytes.length) { throw new Error('Speech returned empty audio.'); }
        this.release(track);
        const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
        const audio = new Audio(url);
        this.tracks.set(track, { audio, url });
        let currentState: GoldieAudioState = 'paused';
        const notify = (): void => {
            if (this.tracks.get(track)?.audio !== audio || this.active !== track) { return; }
            const progress = { position: Number.isFinite(audio.currentTime) ? audio.currentTime : 0, duration: Number.isFinite(audio.duration) ? audio.duration : 0 };
            for (const listener of this.listeners) { listener(currentState, track, progress); }
        };
        for (const [event, state] of [['play', 'playing'], ['pause', 'paused'], ['ended', 'ended'], ['error', 'error']] as const) {
            audio.addEventListener(event, () => {
                currentState = state;
                if (this.active === track && this.tracks.get(track)?.audio === audio) {
                    if (state === 'playing') { this.startMeter(); } else { this.stopMeter(); }
                }
                notify();
            });
        }
        audio.addEventListener('timeupdate', notify);
        audio.addEventListener('loadedmetadata', notify);
        this.select(track);
    }
    select(track: GoldieAudioTrack): void {
        this.pause();
        this.active = track;
    }
    async play(): Promise<void> {
        const entry = this.tracks.get(this.active);
        const audio = entry?.audio;
        if (!audio) { throw new Error('No speech is ready. Try Play again.'); }
        if (this.disposed) { return; }
        const generation = ++this.playbackGeneration;
        if (typeof globalThis.AudioContext === 'function') {
            this.context ??= new AudioContext();
            if (this.context.state === 'suspended') { await this.context.resume(); }
            if (this.disposed || generation !== this.playbackGeneration || this.tracks.get(this.active) !== entry) { return; }
            if (!entry!.source) {
                // The source reroutes this element's output. Connect once to a single audible path.
                const analyser = this.context.createAnalyser();
                analyser.fftSize = 1024;
                const source = this.context.createMediaElementSource(audio);
                source.connect(analyser);
                analyser.connect(this.context.destination);
                entry!.source = source;
                entry!.analyser = analyser;
                entry!.samples = new Float32Array(analyser.fftSize);
            }
        }
        if (audio.ended) { audio.currentTime = 0; }
        await audio.play();
    }
    pause(): void { this.playbackGeneration++; this.stopMeter(); this.tracks.get(this.active)?.audio.pause(); }
    seek(position: number): void {
        if (!Number.isFinite(position) || position < 0) { throw new Error('Invalid audio position.'); }
        const audio = this.tracks.get(this.active)?.audio;
        if (!audio) { throw new Error('No speech is ready.'); }
        audio.currentTime = Number.isFinite(audio.duration) ? Math.min(position, audio.duration) : position;
    }
    clear(): void {
        this.release('lesson');
        this.release('answer');
    }
    dispose(): void {
        this.disposed = true;
        this.listeners.clear(); this.clear(); this.stopMeter();
        this.context?.close().catch(() => undefined);
        this.context = undefined;
    }
    private startMeter(): void {
        this.stopMeter();
        const entry = this.tracks.get(this.active);
        if (!entry?.analyser || !entry.samples || typeof requestAnimationFrame !== 'function') { return; }
        let previous: number | undefined;
        const measure = (time: number): void => {
            if (this.disposed || this.tracks.get(this.active) !== entry) { this.stopMeter(); return; }
            entry.analyser!.getFloatTimeDomainData(entry.samples!);
            const delta = previous === undefined ? 1 / 60 : Math.min(0.1, Math.max(0, (time - previous) / 1000));
            previous = time;
            this.audioLevelRef.current = smoothAudioLevel(this.audioLevelRef.current, waveformLevel(entry.samples!), delta);
            this.meterFrame = requestAnimationFrame(measure);
        };
        this.meterFrame = requestAnimationFrame(measure);
    }
    private stopMeter(): void {
        if (this.meterFrame !== undefined) { cancelAnimationFrame(this.meterFrame); this.meterFrame = undefined; }
        this.audioLevelRef.current = 0;
    }
    private release(track: GoldieAudioTrack): void {
        const entry = this.tracks.get(track);
        if (!entry) { return; }
        if (this.active === track) { this.stopMeter(); }
        this.tracks.delete(track);
        entry.audio.pause();
        entry.audio.removeAttribute('src');
        entry.audio.load();
        entry.source?.disconnect();
        entry.analyser?.disconnect();
        URL.revokeObjectURL(entry.url);
    }
}
