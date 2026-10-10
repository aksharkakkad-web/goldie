/********************************************************************************
 * Copyright (C) 2026 Akshar Kakkad and others.
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { FastifyInstance } from 'fastify';
import {
    AskRequestSchema, AskResponseSchema, CompleteRequestSchema, CompleteResponseSchema,
    IdentifierSchema, OfferRequestSchema, OfferResponseSchema, SessionActionRequestSchema,
    SessionActionResponseSchema, SessionRequestSchema, SessionResponseSchema,
    SessionStateSchema, TeachRequestSchema, TeachResponseSchema
} from '@goldie/contracts';
import { z } from 'zod';
import { ApiError } from './errors';
import { LessonService } from './lessons';

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
    const result = schema.safeParse(body);
    if (!result.success) { throw new ApiError(400, 'INVALID_REQUEST', 'Invalid request.'); }
    return result.data;
}

export function registerLessonRoutes(app: FastifyInstance, lessons: LessonService): void {
    app.post('/api/offer', async request => OfferResponseSchema.parse(await lessons.offer(parse(OfferRequestSchema, request.body))));
    app.post('/api/sessions', async request => SessionResponseSchema.parse(await lessons.createSession(parse(SessionRequestSchema, request.body))));
    app.get<{ Params: { sessionId: string } }>('/api/sessions/:sessionId', async request =>
        SessionStateSchema.parse(await lessons.getSession(parse(IdentifierSchema, request.params.sessionId))));
    app.post('/api/teach', async request => TeachResponseSchema.parse(await lessons.teach(parse(TeachRequestSchema, request.body))));
    app.post('/api/ask', async request => AskResponseSchema.parse(await lessons.ask(parse(AskRequestSchema, request.body))));
    app.post<{ Params: { sessionId: string } }>('/api/sessions/:sessionId/actions', async request =>
        SessionActionResponseSchema.parse(await lessons.action(parse(IdentifierSchema, request.params.sessionId), parse(SessionActionRequestSchema, request.body))));
    app.post('/api/complete', async request => CompleteResponseSchema.parse(await lessons.complete(parse(CompleteRequestSchema, request.body))));
}
