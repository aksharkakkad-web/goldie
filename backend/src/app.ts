import cors from '@fastify/cors';
import { HealthResponse, HealthResponseSchema } from '@goldie/contracts';
import Fastify, { FastifyInstance } from 'fastify';
import { BackendConfig } from './config';

export async function buildApp(config: BackendConfig): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });

    await app.register(cors, {
        origin: (origin, callback) => {
            callback(null, origin === undefined || origin === config.allowedOrigin);
        }
    });

    app.get('/health', async (): Promise<HealthResponse> =>
        HealthResponseSchema.parse({ ok: true })
    );

    return app;
}
