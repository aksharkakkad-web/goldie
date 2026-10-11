// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import type { AskResponse, CompleteResponse, OfferResponse, SessionActionRequest, SessionResponse, TeachResponse } from '@goldie/contracts';
import { GoldieRecording } from './goldie-recorder';
import { GoldiePractice } from './goldie-practice';
import { GOLDIE_NONRETRYABLE_ERROR_CODE, GoldieService } from '../../common/goldie-service';
import { createGoldieContext, GoldieContextSnapshot, KnowledgeLevel, parseGoldieContext } from './goldie-context';
import { GoldieAudioAdapter, GoldieAudioPlayer, GoldieAudioState } from './goldie-audio-player';

export type GoldiePhaseStatus = 'pending' | 'heard' | 'skipped' | 'familiar';
export interface GoldieLessonState {
    readonly view: 'idle' | 'offer' | 'lesson' | 'question' | 'recap' | 'practice';
    readonly practicePhaseId?: string;
    readonly practiceAvailable?: boolean;
    readonly busy: boolean;
    readonly context?: GoldieContextSnapshot;
    readonly operation?: string;
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

interface SessionReference { sessionId: string; revision: number; context?: GoldieContextSnapshot; }
interface AcceptanceReference { offerId: string; revision: number; context: GoldieContextSnapshot; }
type RecoveryReference = SessionReference | AcceptanceReference;
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
type Work = (token: number) => Promise<void>;
const storageKey = 'goldie.lesson-recovery.v2';
const legacyStorageKey = 'goldie.reference-session.v1';
const contextKey = 'goldie.context.v2';
const rejectedAcceptanceKey = 'goldie.rejected-acceptance.v2';
function browserStorage(): Storage | undefined {
    try { return globalThis.localStorage; } catch { return undefined; }
}

/** Server progress is authoritative. Only clip positions and pending UI intent live in this controller. */
export class GoldieLessonController {
    practice?: GoldiePractice;
    private readonly practices = new Map<string, GoldiePractice>();
    private current: GoldieLessonState = { view: 'idle', busy: false, phaseIndex: 0, statuses: {}, audioState: 'idle' };
    private readonly listeners = new Set<(state: GoldieLessonState) => void>();
    private generation = 0;
    private disposed = false;
    private lessonAudioReady = false;
    private answerAudioReady = false;
    private reference?: RecoveryReference;
    private revision = 0;
    private recoveryError?: string;
    private pendingAction?: SessionActionRequest;
    private pendingClosure?: 'completed' | 'dismissed';
    private mutation?: Promise<unknown>;
    private retryWork?: Work;
    private endedDuringWork?: { generation: number; phaseId: string };
    private readonly unsubscribeAudio: () => void;
    private readonly quietLevelRef = { current: 0 };

    constructor(private readonly service: GoldieService, private readonly audio: GoldieAudioAdapter = new GoldieAudioPlayer(),
        private readonly storage: Storage | undefined = browserStorage()) {
        try {
            const savedContext = this.storage?.getItem(contextKey);
            if (savedContext) {
                const snapshot = parseGoldieContext(JSON.parse(savedContext));
                this.revision = snapshot.revision;
                this.current = { ...this.current, context: snapshot };
            }
        } catch { this.current = { ...this.current, error: 'Saved context is invalid. Load the handoff again.' }; }
        try {
            const saved = this.storage?.getItem(storageKey);
            const legacy = saved ? undefined : this.storage?.getItem(legacyStorageKey);
            if ((saved && saved !== 'null') || legacy) {
                const value = JSON.parse(saved || legacy!);
                const id = 'sessionId' in value ? value.sessionId : value.offerId;
                if (typeof id !== 'string' || !id.length || id.length > 128 || !Number.isSafeInteger(value.revision) || value.revision < 0) {
                    throw new Error('Invalid recovery reference');
                }
                const snapshot = value.context ? parseGoldieContext(value.context) : undefined;
                if (saved && (value.version !== 2 || !snapshot || snapshot.revision !== value.revision)) { throw new Error('Invalid saved context'); }
                if (!('sessionId' in value) && !snapshot) { throw new Error('Legacy pending acceptance has no recoverable handoff'); }
                this.reference = 'sessionId' in value ? { sessionId: id, revision: value.revision, context: snapshot }
                    : { offerId: id, revision: value.revision, context: snapshot! };
                this.revision = Math.max(this.revision, value.revision);
                this.current = { ...this.current, context: snapshot };
            }
        } catch {
            this.recoveryError = 'Saved lesson recovery is missing valid context. Its saved data has been preserved; recovery cannot safely replay this request.';
            this.current = { ...this.current, error: this.recoveryError, retryable: false };
        }
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
    get audioLevelRef(): { current: number } { return this.audio.audioLevelRef ?? this.quietLevelRef; }
    get canChangeContext(): boolean {
        return !this.disposed && !this.current.busy && !this.pendingAction && !this.pendingClosure && !this.recoveryError
            && (!this.reference || this.current.view === 'recap') && ['idle', 'recap'].includes(this.current.view);
    }
    setContext(handoff: string, level: KnowledgeLevel, name?: string): void {
        if (!this.canChangeContext) { throw new Error('Finish or recover the current lesson before changing context.'); }
        const previous = this.current.context;
        const changed = !previous || previous.handoff !== handoff || previous.profile.level !== level;
        const snapshot = createGoldieContext(handoff, level, changed ? this.revision + 1 : previous.revision, name ?? previous?.name);
        // Persist the snapshot before publishing it so revisions remain stable across restarts.
        try { this.storage?.setItem(contextKey, JSON.stringify(snapshot)); } catch { throw new Error('Goldie could not save this context. Enable local storage and try again.'); }
        if (this.current.view === 'recap') { this.clearTerminal(); }
        this.revision = snapshot.revision;
        this.generation++;
        this.retryWork = undefined;
        this.update({ context: snapshot, error: undefined, retryable: false });
    }
    setKnowledgeLevel(level: KnowledgeLevel): void {
        const snapshot = this.current.context;
        if (snapshot) { this.setContext(snapshot.handoff, level, snapshot.name); }
    }
    private clearTerminal(): void {
        // Save the tombstone before clearing in-memory recovery. Failed storage preserves the recap.
        try { this.storage?.setItem(storageKey, 'null'); } catch {
            throw new Error('Goldie could not save the end of this lesson. Enable local storage, then retry.');
        }
        this.resetAudio();
        this.reference = undefined;
        this.practice = undefined;
        this.practices.clear();
        this.pendingClosure = undefined;
        this.update({ session: undefined, recap: undefined, offer: undefined, view: 'idle', statuses: {}, phaseIndex: 0,
            explanation: undefined, answer: undefined, addOn: undefined, question: undefined, practicePhaseId: undefined, practiceAvailable: false,
            restored: false, audioState: 'idle' });
    }
    private requestContext(): { handoff: string; profile: GoldieContextSnapshot['profile'] | Record<string, unknown> } {
        const snapshot = this.current.context;
        // Only pre-Stage2 confirmed sessions can lack context; preserve their prepared-session recovery.
        return snapshot ? { handoff: snapshot.handoff, profile: snapshot.profile } : { handoff: '', profile: {} };
    }
    subscribe(listener: (state: GoldieLessonState) => void): () => void {
        this.listeners.add(listener);
        listener(this.current);
        return () => this.listeners.delete(listener);
    }
    async restore(): Promise<void> {
        const reference = this.reference;
        if (this.recoveryError) { this.update({ error: this.recoveryError, retryable: false }); return; }
        if (!reference || this.current.session || this.current.busy) { return; }
        await this.run(async token => {
            this.update({ operation: 'restore' });
            const session = 'sessionId' in reference ? await this.service.getSession(reference.sessionId)
                : await this.startAcceptance(reference, token);
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
        if (this.recoveryError) { this.update({ error: this.recoveryError }); return; }
        const snapshot = this.current.context;
        if (!snapshot) { this.update({ error: 'Load a handoff before finding a lesson.', retryable: false }); return; }
        await this.run(async token => {
            if (this.current.view === 'recap') { this.clearTerminal(); }
            this.update({ operation: 'offer' });
            const offer = await this.service.offer({ projectId: snapshot.projectId, revision: snapshot.revision, handoff: snapshot.handoff, profile: snapshot.profile });
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
        const snapshot = this.current.context;
        if (!snapshot) { return; }
        const acceptance: AcceptanceReference = { offerId, revision: snapshot.revision, context: snapshot };
        let accepted = false;
        await this.run(async token => {
            // Save accepted intent before the network call: acceptance may succeed without a response.
            if (!accepted) {
                this.update({ operation: 'accept' });
                this.saveReference(acceptance);
                const started = await this.startAcceptance(acceptance, token);
                if (!this.valid(token)) { return; }
                this.resetAudio();
                this.applySession(started);
                this.update({ view: 'lesson', explanation: undefined, answer: undefined, addOn: undefined, restored: false });
                accepted = true;
            }
            const session = this.current.session!;
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
    /** Pause before requesting the microphone; leave the original clip and timestamp intact. */
    async prepareVoiceQuestion(): Promise<boolean> {
        if (!this.canCommand() || !this.phase || !this.current.session || this.terminal(this.current.session)
            || !['lesson', 'question'].includes(this.current.view)) { return false; }
        this.audio.pause();
        this.update({ view: 'question', question: undefined, answer: undefined, addOn: undefined, audioState: 'paused' });
        await this.run(async token => {
            if (this.current.session?.status !== 'paused') { await this.sendAction('pause', token); }
        });
        return !this.disposed && this.current.view === 'question' && !this.current.error && !this.pendingAction && !this.pendingClosure;
    }
    cancelVoiceQuestion(): void {
        this.generation++;
        this.retryWork = undefined;
        this.audio.pause();
        this.update({ busy: false, operation: undefined, error: undefined, retryable: false, audioState: 'paused' });
    }
    async submitVoiceQuestion(clip: GoldieRecording): Promise<void> {
        const session = this.current.session;
        const phase = this.phase;
        if (!session || this.terminal(session) || !phase || this.current.view !== 'question' || !this.canCommand()) { return; }
        if (!clip.blob.size || clip.blob.size > 2 * 1024 * 1024 || clip.mimeType.split(';')[0] !== 'audio/webm') {
            this.update({ error: 'Record a WebM question under 2 MiB.', retryable: false }); return;
        }
        const requestId = globalThis.crypto.randomUUID();
        const handoff = this.requestContext().handoff;
        let dataBase64: string | undefined;
        let question: string | undefined;
        let answer: AskResponse | undefined;
        let refreshed = false;
        this.answerAudioReady = false;
        await this.run(async token => {
            if (!question) {
                this.update({ operation: 'transcribe' });
                if (!dataBase64) {
                    const bytes = new Uint8Array(await clip.blob.arrayBuffer());
                    if (!this.valid(token)) { return; }
                    let binary = '';
                    for (let index = 0; index < bytes.length; index += 8192) { binary += String.fromCharCode(...bytes.subarray(index, index + 8192)); }
                    dataBase64 = btoa(binary);
                }
                const result = await this.service.transcribe({ sessionId: session.sessionId, phaseId: phase.id, requestId,
                    mimeType: 'audio/webm', dataBase64 });
                if (!this.valid(token)) { return; }
                question = result.text;
                this.update({ question });
            }
            if (!answer) {
                this.update({ operation: 'ask' });
                const result = await this.mutate(this.service.ask({ sessionId: session.sessionId, phaseId: phase.id, requestId, question, handoff }));
                if (!this.valid(token)) { return; }
                answer = result;
                this.update({ answer });
            }
            if (!refreshed) {
                const saved = await this.service.getSession(session.sessionId);
                if (!this.valid(token)) { return; }
                this.applySession(saved);
                refreshed = true;
            }
            // Keep a successful answer when speech fails. Retrying never transcribes or asks again.
            if (answer.kind === 'answer') { await this.speak(answer.contentId, 'answer', token); }
        });
    }
    async openPractice(phaseId = this.current.practicePhaseId): Promise<void> {
        const session = this.current.session;
        if (!session || !phaseId || !session.completedIds.includes(phaseId) || !this.canCommand()) { return; }
        this.audio.pause();
        this.practice = this.practices.get(phaseId);
        this.update({ view: 'practice', practicePhaseId: phaseId, audioState: 'paused' });
        await this.run(async token => {
            this.update({ operation: 'practice' });
            let practice = this.practices.get(phaseId);
            if (!practice) {
                const cached = await this.service.getPractice(session.sessionId, phaseId);
                if (!this.valid(token)) { return; }
                const batch = cached ?? await this.service.generatePractice(session.sessionId, phaseId);
                if (!this.valid(token)) { return; }
                practice = new GoldiePractice(batch.questions);
                this.practices.set(phaseId, practice);
            }
            this.practice = practice;
            this.update({ practiceAvailable: true });
        });
    }
    async continueAfterPractice(): Promise<void> {
        if (this.current.view !== 'practice' || !this.canCommand()) { return; }
        this.practice = undefined;
        if (this.current.session && this.terminal(this.current.session)) {
            this.update({ view: 'recap', practicePhaseId: undefined, practiceAvailable: false }); return;
        }
        await this.run(async token => {
            await this.sendAction('resume', token);
            if (!this.valid(token)) { return; }
            this.update({ view: 'lesson', practicePhaseId: undefined, practiceAvailable: false });
            await this.teach(token);
        });
    }
    async askQuestion(question: string): Promise<void> {
        if (!question.trim() || question.trim().length > 1000) { return; }
        await this.interrupt(question.trim(), false);
    }
    async explainMore(): Promise<void> { await this.interrupt(undefined, true); }
    async resumeLesson(): Promise<void> {
        if (this.current.view !== 'question' || this.disposed || this.current.busy || this.pendingClosure) { return; }
        this.audio.pause();
        await this.run(async token => {
            if (this.pendingAction) { await this.sendAction(this.pendingAction.action, token); }
            if (!this.valid(token)) { return; }
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
        // An ambiguous acceptance may already have committed. Recover paused rather
        // than replaying the initial acceptance's teach-and-play continuation.
        if (!this.current.busy && this.reference && !this.current.session) { await this.restore(); return; }
        if (!this.current.busy && this.retryWork) { await this.run(this.retryWork); }
    }
    async endSession(): Promise<void> {
        if (!this.current.session || this.terminal(this.current.session)) { return; }
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
        const coveredPhaseId = this.phase.id;
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
            if (action === 'phase_completed') {
                if (!this.current.session?.activePhaseId) {
                    await this.close('completed', token);
                } else if (this.current.session.status === 'learning') {
                    await this.sendAction('pause', token);
                }
                if (!this.valid(token)) { return; }
                this.practice = undefined;
                this.update({ view: 'practice', practicePhaseId: coveredPhaseId, practiceAvailable: true });
            } else if (!this.current.session?.activePhaseId) {
                await this.close('completed', token);
            } else if (this.current.session.status === 'learning') {
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
                    this.update({ operation: 'teach' });
                    const addOn = await this.service.teach({ sessionId: session.sessionId, phaseId: phase.id, detail: 'expanded', ...this.requestContext() });
                    if (!this.valid(token)) { return; }
                    this.update({ addOn });
                }
                await this.speak(this.current.addOn!.contentId, 'answer', token);
            } else {
                if (!this.current.answer) {
                    this.update({ operation: 'ask' });
                    const answer = await this.mutate(this.service.ask({ sessionId: session.sessionId, phaseId: phase.id, question: question!,
                        handoff: this.requestContext().handoff }));
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
        this.update({ operation: 'action' });
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
        this.reference = { sessionId: session.sessionId, revision: this.current.context?.revision ?? session.snapshotRevision, context: this.current.context };
        this.update({ session, statuses, phaseIndex });
        try { this.saveReference(this.reference); } catch {
            this.update({ error: 'Your lesson is open, but this device could not save its reference for reopening.' });
        }
    }
    private saveReference(reference: RecoveryReference): void {
        try {
            if (!this.storage) { throw new Error('Local storage unavailable'); }
            this.storage.setItem(reference.context ? storageKey : legacyStorageKey,
                JSON.stringify(reference.context ? { version: 2, ...reference } : reference));
        } catch { throw new Error('Goldie could not save the lesson recovery reference. Enable local storage, then retry.'); }
        this.reference = reference;
    }
    private async startAcceptance(acceptance: AcceptanceReference, token: number): Promise<SessionResponse> {
        try {
            return await this.mutate(this.service.startSession({ offerId: acceptance.offerId, revision: acceptance.revision,
                handoff: acceptance.context.handoff, profile: acceptance.context.profile }));
        } catch (error) {
            const failure = error as { code?: number; data?: { apiCode?: string } } | undefined;
            const apiCode = failure?.data?.apiCode;
            if (this.valid(token) && failure?.code === GOLDIE_NONRETRYABLE_ERROR_CODE
                && apiCode && ['CONTEXT_CONFLICT', 'REVISION_CONFLICT', 'OFFER_NOT_FOUND',
                    'ACTIVE_SESSION', 'REVISION_ALREADY_ACCEPTED', 'NO_LESSON_OFFER'].includes(apiCode)) {
                // These responses definitively reject acceptance. Keep its exact snapshot as an archive,
                // then retire recovery; network/auth/unknown failures can still represent an accepted session.
                try {
                    if (!this.storage) { throw new Error('Local storage unavailable'); }
                    const saved = this.storage.getItem(rejectedAcceptanceKey);
                    const archive = saved ? JSON.parse(saved) : [];
                    if (!Array.isArray(archive)) { throw new Error('Invalid rejection archive'); }
                    const rejected = { version: 2, ...acceptance, apiCode };
                    if (!archive.some(item => JSON.stringify(item) === JSON.stringify(rejected))) {
                        this.storage.setItem(rejectedAcceptanceKey, JSON.stringify([...archive, rejected]));
                    }
                    // Another window may have saved newer recovery during the network request.
                    // Read immediately before this synchronous retirement and never erase a different intent.
                    if (this.storage.getItem(storageKey) === JSON.stringify({ version: 2, ...acceptance })) {
                        this.storage.setItem(storageKey, 'null');
                    }
                } catch {
                    throw new Error('Goldie could not archive this rejected offer. Its recovery data is preserved; enable local storage, then retry.');
                }
                this.reference = undefined;
                this.resetAudio();
                this.update({ view: 'idle', offer: undefined, restored: false, audioState: 'idle' });
            }
            throw error;
        }
    }
    private async teach(token: number): Promise<void> {
        const phase = this.phase;
        const session = this.current.session;
        if (!phase || !session) { return; }
        this.update({ operation: 'teach' });
        const explanation = this.current.explanation ?? await this.service.teach({ sessionId: session.sessionId, phaseId: phase.id, detail: 'standard', ...this.requestContext() });
        if (!this.valid(token)) { return; }
        this.update({ explanation });
        await this.speak(explanation.contentId, 'lesson', token);
    }
    private async speak(contentId: string, track: 'lesson' | 'answer', token: number): Promise<void> {
        const session = this.current.session;
        if (!session) { return; }
        this.update({ operation: 'speech' });
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
        this.update({ operation: 'complete' });
        const recap = await this.mutate(this.service.complete({ sessionId: session.sessionId, status: this.pendingClosure,
            currentRevision: this.revision, handoff: this.requestContext().handoff, learningState: {} }));
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
                this.update({ busy: false, operation: undefined });
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
