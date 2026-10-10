/********************************************************************************
 * Copyright (C) 2026 Akshar Kakkad and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import cors from '@fastify/cors';
import { HealthResponse, HealthResponseSchema } from '@goldie/contracts';
import Fastify, { FastifyInstance } from 'fastify';
import { BackendConfig } from './config';

export async function buildApp(config: BackendConfig): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });

    await app.register(cors, {
        origin: (origin: string | undefined): Promise<boolean> =>
            Promise.resolve(origin === undefined || origin === config.allowedOrigin)
    });

    app.get('/health', async (): Promise<HealthResponse> =>
        HealthResponseSchema.parse({ ok: true })
    );

    return app;
}
