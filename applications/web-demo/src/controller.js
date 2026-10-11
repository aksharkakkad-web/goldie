// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { handoff } from './scenario.js';
const id = () => globalThis.crypto.randomUUID();
const closed = session => session && ['completed', 'dismissed'].includes(session.status);
function requestStage(path, body) {
    if (path === '/api/offer') { return 'offer'; }
    if (path === '/api/teach') { return 'teaching'; }
    if (path === '/api/speech') { return 'voice'; }
    if (path === '/api/transcribe') { return 'transcription'; }
    if (path === '/api/ask') { return 'thinking'; }
    if (path === '/api/complete') { return 'recap'; }
    if (path.endsWith('/practice')) { return body === undefined ? 'practice-cache' : 'practice'; }
    if (path.endsWith('/actions')) { return body.action === 'pause' ? 'pausing' : body.action === 'resume' ? 'resuming' : 'saving'; }
    return body === undefined ? 'restoring' : 'starting';
}

export class DemoController {
    constructor(api, media, persistence) {
        this.api = api; this.media = media; this.persistence = persistence;
        this.listeners = new Set(); this.generation = 0;
        this.context = { projectId: `web-demo-${id()}`, revision: 1, handoff, profile: { level: 'beginner', knownConcepts: [] } };
        this.state = { view: 'idle', busy: false, processing: null, error: '', retryable: false, session: null,
            offer: null, explanation: '', playing: false, recording: 'idle', answer: '', question: '',
            batches: {}, drafts: {}, revealed: new Set(), recap: '', gatePhaseId: null };
        this.unsubscribeMedia = media.subscribe?.(event => {
            this.state.playing = media.playing;
            if (event === 'recording-ready' && this.state.recording === 'recording') { this.state.recording = 'ready'; }
            if (event === 'recording-canceled') { this.questionCancel(); return; }
            if (event === 'ended' && media.selected === 'lesson' && this.state.view === 'lesson' && !this.state.busy) {
                void this.mark('phase_completed'); return;
            }
            this.emit();
        });
    }
    get phase() { return this.state.session?.phases.find(p => p.id === this.state.session.activePhaseId); }
    get active() { return this.state.session && !closed(this.state.session); }
    subscribe(fn) { this.listeners.add(fn); fn(this.state); return () => this.listeners.delete(fn); }
    emit() { for (const fn of this.listeners) { fn(this.state); } }
    setProcessing(stage) { if (this.state.busy) { this.state.processing = stage; this.emit(); } }
    async startPlayback() { this.setProcessing('playback'); await this.media.play(); }
    save() { this.persistence?.save({ context: this.context, sessionId: this.state.session?.sessionId, offer: this.state.offer,
        acceptancePending: Boolean(this.acceptancePending),
        practicePhaseIds: [...new Set([...(this.state.cachedPracticePhaseIds ?? []), ...Object.keys(this.state.batches)])] }); }
    async request(path, body) {
        const generation = this.generation;
        this.setProcessing(requestStage(path, body));
        const data = await this.api.request(path, body, this.abort?.signal);
        if (generation !== this.generation) { throw new DOMException('Canceled', 'AbortError'); }
        return data;
    }
    async run(work) {
        if (this.state.busy) { return; }
        const generation = this.generation;
        this.abort = new AbortController(); this.state.busy = true; this.state.processing = 'starting'; this.state.error = ''; this.state.retryable = false; this.retryWork = null; this.emit();
        try { await work(); }
        catch (error) {
            if (generation === this.generation && error.name !== 'AbortError') {
                this.state.error = error.message || 'Goldie could not continue.';
                this.state.retryable = Boolean(error.retryable); this.retryWork = this.state.retryable ? work : null;
            }
        } finally {
            if (generation === this.generation) { this.state.busy = false; this.state.processing = null; this.state.playing = this.media.playing; this.emit(); }
        }
    }
    async retry() { if (this.retryWork) { await this.run(this.retryWork); } }
    setLevel(level) { if (!this.active && ['beginner', 'intermediate'].includes(level)) { this.context.profile.level = level; this.emit(); } }
    async prepare() {
        if (this.active) { return; }
        await this.run(async () => {
            const offer = await this.request('/api/offer', this.context);
            if (!offer || typeof offer.shouldOffer !== 'boolean' || (offer.shouldOffer && !offer.offerId)) { throw new Error('The mentor returned an invalid offer.'); }
            this.state.offer = offer; this.state.view = offer.shouldOffer ? 'offer' : 'no-offer'; this.save();
        });
    }
    decline() { if (this.state.busy || this.active) { return; } this.state.view = 'declined'; this.state.offer = null; this.persistence?.clear(); this.emit(); }
    async accept() {
        if (!this.state.offer?.offerId) { return; }
        await this.run(async () => {
            // Save intent before POST: retry/reload accepts the same offer rather than creating another session.
            this.acceptancePending = true; this.save();
            const { projectId: _projectId, ...context } = this.context;
            this.state.session = await this.request('/api/sessions', { ...context, offerId: this.state.offer.offerId });
            this.acceptancePending = false; this.save(); this.state.view = 'lesson'; await this.loadPhase(true);
        });
    }
    async restore() {
        const saved = this.persistence?.load(); if (!saved?.context || (!saved.sessionId && !saved.acceptancePending)) { return; }
        this.context = saved.context;
        await this.run(async () => {
            if (saved.sessionId) { this.state.session = await this.request(`/api/sessions/${encodeURIComponent(saved.sessionId)}`); }
            else if (saved.offer?.offerId && saved.acceptancePending) {
                const { projectId: _projectId, ...context } = this.context;
                this.state.session = await this.request('/api/sessions', { ...context, offerId: saved.offer.offerId });
            }
            if (!this.state.session) { return; }
            this.state.cachedPracticePhaseIds = (saved.practicePhaseIds ?? []).filter(phaseId => this.state.session.completedIds.includes(phaseId));
            this.acceptancePending = false;
            this.save();
            this.state.view = closed(this.state.session) || !this.phase ? 'recap' : 'lesson';
            this.state.recap = 'Your saved progress is ready. Audio and recording are stopped.';
        });
    }
    async loadPhase(autoplay = false) {
        const generation = this.generation;
        if (!this.phase) { this.state.view = 'recap'; return; }
        this.media.clear(); this.state.explanation = ''; this.state.contentId = null;
        this.state.groundingStatus = null; this.state.answer = ''; this.state.view = 'lesson'; this.emit();
        const phaseId = this.phase.id;
        const lesson = await this.request('/api/teach', { sessionId: this.state.session.sessionId, phaseId,
            handoff: this.context.handoff, profile: this.context.profile, detail: 'standard' });
        if (typeof lesson?.explanation !== 'string' || typeof lesson.contentId !== 'string') { throw new Error('The mentor returned an invalid explanation.'); }
        this.state.explanation = lesson.explanation; this.state.groundingStatus = lesson.groundingStatus; this.state.contentId = lesson.contentId; this.emit();
        const speech = await this.request('/api/speech', { sessionId: this.state.session.sessionId, contentId: lesson.contentId });
        await this.media.load('lesson', speech);
        if (generation !== this.generation) { return; }
        if (autoplay) { await this.startPlayback(); }
    }
    async action(action, phaseId, actionId = id()) {
        this.state.session = await this.request(`/api/sessions/${this.state.session.sessionId}/actions`, { actionId, action, ...(phaseId ? { phaseId } : {}) });
        this.save();
    }
    async playPause() {
        if (this.state.busy || !this.active) { return; }
        const playing = this.media.playing; this.media.pause(); this.state.playing = false;
        const actionId = id();
        await this.run(async () => {
            await this.action(playing ? 'pause' : 'resume', undefined, actionId);
            if (!playing) {
                if (!this.state.contentId) { await this.loadPhase(true); }
                else { if (!this.media.lesson) {
                    const speech = await this.request('/api/speech', { sessionId: this.state.session.sessionId, contentId: this.state.contentId });
                    await this.media.load('lesson', speech);
                } this.media.select('lesson'); await this.startPlayback(); }
            }
        });
    }
    async mark(action) {
        if (!this.phase || this.state.busy || !['phase_completed', 'skip', 'already_know'].includes(action)) { return; }
        const phaseId = this.phase.id; const actionId = id();
        this.media.pause(); this.state.playing = false;
        await this.run(async () => {
            if (action === 'phase_completed' && this.state.session.status !== 'learning') { await this.action('resume'); }
            await this.action(action, phaseId, actionId);
            this.state.gatePhaseId = phaseId;
            if (!this.phase) { await this.complete('completed'); }
            if (action === 'phase_completed') { this.state.view = 'gate'; }
            else if (this.phase) {
                if (this.state.session.status !== 'learning') { await this.action('resume'); }
                await this.loadPhase(true);
            }
            else { this.state.view = 'recap'; }
        });
    }
    async continuePhase() {
        if (this.state.busy) { return; }
        if (!this.phase || closed(this.state.session)) { this.state.view = 'recap'; this.emit(); return; }
        await this.run(() => this.loadPhase(true));
    }
    async complete(status) {
        const result = await this.request('/api/complete', { sessionId: this.state.session.sessionId, status,
            currentRevision: this.context.revision, handoff: this.context.handoff, learningState: {} });
        this.state.session.status = status; this.state.recap = result.recap; this.save();
    }
    async end() {
        if (!this.active || this.state.busy) { return; }
        this.media.pause(); this.media.cancelRecording();
        await this.run(async () => { await this.complete('dismissed'); this.state.recording = 'idle'; this.state.view = 'recap'; });
    }
    async practice(phaseId = this.state.gatePhaseId) {
        if (!this.state.session?.completedIds.includes(phaseId) || this.state.busy) { return; }
        if (this.state.batches[phaseId]) { this.state.practicePhaseId = phaseId; this.state.view = 'practice'; this.emit(); return; }
        await this.run(async () => {
            const path = `/api/sessions/${this.state.session.sessionId}/phases/${encodeURIComponent(phaseId)}/practice`;
            const cached = await this.request(path);
            const batch = cached ?? await this.request(path, {});
            if (batch?.phaseId !== phaseId) { throw new Error('Practice does not match this covered topic.'); }
            this.state.batches[phaseId] = batch; this.save(); this.state.practicePhaseId = phaseId; this.state.view = 'practice';
        });
    }
    setDraft(questionId, text) { this.state.drafts[questionId] = text.slice(0, 2000); }
    reveal(questionId) { this.state.revealed.add(questionId); this.emit(); }
    async review() {
        const missing = (this.state.cachedPracticePhaseIds ?? []).filter(phaseId => !this.state.batches[phaseId]);
        if (missing.length) {
            await this.run(async () => {
                for (const phaseId of missing) {
                    const batch = await this.request(`/api/sessions/${this.state.session.sessionId}/phases/${encodeURIComponent(phaseId)}/practice`);
                    if (batch) { this.state.batches[phaseId] = batch; }
                }
                if (Object.keys(this.state.batches).length) { this.state.view = 'review'; }
            });
        } else if (Object.keys(this.state.batches).length) { this.state.view = 'review'; this.emit(); }
    }
    showRecap() { this.state.view = 'recap'; this.emit(); }
    async questionStart() {
        if (this.state.busy || !this.active || this.state.view !== 'lesson') { return; }
        this.media.pause(); this.state.playing = false; this.state.answer = ''; this.state.question = ''; this.state.view = 'question'; this.state.recording = 'permission';
        await this.run(async () => {
            await this.action('pause'); const generation = this.generation;
            this.setProcessing('microphone');
            await this.media.startRecording();
            if (generation !== this.generation) { this.media.cancelRecording(); return; }
            this.state.recording = 'recording';
        });
    }
    questionStop() { if (this.state.recording === 'recording') { this.media.stopRecording(); this.state.recording = 'ready'; this.emit(); } }
    questionCancel() {
        this.generation++; this.abort?.abort(); this.media.cancelRecording(); this.media.pause();
        this.state.recording = 'idle'; this.state.busy = false; this.state.processing = null; this.state.playing = false; this.state.answer = ''; this.state.error = ''; this.retryWork = null;
        this.state.view = 'lesson'; this.emit();
    }
    async questionSend() {
        if (this.state.busy || !['recording', 'ready'].includes(this.state.recording)) { return; }
        this.media.stopRecording(); this.state.recording = 'processing';
        const requestId = id(); let text; let data;
        await this.run(async () => {
            const generation = this.generation;
            this.setProcessing('recording');
            data ??= await this.media.recordingData();
            if (generation !== this.generation) { throw new DOMException('Canceled', 'AbortError'); }
            text ??= (await this.request('/api/transcribe', { sessionId: this.state.session.sessionId, phaseId: this.phase.id, requestId, mimeType: 'audio/webm', dataBase64: data })).text;
            this.state.question = text; this.media.cancelRecording();
            const answer = await this.request('/api/ask', { sessionId: this.state.session.sessionId, phaseId: this.phase.id,
                question: text, handoff: this.context.handoff, requestId });
            this.state.recording = 'idle';
            if (answer.kind === 'needs_sources') { this.state.answer = 'This demo does not inspect a real workspace. Ask about the architecture or resume the lesson.'; return; }
            if (answer.resumePhaseId !== this.phase.id || typeof answer.answer !== 'string') { throw new Error('The answer does not match this lesson.'); }
            this.state.answer = answer.answer; this.emit();
            const speech = await this.request('/api/speech', { sessionId: this.state.session.sessionId, contentId: answer.contentId });
            await this.media.load('answer', speech);
            if (generation !== this.generation) { return; }
            await this.startPlayback();
        });
        if (this.state.error && this.state.recording === 'processing') { this.state.recording = 'ready'; this.emit(); }
    }
    async questionResume() {
        if (this.state.busy) { return; }
        this.media.cancelRecording(); this.media.pause();
        await this.run(async () => {
            await this.action('resume'); this.state.recording = 'idle'; this.state.view = 'lesson';
            this.media.select('lesson'); await this.startPlayback();
        });
    }
    async reset() {
        if (this.state.busy) { return; }
        if (this.active) { await this.end(); if (this.active) { return; } }
        this.generation++; this.abort?.abort(); this.media.clear(); this.media.cancelRecording(); this.persistence?.clear();
        this.context.projectId = `web-demo-${id()}`;
        Object.assign(this.state, { view: 'idle', session: null, offer: null, explanation: '', contentId: null,
            playing: false, processing: null, recording: 'idle', answer: '', question: '', batches: {}, cachedPracticePhaseIds: [], drafts: {}, revealed: new Set(), recap: '', error: '', gatePhaseId: null });
        this.emit();
    }
    dispose() { this.generation++; this.abort?.abort(); this.media.clear(); this.media.cancelRecording(); this.unsubscribeMedia?.(); this.listeners.clear(); }
}
