/********************************************************************************
 * Copyright (C) 2026 Akshar Kakkad and others.
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { randomUUID } from 'node:crypto';
import {
    AskRequest, AskResponse, AskResponseSchema, CompleteRequest, CompleteResponse, IdentifierSchema, PracticeBatch, PracticeBatchSchema,
    OfferRequest, OfferResponse, Phase, SessionActionRequest, SessionActionRequestSchema,
    SessionRequest, SessionResponse, SessionState, SessionStateSchema, TeachRequest, TeachResponse,
    TeachingProfile, TeachingProfileSchema
} from '@goldie/contracts';
import { z } from 'zod';
import { ApiError } from './errors';
import { contentId, lesson, normalizeQuestion } from './lesson';
import { CONVERSATION_PROMPT_VERSION, ConversationResultSchema, LessonPlan, LessonPlanSchema,
    PracticeResultSchema, TeachingProvider, TeachingResultSchema } from './providers/teaching';
import { JsonStore } from './store';

const LegacyOfferSchema = z.object({
    offerId: IdentifierSchema,
    projectId: IdentifierSchema,
    revision: z.number().int().nonnegative(),
    referenceLessonId: z.literal('webapp-architecture'),
    sessionId: IdentifierSchema.optional()
}).strict();

const LegacySessionSchema = z.object({
    state: SessionStateSchema,
    actions: z.array(SessionActionRequestSchema).max(500),
    published: z.record(IdentifierSchema, z.string().min(1).max(4000)),
    completion: z.object({
        recap: z.string(),
        lastEvaluatedRevision: z.number().int().nonnegative()
    }).strict().optional()
}).strict();

const LegacyStoreSchema = z.object({
    version: z.literal(1),
    offers: z.array(LegacyOfferSchema).max(1000),
    sessions: z.array(LegacySessionSchema).max(1000)
}).strict();

const SnapshotSchema = z.object({
    handoff: z.string().min(1).max(32000),
    profile: TeachingProfileSchema.strict(),
    providerIdentity: z.string().min(1).max(1024),
    plan: LessonPlanSchema
}).strict();
const OfferBaseSchema = LegacyOfferSchema.omit({ referenceLessonId: true });
const OfferSchema = z.discriminatedUnion('source', [
    LegacyOfferSchema.extend({ source: z.literal('reference') }).strict(),
    OfferBaseSchema.extend({
        source: z.literal('gemini'), cacheKey: z.string().regex(/^[a-f0-9]{64}$/), snapshot: SnapshotSchema
    }).strict()
]);
const TeachingCacheSchema = z.array(z.object({
    phaseId: IdentifierSchema, detail: z.enum(['standard', 'expanded']), result: TeachingResultSchema
}).strict());
const V2SessionSchema = z.discriminatedUnion('source', [
    LegacySessionSchema.extend({ source: z.literal('reference') }).strict(),
    LegacySessionSchema.extend({ source: z.literal('gemini'), snapshot: SnapshotSchema, teachings: TeachingCacheSchema }).strict()
]);
const ConversationsSchema = z.array(z.object({
    requestId: IdentifierSchema, fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    promptVersion: z.string().min(1), response: AskResponseSchema
}).strict()).max(100);
const StoredSessionSchema = z.discriminatedUnion('source', [
    LegacySessionSchema.extend({ source: z.literal('reference'), conversations: ConversationsSchema, practices: z.array(PracticeBatchSchema) }).strict(),
    LegacySessionSchema.extend({ source: z.literal('gemini'), snapshot: SnapshotSchema, teachings: TeachingCacheSchema,
        conversations: ConversationsSchema, practices: z.array(PracticeBatchSchema) }).strict()
]);
const V2StoreSchema = z.object({
    version: z.literal(2), offers: z.array(OfferSchema).max(1000), sessions: z.array(V2SessionSchema).max(1000)
}).strict();
const StoreSchema = z.object({
    version: z.literal(3), offers: z.array(OfferSchema).max(1000), sessions: z.array(StoredSessionSchema).max(1000)
}).strict();

type StoreState = z.infer<typeof StoreSchema>;
type StoredSession = z.infer<typeof StoredSessionSchema>;
type Snapshot = z.infer<typeof SnapshotSchema>;

function isClosed(state: SessionState): boolean {
    return state.status === 'completed' || state.status === 'dismissed';
}

/** Keep the original V1 checks before accepting any migration. */
function validateInvariants(parsed: z.infer<typeof LegacyStoreSchema> | StoreState): void {
    const sessions = new Set<string>();
    const activeProjects = new Set<string>();
    const offers = new Set<string>();
    for (const session of parsed.sessions) {
        const state = session.state;
        const phaseIds = state.phases.map(phase => phase.id);
        const terminal = [...state.completedIds, ...state.skippedIds, ...state.alreadyKnowIds];
        const actionIds = session.actions.map(action => action.actionId);
        const firstPending = phaseIds.find(id => !terminal.includes(id));
        if (sessions.has(state.sessionId) || new Set(phaseIds).size !== phaseIds.length
            || phaseIds.length === 0 || new Set(terminal).size !== terminal.length
            || terminal.some(id => !phaseIds.includes(id)) || new Set(actionIds).size !== actionIds.length
            || state.questionHistory.length > 100 || state.lastEvaluatedRevision !== state.snapshotRevision
            || state.questionHistory.some(question => !phaseIds.includes(question.resumePhaseId))
            || (!isClosed(state) && state.activePhaseId !== firstPending)
            || (state.status === 'completed' && firstPending !== undefined)
            || (isClosed(state) !== Boolean(session.completion))
            || Object.entries(session.published).some(([id, text]) => contentId(text) !== id)) {
            throw new Error('Invalid persisted session invariants');
        }
        sessions.add(state.sessionId);
        if (!isClosed(state)) {
            if (activeProjects.has(state.projectId)) { throw new Error('Multiple active sessions'); }
            activeProjects.add(state.projectId);
        }
    }
    for (const offer of parsed.offers) {
        if (offers.has(offer.offerId) || (offer.sessionId && !sessions.has(offer.sessionId))) {
            throw new Error('Invalid persisted offer');
        }
        offers.add(offer.offerId);
    }
}

function publicPhases(plan: LessonPlan): Phase[] {
    return plan.phases.map(({ id, title, objective, description }) => ({ id, title, objective, description }));
}

function evaluationKey(projectId: string, revision: number, handoff: string, profile: TeachingProfile, providerIdentity: string): string {
    return contentId(JSON.stringify({
        projectId, revision, handoff: handoff.replace(/\r\n?/g, '\n').trim(),
        profile: { level: profile.level, knownConcepts: [...new Set(profile.knownConcepts)].sort() }, providerIdentity
    }));
}

function validateStore(value: unknown): StoreState {
    if (value && typeof value === 'object' && 'version' in value && value.version === 1) {
        const legacy = LegacyStoreSchema.parse(value);
        validateInvariants(legacy);
        return validateStore({
            version: 2,
            offers: legacy.offers.map(offer => ({ ...offer, source: 'reference' })),
            sessions: legacy.sessions.map(session => ({ ...session, source: 'reference' }))
        });
    }
    if (value && typeof value === 'object' && 'version' in value && value.version === 2) {
        const legacy = V2StoreSchema.parse(value);
        return validateStore({ ...legacy, version: 3,
            sessions: legacy.sessions.map(session => ({ ...session, conversations: [], practices: [] })) });
    }
    const parsed = StoreSchema.parse(value);
    validateInvariants(parsed);
    const accepted = new Set<string>();
    const cached = new Set<string>();
    for (const session of parsed.sessions) {
        const requestIds = session.conversations.map(item => item.requestId);
        const practicePhases = session.practices.map(item => item.phaseId);
        if (new Set(requestIds).size !== requestIds.length || new Set(practicePhases).size !== practicePhases.length
            || practicePhases.some(id => !session.state.completedIds.includes(id))
            || session.conversations.some(item => item.response.kind !== 'answer'
                || !session.state.phases.some(phase => phase.id === item.response.resumePhaseId)
                || session.published[item.response.contentId] !== item.response.answer)) {
            throw new Error('Invalid persisted Stage 3 content');
        }
        const revisionKey = JSON.stringify([session.state.projectId, session.state.snapshotRevision]);
        if (accepted.has(revisionKey)) { throw new Error('Multiple accepted sessions for one revision'); }
        accepted.add(revisionKey);
        if (session.source === 'gemini') {
            const teachingKeys = session.teachings.map(item => JSON.stringify([item.phaseId, item.detail]));
            if (!session.snapshot.handoff.trim() || !session.snapshot.plan.shouldOffer || !session.snapshot.plan.phases.length
                || JSON.stringify(session.state.phases) !== JSON.stringify(publicPhases(session.snapshot.plan))
                || new Set(teachingKeys).size !== teachingKeys.length
                || session.teachings.some(item => !session.state.phases.some(phase => phase.id === item.phaseId)
                    || session.published[contentId(item.result.explanation)] !== item.result.explanation)) {
                throw new Error('Invalid persisted Gemini session');
            }
        }
    }
    for (const offer of parsed.offers) {
        if (offer.source === 'gemini') {
            const snapshot = offer.snapshot;
            if (!snapshot.handoff.trim() || cached.has(offer.cacheKey)
                || offer.cacheKey !== evaluationKey(offer.projectId, offer.revision, snapshot.handoff, snapshot.profile, snapshot.providerIdentity)
                || (offer.sessionId && (!snapshot.plan.shouldOffer || !snapshot.plan.phases.length))) {
                throw new Error('Invalid persisted Gemini offer');
            }
            cached.add(offer.cacheKey);
        }
        if (offer.sessionId) {
            const session = parsed.sessions.find(item => item.state.sessionId === offer.sessionId)!;
            if (session.state.projectId !== offer.projectId || session.state.snapshotRevision !== offer.revision
                || session.source !== offer.source
                || (session.source === 'gemini' && offer.source === 'gemini'
                    && JSON.stringify(session.snapshot) !== JSON.stringify(offer.snapshot))) {
                throw new Error('Offer and accepted session disagree');
            }
        }
    }
    return parsed;
}

export class LessonService {
    private plans = new Map<string, Promise<OfferResponse>>();
    private teachings = new Map<string, Promise<TeachResponse>>();
    private questions = new Map<string, { requestId: string; fingerprint: string; promise: Promise<AskResponse> }>();
    private practices = new Map<string, Promise<PracticeBatch>>();

    private constructor(private store: JsonStore<StoreState>, private provider?: TeachingProvider) { }

    static async open(dataDir: string, provider?: TeachingProvider): Promise<LessonService> {
        let migrated = false;
        const store = await JsonStore.open<StoreState>(dataDir, { version: 3, offers: [], sessions: [] }, value => {
            if (value && typeof value === 'object' && 'version' in value && (value.version === 1 || value.version === 2)) { migrated = true; }
            return validateStore(value);
        });
        if (migrated) { await store.mutate(() => undefined); }
        return new LessonService(store, provider);
    }

    async offer(request: OfferRequest): Promise<OfferResponse> {
        request = { ...request };
        if (request.referenceLessonId === lesson.id) {
            return this.store.mutate(state => {
                if (this.suppressOffer(state, request.projectId, request.revision)) { return this.noOffer(); }
                let offer = state.offers.find(item => item.source === 'reference' && item.projectId === request.projectId && item.revision === request.revision);
                if (!offer) {
                    if (state.offers.length >= 1000) { throw this.limitError(); }
                    offer = {
                        source: 'reference', offerId: randomUUID(), projectId: request.projectId,
                        revision: request.revision, referenceLessonId: lesson.id
                    };
                    state.offers.push(offer);
                }
                return this.offerResponse(offer);
            });
        }
        if (!request.handoff.trim()) { return this.noOffer(); }
        const parsed = TeachingProfileSchema.safeParse(request.profile);
        if (!parsed.success) { throw new ApiError(400, 'INVALID_REQUEST', 'The teaching profile is invalid.'); }
        const before = await this.store.read();
        if (this.suppressOffer(before, request.projectId, request.revision)) { return this.noOffer(); }
        const provider = this.requireProvider();
        const key = evaluationKey(request.projectId, request.revision, request.handoff, parsed.data, provider.identity);
        const cached = before.offers.find(item => item.source === 'gemini' && item.cacheKey === key);
        if (cached) { return this.offerResponse(cached); }
        const existing = this.plans.get(key);
        if (existing) { return existing; }
        if (before.offers.length >= 1000) { throw this.limitError(); }
        const work = this.plan(request, parsed.data, provider, key);
        this.plans.set(key, work);
        try { return await work; } finally { this.plans.delete(key); }
    }

    private async plan(request: OfferRequest, profile: TeachingProfile, provider: TeachingProvider, key: string): Promise<OfferResponse> {
        const input = { handoff: request.handoff, profile: structuredClone(profile) };
        const result = await provider.plan(structuredClone(input));
        const parsed = LessonPlanSchema.safeParse(result);
        if (!parsed.success) { throw new ApiError(502, 'GEMINI_INVALID_OUTPUT', 'Gemini returned an invalid lesson plan.', true); }
        const snapshot: Snapshot = { ...input, providerIdentity: provider.identity, plan: parsed.data };
        return this.store.mutate(state => {
            if (this.suppressOffer(state, request.projectId, request.revision)) { return this.noOffer(); }
            const cached = state.offers.find(item => item.source === 'gemini' && item.cacheKey === key);
            if (cached) { return this.offerResponse(cached); }
            if (state.offers.length >= 1000) { throw this.limitError(); }
            const offer = {
                source: 'gemini' as const, offerId: randomUUID(), projectId: request.projectId,
                revision: request.revision, cacheKey: key, snapshot
            };
            state.offers.push(offer);
            return this.offerResponse(offer);
        });
    }

    async createSession(request: SessionRequest): Promise<SessionResponse> {
        return this.store.mutate(state => {
            const offer = state.offers.find(item => item.offerId === request.offerId);
            if (!offer) { throw new ApiError(404, 'OFFER_NOT_FOUND', 'The lesson offer was not found.'); }
            if (offer.sessionId) { return this.findSession(state, offer.sessionId).state; }
            if (state.sessions.some(item => item.state.projectId === offer.projectId && !isClosed(item.state))) {
                throw new ApiError(409, 'ACTIVE_SESSION', 'This project already has an active lesson.');
            }
            if (state.sessions.some(item => item.state.projectId === offer.projectId && item.state.snapshotRevision === offer.revision)) {
                throw new ApiError(409, 'REVISION_ALREADY_ACCEPTED', 'A lesson for this project revision was already accepted.');
            }
            if (request.revision !== offer.revision) {
                throw new ApiError(409, 'REVISION_CONFLICT', 'Accept the revision shown in the lesson offer.');
            }
            if (state.sessions.length >= 1000) { throw this.limitError(); }
            if (offer.source === 'gemini' && (!offer.snapshot.plan.shouldOffer || !offer.snapshot.plan.phases.length)) {
                throw new ApiError(409, 'NO_LESSON_OFFER', 'This evaluation did not offer a lesson.');
            }
            const phases: Phase[] = offer.source === 'gemini' ? publicPhases(offer.snapshot.plan)
                : lesson.phases.map(({ id, title, objective, description }) => ({ id, title, objective, description }));
            const session: StoredSession = {
                ...(offer.source === 'gemini'
                    ? { source: 'gemini' as const, snapshot: structuredClone(offer.snapshot), teachings: [] }
                    : { source: 'reference' as const }),
                state: {
                    sessionId: randomUUID(), projectId: offer.projectId, snapshotRevision: offer.revision,
                    phases, status: 'learning', activePhaseId: phases[0].id,
                    completedIds: [], skippedIds: [], alreadyKnowIds: [],
                    lastEvaluatedRevision: offer.revision, questionHistory: []
                },
                actions: [], published: {}, conversations: [], practices: []
            };
            offer.sessionId = session.state.sessionId;
            state.sessions.push(session);
            return session.state;
        });
    }

    async getSession(sessionId: string): Promise<SessionState> {
        return this.findSession(await this.store.read(), sessionId).state;
    }

    async teach(request: TeachRequest): Promise<TeachResponse> {
        request = { ...request };
        const current = this.findSession(await this.store.read(), request.sessionId);
        this.requirePhase(current, request.phaseId);
        if (current.source === 'gemini') {
            const cached = current.teachings.find(item => item.phaseId === request.phaseId && item.detail === request.detail)?.result;
            if (cached) { return { ...cached, contentId: contentId(cached.explanation) }; }
            const provider = this.requireProvider();
            if (provider.identity !== current.snapshot.providerIdentity) {
                throw new ApiError(409, 'GEMINI_CONTEXT_CHANGED', 'The Gemini model configuration changed. Restore the original configuration to generate this lesson detail.');
            }
            const key = JSON.stringify([request.sessionId, request.phaseId, request.detail]);
            const pending = this.teachings.get(key);
            if (pending) { return pending; }
            const work = this.generateTeaching(request, current.snapshot, provider);
            this.teachings.set(key, work);
            try { return await work; } finally { this.teachings.delete(key); }
        }
        return this.store.mutate(state => {
            const session = this.findSession(state, request.sessionId);
            this.requirePhase(session, request.phaseId);
            const phase = lesson.phases.find(item => item.id === request.phaseId)!;
            const text = request.detail === 'expanded' ? phase.expanded : phase.explanation;
            const id = this.publish(session, text);
            return { explanation: text, contentId: id, groundingStatus: 'conceptual' as const };
        });
    }

    private async generateTeaching(request: TeachRequest, snapshot: Snapshot, provider: TeachingProvider): Promise<TeachResponse> {
        const result = await provider.teach({
            handoff: snapshot.handoff, profile: structuredClone(snapshot.profile), plan: structuredClone(snapshot.plan),
            phaseId: request.phaseId, detail: request.detail
        });
        const parsed = TeachingResultSchema.safeParse(result);
        if (!parsed.success) { throw new ApiError(502, 'GEMINI_INVALID_OUTPUT', 'Gemini returned an invalid lesson explanation.', true); }
        return this.store.mutate(state => {
            const session = this.findSession(state, request.sessionId);
            this.requirePhase(session, request.phaseId);
            if (session.source !== 'gemini') { throw new Error('Unexpected lesson source'); }
            const cached = session.teachings.find(item => item.phaseId === request.phaseId && item.detail === request.detail);
            const teaching = cached?.result ?? parsed.data;
            if (!cached) { session.teachings.push({ phaseId: request.phaseId, detail: request.detail, result: teaching }); }
            return { ...teaching, contentId: this.publish(session, teaching.explanation) };
        });
    }

    async ask(request: AskRequest): Promise<AskResponse> {
        request = { ...request, question: request.question.trim(), requestId: request.requestId ?? randomUUID() };
        const fingerprint = contentId(JSON.stringify([request.phaseId, request.question]));
        const current = this.findSession(await this.store.read(), request.sessionId);
        this.requireOpen(current);
        const cached = current.conversations.find(item => item.requestId === request.requestId);
        if (cached) {
            if (cached.fingerprint !== fingerprint) { throw this.questionConflict(); }
            return cached.response;
        }
        this.requirePhase(current, request.phaseId);
        if (current.state.questionHistory.length >= 100) { throw this.limitError(); }
        const pending = this.questions.get(request.sessionId);
        if (pending) {
            if (pending.requestId === request.requestId) {
                if (pending.fingerprint !== fingerprint) { throw this.questionConflict(); }
                return pending.promise;
            }
            throw new ApiError(409, 'QUESTION_BUSY', 'Another question is being answered. Wait or retry manually.', true);
        }
        const promise = this.generateAnswer(request, current, fingerprint);
        this.questions.set(request.sessionId, { requestId: request.requestId!, fingerprint, promise });
        try { return await promise; } finally { this.questions.delete(request.sessionId); }
    }

    private async generateAnswer(request: AskRequest, current: StoredSession, fingerprint: string): Promise<AskResponse> {
        let answer: string;
        let supportedQuestions: string[] | undefined;
        if (current.source === 'gemini') {
            const provider = this.requireProvider();
            if (provider.identity !== current.snapshot.providerIdentity) {
                throw new ApiError(409, 'GEMINI_CONTEXT_CHANGED', 'Restore the saved lesson model configuration.');
            }
            if (!provider.ask) { throw new ApiError(503, 'GEMINI_NOT_CONFIGURED', 'Conversational teaching is not configured.'); }
            const explanation = current.teachings.find(t => t.phaseId === request.phaseId && t.detail === 'standard')?.result.explanation;
            if (!explanation) { throw new ApiError(409, 'EXPLANATION_REQUIRED', 'Load the phase explanation before asking a question.'); }
            const parsed = ConversationResultSchema.safeParse(await provider.ask({
                handoff: current.snapshot.handoff, profile: structuredClone(current.snapshot.profile),
                phase: current.state.phases.find(p => p.id === request.phaseId)!, explanation,
                question: request.question, history: structuredClone(current.state.questionHistory.slice(-6))
            }));
            if (!parsed.success) { throw new ApiError(502, 'GEMINI_INVALID_OUTPUT', 'Gemini returned an unusable answer. Retry manually.', true); }
            answer = parsed.data.answer;
        } else {
            const normalized = normalizeQuestion(request.question);
            const prepared = lesson.questions.find(question => question.aliases.some(alias => normalizeQuestion(alias) === normalized));
            const phase = lesson.phases.find(item => item.id === request.phaseId)!;
            const deeper = lesson.deeperAliases.some(alias => normalizeQuestion(alias) === normalized);
            answer = prepared?.answer ?? (deeper ? phase.expanded : lesson.unsupportedAnswer);
            if (!prepared && !deeper) { supportedQuestions = lesson.questions.map(question => question.question); }
        }
        return this.store.mutate(state => {
            const session = this.findSession(state, request.sessionId);
            if (isClosed(session.state) || session.state.activePhaseId !== request.phaseId
                || session.actions.length !== current.actions.length || session.state.questionHistory.length !== current.state.questionHistory.length) {
                throw new ApiError(409, 'QUESTION_STALE', 'The lesson changed while answering. Discard this answer and retry manually.', true);
            }
            const id = this.publish(session, answer);
            session.state.status = 'asking';
            session.state.questionHistory.push({ question: request.question, answer, resumePhaseId: request.phaseId });
            const response: AskResponse = {
                kind: 'answer' as const, answer, resumePhaseId: request.phaseId, contentId: id,
                ...(supportedQuestions ? { supportedQuestions } : {})
            };
            session.conversations.push({ requestId: request.requestId!, fingerprint, promptVersion: CONVERSATION_PROMPT_VERSION, response });
            return response;
        });
    }

    private questionConflict(): ApiError {
        return new ApiError(409, 'REQUEST_CONFLICT', 'This request ID was used for different content. Start a new request.');
    }

    async practice(sessionId: string, phaseId: string, generate: boolean): Promise<PracticeBatch | null> {
        const current = this.findSession(await this.store.read(), sessionId);
        if (!current.state.phases.some(p => p.id === phaseId)) { throw new ApiError(404, 'PHASE_NOT_FOUND', 'The lesson phase was not found.'); }
        const cached = current.practices.find(p => p.phaseId === phaseId);
        // eslint-disable-next-line no-null/no-null -- null is the explicit wire-level cache miss.
        if (cached || !generate) { return cached ?? null; }
        if (!current.state.completedIds.includes(phaseId)) {
            throw new ApiError(409, 'PRACTICE_NOT_AVAILABLE', 'Practice is available only for covered phases, not skipped or familiar phases.');
        }
        const key = JSON.stringify([sessionId, phaseId]);
        const pending = this.practices.get(key);
        if (pending) { return pending; }
        const promise = this.generatePractice(current, phaseId);
        this.practices.set(key, promise);
        try { return await promise; } finally { this.practices.delete(key); }
    }

    private async generatePractice(current: StoredSession, phaseId: string): Promise<PracticeBatch> {
        let questions: PracticeBatch['questions'];
        if (current.source === 'gemini') {
            const provider = this.requireProvider();
            if (provider.identity !== current.snapshot.providerIdentity) {
                throw new ApiError(409, 'GEMINI_CONTEXT_CHANGED', 'Restore the saved lesson model configuration.');
            }
            if (!provider.practice) { throw new ApiError(503, 'GEMINI_NOT_CONFIGURED', 'Practice generation is not configured.'); }
            const explanation = current.teachings.find(t => t.phaseId === phaseId && t.detail === 'standard')?.result.explanation;
            if (!explanation) { throw new ApiError(409, 'EXPLANATION_REQUIRED', 'Practice requires a saved phase explanation.'); }
            const parsed = PracticeResultSchema.safeParse(await provider.practice({ handoff: current.snapshot.handoff,
                profile: structuredClone(current.snapshot.profile), phase: current.state.phases.find(p => p.id === phaseId)!, explanation }));
            if (!parsed.success) { throw new ApiError(502, 'GEMINI_INVALID_OUTPUT', 'Gemini returned unusable practice. Retry manually.', true); }
            questions = parsed.data.questions;
        } else {
            const phase = lesson.phases.find(p => p.id === phaseId)!;
            questions = [
                { id: 'purpose', question: `What responsibility does ${phase.title} have in a create-team request?`, modelAnswer: phase.explanation },
                { id: 'boundary', question: `Why is the boundary around ${phase.title} useful?`, modelAnswer: phase.expanded },
                { id: 'failure', question: 'What should happen if a create-team request fails?',
                    modelAnswer: 'Return a clear error, preserve consistent stored data, and avoid showing success before the server confirms it. '
                        + 'Retries need appropriate idempotency; validation alone does not guarantee correctness.' }
            ];
        }
        const batch = PracticeBatchSchema.parse({ practiceId: randomUUID(), phaseId, questions });
        return this.store.mutate(state => {
            const session = this.findSession(state, current.state.sessionId);
            if (!session.state.completedIds.includes(phaseId)) { throw new ApiError(409, 'PRACTICE_NOT_AVAILABLE', 'This phase is not covered.'); }
            const existing = session.practices.find(p => p.phaseId === phaseId);
            if (existing) { return existing; }
            session.practices.push(batch);
            return batch;
        });
    }

    async authorizeTranscription(sessionId: string, phaseId: string): Promise<string> {
        const session = this.findSession(await this.store.read(), sessionId);
        this.requirePhase(session, phaseId);
        return contentId(JSON.stringify([session.state.sessionId, phaseId, session.actions, session.state.questionHistory.length]));
    }

    async action(sessionId: string, request: SessionActionRequest): Promise<SessionState> {
        return this.store.mutate(state => {
            const session = this.findSession(state, sessionId);
            const existing = session.actions.find(action => action.actionId === request.actionId);
            if (existing) {
                if (existing.action !== request.action || ('phaseId' in existing ? existing.phaseId : undefined) !== ('phaseId' in request ? request.phaseId : undefined)) {
                    throw new ApiError(409, 'ACTION_CONFLICT', 'This action ID was already used for a different action.');
                }
                return session.state;
            }
            this.requireOpen(session);
            if (session.actions.length >= 500) { throw this.limitError(); }
            if (request.action === 'pause' || request.action === 'resume') {
                if (!session.state.activePhaseId) {
                    throw new ApiError(409, 'NO_ACTIVE_PHASE', 'All phases have finished. Complete or end the lesson.');
                }
                session.state.status = request.action === 'pause' ? 'paused' : 'learning';
            } else {
                this.requirePhase(session, request.phaseId);
                if (request.action === 'phase_completed' && session.state.status !== 'learning') {
                    throw new ApiError(409, 'STATE_CONFLICT', 'Resume the lesson before marking its audio complete.');
                }
                if (request.action === 'phase_completed') { session.state.completedIds.push(request.phaseId); }
                if (request.action === 'skip') { session.state.skippedIds.push(request.phaseId); }
                if (request.action === 'already_know') { session.state.alreadyKnowIds.push(request.phaseId); }
                const terminal = [...session.state.completedIds, ...session.state.skippedIds, ...session.state.alreadyKnowIds];
                session.state.activePhaseId = session.state.phases.find(phase => !terminal.includes(phase.id))?.id;
            }
            session.actions.push(request);
            return session.state;
        });
    }

    async complete(request: CompleteRequest): Promise<CompleteResponse> {
        return this.store.mutate(state => {
            const session = this.findSession(state, request.sessionId);
            if (isClosed(session.state)) {
                if (session.state.status !== request.status) {
                    throw new ApiError(409, 'SESSION_CLOSED', 'This lesson has already been closed.');
                }
                return session.completion!;
            }
            if (request.status === 'completed' && session.state.activePhaseId) {
                throw new ApiError(409, 'INCOMPLETE_SESSION', 'Finish, skip, or mark familiarity with every phase before completion.');
            }
            session.state.status = request.status;
            const titles = (ids: string[]): string => ids.map(id => session.state.phases.find(phase => phase.id === id)!.title).join(', ') || 'None';
            session.completion = {
                recap: `${request.status === 'completed' ? 'Lesson finished.' : 'Lesson ended early.'} `
                    + `Covered: ${titles(session.state.completedIds)}. Skipped: ${titles(session.state.skippedIds)}. `
                    + `Self-reported familiarity (not demonstrated mastery): ${titles(session.state.alreadyKnowIds)}.`,
                lastEvaluatedRevision: session.state.snapshotRevision
            };
            return session.completion;
        });
    }

    async publishedText(sessionId: string, id: string): Promise<string> {
        const session = this.findSession(await this.store.read(), sessionId);
        this.requireOpen(session);
        const text = Object.prototype.hasOwnProperty.call(session.published, id) ? session.published[id] : undefined;
        if (!text) { throw new ApiError(404, 'CONTENT_NOT_FOUND', 'This content has not been served in the accepted lesson.'); }
        return text;
    }

    private findSession(state: StoreState, sessionId: string): StoredSession {
        const session = state.sessions.find(item => item.state.sessionId === sessionId);
        if (!session) { throw new ApiError(404, 'SESSION_NOT_FOUND', 'The lesson session was not found.'); }
        return session;
    }

    private requireOpen(session: StoredSession): void {
        if (isClosed(session.state)) { throw new ApiError(409, 'SESSION_CLOSED', 'This lesson has already been closed.'); }
    }

    private requirePhase(session: StoredSession, phaseId: string): void {
        this.requireOpen(session);
        if (!session.state.phases.some(phase => phase.id === phaseId)) {
            throw new ApiError(404, 'PHASE_NOT_FOUND', 'The lesson phase was not found.');
        }
        if (session.state.activePhaseId !== phaseId) {
            throw new ApiError(409, 'PHASE_CONFLICT', 'This phase is not the current lesson phase.');
        }
    }

    private publish(session: StoredSession, text: string): string {
        const id = contentId(text);
        session.published[id] = text;
        return id;
    }

    private noOffer(): OfferResponse { return { shouldOffer: false, previewTopics: [] }; }

    private suppressOffer(state: StoreState, projectId: string, revision: number): boolean {
        return state.sessions.some(session => session.state.projectId === projectId
            && (!isClosed(session.state) || session.state.snapshotRevision === revision));
    }

    private offerResponse(offer: StoreState['offers'][number]): OfferResponse {
        if (offer.source === 'reference') {
            return {
                shouldOffer: true, offerId: offer.offerId, estimatedSeconds: lesson.estimatedSeconds,
                previewTopics: lesson.phases.slice(0, 3).map(phase => phase.title)
            };
        }
        if (!offer.snapshot.plan.shouldOffer || !offer.snapshot.plan.phases.length) { return this.noOffer(); }
        return {
            // A standard spoken phase targets 40–90 seconds, not the model's arbitrary curriculum duration.
            shouldOffer: true, offerId: offer.offerId, estimatedSeconds: offer.snapshot.plan.phases.length * 60,
            previewTopics: offer.snapshot.plan.phases.slice(0, 3).map(phase => phase.title)
        };
    }

    private requireProvider(): TeachingProvider {
        if (!this.provider) { throw new ApiError(503, 'GEMINI_NOT_CONFIGURED', 'Gemini teaching is not configured.'); }
        return this.provider;
    }

    private limitError(): ApiError {
        return new ApiError(409, 'HISTORY_LIMIT', 'The local lesson history limit was reached. End the lesson or archive local history before continuing.');
    }
}
