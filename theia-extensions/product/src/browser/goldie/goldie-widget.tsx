/********************************************************************************
 * Copyright (C) 2026 Goldie contributors.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { codicon, Message } from '@theia/core/lib/browser/widgets';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { FileDialogService } from '@theia/filesystem/lib/browser/file-dialog/file-dialog-service';
import type { KnowledgeLevel } from './goldie-context';
import { GoldieService } from '../../common/goldie-service';
import { GoldieLessonController, GoldieLessonState, GoldiePhaseStatus } from './goldie-lesson-controller';
import { GradientOrb, GradientOrbLevelRef } from './gradient-orb';
import { GoldieRecorder, GoldieRecorderState } from './goldie-recorder';
import { GoldiePracticeView } from './goldie-practice-view';
import { estimatedSentence } from './goldie-captions';
import { GoldieWorkspaceConnection } from './goldie-workspace-connection';
import '../../../src/browser/goldie/goldie-lesson.css';

type ConnectionState = 'Connecting' | 'Connected' | 'Unavailable';

export const GOLDIE_HANDOFF_DIALOG = Symbol('GoldieHandoffDialog');

@injectable()
export class GoldieWidget extends ReactWidget {
    static readonly ID = 'goldie:panel';
    @inject(GoldieService) protected readonly service: GoldieService;
    @inject(GOLDIE_HANDOFF_DIALOG) protected readonly fileDialogService: FileDialogService;
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;
    @inject(GoldieWorkspaceConnection) protected readonly workspaceConnection: GoldieWorkspaceConnection;
    protected workspaceState: GoldieWorkspaceConnection['state'];
    protected unsubscribeWorkspace: (() => void) | undefined;
    protected connectingWorkspace = false;
    protected connectionState: ConnectionState = 'Connecting';
    protected connectionDetail = '';
    protected requestRevision = 0;
    protected connectionTimer: ReturnType<typeof setTimeout> | undefined;
    protected lessonController: GoldieLessonController;
    protected lessonState: GoldieLessonState;
    protected unsubscribeLesson: (() => void) | undefined;
    protected selectedLevel: KnowledgeLevel = 'beginner';
    protected loadingHandoff = false;
    protected contextError: string | undefined;
    protected detailsOpen = false;
    protected recorder = new GoldieRecorder();
    protected recorderState: GoldieRecorderState = { status: 'idle' };
    protected unsubscribeRecorder: (() => void) | undefined;
    protected captureGeneration = 0;
    protected preparingVoiceQuestion = false;
    private readonly microphoneLevelRef: GradientOrbLevelRef = { current: 0 };
    private readonly cancelCapture = (): void => {
        if (this.voiceQuestionActive) { this.discardVoiceQuestion(); }
    };
    private readonly captureHidden = (): void => { if (document.hidden) { this.cancelCapture(); } };

    @postConstruct()
    protected init(): void {
        this.id = GoldieWidget.ID;
        this.title.label = 'Goldie';
        this.title.caption = 'Goldie — learn as you build';
        this.title.closable = true;
        this.title.iconClass = codicon('lightbulb');
        this.addClass('goldie-widget');
        this.node.tabIndex = -1;

        try {
            const saved = globalThis.localStorage?.getItem('goldie.knowledge-level.v1');
            if (saved === 'beginner' || saved === 'intermediate') { this.selectedLevel = saved; }
        } catch { /* A profile remains usable without local storage. */ }
        this.lessonController = this.workspaceConnection.lesson;
        this.lessonState = this.lessonController.state;
        this.unsubscribeLesson = this.lessonController.subscribe(state => this.receiveLessonState(state));
        this.workspaceState = this.workspaceConnection.state;
        this.unsubscribeWorkspace = this.workspaceConnection.subscribe(state => this.receiveWorkspaceState(state));

        this.unsubscribeRecorder = this.recorder.subscribe(state => {
            this.recorderState = state;
            this.update();
        });
        window.addEventListener('blur', this.cancelCapture);
        window.addEventListener('pagehide', this.cancelCapture);
        document.addEventListener('visibilitychange', this.captureHidden);
        this.update();
        this.checkConnection();
    }

    protected receiveLessonState(state: GoldieLessonState): void {
        const previousView = this.lessonState.view;
        this.lessonState = state;
        if (state.busy) { this.contextError = undefined; }
        if (state.context) { this.selectedLevel = state.context.profile.level; }
        if (state.view !== previousView && ['offer', 'practice'].includes(state.view)) { this.detailsOpen = true; }
        if (['lesson', 'question'].includes(state.view) && (state.view !== previousView || state.audioState === 'playing')) {
            this.detailsOpen = false;
        }
        this.update();
    }

    protected receiveWorkspaceState(state: GoldieWorkspaceConnection['state']): void {
        if (state.workspaceUri !== this.workspaceState?.workspaceUri) { this.cancelCapture(); }
        this.workspaceState = state;
        this.update();
    }

    protected async connectWorkspace(): Promise<void> {
        if (this.connectingWorkspace || this.lessonState.busy || this.loadingHandoff || this.voiceQuestionActive) { return; }
        this.connectingWorkspace = true;
        this.update();
        try {
            await this.workspaceConnection.connect();
        } finally {
            this.connectingWorkspace = false;
            if (!this.isDisposed) { this.update(); }
        }
    }

    protected renderWorkspaceControls(): React.ReactNode {
        const state = this.workspaceState;
        const disabled = this.connectingWorkspace || this.loadingHandoff || this.lessonState.busy || this.voiceQuestionActive;
        return <section className='goldie-workspace-controls' aria-label='Project connection'>
            <div className='goldie-workspace-heading'>
                <span className={codicon('folder-opened')} aria-hidden='true' />
                <strong>{state.workspaceName ?? 'Your project'}</strong>
            </div>
            <p className='goldie-note' role='status'>{state.status}</p>
            {state.revision !== undefined && <p className='goldie-note'>Current handoff · Revision {state.revision}</p>}
            {state.connected
                ? <button className='theia-button secondary' disabled={disabled} onClick={() => this.workspaceConnection.disconnect()}>Disconnect</button>
                : <button className='theia-button' disabled={disabled} onClick={() => this.connectWorkspace()}>
                    {this.connectingWorkspace ? 'Connecting project…' : 'Connect this project'}
                </button>}
            {!state.connected && <p className='goldie-note'>Connect to watch this project's .goldie/HANDOFF.md for new builds.</p>}
            {state.pendingRevision !== undefined && <div className='goldie-workspace-pending' role='status'>
                <strong>A newer build is ready · Revision {state.pendingRevision}</strong>
                <p className='goldie-note'>{this.lessonController.canChangeContext
                    ? 'Choose when to learn about the latest changes.' : 'Your current lesson stays in place. Finish or decline it to learn about the latest build.'}</p>
                {this.lessonController.canChangeContext && <button className='theia-button secondary' disabled={disabled}
                    onClick={() => this.workspaceConnection.learnLatest()}>Learn about latest build</button>}
            </div>}
            {state.error && <p className='goldie-workspace-error' role='alert'>{state.error}</p>}
        </section>;
    }

    protected async checkConnection(): Promise<void> {
        const revision = ++this.requestRevision;
        this.connectionState = 'Connecting';
        this.connectionDetail = 'Checking the local teaching service…';
        this.update();
        try {
            const result = await Promise.race([
                this.service.checkHealth(),
                new Promise<never>((_, reject) => {
                    this.connectionTimer = setTimeout(() => reject(new Error('Connection timeout')), 6000);
                })
            ]);
            if (this.isDisposed || revision !== this.requestRevision) { return; }
            this.connectionState = result.connected ? 'Connected' : 'Unavailable';
            this.connectionDetail = result.message;
        } catch {
            if (this.isDisposed || revision !== this.requestRevision) { return; }
            this.connectionState = 'Unavailable';
            this.connectionDetail = "Can't reach Goldie yet. Your editor still works. Try again.";
        }
        finally {
            clearTimeout(this.connectionTimer);
            this.connectionTimer = undefined;
        }
        this.update();
    }

    dispose(): void {
        this.cancelCapture();
        this.unsubscribeRecorder?.();
        this.recorder.dispose();
        window.removeEventListener('blur', this.cancelCapture);
        window.removeEventListener('pagehide', this.cancelCapture);
        document.removeEventListener('visibilitychange', this.captureHidden);
        clearTimeout(this.connectionTimer);
        this.unsubscribeLesson?.();
        this.unsubscribeLesson = undefined;
        this.unsubscribeWorkspace?.();
        this.unsubscribeWorkspace = undefined;
        super.dispose();
    }

    protected onAfterHide(msg: Message): void {
        this.cancelCapture();
        super.onAfterHide(msg);
    }

    async openDetails(): Promise<void> { this.cancelCapture(); this.detailsOpen = true; this.update(); }

    protected get voiceCaptureActive(): boolean {
        return ['permission', 'recording', 'stopping', 'ready'].includes(this.recorderState.status);
    }

    protected get voiceSubmissionActive(): boolean {
        return this.lessonState.busy && this.lessonState.view === 'question'
            && ['transcribe', 'ask', 'speech'].includes(this.lessonState.operation ?? '');
    }

    protected get voiceQuestionActive(): boolean { return this.preparingVoiceQuestion || this.voiceCaptureActive || this.voiceSubmissionActive; }

    protected discardVoiceQuestion(force = false): void {
        if (!force && !this.voiceQuestionActive) { return; }
        this.captureGeneration++;
        this.preparingVoiceQuestion = false;
        this.recorder.cancel();
        this.lessonController?.cancelVoiceQuestion();
        this.update();
    }

    protected async startVoiceQuestion(): Promise<void> {
        const { session, view, busy } = this.lessonState;
        if (busy || this.voiceCaptureActive || !session || ['completed', 'dismissed'].includes(session.status)
            || !['lesson', 'question'].includes(view)) { return; }
        const token = ++this.captureGeneration;
        this.preparingVoiceQuestion = true;
        this.update();
        try {
            if (!await this.lessonController.prepareVoiceQuestion()) { return; }
            if (this.isDisposed || token !== this.captureGeneration) { return; }
            await this.recorder.start();
        } finally {
            if (token === this.captureGeneration) { this.preparingVoiceQuestion = false; this.update(); }
        }
    }

    protected async sendVoiceQuestion(): Promise<void> {
        if (this.lessonState.busy || !['recording', 'ready'].includes(this.recorderState.status) || this.voiceSubmissionActive) { return; }
        const token = this.captureGeneration;
        const clip = await this.recorder.finish();
        if (!clip || this.isDisposed || token !== this.captureGeneration) { return; }
        await this.lessonController.submitVoiceQuestion(clip);
        if (!this.isDisposed && token === this.captureGeneration) { this.recorder.cancel(); }
    }

    protected renderVoiceQuestionControls(): React.ReactNode {
        const { status, error, inputLevel, elapsedSeconds } = this.recorderState ?? { status: 'idle' };
        const submitting = this.voiceSubmissionActive;
        const active = this.voiceQuestionActive;
        const statusText = this.preparingVoiceQuestion ? 'Pausing your lesson…' : submitting ? this.busyMessage()
            : status === 'permission' ? 'Waiting for microphone permission…'
                : status === 'recording' ? `Listening… ${Math.floor(elapsedSeconds ?? 0)} / 30 seconds.`
                    : status === 'stopping' ? 'Finishing your recording…'
                        : status === 'ready' ? 'Recording ready. Send it when you are ready.' : error;
        return <section className={`goldie-voice-question${active ? ' active' : ''}`} aria-label='Ask Goldie by voice'>
            {!active && <>
                <button className='theia-button goldie-voice-start' disabled={this.lessonState.busy}
                    onClick={() => this.startVoiceQuestion()}>
                    <span className={codicon('mic')} aria-hidden='true' /> Ask Goldie
                </button>
                {error && <p className='goldie-voice-error' role='alert'>{error}</p>}
                <p className='goldie-note'>Your recording is transcribed locally and is never saved.</p>
            </>}
            {active && <>
                <div className='goldie-recording-status' role='status' aria-live='polite'>
                    <span className={status === 'recording' ? 'goldie-recording-dot'
                        : codicon('loading', this.preparingVoiceQuestion || status === 'stopping' || submitting)} aria-hidden='true' />
                    <span>{statusText}</span>
                </div>
                {status === 'recording' && inputLevel !== undefined && <meter className='goldie-mic-level'
                    min={0} max={1} value={inputLevel} aria-label='Microphone input level' />}
                <div className='goldie-form-actions'>
                    {!submitting && (status === 'recording' || status === 'ready') && <button className='theia-button' onClick={() => this.sendVoiceQuestion()}>
                        Send question
                    </button>}
                    <button className='theia-button secondary' onClick={() => this.discardVoiceQuestion(true)}>Cancel</button>
                </div>
            </>}
        </section>;
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.querySelector<HTMLButtonElement>('button:not(.goldie-close):not(:disabled)')?.focus();
    }

    protected async endSession(): Promise<void> {
        this.cancelCapture();
        await this.lessonController.endSession();
    }
    async finishLesson(): Promise<void> { await this.endSession(); }

    async loadSampleHandoff(): Promise<void> {
        if (this.loadingHandoff || this.workspaceState.connected) { return; }
        if (!this.lessonController.canChangeContext) {
            this.contextError = 'Decline the current offer or end the lesson before loading another handoff.';
            this.update();
            return;
        }
        this.loadingHandoff = true;
        this.contextError = undefined;
        this.update();
        try {
            const selected = await this.fileDialogService.showOpenDialog({
                title: 'Load sample handoff', canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
                filters: { Markdown: ['md', 'markdown'] }
            });
            if (!selected || this.isDisposed) { return; }
            const sample = await this.service.loadHandoff(selected.toString());
            if (this.isDisposed) { return; }
            this.lessonController.setContext(sample.handoff, this.selectedLevel, sample.name);
        } catch {
            if (!this.isDisposed) {
                this.contextError = 'Could not load this handoff. Select a readable Markdown file with project context, at most 32,000 characters.';
            }
        } finally {
            this.loadingHandoff = false;
            if (!this.isDisposed) { this.update(); }
        }
    }

    protected changeKnowledgeLevel(value: string): void {
        if (this.loadingHandoff || !this.lessonController.canChangeContext || (value !== 'beginner' && value !== 'intermediate')) { return; }
        try {
            this.lessonController.setKnowledgeLevel(value);
            this.selectedLevel = value;
            this.contextError = undefined;
            try { globalThis.localStorage?.setItem('goldie.knowledge-level.v1', value); } catch { /* Keep the selection for this window. */ }
        } catch {
            this.contextError = 'Decline the current offer or end the lesson before changing your knowledge level.';
        }
        this.update();
    }

    protected renderContextControls(): React.ReactNode {
        const { context } = this.lessonState;
        const disabled = this.loadingHandoff || !this.lessonController.canChangeContext;
        return <section className='goldie-context-controls' aria-label='Lesson context'>
            <label htmlFor='goldie-knowledge-level'>Knowledge level</label>
            <select id='goldie-knowledge-level' value={context?.profile.level ?? this.selectedLevel} disabled={disabled}
                onChange={event => this.changeKnowledgeLevel(event.target.value)}>
                <option value='beginner'>Beginner</option><option value='intermediate'>Intermediate</option>
            </select>
            {!this.workspaceState.connected && <button className='theia-button secondary goldie-primary-action' disabled={disabled} onClick={() => this.loadSampleHandoff()}>
                {this.loadingHandoff ? 'Loading handoff…' : 'Load handoff'}
            </button>}
            <p className='goldie-note'>{context
                ? `${context.name} · Revision ${context.revision} · ${context.profile.level === 'beginner' ? 'Beginner' : 'Intermediate'}`
                : this.workspaceState.connected ? 'Waiting for Codex to write the project handoff.' : 'Choose a Markdown handoff to give Goldie project context.'}</p>
            <p className='goldie-note'>{this.workspaceState.connected
                ? 'Project handoff updates are watched locally. Learning sends the current handoff to the teaching service.'
                : 'The handoff is saved locally for recovery. Prepare lesson sends it to the teaching service.'} No source files are inspected.</p>
        </section>;
    }

    protected busyMessage(): string {
        if (this.loadingHandoff) { return 'Loading handoff…'; }
        const messages: Record<string, string> = {
            restore: 'Restoring your lesson…', offer: 'Checking for a useful lesson…', accept: 'Preparing your learning path…',
            teach: 'Writing the explanation…', speech: 'Preparing audio…', transcribe: 'Transcribing on this device…',
            ask: 'Preparing an answer…', practice: 'Preparing practice…',
            action: 'Saving your lesson progress…', complete: 'Preparing your recap…'
        };
        return messages[this.lessonState.operation ?? ''] ?? 'Goldie is working…';
    }

    protected renderStatus(): React.ReactNode {
        return <div className={`goldie-status goldie-status-${this.connectionState.toLowerCase()}`} role='status' aria-live='polite'>
            <span className='goldie-status-dot' aria-hidden='true' />
            <span>{this.connectionState}</span>
            <button className='goldie-status-action' disabled={this.connectionState === 'Connecting'} onClick={() => this.checkConnection()}>
                {this.connectionState === 'Unavailable' ? 'Retry' : 'Check'}
            </button>
        </div>;
    }

    protected renderError(): React.ReactNode {
        const { error, retryable, busy } = this.lessonState;
        if (!error && !this.contextError) { return undefined; }
        return <div className='goldie-error' role='alert'>
            <strong>Goldie hit a snag.</strong>
            <p>{this.contextError ?? error}</p>
            {!this.contextError && retryable && <button className='theia-button secondary' disabled={busy}
                onClick={() => this.lessonController.retry()}>Retry last request</button>}
        </div>;
    }

    protected renderIdle(): React.ReactNode {
        const { busy, offer, context } = this.lessonState;
        const unavailable = this.connectionState === 'Unavailable';
        return <div className='goldie-view goldie-idle-view'>
            <div className='goldie-hero-mark' aria-hidden='true'>g</div>
            <h2>Learn as you build.</h2>
            <p className='goldie-intro'>Learn the engineering ideas behind the project described in your handoff.</p>
            {unavailable
                ? <div className='goldie-connection-card'>
                    <strong>Can't reach Goldie yet.</strong>
                    <p>{this.connectionDetail}</p>
                    <button className='theia-button goldie-retry' disabled={this.connectionState === 'Connecting'} onClick={() => this.checkConnection()}>Retry connection</button>
                </div>
                : <div className='goldie-ready-card'>
                    <span className={codicon('check')} aria-hidden='true' />
                    <div><strong>{context ? 'Project context is ready.' : this.workspaceState.connected ? 'Waiting for project context.' : 'Load context to get started.'}</strong>
                        <p>Goldie suggests a lesson when there is something useful to explain.</p></div>
                </div>}
            {this.renderContextControls()}
            <button className='theia-button goldie-primary-action' disabled={busy || this.loadingHandoff || unavailable || !context}
                onClick={() => this.workspaceState.connected ? this.workspaceConnection.learnLatest() : this.lessonController.checkOffer()}>
                {busy ? this.busyMessage() : 'Prepare lesson'}
            </button>
            {offer && !offer.shouldOffer && <p className='goldie-empty-result' role='status'>No lesson is suggested for this build yet. Keep coding and check again later.</p>}
            <p className='goldie-note'>Learning is opt-in. Audio starts after you choose Explain.</p>
        </div>;
    }

    protected renderOffer(): React.ReactNode {
        const { offer, busy } = this.lessonState;
        const topics = offer?.previewTopics ?? [];
        return <div className='goldie-view goldie-offer-view'>
            <p className='goldie-eyebrow'>LESSON READY</p>
            <h2>Explore the ideas behind this build?</h2>
            <p className='goldie-intro'>Goldie suggests these topics from your handoff and knowledge level.</p>
            {offer?.estimatedSeconds && <p className='goldie-note'>About {Math.ceil(offer.estimatedSeconds / 60)} min of listening · estimate</p>}
            {topics.length > 0 && <ol className='goldie-topic-list' aria-label='Lesson topics'>
                {topics.map((topic, index) => <li key={`${index}-${topic}`}><span>{index + 1}</span><p>{topic}</p></li>)}
            </ol>}
            <div className='goldie-actions goldie-offer-actions'>
                <button className='theia-button' disabled={busy} onClick={() => this.lessonController.acceptOffer()}>{busy ? this.busyMessage() : 'Explain this build'}</button>
                <button className='theia-button secondary' disabled={busy} onClick={() => this.lessonController.declineOffer()}>Not now</button>
            </div>
            <p className='goldie-note'>Audio begins after Explain. Conceptual teaching; your project files have not been inspected.</p>
        </div>;
    }

    protected phaseStatusLabel(status: GoldiePhaseStatus, isCurrent: boolean): string {
        if (status === 'heard') { return 'Covered'; }
        if (status === 'skipped') { return 'Skipped'; }
        if (status === 'familiar') { return 'Already familiar'; }
        return isCurrent ? 'Current phase' : 'Upcoming';
    }

    protected phaseStatusIcon(status: GoldiePhaseStatus, index: number): string {
        if (status === 'heard') { return '✓'; }
        if (status === 'familiar') { return '≈'; }
        if (status === 'skipped') { return '↷'; }
        return `${index + 1}`;
    }

    protected renderRoadmap(): React.ReactNode {
        const { session, phaseIndex, statuses } = this.lessonState;
        if (!session) { return undefined; }
        return <section className='goldie-roadmap' aria-labelledby='goldie-roadmap-title'>
            <h3 id='goldie-roadmap-title'>Your learning path</h3>
            <ol>{session.phases.map((phase, index) => {
                const status = statuses[phase.id] ?? 'pending';
                const isCurrent = index === phaseIndex;
                return <li className={isCurrent ? 'current' : ''} key={phase.id} aria-current={isCurrent ? 'step' : undefined}>
                    <span className='goldie-roadmap-index' aria-hidden='true'>{this.phaseStatusIcon(status, index)}</span>
                    <div><strong>{phase.title}</strong><small>{this.phaseStatusLabel(status, isCurrent)}</small></div>
                </li>;
            })}</ol>
        </section>;
    }

    protected renderLesson(): React.ReactNode {
        const { session, phaseIndex, explanation, audioState, audioPosition, audioDuration, restored, retryable, busy } = this.lessonState;
        const phase = session?.phases[phaseIndex];
        if (!session || !phase) {
            return <div className='goldie-view'>
                <h2>Your learning path is covered.</h2>
                <p className='goldie-intro'>Your progress is saved. Retry the last request to retrieve the recap.</p>
                <button className='theia-button goldie-primary-action' onClick={() => this.endSession()}>End session</button>
            </div>;
        }
        const audioPlaying = audioState === 'playing';
        const audioTitle = !explanation
            ? busy ? this.busyMessage() : 'Retry explanation'
            : audioPlaying
                ? 'Playing explanation'
                : audioState === 'paused'
                    ? 'Explanation paused'
                    : audioState === 'error'
                        ? retryable === false ? 'Play lesson audio' : 'Retry lesson audio'
                        : 'Listen to this phase';
        const audioHelp = !explanation
            ? 'Prepare this phase and its audio again.'
            : audioState === 'error'
                ? 'Try playing the audio again.'
                : 'Use the button to play or pause.';
        return <div className='goldie-view goldie-lesson-view'>
            <div className='goldie-phase-meta'>
                <span>Phase {phaseIndex + 1} of {session.phases.length}</span>
                <button onClick={() => this.endSession()}>End session</button>
            </div>
            <h2>{phase.title}</h2>
            <p className='goldie-objective'>{phase.objective}</p>
            {restored && <p className='goldie-note' role='status'>Saved lesson restored. Choose Play to continue; audio stays paused until then.</p>}
            <p className='goldie-note'>Conceptual explanation · project implementation has not been inspected.</p>
            <div className='goldie-player'>
                <button className='goldie-play-button' disabled={busy || this.voiceQuestionActive} onClick={() => this.lessonController.playPause()}
                    aria-label={!explanation ? 'Prepare explanation' : audioPlaying ? 'Pause lesson audio' : 'Play lesson audio'}>
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'>
                        <path d={audioPlaying ? 'M6 5h4v14H6z M14 5h4v14h-4z' : 'M7 4v16l13-8z'} />
                    </svg>
                </button>
                <div className='goldie-player-detail'><strong>{audioTitle}</strong>
                    {(audioDuration ?? 0) > 0 && <><progress aria-label='Audio progress' max={audioDuration} value={Math.min(audioPosition ?? 0, audioDuration!)} />
                        <small>{this.formatTime(audioPosition ?? 0)} / {this.formatTime(audioDuration!)}</small></>}
                    <small>{audioHelp}</small></div>
            </div>
            {explanation && audioState === 'error' && <p className='goldie-audio-error' role='status'>Audio could not play. Retry audio to hear this explanation.</p>}
            {explanation && audioState === 'error' && <div className='goldie-answer'><h3>Saved explanation</h3><p>{explanation.explanation}</p></div>}
            <div className='goldie-phase-actions'>
                <button disabled={busy || this.voiceQuestionActive} onClick={() => this.lessonController.skipPhase()}>Skip phase</button>
                <button disabled={busy || this.voiceQuestionActive} onClick={() => this.lessonController.markFamiliar()}>I already know this</button>
            </div>
            <button className='theia-button secondary goldie-next-button' disabled={busy || this.voiceQuestionActive}
                onClick={() => this.lessonController.explainMore()}>Explain more</button>
            <button className='theia-button goldie-next-button' disabled={busy || this.voiceQuestionActive || !explanation}
                onClick={() => this.lessonController.nextPhase()}>
                Mark covered
            </button>
            <p className='goldie-note'>Listening or Mark covered offers Practice or Continue. It does not assess mastery.</p>
            {this.renderRoadmap()}
        </div>;
    }

    protected renderQuestion(): React.ReactNode {
        const { answer, addOn, busy, phaseIndex, audioState, retryable } = this.lessonState;
        const answered = answer?.kind === 'answer';
        return <div className='goldie-view goldie-question-view'>
            <p className='goldie-eyebrow'>{addOn ? 'EXPLAIN MORE' : 'QUESTION'}</p>
            <h2>Your lesson is paused.</h2>
            <p className='goldie-saved-note'><span className={codicon('bookmark')} aria-hidden='true' /> Your place in phase {phaseIndex + 1} is saved.</p>
            {answer?.kind === 'needs_sources' && <p className='goldie-note' role='status'>Goldie needs project sources to answer. Your lesson position is saved.</p>}
            {audioState === 'error' && (answered || addOn) && <div className='goldie-answer'><h3>Saved answer</h3>
                <p>{addOn?.explanation ?? (answer?.kind === 'answer' ? answer.answer : '')}</p></div>}
            {(answered || addOn) && <button className='theia-button secondary goldie-answer-audio' disabled={busy || this.voiceQuestionActive}
                onClick={() => this.lessonController.playPause()}>
                {audioState === 'playing' ? 'Pause answer audio' : audioState === 'error' && retryable !== false ? 'Retry answer audio' : 'Play answer audio'}
            </button>}
            <div className='goldie-question-actions'>
                <button className='theia-button' disabled={busy || this.voiceQuestionActive}
                    onClick={() => this.lessonController.resumeLesson()}>Resume phase {phaseIndex + 1}</button>
                <button className='theia-button secondary' onClick={() => this.endSession()}>End session</button>
            </div>
        </div>;
    }

    protected renderPractice(): React.ReactNode {
        const { session, practicePhaseId, busy } = this.lessonState;
        const phase = session?.phases.find(candidate => candidate.id === practicePhaseId);
        const practice = this.lessonController.practice;
        if (practice) {
            return <div className='goldie-view goldie-practice-shell'>
                <GoldiePracticeView practice={practice} onUpdate={() => this.update()}
                    continueLabel={session && ['completed', 'dismissed'].includes(session.status) ? 'Back to recap' : undefined}
                    onContinue={() => this.lessonController.continueAfterPractice()} />
            </div>;
        }
        return <div className='goldie-view goldie-practice-choice'>
            <p className='goldie-eyebrow'>PHASE COVERED</p>
            <h2>{phase?.title ?? 'Ready for the next phase?'}</h2>
            <p className='goldie-intro'>Try a few written questions to compare your reasoning with a model answer, or keep moving.</p>
            {busy && <p className='goldie-loading' role='status'><span className={codicon('loading', true)} aria-hidden='true' /> {this.busyMessage()}</p>}
            <div className='goldie-practice-actions'>
                <button className='theia-button' disabled={busy} onClick={() => this.lessonController.openPractice(practicePhaseId)}>Practice</button>
                <button className='theia-button secondary' disabled={busy} onClick={() => this.lessonController.continueAfterPractice()}>Continue</button>
            </div>
            <p className='goldie-note'>Practice is optional and stays local. It does not grade you or change lesson progress.</p>
            <button className='goldie-text-action' onClick={() => this.endSession()}>End session</button>
        </div>;
    }

    protected renderRecap(): React.ReactNode {
        const { recap, statuses, session, busy } = this.lessonState;
        const values = Object.values(statuses);
        const heard = values.filter(status => status === 'heard').length;
        const skipped = values.filter(status => status === 'skipped').length;
        const familiar = values.filter(status => status === 'familiar').length;
        return <div className='goldie-view goldie-recap-view'>
            <p className='goldie-eyebrow'>SESSION RECAP</p>
            <h2>Back to building.</h2>
            <p className='goldie-intro'>{recap?.recap ?? 'Your lesson session has ended.'}</p>
            <dl className='goldie-recap-list'>
                <div><dt>Topics in this path</dt><dd>{session?.phases.length ?? values.length}</dd></div>
                <div><dt>Covered this session</dt><dd>{heard}</dd></div>
                <div><dt>Skipped</dt><dd>{skipped}</dd></div>
                <div><dt>Self-reported familiarity</dt><dd>{familiar}</dd></div>
            </dl>
            <p className='goldie-note'>Covered topics include listening or marking text as read. Familiarity is self-reported; this lesson does not assess mastery.</p>
            {!!session?.completedIds.length && <section className='goldie-recap-practice' aria-labelledby='goldie-recap-practice-title'>
                <h3 id='goldie-recap-practice-title'>Practice a covered topic</h3>
                <p className='goldie-note'>Open any completed phase for optional self-comparison.</p>
                <div>{session.completedIds.map(id => {
                    const phase = session.phases.find(candidate => candidate.id === id);
                    return <button className='theia-button secondary' key={id} disabled={busy}
                        onClick={() => this.lessonController.openPractice(id)}>{phase?.title ?? 'Covered phase'}</button>;
                })}</div>
            </section>}
            {this.renderContextControls()}
            <button className='theia-button secondary goldie-primary-action' disabled={busy || this.loadingHandoff || !this.lessonState.context}
                onClick={() => this.lessonController.checkOffer()}>{busy ? this.busyMessage() : 'Find another lesson'}</button>
        </div>;
    }

    protected renderLessonView(): React.ReactNode {
        switch (this.lessonState.view) {
            case 'offer': return this.renderOffer();
            case 'lesson': return this.renderLesson();
            case 'question': return this.renderQuestion();
            case 'practice': return this.renderPractice();
            case 'recap': return this.renderRecap();
            default: return this.renderIdle();
        }
    }

    protected get orbLevelRef(): GradientOrbLevelRef | undefined {
        if (this.recorderState.status === 'recording') {
            this.microphoneLevelRef.current = this.recorderState.inputLevel ?? 0;
            return this.microphoneLevelRef;
        }
        const controller = this.lessonController as (GoldieLessonController & { readonly audioLevelRef?: GradientOrbLevelRef }) | undefined;
        return controller?.audioLevelRef;
    }

    protected async handlePrimaryControl(): Promise<void> {
        const { view, context, busy } = this.lessonState;
        if (busy || this.voiceQuestionActive) { return; }
        if (view === 'offer') { await this.lessonController.acceptOffer(); return; }
        if (view === 'lesson' || view === 'question') { await this.lessonController.playPause(); return; }
        if (view === 'practice' || view === 'recap') { this.detailsOpen = true; this.update(); return; }
        if (!context) { this.detailsOpen = true; this.update(); return; }
        if (this.workspaceState.connected) { await this.workspaceConnection.learnLatest(); } else { await this.lessonController.checkOffer(); }
    }

    protected async handleSkipControl(): Promise<void> {
        const { view, busy } = this.lessonState;
        if (busy || this.voiceQuestionActive) { return; }
        if (view === 'lesson') {
            await this.lessonController.skipPhase();
        } else if (view === 'question') {
            await this.lessonController.resumeLesson();
        } else if (view === 'offer') {
            this.lessonController.declineOffer();
        }
    }

    protected async openVoiceQuestion(): Promise<void> {
        if (!['lesson', 'question'].includes(this.lessonState.view)) { return; }
        await this.startVoiceQuestion();
    }

    protected async closeGoldie(): Promise<void> {
        this.cancelCapture();
        this.close();
        await this.shell.collapsePanel('right');
    }

    protected primaryControlLabel(): string {
        const { view, audioState, context, busy } = this.lessonState;
        if (busy) { return this.busyMessage(); }
        if (view === 'offer') { return 'Start lesson'; }
        if (view === 'lesson' || view === 'question') { return audioState === 'playing' ? 'Pause audio' : 'Play audio'; }
        if (view === 'practice') { return 'Open practice options'; }
        if (view === 'recap') { return 'Open session details'; }
        return context ? 'Prepare a lesson' : 'Set up Goldie';
    }

    protected renderOrbError(): React.ReactNode {
        const { error, retryable, busy } = this.lessonState;
        const connectionError = this.connectionState === 'Unavailable';
        if (!error && !this.contextError && !connectionError && !this.workspaceState.error) { return undefined; }
        return <div className='goldie-orb-error' role='alert'>
            <span className={codicon('warning')} aria-hidden='true' />
            <span>{error ?? this.contextError ?? "Goldie couldn't continue."}</span>
            {(connectionError || retryable) && <button disabled={busy || this.connectionState === 'Connecting'} onClick={() => {
                if (connectionError) { this.checkConnection(); } else { this.lessonController.retry(); }
            }}>Retry</button>}
            <button aria-label='Open error details' title='Open error details' onClick={() => { this.detailsOpen = true; this.update(); }}>
                <span className={codicon('chevron-right')} aria-hidden='true' />
            </button>
        </div>;
    }

    protected renderSessionMarkers(): React.ReactNode {
        const { session, phaseIndex, view } = this.lessonState;
        if (!session || (view !== 'lesson' && view !== 'question')) { return undefined; }
        return <div className='goldie-orb-markers' aria-label={`Phase ${phaseIndex + 1} of ${session.phases.length}`}>
            {session.phases.map((phase, index) => <span key={phase.id} className={index === phaseIndex ? 'active' : index < phaseIndex ? 'complete' : ''} />)}
        </div>;
    }

    protected formatTime(seconds: number): string {
        return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
    }

    protected renderCaption(): React.ReactNode {
        const { view, explanation, answer, addOn, audioState, audioPosition, audioDuration, busy } = this.lessonState;
        if (busy || this.voiceQuestionActive || !['playing', 'paused'].includes(audioState)) { return undefined; }
        const text = view === 'lesson' ? explanation?.explanation
            : view === 'question' ? addOn?.explanation ?? (answer?.kind === 'answer' ? answer.answer : undefined) : undefined;
        const sentence = estimatedSentence(text, audioPosition ?? 0, audioDuration ?? 0);
        return sentence && <p className='goldie-orb-caption' aria-label='Spoken caption, approximate timing'>{sentence}</p>;
    }

    protected async finishAndPractice(): Promise<void> {
        if (this.lessonState.view !== 'lesson' || this.lessonState.busy || this.voiceQuestionActive) { return; }
        await this.lessonController.nextPhase();
        if (this.lessonController.state.view === 'practice') { await this.lessonController.openPractice(); }
    }

    protected render(): React.ReactNode {
        const { busy, view, audioState } = this.lessonState;
        if (view === 'practice') {
            return <section className='goldie-panel goldie-practice-panel' aria-label='Goldie learning panel' aria-busy={busy}>
                <header className='goldie-practice-header'>
                    <span className='goldie-mark' aria-hidden='true' />
                    <h2>Goldie</h2>
                    <button className='goldie-close' aria-label='Close Goldie' title='Close Goldie' onClick={() => this.closeGoldie()}>×</button>
                </header>
                {this.renderStatus()}
                <div className='goldie-panel-body'>{this.renderError()}{this.renderPractice()}</div>
            </section>;
        }
        const playing = audioState === 'playing';
        const sessionOpen = !!this.lessonState.session && !['completed', 'dismissed'].includes(this.lessonState.session.status);
        const canAsk = !busy && !this.voiceQuestionActive && sessionOpen && (view === 'lesson' || view === 'question');
        const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
        return <section className='goldie-panel goldie-orb-shell' aria-label='Goldie learning panel' aria-busy={busy || this.loadingHandoff}>
            <div className='goldie-orb-stage'>
                <div className='goldie-live-status' role='status' aria-live='polite' aria-atomic='true'>
                    {this.recorderState.status === 'recording' ? 'Goldie is listening'
                        : this.voiceSubmissionActive ? this.busyMessage()
                            : busy || this.loadingHandoff ? this.busyMessage() : playing ? 'Goldie is speaking' : 'Goldie is ready'}
                </div>
                <div className={`goldie-orb-visual${playing ? ' speaking' : ''}`}>
                    <span className='goldie-orb-halo' aria-hidden='true' />
                    <GradientOrb config={{ rotationSpeed: 0.4 }} levelRef={this.orbLevelRef} reducedMotion={reducedMotion} />
                    {(busy || this.loadingHandoff) && <span className='goldie-demo-thinking' aria-hidden='true'><i /><i /><i /></span>}
                </div>
                {this.renderCaption()}
                {this.renderOrbError()}
                <div className='goldie-orb-navigation' aria-label='Lesson navigation'>
                    {view === 'question' && <button className='goldie-return-lesson' disabled={busy || this.voiceQuestionActive}
                        onClick={() => this.handleSkipControl()}>Return to lesson</button>}
                    {view === 'lesson' && <>
                        <button disabled={busy || this.voiceQuestionActive} onClick={() => this.lessonController.replayPhase()}>Replay section</button>
                        <button disabled={busy || this.voiceQuestionActive} onClick={() => this.lessonController.skipPhase()}>Skip section</button>
                        <button disabled={busy || this.voiceQuestionActive || !this.lessonState.explanation}
                            title='Mark this section covered and open optional practice' onClick={() => this.finishAndPractice()}>Finish &amp; practice</button>
                    </>}
                </div>
                <div className='goldie-orb-controls' role='group' aria-label='Goldie controls'>
                    <button className='goldie-orb-control' disabled={!canAsk} aria-label='Ask Goldie by voice' title='Ask Goldie' onClick={() => this.openVoiceQuestion()}>
                        <span className={codicon('mic')} aria-hidden='true' />
                        <span className='goldie-orb-control-label' aria-hidden='true'>Ask</span>
                    </button>
                    <button className='goldie-orb-control goldie-orb-primary' disabled={busy || this.loadingHandoff || this.voiceQuestionActive}
                        aria-label={this.primaryControlLabel()} title={this.primaryControlLabel()} onClick={() => this.handlePrimaryControl()}>
                        <svg viewBox='0 0 24 24' aria-hidden='true'>{playing ? <path d='M8 6.5v11M16 6.5v11' /> : <path d='m9 6 8 6-8 6V6Z' />}</svg>
                        <span className='goldie-orb-control-label' aria-hidden='true'>{playing ? 'Pause' : 'Play'}</span>
                    </button>
                </div>
                {(this.voiceQuestionActive || this.recorderState.error) && this.renderVoiceQuestionControls()}
            </div>
            {this.detailsOpen && <aside className='goldie-details-drawer' aria-label='Goldie setup and details'>
                <button className='theia-button secondary' onClick={() => { this.detailsOpen = false; this.update(); }}>Back to voice</button>
                <div className='goldie-panel-body'>{this.renderStatus()}{this.renderWorkspaceControls()}{this.renderError()}{this.renderLessonView()}</div>
            </aside>}
        </section>;
    }
}
