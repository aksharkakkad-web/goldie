/********************************************************************************
 * Copyright (C) 2026 Akshar Kakkad and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { z } from 'zod';

const IdentifierSchema = z.string().trim().min(1);
const RevisionSchema = z.number().int().nonnegative();

export const KnowledgeProfileSchema = z.record(z.string(), z.unknown());

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
    handoff: z.string(),
    profile: KnowledgeProfileSchema
}).strict();

export const OfferResponseSchema = z.object({
    shouldOffer: z.boolean(),
    previewTopics: z.array(z.string().trim().min(1)),
    offerId: IdentifierSchema.optional()
}).strict();

export const SessionRequestSchema = z.object({
    offerId: IdentifierSchema,
    revision: RevisionSchema,
    handoff: z.string(),
    profile: KnowledgeProfileSchema
}).strict();

export const SessionResponseSchema = z.object({
    sessionId: IdentifierSchema,
    snapshotRevision: RevisionSchema,
    phases: z.array(PhaseSchema)
}).strict();

export const TeachRequestSchema = z.object({
    sessionId: IdentifierSchema,
    phaseId: IdentifierSchema,
    handoff: z.string(),
    profile: KnowledgeProfileSchema
}).strict();

export const TeachResponseSchema = z.object({
    explanation: z.string(),
    groundingStatus: z.enum(['conceptual', 'inferred', 'observed']),
    audioUrl: z.url().optional()
}).strict();

export const AskRequestSchema = z.object({
    sessionId: IdentifierSchema,
    phaseId: IdentifierSchema,
    question: z.string().trim().min(1),
    handoff: z.string(),
    sources: z.array(SourceExcerptSchema).optional()
}).strict();

export const AskResponseSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('answer'),
        answer: z.string(),
        resumePhaseId: IdentifierSchema
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
    handoff: z.string(),
    learningState: z.record(z.string(), z.unknown())
}).strict();

export const CompleteResponseSchema = z.object({
    recap: z.string(),
    catchupOffer: OfferResponseSchema.optional(),
    lastEvaluatedRevision: RevisionSchema
}).strict();

export const SpeechRequestSchema = z.object({
    text: z.string().trim().min(1)
}).strict();

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type OfferRequest = z.infer<typeof OfferRequestSchema>;
export type OfferResponse = z.infer<typeof OfferResponseSchema>;
export type SessionRequest = z.infer<typeof SessionRequestSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type TeachRequest = z.infer<typeof TeachRequestSchema>;
export type TeachResponse = z.infer<typeof TeachResponseSchema>;
export type AskRequest = z.infer<typeof AskRequestSchema>;
export type AskResponse = z.infer<typeof AskResponseSchema>;
export type CompleteRequest = z.infer<typeof CompleteRequestSchema>;
export type CompleteResponse = z.infer<typeof CompleteResponseSchema>;
export type SpeechRequest = z.infer<typeof SpeechRequestSchema>;
