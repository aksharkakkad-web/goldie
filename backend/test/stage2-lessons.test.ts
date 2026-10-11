/********************************************************************************
 * Copyright (C) 2026 Akshar Kakkad and others.
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { expect } from 'chai';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OfferRequest, SessionState } from '@goldie/contracts';
import { ApiError } from '../src/errors';
import { LessonService } from '../src/lessons';

const phase = (id: string) => ({
    id, title: `Concept ${id}`, objective: `Understand ${id}`, description: `Explore ${id}`,
    whyNow: 'A relevant design decision', sourceStatus: 'planned' as const,
    depth: 'foundation' as const, prerequisiteIds: [] as string[]
});
const roadmap = (count = 5) => ({
    shouldOffer: true, reason: 'Meaningful engineering concepts', estimatedSeconds: 240,
    phases: Array.from({ length: count }, (_, index) => phase(`concept-${index + 1}`))
});
type Plan = ReturnType<typeof roadmap>;
interface PlanningInput { handoff: string; profile: { level: 'beginner' | 'intermediate'; knownConcepts: string[] } }
type TeachingInput = PlanningInput & { plan: Plan; phaseId: string; detail: 'standard' | 'expanded' };
interface TeachingResult { explanation: string; groundingStatus: 'inferred' }
class ControlledProvider {
    readonly identity = 'controlled:model-a:v1';
    plans: PlanningInput[] = [];
    teachings: TeachingInput[] = [];
    planWork = async (_input: PlanningInput): Promise<Plan> => roadmap();
    teachWork = async (_input: TeachingInput) => ({ explanation: 'A project-aware conceptual explanation.', groundingStatus: 'inferred' as const });
    async plan(input: PlanningInput): Promise<Plan> { this.plans.push(structuredClone(input)); return this.planWork(input); }
    async teach(input: TeachingInput): Promise<TeachingResult> { this.teachings.push(structuredClone(input)); return this.teachWork(input); }
}
const open = (directory: string, provider?: ControlledProvider): Promise<LessonService> => LessonService.open(directory, provider);
const offerRequest = (overrides: Partial<OfferRequest> = {}): OfferRequest => ({
    projectId: 'project-a', revision: 1, handoff: 'Plan a background job queue with retries.',
    profile: { level: 'beginner', knownConcepts: [] }, ...overrides
});
const teachRequest = (session: SessionState, detail: 'standard' | 'expanded' = 'standard') => ({
    sessionId: session.sessionId, phaseId: session.phases[0].id, handoff: 'REPLACEMENT-CONTEXT',
    profile: { level: 'intermediate', knownConcepts: ['everything'] }, detail
});
async function accept(service: LessonService, request = offerRequest()): Promise<SessionState> {
    const offer = await service.offer(request);
    expect(offer.shouldOffer).to.equal(true);
    return service.createSession({ offerId: offer.offerId!, revision: request.revision, handoff: 'REPLACEMENT-CONTEXT', profile: { private: 'IGNORE-ME' } });
}
async function expectError(promise: Promise<unknown>, code: string): Promise<void> {
    let caught: unknown;
    try { await promise; } catch (error) { caught = error; }
    expect(caught, `expected ${code}`).to.have.property('code', code);
}
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}
async function fillOfferHistory(directory: string, count: number): Promise<void> {
    const saved = JSON.parse(await readFile(join(directory, 'sessions.json'), 'utf8'));
    while (saved.offers.length < count) {
        const index = saved.offers.length;
        saved.offers.push({
            source: 'reference', referenceLessonId: 'webapp-architecture',
            offerId: `history-offer-${index}`, projectId: `history-project-${index}`, revision: 1
        });
    }
    await writeFile(join(directory, 'sessions.json'), JSON.stringify(saved));
}

describe('Stage 2 immutable lesson planning', () => {
    let directory: string;
    beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'goldie-stage2-')); });
    afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

    it('plans once at offer, previews at most three topics and accepts the exact unbounded roadmap', async () => {
        const provider = new ControlledProvider();
        provider.planWork = async () => roadmap(21);
        const service = await open(directory, provider);
        const offer = await service.offer(offerRequest());
        expect(offer.shouldOffer).to.equal(true);
        expect(offer.previewTopics).to.deep.equal(['Concept concept-1', 'Concept concept-2', 'Concept concept-3']);
        expect(offer.estimatedSeconds).to.equal(1260);
        const session = await service.createSession({ offerId: offer.offerId!, revision: 1, handoff: 'replacement', profile: {} });
        expect(session.phases).to.deep.equal(roadmap(21).phases.map(({ id, title, objective, description }) => ({ id, title, objective, description })));
        expect(provider.plans).to.have.length(1);
        expect(provider.teachings).to.have.length(0);
        expect(await service.createSession({ offerId: offer.offerId!, revision: 99, handoff: '', profile: {} })).to.deep.equal(session);
    });

    it('estimates listening from the frozen phase count instead of an inflated model estimate', async () => {
        const provider = new ControlledProvider();
        provider.planWork = async () => ({ ...roadmap(2), estimatedSeconds: 900 });
        const service = await open(directory, provider);
        const request = offerRequest();
        const offer = await service.offer(request);
        expect(offer.estimatedSeconds).to.equal(120);
        expect(await (await open(directory, provider)).offer(request)).to.deep.equal(offer);
        expect(provider.plans).to.have.length(1);
        const saved = JSON.parse(await readFile(join(directory, 'sessions.json'), 'utf8'));
        expect(saved.offers[0].snapshot.plan.estimatedSeconds).to.equal(900);
    });

    it('uses only the normalized profile allowlist and frozen context for teaching and persists both detail caches', async () => {
        const provider = new ControlledProvider();
        const service = await open(directory, provider);
        const request = offerRequest({ profile: { knownConcepts: ['queues'], secret: 'PRIVATE-UNKNOWN-KEY' } });
        const session = await accept(service, request);
        const standard = await service.teach(teachRequest(session));
        expect(standard.groundingStatus).to.equal('inferred');
        expect(await service.publishedText(session.sessionId, standard.contentId)).to.equal(standard.explanation);
        await service.teach(teachRequest(session, 'expanded'));
        expect(provider.teachings).to.have.length(2);
        expect(provider.teachings[0].handoff).to.equal(request.handoff);
        expect(provider.teachings[0].profile).to.deep.equal({ level: 'beginner', knownConcepts: ['queues'] });
        expect(provider.teachings[0].plan.phases).to.deep.equal(roadmap().phases);
        const disk = await readFile(join(directory, 'sessions.json'), 'utf8');
        expect(JSON.parse(disk).version).to.equal(3);
        expect(disk).to.contain(request.handoff);
        expect(disk).not.to.contain('REPLACEMENT-CONTEXT');
        expect(disk).not.to.contain('PRIVATE-UNKNOWN-KEY');
        expect(disk).not.to.contain('IGNORE-ME');
        const restored = await open(directory);
        expect(await restored.teach(teachRequest(session))).to.deep.equal(standard);
        expect(await restored.teach(teachRequest(session, 'expanded'))).to.have.property('groundingStatus', 'inferred');
        expect((await restored.getSession(session.sessionId)).activePhaseId).to.equal('concept-1');
    });

    it('deduplicates concurrent plans and caches positive and negative evaluations across restarts', async () => {
        const provider = new ControlledProvider();
        const pending = deferred<Plan>();
        provider.planWork = async () => pending.promise;
        const service = await open(directory, provider);
        const first = service.offer(offerRequest());
        const second = service.offer(offerRequest({ profile: { knownConcepts: [], level: 'beginner', ignored: 'private' } }));
        pending.resolve(roadmap());
        const [a, b] = await Promise.all([first, second]);
        expect(a).to.deep.equal(b);
        expect(provider.plans).to.have.length(1);
        const restored = await open(directory, provider);
        expect(await restored.offer(offerRequest())).to.deep.equal(a);
        expect(provider.plans).to.have.length(1);
        provider.planWork = async () => ({ ...roadmap(0), shouldOffer: false, reason: 'Cosmetic task', estimatedSeconds: 0 });
        const negative = offerRequest({ revision: 2, handoff: 'Adjust a margin.' });
        expect(await restored.offer(negative)).to.deep.equal({ shouldOffer: false, previewTopics: [] });
        const again = await open(directory, provider);
        expect(await again.offer(negative)).to.deep.equal({ shouldOffer: false, previewTopics: [] });
        expect(provider.plans).to.have.length(2);
    });

    it('separates cached evaluations by context, normalized knowledge and provider identity', async () => {
        const provider = new ControlledProvider();
        const service = await open(directory, provider);
        const first = await service.offer(offerRequest());
        const context = await service.offer(offerRequest({ handoff: 'Plan a transaction.' }));
        const profile = await service.offer(offerRequest({ profile: { level: 'intermediate' } }));
        expect(new Set([first.offerId, context.offerId, profile.offerId]).size).to.equal(3);
        const other = new ControlledProvider();
        Object.defineProperty(other, 'identity', { value: 'controlled:model-b:v1' });
        const restored = await open(directory, other);
        const model = await restored.offer(offerRequest());
        expect(model.offerId).not.to.equal(first.offerId);
        expect(other.plans).to.have.length(1);
    });

    it('does not call a provider for explicit references or empty context and rejects missing configuration and malformed profiles', async () => {
        const provider = new ControlledProvider();
        const service = await open(directory, provider);
        expect(await service.offer(offerRequest({ handoff: '  ' }))).to.deep.equal({ shouldOffer: false, previewTopics: [] });
        await expectError(service.offer(offerRequest({ profile: { level: 'expert' } })), 'INVALID_REQUEST');
        await expectError(service.offer(offerRequest({ profile: { knownConcepts: 'queues' } })), 'INVALID_REQUEST');
        expect((await service.offer(offerRequest({ referenceLessonId: 'webapp-architecture', profile: { level: 'expert' } }))).shouldOffer).to.equal(true);
        expect(provider.plans).to.have.length(0);
        const missing = await open(directory);
        await expectError(missing.offer(offerRequest()), 'GEMINI_NOT_CONFIGURED');
    });

    it('does not cache transient failures and retries duplicate teaching safely', async () => {
        const provider = new ControlledProvider();
        const service = await open(directory, provider);
        provider.planWork = async () => { throw new ApiError(503, 'GEMINI_UNAVAILABLE', 'Unavailable', true); };
        await expectError(service.offer(offerRequest()), 'GEMINI_UNAVAILABLE');
        provider.planWork = async () => roadmap();
        const session = await accept(service);
        provider.teachWork = async () => { throw new ApiError(503, 'GEMINI_UNAVAILABLE', 'Unavailable', true); };
        await expectError(service.teach(teachRequest(session)), 'GEMINI_UNAVAILABLE');
        const pending = deferred<{ explanation: string; groundingStatus: 'inferred' }>();
        provider.teachWork = async () => pending.promise;
        const first = service.teach(teachRequest(session));
        const second = service.teach(teachRequest(session));
        pending.resolve({ explanation: 'Generated once after retry.', groundingStatus: 'inferred' });
        expect(await first).to.deep.equal(await second);
        expect(provider.plans).to.have.length(2);
        expect(provider.teachings).to.have.length(2);
    });

    it('freezes model identity across restart while serving cached detail without configuration', async () => {
        const provider = new ControlledProvider();
        const service = await open(directory, provider);
        const session = await accept(service);
        const standard = await service.teach(teachRequest(session));
        const other = new ControlledProvider();
        Object.defineProperty(other, 'identity', { value: 'controlled:model-b:v1' });
        const changed = await open(directory, other);
        expect(await changed.teach(teachRequest(session))).to.deep.equal(standard);
        await expectError(changed.teach(teachRequest(session, 'expanded')), 'GEMINI_CONTEXT_CHANGED');
        expect(other.teachings).to.have.length(0);
        expect(await (await open(directory)).teach(teachRequest(session))).to.deep.equal(standard);
    });

    it('suppresses an already accepted project revision across contexts and fixture routing after closure', async () => {
        const provider = new ControlledProvider();
        const service = await open(directory, provider);
        const alternative = await service.offer(offerRequest({ handoff: 'A different design.' }));
        const session = await accept(service);
        await service.complete({ sessionId: session.sessionId, status: 'dismissed', currentRevision: 3, handoff: '', learningState: {} });
        expect((await service.offer(offerRequest({ handoff: 'changed context' }))).shouldOffer).to.equal(false);
        expect((await service.offer(offerRequest({ referenceLessonId: 'webapp-architecture' }))).shouldOffer).to.equal(false);
        await expectError(service.createSession({ offerId: alternative.offerId!, revision: 1, handoff: '', profile: {} }), 'REVISION_ALREADY_ACCEPTED');
    });

    it('rechecks acceptance when slow planning finishes and never holds the storage queue during generation', async () => {
        const provider = new ControlledProvider();
        const service = await open(directory, provider);
        const pending = deferred<Plan>();
        const started = deferred<void>();
        provider.planWork = async () => { started.resolve(); return pending.promise; };
        const planning = service.offer(offerRequest());
        await started.promise;
        const session = await accept(service, offerRequest({ referenceLessonId: 'webapp-architecture' }));
        await service.complete({ sessionId: session.sessionId, status: 'dismissed', currentRevision: 1, handoff: '', learningState: {} });
        pending.resolve(roadmap());
        expect(await planning).to.deep.equal({ shouldOffer: false, previewTopics: [] });
    });

    it('deduplicates acceptance races and prevents competing active sessions', async () => {
        const service = await open(directory, new ControlledProvider());
        const first = await service.offer(offerRequest());
        const second = await service.offer(offerRequest({ revision: 2 }));
        const request = { offerId: first.offerId!, revision: 1, handoff: '', profile: {} };
        const accepted = await Promise.all([service.createSession(request), service.createSession(request)]);
        expect(accepted[0].sessionId).to.equal(accepted[1].sessionId);
        await expectError(service.createSession({ ...request, offerId: second.offerId!, revision: 2 }), 'ACTIVE_SESSION');
    });

    it('does not publish a stale explanation after a phase advances or a lesson closes', async () => {
        const provider = new ControlledProvider();
        const service = await open(directory, provider);
        const session = await accept(service);
        const pending = deferred<{ explanation: string; groundingStatus: 'inferred' }>();
        const started = deferred<void>();
        provider.teachWork = async () => { started.resolve(); return pending.promise; };
        const teaching = service.teach(teachRequest(session));
        await started.promise;
        await service.action(session.sessionId, { actionId: 'skip', action: 'skip', phaseId: 'concept-1' });
        pending.resolve({ explanation: 'STALE-EXPLANATION', groundingStatus: 'inferred' });
        await expectError(teaching, 'PHASE_CONFLICT');
        expect(await readFile(join(directory, 'sessions.json'), 'utf8')).not.to.contain('STALE-EXPLANATION');
        const closedPending = deferred<{ explanation: string; groundingStatus: 'inferred' }>();
        const closedStarted = deferred<void>();
        provider.teachWork = async () => { closedStarted.resolve(); return closedPending.promise; };
        const later = service.teach({ ...teachRequest(session), phaseId: 'concept-2' });
        await closedStarted.promise;
        await service.complete({ sessionId: session.sessionId, status: 'dismissed', currentRevision: 1, handoff: '', learningState: {} });
        closedPending.resolve({ explanation: 'CLOSED-EXPLANATION', groundingStatus: 'inferred' });
        await expectError(later, 'SESSION_CLOSED');
        expect(await readFile(join(directory, 'sessions.json'), 'utf8')).not.to.contain('CLOSED-EXPLANATION');
    });

    it('never substitutes the old general FAQ when live conversational generation is not configured', async () => {
        const provider = new ControlledProvider();
        const service = await open(directory, provider);
        const session = await accept(service);
        await expectError(service.ask({ sessionId: session.sessionId, phaseId: 'concept-1', question: 'what is an api', handoff: '' }), 'GEMINI_NOT_CONFIGURED');
        expect((await service.getSession(session.sessionId)).activePhaseId).to.equal('concept-1');
        expect(provider.teachings).to.have.length(0);
    });

    it('migrates valid version 1 progress without loss and rejects invalid old invariants without rewriting bytes', async () => {
        const service = await open(directory);
        const session = await accept(service, offerRequest({ referenceLessonId: 'webapp-architecture' }));
        const published = await service.teach({ ...teachRequest(session), phaseId: 'frontend' });
        await service.action(session.sessionId, { actionId: 'skip', action: 'skip', phaseId: 'frontend' });
        const saved = JSON.parse(await readFile(join(directory, 'sessions.json'), 'utf8'));
        const legacy = { version: 1, offers: saved.offers.map((item: { offerId: string; projectId: string; revision: number; sessionId: string }) => ({
            offerId: item.offerId, projectId: item.projectId, revision: item.revision, sessionId: item.sessionId, referenceLessonId: 'webapp-architecture'
        })), sessions: saved.sessions.map((item: { state: SessionState; actions: unknown[]; published: object; completion?: object }) => ({
            state: item.state, actions: item.actions, published: item.published, ...(item.completion ? { completion: item.completion } : {})
        })) };
        await writeFile(join(directory, 'sessions.json'), JSON.stringify(legacy));
        const migrated = await open(directory);
        expect((await migrated.getSession(session.sessionId)).skippedIds).to.deep.equal(['frontend']);
        expect(await migrated.publishedText(session.sessionId, published.contentId)).to.equal(published.explanation);
        expect((await migrated.action(session.sessionId, { actionId: 'skip', action: 'skip', phaseId: 'frontend' })).activePhaseId).to.equal('backend');
        await migrated.action(session.sessionId, { actionId: 'pause', action: 'pause' });
        expect(JSON.parse(await readFile(join(directory, 'sessions.json'), 'utf8')).version).to.equal(3);
        legacy.sessions[0].state.activePhaseId = 'frontend';
        const corrupt = JSON.stringify(legacy);
        await writeFile(join(directory, 'sessions.json'), corrupt);
        await expectError(open(directory), 'STORE_CORRUPT');
        expect(await readFile(join(directory, 'sessions.json'), 'utf8')).to.equal(corrupt);
    });

    it('caches teaching for phase IDs that coincide with inherited object properties', async () => {
        const provider = new ControlledProvider();
        provider.planWork = async () => ({ ...roadmap(1), phases: [phase('__proto__')] });
        const service = await open(directory, provider);
        const session = await accept(service);
        try {
            const result = await service.teach(teachRequest(session));
            expect(await (await open(directory)).teach(teachRequest(session))).to.deep.equal(result);
            expect(Object.prototype).not.to.have.own.property('standard');
        } finally {
            Reflect.deleteProperty(Object.prototype, 'standard');
        }
    });

    it('captures offer and teaching request identities before awaiting external generation', async () => {
        const provider = new ControlledProvider();
        const planning = deferred<Plan>();
        const planStarted = deferred<void>();
        provider.planWork = async () => { planStarted.resolve(); return planning.promise; };
        const service = await open(directory, provider);
        const request = offerRequest();
        const offering = service.offer(request);
        await planStarted.promise;
        request.projectId = 'replacement-project';
        request.revision = 99;
        planning.resolve(roadmap());
        const offer = await offering;
        const session = await service.createSession({ offerId: offer.offerId!, revision: 1, handoff: '', profile: {} });
        expect(session.projectId).to.equal('project-a');
        expect(session.snapshotRevision).to.equal(1);
        const teaching = deferred<TeachingResult>();
        const teachStarted = deferred<void>();
        provider.teachWork = async () => { teachStarted.resolve(); return teaching.promise; };
        const teach = teachRequest(session);
        const response = service.teach(teach);
        await teachStarted.promise;
        teach.phaseId = 'concept-2';
        teaching.resolve({ explanation: 'Original phase explanation.', groundingStatus: 'inferred' });
        expect((await response).explanation).to.equal('Original phase explanation.');
        expect(await service.teach(teachRequest(session))).to.have.property('explanation', 'Original phase explanation.');
        expect(provider.teachings).to.have.length(1);
    });

    it('rejects malformed durable snapshots, cache identities and progress while preserving corrupt files', async () => {
        const service = await open(directory, new ControlledProvider());
        const session = await accept(service);
        await service.teach(teachRequest(session));
        const original = JSON.parse(await readFile(join(directory, 'sessions.json'), 'utf8'));
        const malformed: string[] = [];
        const missingMetadata = structuredClone(original);
        delete missingMetadata.offers[0].snapshot.plan.phases[0].whyNow;
        malformed.push(JSON.stringify(missingMetadata));
        const badCacheKey = structuredClone(original);
        badCacheKey.offers[0].cacheKey = 'a'.repeat(64);
        malformed.push(JSON.stringify(badCacheKey));
        const changedRoadmap = structuredClone(original);
        changedRoadmap.sessions[0].state.phases[0].title = 'Different from the accepted plan';
        malformed.push(JSON.stringify(changedRoadmap));
        const invalidProgress = structuredClone(original);
        invalidProgress.sessions[0].state.completedIds = ['unknown-phase'];
        malformed.push(JSON.stringify(invalidProgress));
        const duplicatedCache = structuredClone(original);
        duplicatedCache.sessions[0].teachings.push(duplicatedCache.sessions[0].teachings[0]);
        malformed.push(JSON.stringify(duplicatedCache));
        const unpublished = structuredClone(original);
        unpublished.sessions[0].published = {};
        malformed.push(JSON.stringify(unpublished));
        const unknownProfile = structuredClone(original);
        unknownProfile.sessions[0].snapshot.profile.secret = 'not-allowlisted';
        malformed.push(JSON.stringify(unknownProfile));
        for (const corrupt of malformed) {
            await writeFile(join(directory, 'sessions.json'), corrupt);
            await expectError(open(directory), 'STORE_CORRUPT');
            expect(await readFile(join(directory, 'sessions.json'), 'utf8')).to.equal(corrupt);
        }
    });

    it('finishes dynamic phases using server-confirmed progress and rejects closed speech', async () => {
        const service = await open(directory, new ControlledProvider());
        const session = await accept(service);
        const taught = await service.teach(teachRequest(session));
        await expectError(service.complete({ sessionId: session.sessionId, status: 'completed', currentRevision: 99, handoff: '', learningState: {} }), 'INCOMPLETE_SESSION');
        for (const item of session.phases) {
            await service.action(session.sessionId, { actionId: `done-${item.id}`, action: 'phase_completed', phaseId: item.id });
        }
        const recap = await service.complete({ sessionId: session.sessionId, status: 'completed', currentRevision: 99, handoff: '', learningState: {} });
        expect(recap.lastEvaluatedRevision).to.equal(1);
        expect(recap.recap).to.contain('Covered: Concept concept-1, Concept concept-2');
        await expectError(service.publishedText(session.sessionId, taught.contentId), 'SESSION_CLOSED');
        const restored = await open(directory);
        expect((await restored.getSession(session.sessionId)).status).to.equal('completed');
        expect(await restored.complete({ sessionId: session.sessionId, status: 'completed', currentRevision: 99, handoff: '', learningState: {} })).to.deep.equal(recap);
    });

    it('rejects full history before paid planning while serving cached positive and negative evaluations', async () => {
        const provider = new ControlledProvider();
        const service = await open(directory, provider);
        const positive = await service.offer(offerRequest());
        provider.planWork = async () => ({ ...roadmap(0), shouldOffer: false, estimatedSeconds: 0 });
        const cosmetic = offerRequest({ revision: 2, handoff: 'Adjust spacing.' });
        const negative = await service.offer(cosmetic);
        await fillOfferHistory(directory, 1000);
        const full = await open(directory, provider);
        provider.planWork = async () => { throw new ApiError(503, 'UNEXPECTED_PLANNING', 'Planning should not run at capacity.'); };
        expect(await full.offer(offerRequest())).to.deep.equal(positive);
        expect(await full.offer(cosmetic)).to.deep.equal(negative);
        await expectError(full.offer(offerRequest({ revision: 3 })), 'HISTORY_LIMIT');
        expect(provider.plans).to.have.length(2);
    });

    it('joins an in-flight duplicate after history fills and retains the commit-time capacity check', async () => {
        const provider = new ControlledProvider();
        const initial = await open(directory, provider);
        const reference = offerRequest({ projectId: 'reference-project', referenceLessonId: 'webapp-architecture' });
        await initial.offer(reference);
        await fillOfferHistory(directory, 999);
        const service = await open(directory, provider);
        const pending = deferred<Plan>();
        const started = deferred<void>();
        provider.planWork = async () => { started.resolve(); return pending.promise; };
        const planning = service.offer(offerRequest());
        await started.promise;
        await service.offer({ ...reference, revision: 2 });
        let duplicateSettled = false;
        const duplicate = service.offer(offerRequest());
        const observedDuplicate = duplicate.then(() => { duplicateSettled = true; }, () => { duplicateSettled = true; });
        await service.offer(reference);
        expect(duplicateSettled).to.equal(false);
        pending.resolve(roadmap());
        await Promise.all([expectError(planning, 'HISTORY_LIMIT'), expectError(duplicate, 'HISTORY_LIMIT')]);
        await observedDuplicate;
        expect(provider.plans).to.have.length(1);
        expect(JSON.parse(await readFile(join(directory, 'sessions.json'), 'utf8')).offers).to.have.length(1000);
    });
});
