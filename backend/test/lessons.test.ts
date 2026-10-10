/********************************************************************************
 * Copyright (C) 2026 Akshar Kakkad and others.
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { expect } from 'chai';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LessonService } from '../src/lessons';

describe('prepared lesson service', () => {
    let directory: string;
    beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'goldie-lessons-')); });
    afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

    it('creates a frozen three-phase session only from an explicit accepted offer', async () => {
        const service = await LessonService.open(directory);
        const noOffer = await service.offer({ projectId: 'project-a', revision: 1, handoff: '', profile: {} });
        expect(noOffer.shouldOffer).to.equal(false);
        const offer = await service.offer({ projectId: 'project-a', revision: 1, handoff: '', profile: {}, referenceLessonId: 'webapp-architecture' });
        expect(offer.shouldOffer).to.equal(true);
        const session = await service.createSession({ offerId: offer.offerId!, revision: 1, handoff: '', profile: {} });
        expect(session.phases.map(phase => phase.id)).to.deep.equal(['frontend', 'backend', 'database']);
        expect(session.snapshotRevision).to.equal(1);
        const retry = await service.createSession({ offerId: offer.offerId!, revision: 9, handoff: '', profile: {} });
        expect(retry.sessionId).to.equal(session.sessionId);
        expect(retry.snapshotRevision).to.equal(1);
    });

    it('does not complete taught phases and permits speech only for published session text', async () => {
        const service = await LessonService.open(directory);
        const offer = await service.offer({ projectId: 'project-a', revision: 1, handoff: '', profile: {}, referenceLessonId: 'webapp-architecture' });
        const session = await service.createSession({ offerId: offer.offerId!, revision: 1, handoff: '', profile: {} });
        await expectError(service.publishedText(session.sessionId, 'unserved'), 'CONTENT_NOT_FOUND');
        const taught = await service.teach({ sessionId: session.sessionId, phaseId: 'frontend', handoff: '', profile: {}, detail: 'standard' });
        expect(taught.groundingStatus).to.equal('conceptual');
        expect(taught.explanation.split(/\s+/).length).to.be.within(100, 150);
        expect(await service.publishedText(session.sessionId, taught.contentId)).to.equal(taught.explanation);
        expect((await service.getSession(session.sessionId)).completedIds).to.deep.equal([]);
        await expectError(service.teach({ sessionId: session.sessionId, phaseId: 'database', handoff: '', profile: {}, detail: 'standard' }), 'PHASE_CONFLICT');
    });

    it('preserves the question phase and normalizes explicit aliases with an honest unknown fallback', async () => {
        const service = await LessonService.open(directory);
        const offer = await service.offer({ projectId: 'project-a', revision: 2, handoff: '', profile: {}, referenceLessonId: 'webapp-architecture' });
        const session = await service.createSession({ offerId: offer.offerId!, revision: 2, handoff: '', profile: {} });
        const response = await service.ask({ sessionId: session.sessionId, phaseId: 'frontend', question: '  WHAT IS AN API??? ', handoff: '' });
        expect(response.kind).to.equal('answer');
        if (response.kind !== 'answer') { throw new Error('Expected prepared answer'); }
        expect(response.answer).to.contain('contract');
        expect(response.resumePhaseId).to.equal('frontend');
        const state = await service.getSession(session.sessionId);
        expect(state.status).to.equal('asking');
        expect(state.activePhaseId).to.equal('frontend');
        const unknown = await service.ask({ sessionId: session.sessionId, phaseId: 'frontend', question: 'Which actual file contains my billing code?', handoff: '' });
        if (unknown.kind !== 'answer') { throw new Error('Expected safe answer'); }
        expect(unknown.answer).to.contain('prepared');
        expect(unknown.supportedQuestions).to.include('What is an API?');
        expect((await service.getSession(session.sessionId)).questionHistory).to.have.length(2);
    });

    it('records terminal actions separately, deduplicates retries, and rejects conflicting action IDs', async () => {
        const service = await LessonService.open(directory);
        const offer = await service.offer({ projectId: 'project-a', revision: 1, handoff: '', profile: {}, referenceLessonId: 'webapp-architecture' });
        const session = await service.createSession({ offerId: offer.offerId!, revision: 1, handoff: '', profile: {} });
        const skip = { actionId: 'skip-1', action: 'skip' as const, phaseId: 'frontend' };
        const skipped = await service.action(session.sessionId, skip);
        expect(skipped.activePhaseId).to.equal('backend');
        expect(skipped.skippedIds).to.deep.equal(['frontend']);
        await service.action(session.sessionId, skip);
        expect((await service.getSession(session.sessionId)).activePhaseId).to.equal('backend');
        await expectError(service.action(session.sessionId, { ...skip, action: 'already_know' }), 'ACTION_CONFLICT');
        await service.action(session.sessionId, { actionId: 'familiar-1', action: 'already_know', phaseId: 'backend' });
        const finished = await service.action(session.sessionId, { actionId: 'done-1', action: 'phase_completed', phaseId: 'database' });
        expect(finished.completedIds).to.deep.equal(['database']);
        expect(finished.alreadyKnowIds).to.deep.equal(['backend']);
        expect(finished.activePhaseId).to.equal(undefined);
        const recap = await service.complete({
            sessionId: session.sessionId, status: 'completed', currentRevision: 99, handoff: '', learningState: { completedIds: ['frontend'] }
        });
        expect(recap.recap).to.contain('Skipped: Frontend');
        expect(recap.recap).to.contain('Self-reported familiarity');
        expect(recap.lastEvaluatedRevision).to.equal(1);
        expect(recap.catchupOffer).to.equal(undefined);
        await expectError(service.action(session.sessionId, { actionId: 'late', action: 'resume' }), 'SESSION_CLOSED');
        await service.action(session.sessionId, skip);
        expect(await service.complete({ sessionId: session.sessionId, status: 'completed', currentRevision: 100, handoff: '', learningState: {} })).to.deep.equal(recap);
    });

    it('persists progress across restart without retaining raw context and serializes concurrent actions', async () => {
        const service = await LessonService.open(directory);
        const offer = await service.offer({
            projectId: 'project-a', revision: 3, handoff: 'TOP-SECRET-CONTEXT', profile: { key: 'PRIVATE-PROFILE' }, referenceLessonId: 'webapp-architecture'
        });
        const session = await service.createSession({ offerId: offer.offerId!, revision: 3, handoff: 'SECRET-HANDOFF', profile: {} });
        const results = await Promise.allSettled([
            service.action(session.sessionId, { actionId: 'skip-a', action: 'skip', phaseId: 'frontend' }),
            service.action(session.sessionId, { actionId: 'skip-b', action: 'skip', phaseId: 'frontend' })
        ]);
        expect(results.filter(result => result.status === 'fulfilled')).to.have.length(1);
        const restored = await LessonService.open(directory);
        expect((await restored.getSession(session.sessionId)).skippedIds).to.deep.equal(['frontend']);
        const persisted = await readFile(join(directory, 'sessions.json'), 'utf8');
        expect(persisted).not.to.contain('SECRET');
        expect(persisted).not.to.contain('PRIVATE-PROFILE');
    });

    it('rejects competing active sessions, unknown identifiers, premature completion and corrupt state', async () => {
        const service = await LessonService.open(directory);
        const offer = await service.offer({ projectId: 'project-a', revision: 3, handoff: '', profile: {}, referenceLessonId: 'webapp-architecture' });
        const session = await service.createSession({ offerId: offer.offerId!, revision: 3, handoff: '', profile: {} });
        const nextOffer = await service.offer({ projectId: 'project-a', revision: 4, handoff: '', profile: {}, referenceLessonId: 'webapp-architecture' });
        expect(nextOffer.shouldOffer).to.equal(false);
        await expectError(service.getSession('missing'), 'SESSION_NOT_FOUND');
        await expectError(service.complete({ sessionId: session.sessionId, status: 'completed', currentRevision: 3, handoff: '', learningState: {} }), 'INCOMPLETE_SESSION');
        await service.complete({ sessionId: session.sessionId, status: 'dismissed', currentRevision: 4, handoff: '', learningState: {} });
        expect((await service.getSession(session.sessionId)).status).to.equal('dismissed');
        await writeFile(join(directory, 'sessions.json'), '{broken', 'utf8');
        await expectError(LessonService.open(directory), 'STORE_CORRUPT');
    });

    it('rejects stale outstanding offers and preserves pause or asking state when skipping', async () => {
        const service = await LessonService.open(directory);
        const first = await service.offer({ projectId: 'project-a', revision: 1, handoff: '', profile: {}, referenceLessonId: 'webapp-architecture' });
        const second = await service.offer({ projectId: 'project-a', revision: 2, handoff: '', profile: {}, referenceLessonId: 'webapp-architecture' });
        const session = await service.createSession({ offerId: first.offerId!, revision: 1, handoff: '', profile: {} });
        await expectError(service.createSession({ offerId: second.offerId!, revision: 2, handoff: '', profile: {} }), 'ACTIVE_SESSION');
        await service.action(session.sessionId, { actionId: 'pause', action: 'pause' });
        const skipped = await service.action(session.sessionId, { actionId: 'skip', action: 'skip', phaseId: 'frontend' });
        expect(skipped.status).to.equal('paused');
        expect(skipped.activePhaseId).to.equal('backend');
        await service.action(session.sessionId, { actionId: 'resume', action: 'resume' });
        await service.ask({ sessionId: session.sessionId, phaseId: 'backend', question: 'explain more', handoff: '' });
        const familiar = await service.action(session.sessionId, { actionId: 'familiar', action: 'already_know', phaseId: 'backend' });
        expect(familiar.status).to.equal('asking');
        expect(familiar.activePhaseId).to.equal('database');
    });

    it('does not commit progress in memory when its atomic replacement fails', async () => {
        const service = await LessonService.open(directory);
        const offer = await service.offer({ projectId: 'project-a', revision: 1, handoff: '', profile: {}, referenceLessonId: 'webapp-architecture' });
        const session = await service.createSession({ offerId: offer.offerId!, revision: 1, handoff: '', profile: {} });
        await rename(join(directory, 'sessions.json'), join(directory, 'saved.json'));
        await mkdir(join(directory, 'sessions.json'));
        await expectError(service.action(session.sessionId, { actionId: 'failed-write', action: 'skip', phaseId: 'frontend' }), 'STORE_UNAVAILABLE');
        expect((await service.getSession(session.sessionId)).skippedIds).to.deep.equal([]);
        await rm(join(directory, 'sessions.json'), { recursive: true });
        await rename(join(directory, 'saved.json'), join(directory, 'sessions.json'));
        const retried = await service.action(session.sessionId, { actionId: 'failed-write', action: 'skip', phaseId: 'frontend' });
        expect(retried.skippedIds).to.deep.equal(['frontend']);
    });

    it('does not accept an audio-ended completion while paused or answering a question', async () => {
        const service = await LessonService.open(directory);
        const offer = await service.offer({ projectId: 'project-a', revision: 1, handoff: '', profile: {}, referenceLessonId: 'webapp-architecture' });
        const session = await service.createSession({ offerId: offer.offerId!, revision: 1, handoff: '', profile: {} });
        await service.action(session.sessionId, { actionId: 'pause', action: 'pause' });
        await expectError(service.action(session.sessionId, { actionId: 'late-ended', action: 'phase_completed', phaseId: 'frontend' }), 'STATE_CONFLICT');
        await service.ask({ sessionId: session.sessionId, phaseId: 'frontend', question: 'what is an api', handoff: '' });
        await expectError(service.action(session.sessionId, { actionId: 'answer-ended', action: 'phase_completed', phaseId: 'frontend' }), 'STATE_CONFLICT');
        await service.action(session.sessionId, { actionId: 'resume', action: 'resume' });
        expect((await service.action(session.sessionId, { actionId: 'lesson-ended', action: 'phase_completed', phaseId: 'frontend' })).completedIds).to.deep.equal(['frontend']);
    });
});

async function expectError(promise: Promise<unknown>, code: string): Promise<void> {
    let error: unknown;
    try { await promise; } catch (caught) { error = caught; }
    expect(error, `expected ${code}`).to.have.property('code', code);
}
