/********************************************************************************
 * Copyright (C) 2026 Akshar Kakkad and others.
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { randomUUID } from 'node:crypto';
import {
    AskRequest, AskResponse, CompleteRequest, CompleteResponse, IdentifierSchema,
    OfferRequest, OfferResponse, Phase, SessionActionRequest, SessionActionRequestSchema,
    SessionRequest, SessionResponse, SessionState, SessionStateSchema, TeachRequest, TeachResponse
} from '@goldie/contracts';
import { z } from 'zod';
import { ApiError } from './errors';
import { contentId, lesson, normalizeQuestion } from './lesson';
import { JsonStore } from './store';

const OfferSchema = z.object({
    offerId: IdentifierSchema,
    projectId: IdentifierSchema,
    revision: z.number().int().nonnegative(),
    referenceLessonId: z.literal('webapp-architecture'),
    sessionId: IdentifierSchema.optional()
}).strict();

const StoredSessionSchema = z.object({
    state: SessionStateSchema,
    actions: z.array(SessionActionRequestSchema).max(500),
    published: z.record(IdentifierSchema, z.string().min(1).max(4000)),
    completion: z.object({
        recap: z.string(),
        lastEvaluatedRevision: z.number().int().nonnegative()
    }).strict().optional()
}).strict();

const StoreSchema = z.object({
    version: z.literal(1),
    offers: z.array(OfferSchema).max(1000),
    sessions: z.array(StoredSessionSchema).max(1000)
}).strict();

type StoreState = z.infer<typeof StoreSchema>;
type StoredSession = z.infer<typeof StoredSessionSchema>;

function isClosed(state: SessionState): boolean {
    return state.status === 'completed' || state.status === 'dismissed';
}

function validateStore(value: unknown): StoreState {
    const parsed = StoreSchema.parse(value);
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
    return parsed;
}

export class LessonService {
    private constructor(private store: JsonStore<StoreState>) { }

    static async open(dataDir: string): Promise<LessonService> {
        return new LessonService(await JsonStore.open(dataDir, { version: 1, offers: [], sessions: [] }, validateStore));
    }

    async offer(request: OfferRequest): Promise<OfferResponse> {
        if (request.referenceLessonId !== lesson.id) {
            return { shouldOffer: false, previewTopics: [] };
        }
        return this.store.mutate(state => {
            if (state.sessions.some(session => session.state.projectId === request.projectId && !isClosed(session.state))) {
                return { shouldOffer: false, previewTopics: [] };
            }
            let offer = state.offers.find(item => item.projectId === request.projectId && item.revision === request.revision);
            if (offer?.sessionId) { return { shouldOffer: false, previewTopics: [] }; }
            if (!offer) {
                if (state.offers.length >= 1000) { throw this.limitError(); }
                offer = {
                    offerId: randomUUID(), projectId: request.projectId, revision: request.revision,
                    referenceLessonId: lesson.id
                };
                state.offers.push(offer);
            }
            return {
                shouldOffer: true, offerId: offer.offerId,
                previewTopics: lesson.phases.map(phase => phase.title), estimatedSeconds: lesson.estimatedSeconds
            };
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
            if (request.revision !== offer.revision) {
                throw new ApiError(409, 'REVISION_CONFLICT', 'Accept the revision shown in the lesson offer.');
            }
            if (state.sessions.length >= 1000) { throw this.limitError(); }
            const phases: Phase[] = lesson.phases.map(({ id, title, objective, description }) => ({ id, title, objective, description }));
            const session: StoredSession = {
                state: {
                    sessionId: randomUUID(), projectId: offer.projectId, snapshotRevision: offer.revision,
                    phases, status: 'learning', activePhaseId: phases[0].id,
                    completedIds: [], skippedIds: [], alreadyKnowIds: [],
                    lastEvaluatedRevision: offer.revision, questionHistory: []
                },
                actions: [], published: {}
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
        return this.store.mutate(state => {
            const session = this.findSession(state, request.sessionId);
            this.requirePhase(session, request.phaseId);
            const phase = lesson.phases.find(item => item.id === request.phaseId)!;
            const text = request.detail === 'expanded' ? phase.expanded : phase.explanation;
            const id = this.publish(session, text);
            return { explanation: text, contentId: id, groundingStatus: 'conceptual' as const };
        });
    }

    async ask(request: AskRequest): Promise<AskResponse> {
        return this.store.mutate(state => {
            const session = this.findSession(state, request.sessionId);
            this.requirePhase(session, request.phaseId);
            if (session.state.questionHistory.length >= 100) { throw this.limitError(); }
            const normalized = normalizeQuestion(request.question);
            const prepared = lesson.questions.find(question => question.aliases.some(alias => normalizeQuestion(alias) === normalized));
            const deeper = lesson.deeperAliases.some(alias => normalizeQuestion(alias) === normalized);
            const phase = lesson.phases.find(item => item.id === request.phaseId)!;
            const answer = prepared?.answer ?? (deeper ? phase.expanded : lesson.unsupportedAnswer);
            const id = this.publish(session, answer);
            session.state.status = 'asking';
            session.state.questionHistory.push({ question: request.question, answer, resumePhaseId: request.phaseId });
            return {
                kind: 'answer' as const, answer, resumePhaseId: request.phaseId, contentId: id,
                ...(!prepared && !deeper ? { supportedQuestions: lesson.questions.map(question => question.question) } : {})
            };
        });
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

    private limitError(): ApiError {
        return new ApiError(409, 'HISTORY_LIMIT', 'The local lesson history limit was reached. End the lesson or archive local history before continuing.');
    }
}
