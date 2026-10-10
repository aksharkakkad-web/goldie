// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import type { AskResponse, CompleteResponse, OfferResponse, SessionActionRequest, SessionResponse, TeachResponse } from '@goldie/contracts';
import { GOLDIE_NONRETRYABLE_ERROR_CODE, GoldieService } from '../../common/goldie-service';
import { GoldieAudioAdapter, GoldieAudioPlayer, GoldieAudioState } from './goldie-audio-player';

export type GoldiePhaseStatus = 'pending' | 'heard' | 'skipped' | 'familiar';
export interface GoldieLessonState {
    readonly view: 'idle' | 'offer' | 'lesson' | 'question' | 'recap';
    readonly busy: boolean;
    readonly error?: string;
    readonly retryable?: boolean;
    readonly restored?: boolean;
    readonly offer?: OfferResponse;
    readonly session?: SessionResponse;
    readonly phaseIndex: number;
    readonly statuses: Readonly<Record<string, GoldiePhaseStatus>>;
    readonly explanation?: TeachResponse;
    readonly addOn?: TeachResponse;
    readonly question?: string;
    readonly answer?: AskResponse;
    readonly recap?: CompleteResponse;
    readonly audioState: GoldieAudioState;
    readonly audioPosition?: number;
    readonly audioDuration?: number;
}

interface SessionReference { sessionId: string; revision: number; }
interface AcceptanceReference { offerId: string; revision: number; }
type RecoveryReference = SessionReference | AcceptanceReference;
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
type Work = (token: number) => Promise<void>;
const storageKey = 'goldie.reference-session.v1';
const context = { handoff: '', profile: {} };
function browserStorage(): Storage | undefined {
    try { return globalThis.localStorage; } catch { return undefined; }
}

/** Server progress is authoritative. Only clip positions and pending UI intent live in this controller. */
export class GoldieLessonController {
    private current: GoldieLessonState = { view: 'idle', busy: false, phaseIndex: 0, statuses: {}, audioState: 'idle' };
    private readonly listeners = new Set<(state: GoldieLessonState) => void>();
    private generation = 0;
    private disposed = false;
    private lessonAudioReady = false;
    private answerAudioReady = false;
    private reference?: RecoveryReference;
    private revision = 1;
    private pendingAction?: SessionActionRequest;
    private pendingClosure?: 'completed' | 'dismissed';
    private mutation?: Promise<unknown>;
    private retryWork?: Work;
    private endedDuringWork?: { generation: number; phaseId: string };
    private readonly unsubscribeAudio: () => void;

    constructor(private readonly service: GoldieService, private readonly audio: GoldieAudioAdapter = new GoldieAudioPlayer(),
        private readonly storage: Storage | undefined = browserStorage()) {
        try {
            const saved = this.storage?.getItem(storageKey);
            if (saved) {
                const value: RecoveryReference = JSON.parse(saved);
                const id = 'sessionId' in value ? value.sessionId : value.offerId;
                if (typeof id === 'string' && id.length > 0 && id.length <= 128 && Number.isSafeInteger(value.revision) && value.revision >= 0) {
                    this.reference = 'sessionId' in value ? { sessionId: id, revision: value.revision } : { offerId: id, revision: value.revision };
                    this.revision = value.revision;
                }
            }
        } catch { /* Unavailable local storage must not stop a new lesson. */ }
        this.unsubscribeAudio = audio.subscribe((audioState, track, progress) => {
            if (this.disposed || (track === 'lesson' && this.current.view !== 'lesson') || (track === 'answer' && this.current.view !== 'question')) { return; }
            if (audioState === 'error') {
                if (track === 'lesson') { this.lessonAudioReady = false; } else { this.answerAudioReady = false; }
            }
            this.update({ audioState, audioPosition: progress?.position ?? 0, audioDuration: progress?.duration ?? 0,
                ...(audioState === 'error' ? { error: 'Audio could not play. The text is still available; try Play again.' } : {}) });
            if (track === 'lesson' && audioState === 'ended' && this.current.session?.status === 'learning' && this.phase) {
                if (this.current.busy) { this.endedDuringWork = { generation: this.generation, phaseId: this.phase.id }; } else { this.nextPhase(); }
            }
        });
    }

    get state(): GoldieLessonState { return this.current; }
    subscribe(listener: (state: GoldieLessonState) => void): () => void {
        this.listeners.add(listener);
        listener(this.current);
        return () => this.listeners.delete(listener);
    }
    async restore(): Promise<void> {
        const reference = this.reference;
        if (!reference || this.current.session || this.current.busy) { return; }
        await this.run(async token => {
            const session = 'sessionId' in reference ? await this.service.getSession(reference.sessionId)
                : await this.mutate(this.service.startSession({ offerId: reference.offerId, revision: reference.revision, ...context }));
            if (!this.valid(token)) { return; }
            this.resetAudio();
            this.applySession(session);
            this.update({ view: 'lesson', restored: true, audioState: 'paused', explanation: undefined, answer: undefined, addOn: undefined });
            if (this.terminal(session) || !session.activePhaseId) {
                await this.close(this.terminal(session) ? session.status as 'completed' | 'dismissed' : 'completed', token);
            }
        });
    }
    async checkOffer(): Promise<void> {
        if (this.reference && !this.current.session) { await this.restore(); return; }
        if (this.current.session && this.current.view !== 'recap') { return; }
        if (this.current.view === 'recap') {
            this.revision = Math.max(this.revision, this.current.session?.snapshotRevision ?? 0) + 1;
            this.reference = undefined;
            this.pendingClosure = undefined;
            this.update({ session: undefined, recap: undefined, view: 'idle' });
        }
        await this.run(async token => {
            const offer = await this.service.offer({ projectId: 'goldie-reference', revision: this.revision, referenceLessonId: 'webapp-architecture', ...context });
            if (offer.shouldOffer && !offer.offerId) { throw new Error('Goldie returned an offer without an ID. Try finding a lesson again.'); }
            if (this.valid(token)) { this.update({ view: offer.shouldOffer ? 'offer' : 'idle', offer }); }
        });
    }
    declineOffer(): void {
        if (this.current.view !== 'offer' || this.current.busy) { return; }
        this.generation++;
        this.resetAudio();
        this.update({ view: 'idle', offer: undefined, busy: false, error: undefined, retryable: false, audioState: 'idle' });
    }
    async acceptOffer(): Promise<void> {
        const offerId = this.current.offer?.offerId;
        if (this.current.view !== 'offer' || !offerId) { return; }
        const acceptance: AcceptanceReference = { offerId, revision: this.revision };
        await this.run(async token => {
            // Save accepted intent before the network call: acceptance may succeed without a response.
            this.saveReference(acceptance);
            const session = await this.mutate(this.service.startSession({ ...acceptance, ...context }));
            if (!this.valid(token)) { return; }
            this.resetAudio();
            this.applySession(session);
            this.update({ view: 'lesson', explanation: undefined, answer: undefined, addOn: undefined, restored: false });
            if (this.terminal(session) || !session.activePhaseId) {
                await this.close(this.terminal(session) ? session.status as 'completed' | 'dismissed' : 'completed', token);
            } else if (session.status === 'learning') { await this.teach(token); }
        });
    }
    async playPause(): Promise<void> {
        if (!this.canCommand() || !['lesson', 'question'].includes(this.current.view)) { return; }
        const isAnswer = this.current.view === 'question';
        const wasPlaying = this.current.audioState === 'playing';
        if (wasPlaying) { this.audio.pause(); }
        await this.run(async token => {
            if (isAnswer) {
                if (wasPlaying) { return; }
                const content = this.current.addOn ?? (this.current.answer?.kind === 'answer' ? this.current.answer : undefined);
                if (!content) { return; }
                if (!this.answerAudioReady) { await this.speak(content.contentId, 'answer', token); } else { await this.audio.play(); }
                return;
            }
            if (wasPlaying) { await this.sendAction('pause', token); return; }
            if (this.current.session?.status !== 'learning') { await this.sendAction('resume', token); }
            if (!this.valid(token)) { return; }
            this.update({ restored: false });
            if (!this.current.explanation) { await this.teach(token); } else if (!this.lessonAudioReady) {
                await this.speak(this.current.explanation.contentId, 'lesson', token);
            } else { this.audio.select('lesson'); await this.audio.play(); }
        });
    }
    async skipPhase(): Promise<void> { await this.advance('skip'); }
    async markFamiliar(): Promise<void> { await this.advance('already_know'); }
    async nextPhase(): Promise<void> { await this.advance('phase_completed'); }
    async askQuestion(question: string): Promise<void> {
        if (!question.trim() || question.trim().length > 1000) { return; }
        await this.interrupt(question.trim(), false);
    }
    async explainMore(): Promise<void> { await this.interrupt(undefined, true); }
    async resumeLesson(): Promise<void> {
        if (this.current.view !== 'question' || !this.canCommand()) { return; }
        this.audio.pause();
        await this.run(async token => {
            await this.sendAction('resume', token);
            if (!this.valid(token)) { return; }
            this.audio.select('lesson');
            this.update({ view: 'lesson', audioState: 'paused', addOn: undefined, answer: undefined, question: undefined });
            if (!this.current.explanation) { await this.teach(token); } else if (!this.lessonAudioReady) {
                await this.speak(this.current.explanation.contentId, 'lesson', token);
            } else { await this.audio.play(); }
        });
    }
    async retry(): Promise<void> {
        if (!this.current.busy && this.retryWork) { await this.run(this.retryWork); }
    }
    async endSession(): Promise<void> {
        if (!this.current.session || this.current.view === 'recap') { return; }
        // Cancel media immediately, but order closure after any outstanding state mutation.
        const mutation = this.mutation;
        this.generation++;
        this.resetAudio();
        this.update({ busy: false, audioState: 'idle' });
        await this.run(async token => {
            if (mutation) { try { await mutation; } catch { /* Closure reads stored progress, including a lost action response. */ } }
            if (this.valid(token)) { await this.close(this.pendingClosure ?? 'dismissed', token); }
        });
    }
    dispose(): void {
        this.disposed = true;
        this.generation++;
        this.unsubscribeAudio();
        this.audio.dispose();
        this.listeners.clear();
    }
    private get phase(): SessionResponse['phases'][number] | undefined { return this.current.session?.phases[this.current.phaseIndex]; }
    private canCommand(): boolean { return !this.disposed && !this.current.busy && !this.pendingAction && !this.pendingClosure; }
    private terminal(session: SessionResponse): boolean { return session.status === 'completed' || session.status === 'dismissed'; }
    private async advance(action: 'skip' | 'already_know' | 'phase_completed'): Promise<void> {
        if (this.current.view !== 'lesson' || !this.canCommand() || !this.phase) { return; }
        this.resetAudio();
        this.update({ audioState: 'idle' });
        let advanced = false;
        await this.run(async token => {
            if (!advanced) {
                if (action === 'phase_completed' && this.current.session?.status !== 'learning') { await this.sendAction('resume', token); }
                if (!this.valid(token)) { return; }
                await this.sendAction(action, token);
                advanced = this.valid(token);
            }
            if (!this.valid(token)) { return; }
            this.update({ explanation: undefined, answer: undefined, addOn: undefined, question: undefined, audioState: 'idle' });
            if (!this.current.session?.activePhaseId) { await this.close('completed', token); } else if (this.current.session.status === 'learning') {
                await this.teach(token);
            }
        });
    }
    private async interrupt(question: string | undefined, expanded: boolean): Promise<void> {
        const session = this.current.session;
        const phase = this.phase;
        if (!session || !phase || !this.canCommand() || !['lesson', 'question'].includes(this.current.view)) { return; }
        this.audio.pause();
        this.answerAudioReady = false;
        this.update({ view: 'question', question, answer: undefined, addOn: undefined, audioState: 'paused' });
        await this.run(async token => {
            if (this.current.session?.status === 'learning') { await this.sendAction('pause', token); }
            if (!this.valid(token)) { return; }
            if (expanded) {
                if (!this.current.addOn) {
                    const addOn = await this.service.teach({ sessionId: session.sessionId, phaseId: phase.id, detail: 'expanded', ...context });
                    if (!this.valid(token)) { return; }
                    this.update({ addOn });
                }
                await this.speak(this.current.addOn!.contentId, 'answer', token);
            } else {
                if (!this.current.answer) {
                    const answer = await this.mutate(this.service.ask({ sessionId: session.sessionId, phaseId: phase.id, question: question!, handoff: context.handoff }));
                    if (!this.valid(token)) { return; }
                    this.update({ answer });
                    const saved = await this.service.getSession(session.sessionId);
                    if (!this.valid(token)) { return; }
                    this.applySession(saved);
                }
                if (this.current.answer?.kind === 'answer') { await this.speak(this.current.answer.contentId, 'answer', token); }
            }
        });
    }
    private async sendAction(action: SessionActionRequest['action'], token: number): Promise<void> {
        const session = this.current.session;
        if (!session) { return; }
        if (!this.pendingAction) {
            const actionId = globalThis.crypto.randomUUID();
            this.pendingAction = action === 'pause' || action === 'resume' ? { actionId, action } : { actionId, action, phaseId: this.phase!.id };
        }
        const saved = await this.mutate(this.service.action(session.sessionId, this.pendingAction!));
        if (!this.valid(token)) { return; }
        this.pendingAction = undefined;
        this.applySession(saved);
    }
    private applySession(session: SessionResponse): void {
        const statuses = Object.fromEntries(session.phases.map(phase => [phase.id,
            session.completedIds.includes(phase.id) ? 'heard' : session.skippedIds.includes(phase.id) ? 'skipped'
                : session.alreadyKnowIds.includes(phase.id) ? 'familiar' : 'pending'])) as Record<string, GoldiePhaseStatus>;
        const phaseIndex = session.phases.findIndex(phase => phase.id === session.activePhaseId);
        this.reference = { sessionId: session.sessionId, revision: session.snapshotRevision };
        this.revision = Math.max(this.revision, session.snapshotRevision);
        this.update({ session, statuses, phaseIndex });
        try { this.saveReference(this.reference); } catch {
            this.update({ error: 'Your lesson is open, but this device could not save its reference for reopening.' });
        }
    }
    private saveReference(reference: RecoveryReference): void {
        try {
            if (!this.storage) { throw new Error('Local storage unavailable'); }
            this.storage.setItem(storageKey, JSON.stringify(reference));
        } catch { throw new Error('Goldie could not save the lesson recovery reference. Enable local storage, then retry.'); }
        this.reference = reference;
    }
    private async teach(token: number): Promise<void> {
        const phase = this.phase;
        const session = this.current.session;
        if (!phase || !session) { return; }
        const explanation = await this.service.teach({ sessionId: session.sessionId, phaseId: phase.id, detail: 'standard', ...context });
        if (!this.valid(token)) { return; }
        this.update({ explanation });
        await this.speak(explanation.contentId, 'lesson', token);
    }
    private async speak(contentId: string, track: 'lesson' | 'answer', token: number): Promise<void> {
        const session = this.current.session;
        if (!session) { return; }
        const speech = await this.service.speech({ sessionId: session.sessionId, contentId });
        if (!this.valid(token)) { return; }
        this.audio.load(track, speech);
        if (track === 'lesson') { this.lessonAudioReady = true; } else { this.answerAudioReady = true; }
        await this.audio.play();
    }
    private async close(status: 'completed' | 'dismissed', token: number): Promise<void> {
        const session = this.current.session;
        if (!session) { return; }
        this.pendingClosure ??= status;
        const recap = await this.mutate(this.service.complete({ sessionId: session.sessionId, status: this.pendingClosure,
            currentRevision: this.revision, handoff: context.handoff, learningState: {} }));
        if (!this.valid(token)) { return; }
        const saved = await this.service.getSession(session.sessionId);
        if (!this.valid(token)) { return; }
        this.applySession(saved);
        this.pendingAction = undefined;
        this.pendingClosure = undefined;
        this.resetAudio();
        this.update({ view: 'recap', recap, audioState: 'idle', restored: false });
    }
    private async mutate<T>(promise: Promise<T>): Promise<T> {
        this.mutation = promise;
        try { return await promise; } finally { if (this.mutation === promise) { this.mutation = undefined; } }
    }
    private resetAudio(): void {
        this.audio.clear();
        this.lessonAudioReady = false;
        this.answerAudioReady = false;
        this.endedDuringWork = undefined;
    }
    private async run(work: Work): Promise<void> {
        if (this.disposed || this.current.busy) { return; }
        const token = ++this.generation;
        this.update({ busy: true, error: undefined, retryable: false });
        try {
            await work(token);
            if (this.valid(token)) { this.retryWork = undefined; }
        } catch (error) {
            if (this.valid(token)) {
                const retryable = (error as { code?: number } | undefined)?.code !== GOLDIE_NONRETRYABLE_ERROR_CODE;
                this.retryWork = retryable ? work : undefined;
                this.update({ error: error instanceof Error ? error.message : 'Goldie could not connect. Please try again.', retryable, audioState: 'error' });
            }
        } finally {
            if (this.valid(token)) {
                this.update({ busy: false });
                const ended = this.endedDuringWork;
                this.endedDuringWork = undefined;
                if (ended?.generation === token && this.valid(token) && ended.phaseId === this.phase?.id && this.current.view === 'lesson'
                    && this.current.session?.status === 'learning' && this.current.audioState === 'ended') {
                    this.nextPhase();
                }
            }
        }
    }
    private valid(token: number): boolean { return !this.disposed && token === this.generation; }
    private update(update: Partial<GoldieLessonState>): void {
        if (this.disposed) { return; }
        this.current = Object.freeze({ ...this.current, ...update });
        for (const listener of this.listeners) { listener(this.current); }
    }
}
