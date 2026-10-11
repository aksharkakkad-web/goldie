// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
/* eslint-disable no-null/no-null -- null is the required practice cache-miss wire contract. */
import { expect } from 'chai';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { FastifyInstance } from 'fastify';

describe('Stage 3 HTTP authorization and practice', () => {
    let directory: string;
    let app: FastifyInstance;
    let sessionId: string;
    const post = (url: string, payload: object) => app.inject({ method: 'POST', url, payload });
    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'goldie-stage3-http-'));
        app = await buildApp(loadConfig({ GOLDIE_DATA_DIR: directory }));
        const offer = (await post('/api/offer', { projectId: 'p', revision: 1, referenceLessonId: 'webapp-architecture' })).json();
        sessionId = (await post('/api/sessions', { offerId: offer.offerId, revision: 1 })).json().sessionId;
    });
    afterEach(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
    it('retrieves without generation, authorizes coverage, supports closed-session practice but not closed speech', async () => {
        const path = `/api/sessions/${sessionId}/phases/frontend/practice`;
        expect((await app.inject(path)).json()).to.equal(null);
        expect((await post(path, {})).json().error.code).to.equal('PRACTICE_NOT_AVAILABLE');
        await post('/api/teach', { sessionId, phaseId: 'frontend' });
        await post(`/api/sessions/${sessionId}/actions`, { actionId: 'covered', action: 'phase_completed', phaseId: 'frontend' });
        const batch = (await post(path, {})).json();
        expect(batch.questions).to.have.length(3);
        expect((await app.inject(path)).json()).to.deep.equal(batch);
        expect((await post(path, { studentResponse: 'PRIVATE' })).statusCode).to.equal(400);
        await post('/api/complete', { sessionId, status: 'dismissed', currentRevision: 1 });
        expect((await post(path, {})).json()).to.deep.equal(batch);
        expect((await post('/api/speech', { sessionId, contentId: batch.practiceId })).json().error.code).to.equal('SESSION_CLOSED');
    });
    it('authorizes transcription before configured tools and keeps the large audio body limit route-specific', async () => {
        const payload = { sessionId, phaseId: 'frontend', requestId: 'r', mimeType: 'audio/webm', dataBase64: 'GkXfowAAAA==' };
        expect((await post('/api/transcribe', { ...payload, sessionId: 'unknown' })).json().error.code).to.equal('SESSION_NOT_FOUND');
        expect((await post('/api/transcribe', payload)).json().error.code).to.equal('TRANSCRIPTION_NOT_CONFIGURED');
        expect((await post('/api/transcribe', { ...payload, phaseId: 'backend' })).json().error.code).to.equal('PHASE_CONFLICT');
        expect((await post('/api/ask', { sessionId, phaseId: 'frontend', question: 'x'.repeat(70000) })).statusCode).to.equal(413);
        expect((await post('/api/transcribe', { ...payload, dataBase64: Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...Array(80000).fill(0)]).toString('base64') })).json().error.code)
            .to.equal('TRANSCRIPTION_NOT_CONFIGURED');
    });
});
