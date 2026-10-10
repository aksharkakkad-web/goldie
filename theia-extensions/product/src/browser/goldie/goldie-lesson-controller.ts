// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import type { AskResponse, CompleteResponse, OfferResponse, SessionResponse, TeachResponse } from '@goldie/contracts';
import type { GoldieService } from '../../common/goldie-service';
import { GoldieAudioAdapter, GoldieAudioPlayer, GoldieAudioState } from './goldie-audio-player';

export type GoldiePhaseStatus = 'pending' | 'heard' | 'skipped' | 'familiar';
export interface GoldieLessonState {
    readonly view: 'idle' | 'offer' | 'lesson' | 'question' | 'recap';
    readonly busy: boolean;
    readonly error?: string;
    readonly offer?: OfferResponse;
    readonly session?: SessionResponse;
    readonly phaseIndex: number;
    readonly statuses: Readonly<Record<string, GoldiePhaseStatus>>;
    readonly explanation?: TeachResponse;
    readonly question?: string;
    readonly answer?: AskResponse;
    readonly recap?: CompleteResponse;
    readonly audioState: GoldieAudioState;
}

// Explicit sample context, not a claim that a live Codex handoff has been captured.
const context = {
    revision: 1,
    handoff: 'Prepared example: a small Next.js team-management app. Task: add authentication and protected workspace routes. Implementation has not been verified.',
    profile: { level: 'beginner' }
};

export class GoldieLessonController {
    private current: GoldieLessonState = { view: 'idle', busy: false, phaseIndex: 0, statuses: {}, audioState: 'idle' };
    private readonly listeners = new Set<(state: GoldieLessonState) => void>();
    private generation = 0;
    private disposed = false;
    private lessonAudioReady = false;
    private answerAudioReady = false;
    private readonly unsubscribeAudio: () => void;

    constructor(private readonly service: GoldieService, private readonly audio: GoldieAudioAdapter = new GoldieAudioPlayer()) {
        this.unsubscribeAudio = audio.subscribe((audioState, track) => {
            if (this.disposed || (track === 'lesson' && this.current.view !== 'lesson') || (track === 'answer' && this.current.view !== 'question')) { return; }
            if (audioState === 'error') {
                if (track === 'lesson') { this.lessonAudioReady = false; } else { this.answerAudioReady = false; }
            }
            const phase = this.phase;
            this.update({ audioState, ...(audioState === 'error' ? { error: 'Audio could not play. The text is still available; try Play again.' } : {}),
                ...(track === 'lesson' && audioState === 'ended' && phase && this.current.statuses[phase.id] === 'pending'
                    ? { statuses: { ...this.current.statuses, [phase.id]: 'heard' } } : {}) });
        });
    }
    get state(): GoldieLessonState { return this.current; }
    subscribe(listener: (state: GoldieLessonState) => void): () => void {
        this.listeners.add(listener);
        listener(this.current);
        return () => this.listeners.delete(listener);
    }
    async checkOffer(): Promise<void> {
        if (this.current.session && this.current.view !== 'recap') { return; }
        await this.run(async token => {
            const offer = await this.service.offer({ projectId: 'goldie-reference', ...context });
            if (offer.shouldOffer && !offer.offerId) { throw new Error('Goldie returned an offer without an ID. Try finding a lesson again.'); }
            if (this.valid(token)) { this.update({ view: offer.shouldOffer ? 'offer' : 'idle', offer, session: undefined, recap: undefined }); }
        });
    }
    declineOffer(): void {
        if (this.current.view !== 'offer') { return; }
        this.generation++;
        this.audio.clear();
        this.update({ view: 'idle', offer: undefined, busy: false, error: undefined, audioState: 'idle' });
    }
    async acceptOffer(): Promise<void> {
        const offerId = this.current.offer?.offerId;
        if (this.current.view !== 'offer' || !offerId) { return; }
        await this.run(async token => {
            const session = await this.service.startSession({ offerId, ...context });
            if (!this.valid(token)) { return; }
            this.audio.clear();
            this.lessonAudioReady = false;
            this.answerAudioReady = false;
            this.update({ view: 'lesson', session, phaseIndex: 0, statuses: Object.fromEntries(session.phases.map(phase => [phase.id, 'pending'])), explanation: undefined });
            if (session.phases.length) { await this.teach(token); }
        });
    }
    async playPause(): Promise<void> {
        if (this.current.busy || !['lesson', 'question'].includes(this.current.view)) { return; }
        if (this.current.audioState === 'playing') { this.audio.pause(); this.update({ audioState: 'paused' }); return; }
        await this.run(async token => {
            if (this.current.view === 'lesson' && !this.current.explanation) { await this.teach(token); return; }
            const isAnswer = this.current.view === 'question';
            const text = isAnswer ? (this.current.answer?.kind === 'answer' ? this.current.answer.answer : undefined) : this.current.explanation?.explanation;
            if (!text) { return; }
            if (!(isAnswer ? this.answerAudioReady : this.lessonAudioReady)) {
                await this.speak(text, isAnswer ? 'answer' : 'lesson', token);
            } else {
                await this.audio.play();
            }
        });
    }
    async skipPhase(): Promise<void> { await this.advance('skipped'); }
    async markFamiliar(): Promise<void> { await this.advance('familiar'); }
    async nextPhase(): Promise<void> { await this.advance(); }
    async askQuestion(question: string): Promise<void> {
        const phase = this.phase;
        const session = this.current.session;
        if (!question.trim() || !phase || !session || this.current.busy || !['lesson', 'question'].includes(this.current.view)) { return; }
        this.audio.pause();
        this.answerAudioReady = false;
        this.update({ view: 'question', question: question.trim(), answer: undefined, audioState: 'paused' });
        await this.run(async token => {
            const answer = await this.service.ask({ sessionId: session.sessionId, phaseId: phase.id, question: question.trim(), handoff: context.handoff });
            if (!this.valid(token)) { return; }
            this.update({ answer });
            if (answer.kind === 'answer') {
                await this.speak(answer.answer, 'answer', token);
            } else {
                this.update({ error: 'This question needs source evidence. Source retrieval is not connected yet; you can resume the lesson.' });
            }
        });
    }
    async resumeLesson(): Promise<void> {
        if (this.current.view !== 'question' || this.current.busy) { return; }
        this.audio.select('lesson');
        this.update({ view: 'lesson', audioState: 'paused', error: undefined });
        await this.playPause();
    }
    async endSession(): Promise<void> { await this.finish('dismissed'); }
    dispose(): void {
        this.disposed = true;
        this.generation++;
        this.unsubscribeAudio();
        this.audio.dispose();
        this.listeners.clear();
    }
    private get phase(): SessionResponse['phases'][number] | undefined { return this.current.session?.phases[this.current.phaseIndex]; }
    private async advance(status?: GoldiePhaseStatus): Promise<void> {
        if (this.current.view !== 'lesson' || this.current.busy) { return; }
        const phase = this.phase;
        if (phase && status) { this.update({ statuses: { ...this.current.statuses, [phase.id]: status } }); }
        if (!this.current.session || this.current.phaseIndex + 1 >= this.current.session.phases.length) { await this.finish('completed'); return; }
        this.audio.clear();
        this.lessonAudioReady = false;
        this.answerAudioReady = false;
        this.update({ phaseIndex: this.current.phaseIndex + 1, explanation: undefined, answer: undefined, question: undefined, audioState: 'idle' });
        await this.run(token => this.teach(token));
    }
    private async teach(token: number): Promise<void> {
        const phase = this.phase;
        const session = this.current.session;
        if (!phase || !session) { return; }
        const explanation = await this.service.teach({ sessionId: session.sessionId, phaseId: phase.id, handoff: context.handoff, profile: context.profile });
        if (!this.valid(token)) { return; }
        this.update({ explanation });
        await this.speak(explanation.explanation, 'lesson', token);
    }
    private async speak(text: string, track: 'lesson' | 'answer', token: number): Promise<void> {
        const speech = await this.service.speech({ text });
        if (!this.valid(token)) { return; }
        this.audio.load(track, speech);
        if (track === 'lesson') { this.lessonAudioReady = true; } else { this.answerAudioReady = true; }
        await this.audio.play();
    }
    private async finish(status: 'completed' | 'dismissed'): Promise<void> {
        const session = this.current.session;
        if (!session || this.current.view === 'recap') { return; }
        // Ending is also available while a provider is taking too long.
        this.generation++;
        this.audio.clear();
        this.lessonAudioReady = false;
        this.answerAudioReady = false;
        this.update({ busy: false, audioState: 'idle' });
        await this.run(async token => {
            const recap = await this.service.complete({ sessionId: session.sessionId, status, currentRevision: context.revision, handoff: context.handoff,
                learningState: { phases: { ...this.current.statuses }, currentPhaseId: this.phase?.id, sessionSnapshotRevision: session.snapshotRevision } });
            if (this.valid(token)) { this.update({ view: 'recap', recap }); }
        });
    }
    private async run(work: (token: number) => Promise<void>): Promise<void> {
        if (this.disposed || this.current.busy) { return; }
        const token = ++this.generation;
        this.update({ busy: true, error: undefined });
        try { await work(token); } catch (error) {
            if (this.valid(token)) { this.update({ error: error instanceof Error ? error.message : 'Goldie could not connect. Please try again.', audioState: 'error' }); }
        } finally { if (this.valid(token)) { this.update({ busy: false }); } }
    }
    private valid(token: number): boolean { return !this.disposed && token === this.generation; }
    private update(update: Partial<GoldieLessonState>): void {
        if (this.disposed) { return; }
        this.current = Object.freeze({ ...this.current, ...update });
        for (const listener of this.listeners) { listener(this.current); }
    }
}
