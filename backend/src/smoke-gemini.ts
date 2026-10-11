// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import * as dotenv from 'dotenv';
import { FastifyInstance } from 'fastify';
import { ApiErrorResponseSchema, AskResponseSchema, OfferResponseSchema, SessionStateSchema, SpeechResponseSchema, TeachResponseSchema } from '@goldie/contracts';
import { buildApp } from './app';
import { BackendConfig, loadConfig } from './config';
import { isMp3 } from './providers/speech';
import { GEMINI_PROMPT_VERSION } from './providers/teaching';

const HANDOFF = [
    '# TeamFlow supplied sample handoff',
    'Revision: 1. Status: planned; no implementation has been verified.',
    'Build a Next.js team-management web app: browser forms and UI state call server APIs.',
    'The API validates input and authenticated team permissions. PostgreSQL persists teams and memberships.',
    'Explain the logical architecture and the create-team request flow; frontend and server code can share one deployment.'
].join('\n');
const CHANGED = HANDOFF + '\nNew architecture: add Stripe billing webhooks, durable idempotency keys and a background job queue with worker retries.';

export interface GeminiSmokeOptions { speech: boolean; play: boolean }

/** Explicit opt-in only. Controlled HTTP tests can supply an app without calling external providers. */
export async function runGeminiSmoke(app: FastifyInstance, config: BackendConfig, options: GeminiSmokeOptions): Promise<string> {
    const runId = randomUUID();
    const sessions: string[] = [];
    const timings: Array<{ operation: string; elapsedMs: number }> = [];
    const report: Array<{ scenario: string; offer: unknown; session?: unknown; lesson?: unknown; expanded?: unknown }> = [];
    const post = async (url: string, payload: unknown): Promise<unknown> => {
        const started = performance.now();
        process.stdout.write(`Stage 2 smoke: ${url} starting\n`);
        const response = await app.inject({ method: 'POST', url, payload: payload as Record<string, unknown> });
        const elapsedMs = Math.round(performance.now() - started);
        timings.push({ operation: url, elapsedMs });
        const body: unknown = response.json();
        if (response.statusCode !== 200) {
            const parsed = ApiErrorResponseSchema.safeParse(body);
            throw new Error(parsed.success
                ? `${url} failed after ${elapsedMs} ms (${parsed.data.error.code}): ${parsed.data.error.message}`
                : `${url} failed after ${elapsedMs} ms.`);
        }
        process.stdout.write(`Stage 2 smoke: ${url} succeeded in ${elapsedMs} ms\n`);
        return body;
    };
    try {
        for (const [scenario, handoff, profile] of [
            ['beginner', HANDOFF, { level: 'beginner' }],
            ['intermediate', HANDOFF, { level: 'intermediate', knownConcepts: ['frontend forms', 'HTTP APIs', 'relational databases'] }],
            ['changed-architecture', CHANGED, { level: 'beginner' }],
            ['cosmetic', '# Supplied handoff\nOnly change: make the signup button blue. No new architecture or behavior.', { level: 'beginner' }]
        ] as const) {
            const offer = OfferResponseSchema.parse(await post('/api/offer', { projectId: `stage2-smoke-${runId}-${scenario}`, revision: 1, handoff, profile }));
            if (scenario === 'cosmetic') {
                if (offer.shouldOffer) { throw new Error('Cosmetic task offered a lesson. Inspect the planner before claiming the Stage 2 gate.'); }
                report.push({ scenario, offer });
                continue;
            }
            if (!offer.shouldOffer || !offer.offerId) { throw new Error(`No useful lesson was offered for ${scenario}.`); }
            const session = SessionStateSchema.parse(await post('/api/sessions', { offerId: offer.offerId, revision: 1 }));
            sessions.push(session.sessionId);
            const lesson = TeachResponseSchema.parse(await post('/api/teach', { sessionId: session.sessionId, phaseId: session.activePhaseId }));
            let expanded;
            if (scenario === 'beginner') {
                expanded = TeachResponseSchema.parse(await post('/api/teach', { sessionId: session.sessionId, phaseId: session.activePhaseId, detail: 'expanded' }));
            }
            report.push({ scenario, offer, session, lesson, expanded });
            if (options.speech && scenario === 'beginner') {
                await post(`/api/sessions/${session.sessionId}/actions`, { actionId: 'pause-for-question', action: 'pause' });
                const answer = AskResponseSchema.parse(await post('/api/ask', {
                    sessionId: session.sessionId, phaseId: session.activePhaseId, question: 'What is an API?'
                }));
                if (answer.kind !== 'answer') { throw new Error('Expected a conversational Gemini answer.'); }
                for (const [label, contentId] of [['Gemini lesson', lesson.contentId], ['Gemini answer', answer.contentId]]) {
                    const speech = SpeechResponseSchema.parse(await post('/api/speech', { sessionId: session.sessionId, contentId }));
                    const audio = await app.inject({ method: 'GET', url: speech.audioUrl });
                    if (audio.statusCode !== 200 || !isMp3(audio.rawPayload)) { throw new Error('Dynamic speech smoke returned invalid MP3.'); }
                    const audioFilename = path.join(config.dataDir, 'audio', speech.audioId + '.mp3');
                    process.stdout.write(`${label}: ${audioFilename}\n`);
                    if (options.play) { await promisify(execFile)('afplay', [audioFilename], { timeout: 120000 }); }
                }
                await post(`/api/sessions/${session.sessionId}/actions`, { actionId: 'resume-after-answer', action: 'resume' });
            }
        }
        const signatures = report.slice(0, 3).map(entry => {
            const session = SessionStateSchema.parse(entry.session);
            const lesson = TeachResponseSchema.parse(entry.lesson);
            return JSON.stringify({ phases: session.phases.map(({ title, objective, description }) => ({ title, objective, description })), explanation: lesson.explanation });
        });
        if (new Set(signatures).size !== 3) { throw new Error('Contexts returned identical teaching. Inspect adaptation before claiming the Stage 2 gate.'); }
        const filename = path.join(config.dataDir, `stage2-smoke-${runId}.json`);
        await writeFile(filename, JSON.stringify({ model: config.geminiModel, promptVersion: GEMINI_PROMPT_VERSION, timings, scenarios: report,
            reviewRequired: 'Compare coverage, depth and project relevance; wording differences alone do not prove meaningful adaptation.' }, undefined, 2),
        { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        return filename;
    } finally {
        for (const sessionId of sessions) {
            await app.inject({ method: 'POST', url: '/api/complete', payload: { sessionId, status: 'dismissed', currentRevision: 1 } });
        }
    }
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    if (args.some(arg => !['--speech', '--play'].includes(arg))) {
        throw new Error('Usage: yarn backend:smoke:gemini [--speech] [--play]');
    }
    dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
    const loaded = loadConfig();
    if (!loaded.geminiApiKey) { throw new Error('GEMINI_API_KEY is required for the live Stage 2 smoke test.'); }
    const play = args.includes('--play');
    const speech = play || args.includes('--speech');
    if (speech && !loaded.elevenLabsApiKey) { throw new Error('ELEVENLABS_API_KEY is required for the Stage 2 speech smoke test.'); }
    if (play && process.platform !== 'darwin') { throw new Error('--play requires macOS afplay. Use --speech and your local player instead.'); }
    // Separate sessions/cache from a running development backend. Do not run two smoke processes together.
    const config = { ...loaded, dataDir: path.join(loaded.dataDir, 'stage2-smoke') };
    const app = await buildApp(config);
    try {
        const filename = await runGeminiSmoke(app, config, { speech, play });
        process.stdout.write(`Live Stage 2 smoke generated a report: ${filename}\nReview semantic adaptation before marking Stage 2 complete.\n`);
    } finally { await app.close(); }
}

if (require.main === module) {
    main().catch(error => {
        process.stderr.write(`${error instanceof Error ? error.message : 'Stage 2 smoke failed.'}\n`);
        process.exitCode = 1;
    });
}
