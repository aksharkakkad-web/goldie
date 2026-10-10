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
import { GoldieService } from '../../common/goldie-service';
import { GoldieLessonController, GoldieLessonState, GoldiePhaseStatus } from './goldie-lesson-controller';
import '../../../src/browser/goldie/goldie-lesson.css';

type ConnectionState = 'Connecting' | 'Connected' | 'Unavailable';

@injectable()
export class GoldieWidget extends ReactWidget {
    static readonly ID = 'goldie:panel';
    @inject(GoldieService) protected readonly service: GoldieService;
    protected connectionState: ConnectionState = 'Connecting';
    protected connectionDetail = '';
    protected requestRevision = 0;
    protected connectionTimer: ReturnType<typeof setTimeout> | undefined;
    protected lessonController: GoldieLessonController;
    protected lessonState: GoldieLessonState;
    protected unsubscribeLesson: (() => void) | undefined;
    protected questionComposerOpen = false;
    protected questionDraft = '';

    @postConstruct()
    protected init(): void {
        this.id = GoldieWidget.ID;
        this.title.label = 'Goldie';
        this.title.caption = 'Goldie — learn as you build';
        this.title.closable = true;
        this.title.iconClass = codicon('lightbulb');
        this.addClass('goldie-widget');
        this.node.tabIndex = -1;

        this.lessonController = new GoldieLessonController(this.service);
        this.lessonState = this.lessonController.state;
        this.unsubscribeLesson = this.lessonController.subscribe(state => {
            this.lessonState = state;
            if (state.view !== 'lesson') {
                this.questionComposerOpen = false;
            }
            this.update();
        });

        this.update();
        this.checkConnection();
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
        clearTimeout(this.connectionTimer);
        this.unsubscribeLesson?.();
        this.unsubscribeLesson = undefined;
        this.lessonController?.dispose();
        super.dispose();
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.querySelector<HTMLButtonElement>('button:not(.goldie-close):not(:disabled)')?.focus();
    }

    protected openQuestionComposer(): void {
        this.questionComposerOpen = true;
        this.update();
        requestAnimationFrame(() => this.node.querySelector<HTMLTextAreaElement>('#goldie-question')?.focus());
    }

    protected async submitQuestion(event: React.SubmitEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        const question = this.questionDraft.trim();
        if (!question || this.lessonState.busy) { return; }
        await this.lessonController.askQuestion(question);
        if (!this.lessonState.error) {
            this.questionDraft = '';
            this.questionComposerOpen = false;
            this.update();
        }
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
        const { error, view, busy } = this.lessonState;
        if (!error) { return undefined; }
        const retry = view === 'idle'
            ? () => this.lessonController.checkOffer()
            : view === 'offer' ? () => this.lessonController.acceptOffer() : undefined;
        return <div className='goldie-error' role='alert'>
            <strong>Goldie hit a snag.</strong>
            <p>{error}</p>
            {retry && <button className='theia-button secondary' disabled={busy} onClick={retry}>Try again</button>}
        </div>;
    }

    protected renderIdle(): React.ReactNode {
        const { busy, offer } = this.lessonState;
        const unavailable = this.connectionState === 'Unavailable';
        return <div className='goldie-view goldie-idle-view'>
            <div className='goldie-hero-mark' aria-hidden='true'>g</div>
            <h2>Learn as you build.</h2>
            <p className='goldie-intro'>Explore a prepared authentication example and hear the engineering ideas behind it while you keep coding.</p>
            {unavailable
                ? <div className='goldie-connection-card'>
                    <strong>Can't reach Goldie yet.</strong>
                    <p>{this.connectionDetail}</p>
                    <button className='theia-button goldie-retry' disabled={this.connectionState === 'Connecting'} onClick={() => this.checkConnection()}>Retry connection</button>
                </div>
                : <div className='goldie-ready-card'>
                    <span className={codicon('check')} aria-hidden='true' />
                    <div><strong>Ready to explore authentication.</strong><p>Prepare a short lesson from Goldie's example team app.</p></div>
                </div>}
            <button className='theia-button goldie-primary-action' disabled={busy || unavailable} onClick={() => this.lessonController.checkOffer()}>
                {busy ? 'Preparing a lesson…' : 'Prepare lesson'}
            </button>
            {offer && !offer.shouldOffer && <p className='goldie-empty-result' role='status'>No lesson is suggested for this build yet. Keep coding and check again later.</p>}
            <p className='goldie-note'>Learning is opt-in. Nothing plays automatically.</p>
        </div>;
    }

    protected renderOffer(): React.ReactNode {
        const { offer, busy } = this.lessonState;
        const topics = offer?.previewTopics ?? [];
        return <div className='goldie-view goldie-offer-view'>
            <p className='goldie-eyebrow'>LESSON READY</p>
            <h2>Learn how authentication protects an app?</h2>
            <p className='goldie-intro'>This prepared example follows authentication work in a small team app.</p>
            {topics.length > 0 && <ol className='goldie-topic-list' aria-label='Lesson topics'>
                {topics.map((topic, index) => <li key={`${index}-${topic}`}><span>{index + 1}</span><p>{topic}</p></li>)}
            </ol>}
            <div className='goldie-actions goldie-offer-actions'>
                <button className='theia-button' disabled={busy} onClick={() => this.lessonController.acceptOffer()}>{busy ? 'Preparing lesson…' : 'Explain this build'}</button>
                <button className='theia-button secondary' disabled={busy} onClick={() => this.lessonController.declineOffer()}>Not now</button>
            </div>
            <p className='goldie-note'>Audio begins only after you choose to start.</p>
        </div>;
    }

    protected phaseStatusLabel(status: GoldiePhaseStatus, isCurrent: boolean): string {
        if (status === 'heard') { return 'Heard'; }
        if (status === 'skipped') { return 'Skipped'; }
        if (status === 'familiar') { return 'Already familiar'; }
        return isCurrent ? 'Current phase' : 'Upcoming';
    }

    protected phaseStatusIcon(status: GoldiePhaseStatus, index: number): string {
        if (status === 'heard' || status === 'familiar') { return '✓'; }
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

    protected renderQuestionComposer(): React.ReactNode {
        const { busy } = this.lessonState;
        if (!this.questionComposerOpen) {
            return <button className='theia-button secondary goldie-ask-open' disabled={busy} onClick={() => this.openQuestionComposer()}>Ask a question</button>;
        }
        return <form className='goldie-question-form' onSubmit={event => this.submitQuestion(event)}>
            <label htmlFor='goldie-question'>What would you like to understand?</label>
            <textarea id='goldie-question' rows={3} value={this.questionDraft} disabled={busy} placeholder='Ask about this phase…'
                onChange={event => { this.questionDraft = event.currentTarget.value; this.update(); }}
                onKeyDown={event => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                    }
                }} />
            <div className='goldie-form-actions'>
                <button type='submit' className='theia-button' disabled={busy || !this.questionDraft.trim()}>{busy ? 'Asking…' : 'Ask Goldie'}</button>
                <button type='button' className='theia-button secondary' disabled={busy} onClick={() => { this.questionComposerOpen = false; this.update(); }}>Cancel</button>
            </div>
            <small>Press Ctrl or ⌘ + Enter to ask.</small>
        </form>;
    }

    protected renderLesson(): React.ReactNode {
        const { session, phaseIndex, explanation, audioState, busy } = this.lessonState;
        const phase = session?.phases[phaseIndex];
        if (!session || !phase) {
            return <div className='goldie-view'>
                <h2>No lesson phases were prepared.</h2>
                <p className='goldie-intro'>Goldie returned an empty learning path. End this session and try finding a lesson again.</p>
                <button className='theia-button goldie-primary-action' onClick={() => this.lessonController.endSession()}>End session</button>
            </div>;
        }
        const audioPlaying = audioState === 'playing';
        const audioTitle = !explanation
            ? busy ? 'Preparing explanation' : 'Retry explanation'
            : audioPlaying
                ? 'Playing explanation'
                : audioState === 'paused'
                    ? 'Explanation paused'
                    : audioState === 'error'
                        ? 'Retry lesson audio'
                        : 'Listen to this phase';
        const audioHelp = !explanation
            ? 'Prepare this phase and its audio again.'
            : audioState === 'error'
                ? 'The text stays available if audio fails again.'
                : 'Use the button to play or pause.';
        return <div className='goldie-view goldie-lesson-view'>
            <div className='goldie-phase-meta'>
                <span>Phase {phaseIndex + 1} of {session.phases.length}</span>
                <button onClick={() => this.lessonController.endSession()}>End session</button>
            </div>
            <h2>{phase.title}</h2>
            <p className='goldie-objective'>{phase.objective}</p>
            <div className='goldie-explanation' aria-live='polite'>
                {busy && !explanation
                    ? <p className='goldie-loading'><span className={codicon('loading', true)} aria-hidden='true' /> Preparing this explanation…</p>
                    : <p>{explanation?.explanation ?? phase.description}</p>}
            </div>
            <div className='goldie-player'>
                <button className='goldie-play-button' disabled={busy} onClick={() => this.lessonController.playPause()}
                    aria-label={!explanation ? 'Prepare explanation' : audioPlaying ? 'Pause lesson audio' : 'Play lesson audio'}>
                    <span className={codicon(!explanation ? 'refresh' : audioPlaying ? 'debug-pause' : 'play')} aria-hidden='true' />
                </button>
                <div><strong>{audioTitle}</strong>
                    <small>{audioHelp}</small></div>
            </div>
            {explanation && audioState === 'error' && <p className='goldie-audio-error' role='status'>Audio could not play. The full explanation is still available above.</p>}
            <div className='goldie-phase-actions'>
                <button disabled={busy} onClick={() => this.lessonController.skipPhase()}>Skip phase</button>
                <button disabled={busy} onClick={() => this.lessonController.markFamiliar()}>I already know this</button>
            </div>
            {this.renderQuestionComposer()}
            <button className='theia-button goldie-next-button' disabled={busy || !explanation} onClick={() => this.lessonController.nextPhase()}>
                {phaseIndex === session.phases.length - 1 ? 'Finish lesson' : 'Next phase'}
            </button>
            {this.renderRoadmap()}
        </div>;
    }

    protected renderQuestion(): React.ReactNode {
        const { question, answer, busy, phaseIndex, audioState } = this.lessonState;
        const answered = answer?.kind === 'answer';
        return <div className='goldie-view goldie-question-view'>
            <p className='goldie-eyebrow'>QUESTION</p>
            <h2>Your lesson is paused.</h2>
            <p className='goldie-saved-note'><span className={codicon('bookmark')} aria-hidden='true' /> Your place in phase {phaseIndex + 1} is saved.</p>
            {question && <blockquote>{question}</blockquote>}
            <div className='goldie-answer' aria-live='polite'>
                {busy && !answer ? <p className='goldie-loading'><span className={codicon('loading', true)} aria-hidden='true' /> Preparing an answer…</p>
                    : answered ? <><h3>Goldie's answer</h3><p>{answer.answer}</p></>
                        : answer?.kind === 'needs_sources'
                            ? <><h3>More context needed</h3><p>Goldie needs project sources before it can answer this question. Your lesson position is still saved.</p></>
                            : <><h3>No answer received</h3><p>You can try this question again or return to the lesson.</p></>}
            </div>
            {answered && <button className='theia-button secondary goldie-answer-audio' disabled={busy}
                onClick={() => this.lessonController.playPause()}>
                {audioState === 'playing' ? 'Pause answer audio' : audioState === 'error' ? 'Retry answer audio' : 'Play answer audio'}
            </button>}
            {!busy && !answer && question && <button className='theia-button secondary goldie-answer-audio'
                onClick={() => this.lessonController.askQuestion(question)}>Try question again</button>}
            <div className='goldie-question-actions'>
                <button className='theia-button' disabled={busy} onClick={() => this.lessonController.resumeLesson()}>Resume phase {phaseIndex + 1}</button>
                <button className='theia-button secondary' onClick={() => this.lessonController.endSession()}>End session</button>
            </div>
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
                <div><dt>Heard this session</dt><dd>{heard}</dd></div>
                <div><dt>Skipped</dt><dd>{skipped}</dd></div>
                <div><dt>Already familiar</dt><dd>{familiar}</dd></div>
            </dl>
            <p className='goldie-note'>Skipped or unplayed phases are not marked as learned.</p>
            <button className='theia-button secondary goldie-primary-action' disabled={busy} onClick={() => this.lessonController.checkOffer()}>Find another lesson</button>
        </div>;
    }

    protected renderLessonView(): React.ReactNode {
        switch (this.lessonState.view) {
            case 'offer': return this.renderOffer();
            case 'lesson': return this.renderLesson();
            case 'question': return this.renderQuestion();
            case 'recap': return this.renderRecap();
            default: return this.renderIdle();
        }
    }

    protected render(): React.ReactNode {
        const { busy } = this.lessonState;
        return <section className='goldie-panel' aria-label='Goldie learning panel' aria-busy={busy}>
            <header className='goldie-panel-header'>
                <span className='goldie-mark' aria-hidden='true'>g</span><strong>Goldie</strong>
                <button className='goldie-close' aria-label='Close Goldie panel' title='Close Goldie panel' onClick={() => this.close()}>×</button>
            </header>
            <div className='goldie-panel-body'>
                {this.renderStatus()}
                <div className='goldie-live-status' role='status' aria-live='polite' aria-atomic='true'>{busy ? 'Goldie is working.' : ''}</div>
                {this.renderError()}
                {this.renderLessonView()}
            </div>
            <footer className='goldie-panel-footer'>Prepared authentication lesson · service connection required</footer>
        </section>;
    }
}
