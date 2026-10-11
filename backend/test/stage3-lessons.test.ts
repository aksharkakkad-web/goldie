// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
/* eslint-disable no-null/no-null -- null is the required practice cache-miss wire contract. */
import { expect } from 'chai';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AskRequest, PracticeBatch } from '@goldie/contracts';
import { LessonService } from '../src/lessons';
import { ConversationInput } from '../src/providers/teaching';

const plan = { shouldOffer: true, reason: 'Teach the boundary', estimatedSeconds: 120,
    phases: ['api', 'data'].map(id => ({ id, title: id, objective: `Understand ${id}`, description: `Explore ${id}`,
        whyNow: 'Relevant architecture', sourceStatus: 'planned' as const, depth: 'foundation' as const, prerequisiteIds: [] })) };
const questions = [1, 2, 3].map(n => ({ id: `q${n}`, question: `What happens in case ${n}?`, modelAnswer: `Reason about case ${n}.` }));
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    return { promise: new Promise<T>(done => resolve = done), resolve: (value: T) => resolve(value) };
}
async function waitForInput(inputs: unknown[]): Promise<void> {
    const end = Date.now() + 500;
    while (!inputs.length && Date.now() < end) { await new Promise(resolve => setTimeout(resolve, 5)); }
    expect(inputs.length, 'the real service must invoke contextual generation').to.be.greaterThan(0);
}
async function errorCode(promise: Promise<unknown>, code: string): Promise<void> {
    let error: unknown;
    try { await promise; } catch (caught) { error = caught; }
    expect(error).to.have.property('code', code);
}
// Interface is deliberately consumer-shaped so RED runs against the current service.
type PracticeService = LessonService & { practice(s: string, p: string, generate: boolean): Promise<PracticeBatch | null> };

describe('Stage 3 durable conversation and optional practice', () => {
    let directory: string;
    let service: PracticeService;
    let sessionId: string;
    let inputs: ConversationInput[];
    let practiceCalls: number;
    let answerWork: () => Promise<{ answer: string }>;
    let practiceWork: () => Promise<{ questions: typeof questions }>;
    const provider = {
        identity: 'controlled:stage2-unchanged', plan: async () => plan,
        teach: async () => ({ explanation: 'An API is a trust boundary. This is conceptual, not inspected code.', groundingStatus: 'conceptual' as const }),
        ask: async (input: ConversationInput) => { inputs.push(structuredClone(input)); return answerWork(); },
        practice: async () => { practiceCalls++; return practiceWork(); }
    };
    const ask = (id: string, question = 'Why validate twice?'): AskRequest => ({ sessionId, phaseId: 'api', question, requestId: id, handoff: 'IGNORE-NEW-CONTEXT' });
    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'goldie-stage3-'));
        inputs = []; practiceCalls = 0;
        answerWork = async () => ({ answer: `Answer ${inputs.length}: validate at the trust boundary.` });
        practiceWork = async () => ({ questions });
        service = await LessonService.open(directory, provider) as PracticeService;
        const offer = await service.offer({ projectId: 'project', revision: 9, handoff: 'Frozen team API design.', profile: { level: 'intermediate', private: 'NEVER-FORWARD' } });
        sessionId = (await service.createSession({ offerId: offer.offerId!, revision: 9, handoff: '', profile: {} })).sessionId;
        await service.teach({ sessionId, phaseId: 'api', handoff: '', profile: {}, detail: 'standard' });
    });
    afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

    it('answers unseen questions with frozen context, saved explanation and only six successful turns', async () => {
        for (let n = 0; n < 8; n++) { await service.ask(ask(`r${n}`, `Question ${n}?`)); }
        expect(inputs).to.have.length(8);
        expect(inputs[7].handoff).to.equal('Frozen team API design.');
        expect(inputs[7].profile).to.deep.equal({ level: 'intermediate', knownConcepts: [] });
        expect(inputs[7].explanation).to.include('trust boundary');
        expect((inputs[7].history as { question: string }[]).map(t => t.question)).to.deep.equal([1, 2, 3, 4, 5, 6].map(n => `Question ${n}?`));
        const state = await service.getSession(sessionId);
        expect(state.activePhaseId).to.equal('api');
        expect(state.completedIds).to.deep.equal([]);
        expect(state.status).to.equal('asking');
    });
    it('recovers the exact committed answer after a lost response and restart, and rejects conflicting intent reuse', async () => {
        const answer = await service.ask(ask('lost'));
        service = await LessonService.open(directory, provider) as PracticeService;
        expect(await service.ask(ask('lost'))).to.deep.equal(answer);
        expect(inputs).to.have.length(1);
        expect((await service.getSession(sessionId)).questionHistory).to.have.length(1);
        await errorCode(service.ask(ask('lost', 'Different question')), 'REQUEST_CONFLICT');
        if (answer.kind === 'answer') { expect(await service.publishedText(sessionId, answer.contentId)).to.equal(answer.answer); }
    });
    it('deduplicates identical pending questions, rejects another question, and discards an answer after an intervening action', async () => {
        const gate = deferred<{ answer: string }>();
        answerWork = () => gate.promise;
        const first = service.ask(ask('one'));
        const second = service.ask(ask('one'));
        await waitForInput(inputs);
        await errorCode(service.ask(ask('two')), 'QUESTION_BUSY');
        await errorCode(service.ask(ask('one', 'collision')), 'REQUEST_CONFLICT');
        await service.action(sessionId, { action: 'pause', actionId: 'pause' });
        gate.resolve({ answer: 'Late answer' });
        await Promise.all([errorCode(first, 'QUESTION_STALE'), errorCode(second, 'QUESTION_STALE')]);
        expect(inputs).to.have.length(1);
        expect((await service.getSession(sessionId)).questionHistory).to.have.length(0);
        answerWork = async () => ({ answer: 'Retry succeeded' });
        expect(await service.ask(ask('one'))).to.have.property('answer', 'Retry succeeded');
    });
    it('does not append failed generations or silently substitute a prepared FAQ', async () => {
        answerWork = async () => { throw Object.assign(new Error('safe failure'), { code: 'GEMINI_QUOTA' }); };
        await errorCode(service.ask(ask('retry', 'What is an API?')), 'GEMINI_QUOTA');
        expect((await service.getSession(sessionId)).questionHistory).to.have.length(0);
        answerWork = async () => ({ answer: 'Manually retried answer' });
        expect(await service.ask(ask('retry'))).to.have.property('answer', 'Manually retried answer');
    });
    it('discards question results after skip or closure', async () => {
        const gate = deferred<{ answer: string }>(); answerWork = () => gate.promise;
        const pending = service.ask(ask('late'));
        await waitForInput(inputs);
        await service.complete({ sessionId, status: 'dismissed', currentRevision: 9, handoff: '', learningState: {} });
        gate.resolve({ answer: 'Late' });
        await errorCode(pending, 'QUESTION_STALE');
    });
    it('rejects malformed practice and leaves generation manually retryable without publishing content', async () => {
        await service.action(sessionId, { action: 'phase_completed', actionId: 'covered', phaseId: 'api' });
        practiceWork = async () => ({ questions: questions.slice(0, 2) });
        await errorCode(service.practice(sessionId, 'api', true), 'GEMINI_INVALID_OUTPUT');
        expect(await service.practice(sessionId, 'api', false)).to.equal(null);
        practiceWork = async () => ({ questions });
        expect((await service.practice(sessionId, 'api', true))?.questions).to.have.length(3);
    });
    it('generates practice only on demand for covered phases, caches across restart and never publishes it as speech', async () => {
        expect(await service.practice(sessionId, 'api', false)).to.equal(null);
        await errorCode(service.practice(sessionId, 'api', true), 'PRACTICE_NOT_AVAILABLE');
        expect(practiceCalls).to.equal(0);
        await service.action(sessionId, { action: 'phase_completed', actionId: 'covered', phaseId: 'api' });
        const before = await service.getSession(sessionId);
        const [batch, duplicate] = await Promise.all([service.practice(sessionId, 'api', true), service.practice(sessionId, 'api', true)]);
        expect(batch).to.deep.equal(duplicate);
        expect(batch?.questions).to.deep.equal(questions);
        expect(practiceCalls).to.equal(1);
        service = await LessonService.open(directory, provider) as PracticeService;
        expect(await service.practice(sessionId, 'api', false)).to.deep.equal(batch);
        expect(await service.practice(sessionId, 'api', true)).to.deep.equal(batch);
        expect(await service.getSession(sessionId)).to.deep.equal(before);
        expect(practiceCalls).to.equal(1);
        await errorCode(service.publishedText(sessionId, batch!.practiceId), 'CONTENT_NOT_FOUND');
        await service.action(sessionId, { action: 'skip', actionId: 'skip', phaseId: 'data' });
        await service.complete({ sessionId, status: 'completed', currentRevision: 9, handoff: '', learningState: {} });
        const terminal = await service.getSession(sessionId);
        expect(await service.practice(sessionId, 'api', true)).to.deep.equal(batch);
        await errorCode(service.practice(sessionId, 'data', true), 'PRACTICE_NOT_AVAILABLE');
        expect(await service.getSession(sessionId)).to.deep.equal(terminal);
    });
    it('supports final covered-phase practice after closure without reopening or changing recap', async () => {
        await service.action(sessionId, { action: 'phase_completed', actionId: 'c1', phaseId: 'api' });
        await service.teach({ sessionId, phaseId: 'data', handoff: '', profile: {}, detail: 'standard' });
        await service.action(sessionId, { action: 'phase_completed', actionId: 'c2', phaseId: 'data' });
        const request = { sessionId, status: 'completed' as const, currentRevision: 9, handoff: '', learningState: {} };
        const recap = await service.complete(request);
        expect(await service.practice(sessionId, 'data', true)).to.have.property('phaseId', 'data');
        expect(await service.complete(request)).to.deep.equal(recap);
        expect((await service.getSession(sessionId)).status).to.equal('completed');
    });
    it('migrates V2 without losing content, actions or question restoration', async () => {
        await service.ask(ask('old'));
        const saved = JSON.parse(await readFile(join(directory, 'sessions.json'), 'utf8'));
        const old = structuredClone(saved); old.version = 2;
        for (const session of old.sessions) { delete session.conversations; delete session.practices; }
        await writeFile(join(directory, 'sessions.json'), JSON.stringify(old));
        service = await LessonService.open(directory, provider) as PracticeService;
        expect(await service.getSession(sessionId)).to.deep.equal(saved.sessions[0].state);
        expect(JSON.parse(await readFile(join(directory, 'sessions.json'), 'utf8')).version).to.equal(3);
    });
});
