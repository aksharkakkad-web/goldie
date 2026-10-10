// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { expect } from 'chai';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { FastifyInstance } from 'fastify';
import { ApiErrorResponseSchema, SessionStateSchema, SpeechResponseSchema } from '@goldie/contracts';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

describe('Stage 1 real HTTP journey', () => {
    let directory: string;
    let app: FastifyInstance;
    let address: string;
    let providerCalls: number;
    const upstream = createServer((request, response) => {
        providerCalls++;
        expect(request.headers['xi-api-key']).to.equal('never-expose-test-secret');
        response.writeHead(200, { 'content-type': 'audio/mpeg' });
        response.end('ID3http-speech');
    });
    before(async () => { await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve)); });
    after(async () => {
        upstream.closeAllConnections();
        await new Promise<void>(resolve => upstream.close(() => resolve()));
    });
    beforeEach(async () => {
        providerCalls = 0;
        directory = await mkdtemp(path.join(tmpdir(), 'goldie-http-test-'));
        app = await buildApp(loadConfig({
            GOLDIE_DATA_DIR: directory, ELEVENLABS_API_KEY: 'never-expose-test-secret',
            ELEVENLABS_BASE_URL: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`
        }));
        address = await app.listen({ host: '127.0.0.1', port: 0 });
    });
    afterEach(async () => {
        await app.close();
        await rm(directory, { recursive: true, force: true });
    });

    async function post(url: string, body: unknown, status = 200): Promise<Record<string, unknown>> {
        const response = await fetch(address + url, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
        });
        const result = await response.json() as Record<string, unknown>;
        expect(response.status, JSON.stringify(result)).to.equal(status);
        return result;
    }

    it('serves a full text-and-speech journey without mutating the frozen roadmap', async () => {
        const offer = await post('/api/offer', { projectId: 'teamflow', revision: 1, referenceLessonId: 'webapp-architecture' });
        expect(offer.shouldOffer).to.equal(true);
        expect(providerCalls).to.equal(0);
        const session = SessionStateSchema.parse(await post('/api/sessions', { offerId: offer.offerId, revision: 1 }));
        expect(session.phases).to.have.length(3);
        expect(providerCalls).to.equal(0);
        const [frontend, backend, database] = session.phases;
        const taught = await post('/api/teach', { sessionId: session.sessionId, phaseId: frontend.id });
        expect(taught.groundingStatus).to.equal('conceptual');
        const lessonAudio = SpeechResponseSchema.parse(await post('/api/speech', { sessionId: session.sessionId, contentId: taught.contentId }));
        const mp3 = await fetch(address + lessonAudio.audioUrl);
        expect(mp3.headers.get('content-type')).to.include('audio/mpeg');
        expect(Buffer.from(await mp3.arrayBuffer())).to.deep.equal(Buffer.from('ID3http-speech'));
        expect(providerCalls).to.equal(1);
        await post('/api/speech', { sessionId: session.sessionId, contentId: taught.contentId });
        expect(providerCalls).to.equal(1);
        await post(`/api/sessions/${session.sessionId}/actions`, { actionId: 'pause-1', action: 'pause' });
        const answer = await post('/api/ask', { sessionId: session.sessionId, phaseId: frontend.id, question: 'What is an API?' });
        expect(answer.resumePhaseId).to.equal(frontend.id);
        expect(answer.answer).to.be.a('string');
        await post('/api/speech', { sessionId: session.sessionId, contentId: answer.contentId });
        expect(providerCalls).to.equal(2);
        await post(`/api/sessions/${session.sessionId}/actions`, { actionId: 'resume-1', action: 'resume' });
        const progress = await post(`/api/sessions/${session.sessionId}/actions`, {
            actionId: 'complete-frontend', action: 'phase_completed', phaseId: frontend.id
        });
        expect(progress.activePhaseId).to.equal(backend.id);
        await post(`/api/sessions/${session.sessionId}/actions`, { actionId: 'skip-backend', action: 'skip', phaseId: backend.id });
        await post(`/api/sessions/${session.sessionId}/actions`, { actionId: 'know-database', action: 'already_know', phaseId: database.id });
        const recap = await post('/api/complete', {
            sessionId: session.sessionId, status: 'completed', currentRevision: 3,
            learningState: { completedIds: ['fabricated-mastery'] }
        });
        expect(recap.lastEvaluatedRevision).to.equal(1);
        expect(recap.recap).to.include('Covered:').and.include('Skipped:').and.include('not demonstrated mastery');
        expect(recap.recap).not.to.include('fabricated-mastery');
        const saved = SessionStateSchema.parse(await (await fetch(`${address}/api/sessions/${session.sessionId}`)).json());
        expect(saved.status).to.equal('completed');
        expect(saved.completedIds).to.deep.equal([frontend.id]);
        expect(saved.skippedIds).to.deep.equal([backend.id]);
        expect(saved.alreadyKnowIds).to.deep.equal([database.id]);
        expect(saved.phases).to.deep.equal(session.phases);
    });

    it('rejects unaccepted speech, arbitrary text, malformed JSON and disallowed browser origins', async () => {
        const missing = await post('/api/speech', { sessionId: 'missing', contentId: 'missing' }, 404);
        expect(ApiErrorResponseSchema.safeParse(missing).success).to.equal(true);
        await post('/api/speech', { text: 'Send private arbitrary material to the provider' }, 400);
        const malformed = await fetch(address + '/api/offer', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{broken'
        });
        expect(malformed.status).to.equal(400);
        expect(ApiErrorResponseSchema.safeParse(await malformed.json()).success).to.equal(true);
        const forbidden = await fetch(address + '/api/offer', {
            method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://attacker.example' },
            body: JSON.stringify({ projectId: 'p', revision: 1, referenceLessonId: 'webapp-architecture' })
        });
        expect(forbidden.status).to.equal(403);
        expect(providerCalls).to.equal(0);
    });

    it('keeps text and progress usable when speech is not configured', async () => {
        await app.close();
        app = await buildApp(loadConfig({ GOLDIE_DATA_DIR: directory }));
        address = await app.listen({ host: '127.0.0.1', port: 0 });
        const offer = await post('/api/offer', { projectId: 'teamflow', revision: 1, referenceLessonId: 'webapp-architecture' });
        const session = SessionStateSchema.parse(await post('/api/sessions', { offerId: offer.offerId, revision: 1 }));
        const lesson = await post('/api/teach', { sessionId: session.sessionId, phaseId: session.activePhaseId });
        const failed = ApiErrorResponseSchema.parse(await post('/api/speech', { sessionId: session.sessionId, contentId: lesson.contentId }, 503));
        expect(failed.error.code).to.equal('SPEECH_NOT_CONFIGURED');
        expect(failed.error.retryable).to.equal(false);
        expect(lesson.explanation).to.be.a('string').and.not.equal('');
        const ended = await post('/api/complete', { sessionId: session.sessionId, status: 'dismissed', currentRevision: 1 });
        expect(ended.recap).to.include('early');
    });
});
