/********************************************************************************
 * Copyright (C) 2026 Akshar Kakkad and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { z } from 'zod';

export const IdentifierSchema = z.string().trim().min(1).max(128);
const RevisionSchema = z.number().int().nonnegative();
const HandoffSchema = z.string().max(32000).default('');

export const KnowledgeProfileSchema = z.record(z.string(), z.unknown());

/** Allowlisted model context; unrelated local profile fields never leave the backend. */
export const TeachingProfileSchema = z.object({
    level: z.enum(['beginner', 'intermediate']).default('beginner'),
    knownConcepts: z.array(z.string().trim().min(1).max(200)).max(100).default([])
});
export type TeachingProfile = z.infer<typeof TeachingProfileSchema>;

export const PhaseSchema = z.object({
    id: IdentifierSchema,
    title: z.string().trim().min(1),
    objective: z.string().trim().min(1),
    description: z.string().trim().min(1)
}).strict();

export const SourceExcerptSchema = z.object({
    path: z.string().trim().min(1),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    content: z.string()
}).strict().refine(value => value.endLine >= value.startLine, {
    message: 'endLine must be greater than or equal to startLine'
});

export const HealthResponseSchema = z.object({
    ok: z.literal(true)
}).strict();

export const OfferRequestSchema = z.object({
    projectId: IdentifierSchema,
    revision: RevisionSchema,
    handoff: HandoffSchema,
    profile: KnowledgeProfileSchema.default({}),
    referenceLessonId: z.literal('webapp-architecture').optional()
}).strict();

export const OfferResponseSchema = z.object({
    shouldOffer: z.boolean(),
    previewTopics: z.array(z.string().trim().min(1)),
    offerId: IdentifierSchema.optional(),
    estimatedSeconds: z.number().int().positive().optional()
}).strict();

export const SessionRequestSchema = z.object({
    offerId: IdentifierSchema,
    revision: RevisionSchema,
    handoff: HandoffSchema,
    profile: KnowledgeProfileSchema.default({})
}).strict();

export const SessionStateSchema = z.object({
    sessionId: IdentifierSchema,
    projectId: IdentifierSchema,
    snapshotRevision: RevisionSchema,
    phases: z.array(PhaseSchema),
    status: z.enum(['learning', 'paused', 'asking', 'completed', 'dismissed']),
    activePhaseId: IdentifierSchema.optional(),
    completedIds: z.array(IdentifierSchema),
    skippedIds: z.array(IdentifierSchema),
    alreadyKnowIds: z.array(IdentifierSchema),
    lastEvaluatedRevision: RevisionSchema,
    questionHistory: z.array(z.object({
        question: z.string().min(1).max(1000),
        answer: z.string().min(1).max(4000),
        resumePhaseId: IdentifierSchema
    }).strict())
}).strict();

export const SessionResponseSchema = SessionStateSchema;

const ActionBaseSchema = z.object({ actionId: IdentifierSchema });
export const SessionActionRequestSchema = z.discriminatedUnion('action', [
    ActionBaseSchema.extend({ action: z.literal('pause') }).strict(),
    ActionBaseSchema.extend({ action: z.literal('resume') }).strict(),
    ActionBaseSchema.extend({ action: z.literal('phase_completed'), phaseId: IdentifierSchema }).strict(),
    ActionBaseSchema.extend({ action: z.literal('skip'), phaseId: IdentifierSchema }).strict(),
    ActionBaseSchema.extend({ action: z.literal('already_know'), phaseId: IdentifierSchema }).strict()
]);
export const SessionActionResponseSchema = SessionStateSchema;

export const TeachRequestSchema = z.object({
    sessionId: IdentifierSchema,
    phaseId: IdentifierSchema,
    handoff: HandoffSchema,
    profile: KnowledgeProfileSchema.default({}),
    detail: z.enum(['standard', 'expanded']).default('standard')
}).strict();

export const TeachResponseSchema = z.object({
    explanation: z.string().min(1).max(4000),
    groundingStatus: z.enum(['conceptual', 'inferred', 'observed']),
    contentId: IdentifierSchema,
    audioUrl: z.url().optional()
}).strict();

export const AskRequestSchema = z.object({
    sessionId: IdentifierSchema,
    requestId: IdentifierSchema.optional(),
    phaseId: IdentifierSchema,
    question: z.string().trim().min(1).max(1000),
    handoff: HandoffSchema,
    sources: z.array(SourceExcerptSchema).max(8).optional()
}).strict();

export const AskResponseSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('answer'),
        answer: z.string().min(1).max(4000),
        resumePhaseId: IdentifierSchema,
        contentId: IdentifierSchema,
        supportedQuestions: z.array(z.string().min(1).max(1000)).optional()
    }).strict(),
    z.object({
        kind: z.literal('needs_sources'),
        sourceQueries: z.array(z.string().trim().min(1)),
        resumePhaseId: IdentifierSchema
    }).strict()
]);

export const CompleteRequestSchema = z.object({
    sessionId: IdentifierSchema,
    status: z.enum(['completed', 'dismissed']),
    currentRevision: RevisionSchema,
    handoff: HandoffSchema,
    learningState: z.record(z.string(), z.unknown()).default({})
}).strict();

export const CompleteResponseSchema = z.object({
    recap: z.string(),
    catchupOffer: OfferResponseSchema.optional(),
    lastEvaluatedRevision: RevisionSchema
}).strict();

export const SpeechRequestSchema = z.object({
    sessionId: IdentifierSchema,
    contentId: IdentifierSchema
}).strict();

export const AudioIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const SpeechResponseSchema = z.object({
    audioId: AudioIdSchema,
    audioUrl: z.string().regex(/^\/api\/audio\/[a-f0-9]{64}$/),
    mimeType: z.literal('audio/mpeg')
}).strict();

export const ApiErrorResponseSchema = z.object({
    error: z.object({ code: z.string().min(1), message: z.string().min(1), retryable: z.boolean() }).strict()
}).strict();

export const PracticeQuestionsSchema = z.array(z.object({
    id: IdentifierSchema,
    question: z.string().trim().min(1).max(1000),
    modelAnswer: z.string().trim().min(1).max(2000)
}).strict()).min(3).max(5).superRefine((questions, ctx) => {
    if (new Set(questions.map(q => q.id)).size !== questions.length
        || new Set(questions.map(q => q.question.toLowerCase().replace(/\s+/g, ' ').trim())).size !== questions.length) {
        ctx.addIssue({ code: 'custom', message: 'Practice questions must be distinct.' });
    }
});
export const PracticeBatchSchema = z.object({
    practiceId: IdentifierSchema, phaseId: IdentifierSchema, questions: PracticeQuestionsSchema
}).strict();
export const PracticeResponseSchema = PracticeBatchSchema.nullable();
export const PracticeGenerateRequestSchema = z.object({}).strict();

export const TranscribeRequestSchema = z.object({
    sessionId: IdentifierSchema, phaseId: IdentifierSchema, requestId: IdentifierSchema,
    mimeType: z.literal('audio/webm'),
    dataBase64: z.string().min(8).max(2796204)
}).strict();
export const TranscribeResponseSchema = z.object({ text: z.string().trim().min(1).max(1000) }).strict();
export type PracticeBatch = z.infer<typeof PracticeBatchSchema>;
export type TranscribeRequest = z.infer<typeof TranscribeRequestSchema>;
export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>;

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type OfferRequest = z.infer<typeof OfferRequestSchema>;
export type OfferResponse = z.infer<typeof OfferResponseSchema>;
export type SessionRequest = z.infer<typeof SessionRequestSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type SessionState = z.infer<typeof SessionStateSchema>;
export type Phase = z.infer<typeof PhaseSchema>;
export type SessionActionRequest = z.infer<typeof SessionActionRequestSchema>;
export type SessionActionResponse = z.infer<typeof SessionActionResponseSchema>;
export type TeachRequest = z.infer<typeof TeachRequestSchema>;
export type TeachResponse = z.infer<typeof TeachResponseSchema>;
export type AskRequest = z.infer<typeof AskRequestSchema>;
export type AskResponse = z.infer<typeof AskResponseSchema>;
export type CompleteRequest = z.infer<typeof CompleteRequestSchema>;
export type CompleteResponse = z.infer<typeof CompleteResponseSchema>;
export type SpeechRequest = z.infer<typeof SpeechRequestSchema>;
export type SpeechResponse = z.infer<typeof SpeechResponseSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
