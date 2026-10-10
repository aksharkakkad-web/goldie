// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import type { GoldieSpeech } from '../../common/goldie-service';

export type GoldieAudioState = 'idle' | 'playing' | 'paused' | 'ended' | 'error';
export type GoldieAudioTrack = 'lesson' | 'answer';
export interface GoldieAudioAdapter {
    subscribe(listener: (state: GoldieAudioState, track: GoldieAudioTrack) => void): () => void;
    load(track: GoldieAudioTrack, speech: GoldieSpeech): void;
    select(track: GoldieAudioTrack): void;
    play(): Promise<void>;
    pause(): void;
    clear(): void;
    dispose(): void;
}

/** Retain the lesson element while an answer plays, including its playback position. */
export class GoldieAudioPlayer implements GoldieAudioAdapter {
    private readonly tracks = new Map<GoldieAudioTrack, { audio: HTMLAudioElement; url: string }>();
    private readonly listeners = new Set<(state: GoldieAudioState, track: GoldieAudioTrack) => void>();
    private active: GoldieAudioTrack = 'lesson';

    subscribe(listener: (state: GoldieAudioState, track: GoldieAudioTrack) => void): () => void {
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
        for (const [event, state] of [['play', 'playing'], ['pause', 'paused'], ['ended', 'ended'], ['error', 'error']] as const) {
            audio.addEventListener(event, () => {
                if (this.tracks.get(track)?.audio === audio && this.active === track) {
                    for (const listener of this.listeners) { listener(state, track); }
                }
            });
        }
        this.select(track);
    }
    select(track: GoldieAudioTrack): void {
        this.pause();
        this.active = track;
    }
    async play(): Promise<void> {
        const audio = this.tracks.get(this.active)?.audio;
        if (!audio) { throw new Error('No speech is ready. Try Play again.'); }
        if (audio.ended) { audio.currentTime = 0; }
        await audio.play();
    }
    pause(): void { this.tracks.get(this.active)?.audio.pause(); }
    clear(): void {
        this.release('lesson');
        this.release('answer');
    }
    dispose(): void { this.listeners.clear(); this.clear(); }
    private release(track: GoldieAudioTrack): void {
        const entry = this.tracks.get(track);
        if (!entry) { return; }
        this.tracks.delete(track);
        entry.audio.pause();
        entry.audio.removeAttribute('src');
        entry.audio.load();
        URL.revokeObjectURL(entry.url);
    }
}
