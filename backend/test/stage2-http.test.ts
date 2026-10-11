// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { expect } from 'chai';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FastifyInstance } from 'fastify';
import { OfferResponseSchema, SessionStateSchema, TeachResponseSchema, AskResponseSchema, SpeechResponseSchema } from '@goldie/contracts';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { GeminiTeachingProvider } from '../src/providers/teaching';

describe('Stage 2 real HTTP integration with controlled upstream HTTP', () => {
    let directory: string;
    let app: FastifyInstance;
    let address: string;
    let plans: number;
    let teaches: number;
    let speechCalls: number;
    const upstream = createServer((req, res) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            if (req.url?.startsWith('/v1/text-to-speech/')) {
                speechCalls++;
                expect(req.headers['xi-api-key']).to.equal('speech-private-key');
                expect(JSON.parse(body).text).to.be.a('string');
                res.writeHead(200, { 'content-type': 'audio/mpeg' }); res.end('ID3dynamic-integration');
                return;
            }
            expect(req.headers['x-goog-api-key']).to.equal('gemini-private-key');
            expect(body).not.to.include('never-forward-this-profile-field');
            const context = JSON.parse(JSON.parse(body).contents[0].parts[0].text);
            let result;
            if (context.phaseId) {
                teaches++;
                expect(context.handoff).to.equal('Plan a web application with authenticated teams and membership storage.');
                result = {
                    explanation: 'Your supplied handoff plans authenticated teams. Conceptually, an API validates requests before changing membership data. '
                        + 'This is not verified implementation evidence.',
                    groundingStatus: 'inferred'
                };
            } else {
                plans++;
                const count = context.profile.level === 'intermediate' ? 1 : 3;
                result = { shouldOffer: true, reason: 'Teach the planned request boundary.', estimatedSeconds: count * 60,
                    phases: Array.from({ length: count }, (_, i) => ({ id: `dynamic-${i}`, title: `Architecture ${i + 1}`, objective: 'Understand the request boundary',
                        description: 'Follow data through the system', whyNow: 'The supplied plan adds teams',
                        sourceStatus: 'planned', depth: 'foundation', prerequisiteIds: [] })) };
            }
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(result) }] } }] }));
        });
    });
    before(async () => { await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve)); });
    after(async () => { upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve())); });
    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'goldie-stage2-http-'));
        plans = teaches = speechCalls = 0;
        await start();
    });
    afterEach(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });

    async function start(): Promise<void> {
        const baseUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
        app = await buildApp(loadConfig({ GOLDIE_DATA_DIR: directory, ELEVENLABS_API_KEY: 'speech-private-key', ELEVENLABS_BASE_URL: baseUrl }),
            new GeminiTeachingProvider({ apiKey: 'gemini-private-key', baseUrl, model: 'gemini-3.8-flash', timeoutMs: 1000 }));
        address = await app.listen({ host: '127.0.0.1', port: 0 });
    }
    async function post(url: string, payload: unknown, status = 200): Promise<unknown> {
        const response = await fetch(address + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
        expect(response.status).to.equal(status);
        const body: unknown = await response.json();
        expect(JSON.stringify(body)).not.to.match(/gemini-private-key|speech-private-key|never-forward-this-profile-field/);
        return body;
    }

    it('offers, freezes, speaks, asks, advances, restores and recaps through the real contracts', async () => {
        const offer = OfferResponseSchema.parse(await post('/api/offer', { projectId: 'live-http', revision: 4,
            handoff: 'Plan a web application with authenticated teams and membership storage.', profile: { level: 'beginner', extra: 'never-forward-this-profile-field' } }));
        expect(offer.previewTopics).to.deep.equal(['Architecture 1', 'Architecture 2', 'Architecture 3']);
        const session = SessionStateSchema.parse(await post('/api/sessions', { offerId: offer.offerId, revision: 4, handoff: 'replacement must be ignored' }));
        expect(plans).to.equal(1);
        const taught = TeachResponseSchema.parse(await post('/api/teach', { sessionId: session.sessionId, phaseId: 'dynamic-0' }));
        expect(taught.groundingStatus).to.equal('inferred');
        const audio = await Promise.all([post('/api/speech', { sessionId: session.sessionId, contentId: taught.contentId }),
            post('/api/speech', { sessionId: session.sessionId, contentId: taught.contentId })]);
        expect(audio[0]).to.deep.equal(audio[1]);
        expect(speechCalls).to.equal(1);
        const metadata = SpeechResponseSchema.parse(audio[0]);
        expect(Buffer.from(await (await fetch(address + metadata.audioUrl)).arrayBuffer()).toString()).to.equal('ID3dynamic-integration');
        await post(`/api/sessions/${session.sessionId}/actions`, { actionId: 'pause', action: 'pause' });
        const answer = AskResponseSchema.parse(await post('/api/ask', { sessionId: session.sessionId, phaseId: 'dynamic-0', question: 'What is an API?' }));
        expect(answer.resumePhaseId).to.equal('dynamic-0');
        expect(teaches).to.equal(1);
        await post(`/api/sessions/${session.sessionId}/actions`, { actionId: 'resume', action: 'resume' });
        await app.close(); await start();
        const restored = SessionStateSchema.parse(await (await fetch(`${address}/api/sessions/${session.sessionId}`)).json());
        expect(restored.phases).to.deep.equal(session.phases);
        expect(restored.activePhaseId).to.equal('dynamic-0');
        expect(await post('/api/teach', { sessionId: session.sessionId, phaseId: 'dynamic-0' })).to.deep.equal(taught);
        expect(teaches).to.equal(1);
        for (const [actionId, action, phaseId] of [['done', 'phase_completed', 'dynamic-0'], ['skip', 'skip', 'dynamic-1'], ['know', 'already_know', 'dynamic-2']]) {
            await post(`/api/sessions/${session.sessionId}/actions`, { actionId, action, phaseId });
        }
        const recap = await post('/api/complete', { sessionId: session.sessionId, status: 'completed', currentRevision: 99 });
        expect(recap).to.have.property('lastEvaluatedRevision', 4);
        expect(JSON.stringify(recap)).to.include('Covered:').and.include('Skipped:').and.include('not demonstrated mastery');
    });

    it('passes the normalized knowledge baseline to Gemini and accepts its variable roadmap', async () => {
        const offer = OfferResponseSchema.parse(await post('/api/offer', { projectId: 'intermediate', revision: 1,
            handoff: 'Plan a web application with authenticated teams and membership storage.', profile: { level: 'intermediate', knownConcepts: ['forms'] } }));
        const session = SessionStateSchema.parse(await post('/api/sessions', { offerId: offer.offerId, revision: 1 }));
        expect(session.phases).to.have.length(1);
    });

    it('returns an honest configured error rather than a prepared offer when Gemini has no key', async () => {
        await app.close();
        app = await buildApp(loadConfig({ GOLDIE_DATA_DIR: directory }));
        address = await app.listen({ host: '127.0.0.1', port: 0 });
        const result = await post('/api/offer', { projectId: 'missing-key', revision: 1, handoff: 'Add asynchronous work queues.' }, 503);
        expect(result).to.have.nested.property('error.code', 'GEMINI_NOT_CONFIGURED');
    });
});
