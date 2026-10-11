/********************************************************************************
 * Copyright (C) 2026 Akshar Kakkad and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import cors from '@fastify/cors';
import { ApiErrorResponseSchema, HealthResponse, HealthResponseSchema, SpeechRequestSchema, SpeechResponseSchema } from '@goldie/contracts';
import Fastify, { FastifyInstance } from 'fastify';
import * as path from 'node:path';
import { BackendConfig } from './config';
import { ApiError } from './errors';
import { registerLessonRoutes } from './lesson-routes';
import { LessonService } from './lessons';
import { SpeechProviderError } from './providers/speech';
import { GeminiTeachingProvider, TeachingProvider } from './providers/teaching';
import { SpeechService } from './speech';

export async function buildApp(config: BackendConfig, teachingProvider: TeachingProvider = new GeminiTeachingProvider({
    apiKey: config.geminiApiKey, model: config.geminiModel, timeoutMs: config.geminiTimeoutMs
})): Promise<FastifyInstance> {
    const lessons = await LessonService.open(config.dataDir, teachingProvider);
    const speech = new SpeechService(path.join(config.dataDir, 'audio'), {
        apiKey: config.elevenLabsApiKey, baseUrl: config.elevenLabsBaseUrl,
        voiceId: config.elevenLabsVoiceId, modelId: config.elevenLabsModelId, timeoutMs: config.speechTimeoutMs
    }, (sessionId, contentId) => lessons.publishedText(sessionId, contentId));
    const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });

    app.addHook('onRequest', async request => {
        const origin = request.headers.origin;
        if (origin !== undefined && origin !== config.allowedOrigin) {
            throw new ApiError(403, 'ORIGIN_FORBIDDEN', 'Use the local IDE transport or the configured browser origin.');
        }
    });

    app.setErrorHandler((error, _request, reply) => {
        let statusCode = 500;
        let code = 'INTERNAL_ERROR';
        let message = 'The teaching service could not complete this request.';
        let retryable = false;
        if (error instanceof ApiError) {
            ({ statusCode, code, message, retryable } = error);
        } else if (error instanceof SpeechProviderError) {
            statusCode = 503;
            ({ code, message, retryable } = error);
        } else if (error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
            && error.statusCode >= 400 && error.statusCode < 500) {
            statusCode = error.statusCode;
            code = 'INVALID_REQUEST';
            message = 'Invalid request.';
        }
        reply.code(statusCode).send(ApiErrorResponseSchema.parse({ error: { code, message, retryable } }));
    });
    app.setNotFoundHandler((_request, reply) => {
        reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found.', retryable: false } });
    });

    await app.register(cors, {
        origin: (origin: string | undefined): Promise<boolean> =>
            Promise.resolve(origin === undefined || origin === config.allowedOrigin)
    });

    app.get('/health', async (): Promise<HealthResponse> =>
        HealthResponseSchema.parse({ ok: true })
    );

    registerLessonRoutes(app, lessons);
    app.post('/api/speech', async request => {
        const parsed = SpeechRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            throw new ApiError(400, 'INVALID_REQUEST', 'Invalid request.');
        }
        return SpeechResponseSchema.parse(await speech.create(parsed.data));
    });
    app.get<{ Params: { audioId: string } }>('/api/audio/:audioId', async (request, reply) => {
        const bytes = await speech.audio(request.params.audioId);
        return reply.type('audio/mpeg').header('Cache-Control', 'private, max-age=86400')
            .header('X-Content-Type-Options', 'nosniff').send(bytes);
    });

    return app;
}
