// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import * as dotenv from 'dotenv';
import { AskResponseSchema, OfferResponseSchema, PracticeBatchSchema, SessionStateSchema,
    SpeechResponseSchema, TeachResponseSchema, TranscribeResponseSchema } from '@goldie/contracts';
import { buildApp } from './app';
import { loadConfig } from './config';
import { isMp3 } from './providers/speech';

/** Explicit real-provider opt-in. Input audio stays local; only recognized text is sent to Gemini. */
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    let audioPath: string | undefined;
    let followupPath: string | undefined;
    let live = false;
    let play = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--live') { live = true;
        } else if (args[i] === '--play') { play = true;
        } else if (args[i] === '--audio') { audioPath = args[++i];
        } else if (args[i] === '--followup-audio') { followupPath = args[++i];
        } else { throw new Error('Usage: yarn backend:smoke:stage3 --live --audio /absolute/question.webm [--followup-audio /absolute/followup.webm] [--play]'); }
    }
    if (!live || !audioPath || !isAbsolute(audioPath) || (followupPath && !isAbsolute(followupPath))) {
        throw new Error('Usage: yarn backend:smoke:stage3 --live --audio /absolute/question.webm [--followup-audio /absolute/followup.webm] [--play]');
    }
    dotenv.config({ path: resolve(__dirname, '../../.env'), quiet: true });
    const loaded = loadConfig();
    if (!loaded.geminiApiKey || !loaded.elevenLabsApiKey) { throw new Error('Gemini and ElevenLabs credentials are required in the ignored backend environment.'); }
    if (play && process.platform !== 'darwin') { throw new Error('--play requires macOS afplay.'); }
    const recordings = await Promise.all([audioPath, ...(followupPath ? [followupPath] : [])].map(async filename => {
        const bytes = await readFile(filename);
        if (!bytes.length || bytes.length > 2 * 1024 * 1024) { throw new Error('Smoke audio must be WebM, at most 2 MiB.'); }
        return bytes.toString('base64');
    }));
    const config = { ...loaded, dataDir: join(loaded.dataDir, 'stage3-smoke') };
    const app = await buildApp(config);
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const timings: { operation: string; elapsedMs: number }[] = [];
    const runId = randomUUID();
    let sessionId: string | undefined;
    const post = async (url: string, payload: object): Promise<unknown> => {
        const start = performance.now();
        const response = await fetch(address + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
        const elapsedMs = Math.round(performance.now() - start);
        timings.push({ operation: url, elapsedMs });
        const body = await response.json() as { error?: { code?: string } };
        if (!response.ok) { throw new Error(`${url} failed (${body.error?.code ?? 'UNKNOWN'}) after ${elapsedMs} ms. No automatic retry was made.`); }
        process.stdout.write(`${url}: ${elapsedMs} ms\n`);
        return body;
    };
    try {
        const offer = OfferResponseSchema.parse(await post('/api/offer', { projectId: `stage3-smoke-${runId}`, revision: 1,
            handoff: 'Plan a Next.js team app: browser forms call server APIs which validate authenticated permissions '
                + 'before writing teams and memberships to PostgreSQL. No implementation has been verified.',
            profile: { level: 'beginner' } }));
        if (!offer.shouldOffer) { throw new Error('No lesson offered for the explicit engineering smoke context.'); }
        const session = SessionStateSchema.parse(await post('/api/sessions', { offerId: offer.offerId, revision: 1 }));
        sessionId = session.sessionId;
        const phaseId = session.activePhaseId!;
        const lesson = TeachResponseSchema.parse(await post('/api/teach', { sessionId, phaseId }));
        const speak = async (contentId: string): Promise<void> => {
            const speech = SpeechResponseSchema.parse(await post('/api/speech', { sessionId, contentId }));
            const bytes = Buffer.from(await (await fetch(address + speech.audioUrl)).arrayBuffer());
            if (!isMp3(bytes)) { throw new Error('Invalid live MP3 audio.'); }
            if (play) { await promisify(execFile)('afplay', [join(config.dataDir, 'audio', `${speech.audioId}.mp3`)], { timeout: 120000 }); }
        };
        await speak(lesson.contentId);
        await post(`/api/sessions/${sessionId}/actions`, { actionId: 'pause', action: 'pause' });
        const answers = [];
        for (const [index, dataBase64] of recordings.entries()) {
            const requestId = `voice-${index}-${runId}`;
            const transcript = TranscribeResponseSchema.parse(await post('/api/transcribe', { sessionId, phaseId, requestId, mimeType: 'audio/webm', dataBase64 }));
            const intent = { sessionId, phaseId, requestId, question: transcript.text };
            const answer = AskResponseSchema.parse(await post('/api/ask', intent));
            if (answer.kind !== 'answer' || answer.resumePhaseId !== phaseId) { throw new Error('Conversation lost the resume phase.'); }
            const recovered = await post('/api/ask', intent);
            if (JSON.stringify(recovered) !== JSON.stringify(answer)) { throw new Error('Lost-response retry did not recover the identical answer.'); }
            await speak(answer.contentId);
            answers.push({ transcript: transcript.text, answer });
        }
        await post(`/api/sessions/${sessionId}/actions`, { actionId: 'resume', action: 'resume' });
        await post(`/api/sessions/${sessionId}/actions`, { actionId: 'covered', action: 'phase_completed', phaseId });
        const practicePath = `/api/sessions/${sessionId}/phases/${phaseId}/practice`;
        // eslint-disable-next-line no-null/no-null -- GET practice returns an explicit null cache miss.
        if (await (await fetch(address + practicePath)).json() !== null) { throw new Error('Practice generated before opt-in.'); }
        const practice = PracticeBatchSchema.parse(await post(practicePath, {}));
        const recap = await post('/api/complete', { sessionId, status: 'dismissed', currentRevision: 1 });
        if (JSON.stringify(await (await fetch(address + practicePath)).json()) !== JSON.stringify(practice)) { throw new Error('Closed session lost practice.'); }
        const reportPath = join(config.dataDir, `stage3-smoke-${runId}.json`);
        await writeFile(reportPath, JSON.stringify({ model: config.geminiModel, timings, session, lesson, answers, practice, recap,
            limits: 'Synthetic/local input only unless a human recorded the supplied file. '
                + 'Does not verify renderer recording, focus cleanup or exact clip resume.' }, undefined, 2),
        { mode: 0o600, flag: 'wx' });
        process.stdout.write(`Stage 3 live backend smoke passed. Private report: ${reportPath}\n`);
    } finally {
        if (sessionId) { await app.inject({ method: 'POST', url: '/api/complete', payload: { sessionId, status: 'dismissed', currentRevision: 1 } }); }
        await app.close();
    }
}
if (require.main === module) {
    main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : 'Stage 3 smoke failed.'}\n`); process.exitCode = 1; });
}
