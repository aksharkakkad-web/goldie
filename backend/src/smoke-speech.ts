// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import {
    ApiErrorResponseSchema, AskResponseSchema, OfferResponseSchema, SessionStateSchema, SpeechResponseSchema, TeachResponseSchema
} from '@goldie/contracts';
import * as dotenv from 'dotenv';
import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { buildApp } from './app';
import { loadConfig } from './config';
import { isMp3 } from './providers/speech';

/** Opt-in CLI only: spends existing credits for one lesson and one answer, unless cached. */
async function main(): Promise<void> {
    dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
    const config = loadConfig();
    if (!config.elevenLabsApiKey) {
        throw new Error('ELEVENLABS_API_KEY is required for the real-speech smoke test.');
    }
    const args = process.argv.slice(2);
    if (args.some(argument => argument !== '--play')) {
        throw new Error('Usage: yarn backend:smoke:speech [--play]');
    }
    const play = args.includes('--play');
    if (play && process.platform !== 'darwin') {
        throw new Error('--play uses macOS afplay; omit it and play the returned MP3 files with your local player.');
    }
    const app = await buildApp(config);
    let sessionId: string | undefined;
    const revision = Date.now();
    try {
        const address = await app.listen({ host: '127.0.0.1', port: 0 });
        const post = async (url: string, body: unknown): Promise<unknown> => {
            const response = await fetch(address + url, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
                signal: AbortSignal.timeout(config.speechTimeoutMs + 5000)
            });
            const result: unknown = await response.json();
            if (!response.ok) {
                const parsed = ApiErrorResponseSchema.safeParse(result);
                throw new Error(parsed.success ? parsed.data.error.message : `Speech smoke request failed (${response.status}).`);
            }
            return result;
        };
        const offer = OfferResponseSchema.parse(await post('/api/offer', {
            projectId: `stage1-speech-smoke-${revision}`, revision, referenceLessonId: 'webapp-architecture'
        }));
        const session = SessionStateSchema.parse(await post('/api/sessions', { offerId: offer.offerId, revision }));
        sessionId = session.sessionId;
        const phaseId = session.phases[0].id;
        const lesson = TeachResponseSchema.parse(await post('/api/teach', { sessionId, phaseId }));
        const answer = AskResponseSchema.parse(await post('/api/ask', { sessionId, phaseId, question: 'What is an API?' }));
        if (answer.kind !== 'answer') {
            throw new Error('Expected the prepared API answer.');
        }
        for (const [label, contentId] of [['lesson', lesson.contentId], ['answer', answer.contentId]]) {
            const speech = SpeechResponseSchema.parse(await post('/api/speech', { sessionId, contentId }));
            const response = await fetch(address + speech.audioUrl, { signal: AbortSignal.timeout(5000) });
            if (!response.ok || !isMp3(Buffer.from(await response.arrayBuffer()))) {
                throw new Error('Speech smoke returned invalid MP3 audio.');
            }
            const filename = path.join(config.dataDir, 'audio', speech.audioId + '.mp3');
            process.stdout.write(`${label}: ${filename}\n`);
            if (play) {
                await promisify(execFile)('afplay', [filename], { timeout: 120000 });
            }
        }
        process.stdout.write(`Real-speech smoke passed${play ? ' and both clips played' : ''}. Audio is cached for replay.\n`);
    } finally {
        if (sessionId) {
            await app.inject({ method: 'POST', url: '/api/complete', payload: { sessionId, status: 'dismissed', currentRevision: revision } });
        }
        await app.close();
    }
}

main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Real-speech smoke failed.'}\n`);
    process.exitCode = 1;
});
