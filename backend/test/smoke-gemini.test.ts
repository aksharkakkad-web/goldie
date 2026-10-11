// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { expect } from 'chai';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { runGeminiSmoke } from '../src/smoke-gemini';
import { TeachingProvider } from '../src/providers/teaching';
import { ApiError } from '../src/errors';

function cliEnvironment(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env, GEMINI_API_KEY: '', ELEVENLABS_API_KEY: '' };
    // Lerna/terminal color flags can otherwise prepend a Node warning to CLI stderr.
    delete env.FORCE_COLOR;
    delete env.NO_COLOR;
    return env;
}

describe('Stage 2 smoke CLI safety', () => {
    it('fails before generating or spending credits when Gemini credentials are missing', () => {
        const result = spawnSync(process.execPath, [resolve(__dirname, '../src/smoke-gemini.js')], {
            encoding: 'utf8', env: cliEnvironment()
        });
        expect(result.status).to.equal(1);
        expect(result.stderr.trim()).to.equal('GEMINI_API_KEY is required for the live Stage 2 smoke test.');
        expect(result.stdout).to.equal('');
    });
    it('rejects unknown flags before attempting provider access', () => {
        const result = spawnSync(process.execPath, [resolve(__dirname, '../src/smoke-gemini.js'), '--upload-repo'], {
            encoding: 'utf8', env: cliEnvironment()
        });
        expect(result.status).to.equal(1);
        expect(result.stderr.trim()).to.equal('Usage: yarn backend:smoke:gemini [--speech] [--play]');
    });

    it('exercises all sample contexts, saves reviewable output and closes every accepted lesson', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'goldie-gemini-smoke-test-'));
        const config = loadConfig({ GOLDIE_DATA_DIR: directory });
        const provider: TeachingProvider = {
            identity: 'controlled-smoke:v1',
            plan: async input => {
                const cosmetic = input.handoff.includes('make the signup button blue');
                const title = input.handoff.includes('Stripe') ? 'Billing idempotency' : input.profile.level === 'intermediate' ? 'Permission boundaries' : 'Web app foundations';
                return { shouldOffer: !cosmetic, reason: 'Controlled integration response', estimatedSeconds: cosmetic ? 0 : 60,
                    phases: cosmetic ? [] : [{ id: 'custom', title, objective: `Understand ${title}`, description: 'A conceptual architecture lesson',
                        whyNow: 'Relevant supplied change', sourceStatus: 'planned', depth: 'foundation', prerequisiteIds: [] }] };
            },
            teach: async input => ({ explanation: `Conceptual ${input.detail}: ${input.plan.phases[0].title}. No code inspected.`, groundingStatus: 'conceptual' })
        };
        const app = await buildApp(config, provider);
        try {
            const filename = await runGeminiSmoke(app, config, { play: false, speech: false });
            const report = JSON.parse(await readFile(filename, 'utf8'));
            expect(report.scenarios.map((scenario: { scenario: string }) => scenario.scenario))
                .to.deep.equal(['beginner', 'intermediate', 'changed-architecture', 'cosmetic']);
            expect(report.scenarios[0].expanded.explanation).to.include('expanded');
            expect(report.scenarios[1].session.phases[0].title).to.equal('Permission boundaries');
            expect(report.scenarios[2].session.phases[0].title).to.equal('Billing idempotency');
            expect(report.scenarios[3].offer.shouldOffer).to.equal(false);
            expect(report.reviewRequired).to.include('wording differences alone');
            expect(report.timings.map((timing: { operation: string }) => timing.operation)).to.deep.equal([
                '/api/offer', '/api/sessions', '/api/teach', '/api/teach',
                '/api/offer', '/api/sessions', '/api/teach',
                '/api/offer', '/api/sessions', '/api/teach', '/api/offer'
            ]);
            expect(report.timings.every((timing: { elapsedMs: number }) => Number.isFinite(timing.elapsedMs) && timing.elapsedMs >= 0)).to.equal(true);
            const store = JSON.parse(await readFile(join(directory, 'sessions.json'), 'utf8'));
            expect(store.sessions).to.have.length(3);
            expect(store.sessions.every((session: { state: { status: string } }) => session.state.status === 'dismissed')).to.equal(true);
        } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
    });

    it('identifies the failing operation and elapsed time without retrying a provider failure', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'goldie-gemini-smoke-failure-'));
        const config = loadConfig({ GOLDIE_DATA_DIR: directory });
        let calls = 0;
        const app = await buildApp(config, {
            identity: 'controlled-timeout:v1',
            plan: async () => { calls++; throw new ApiError(504, 'GEMINI_TIMEOUT', 'Gemini generation timed out. Retry manually.', true); },
            teach: async () => { throw new Error('Teaching must not start.'); }
        });
        try {
            let caught;
            try { await runGeminiSmoke(app, config, { play: false, speech: false }); } catch (error) { caught = error; }
            expect(caught).to.be.instanceOf(Error);
            expect((caught as Error).message).to.match(/^\/api\/offer failed after \d+ ms \(GEMINI_TIMEOUT\)/);
            expect(calls).to.equal(1);
        } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
    });
});
