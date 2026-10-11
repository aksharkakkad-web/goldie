// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { expect } from 'chai';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('Stage 3 live smoke opt-in', () => {
    it('refuses provider use without an explicit live flag and valid audio argument', () => {
        const result = spawnSync(process.execPath, [resolve(__dirname, '../src/smoke-stage3.js')], { encoding: 'utf8' });
        expect(result.status).to.equal(1);
        expect(result.stderr).to.include('Usage:');
        expect(result.stdout).to.equal('');
    });
    it('rejects missing server credentials before opening a lesson or making paid requests', () => {
        const result = spawnSync(process.execPath, [resolve(__dirname, '../src/smoke-stage3.js'), '--live', '--audio', '/nonexistent/audio.webm'], {
            encoding: 'utf8', env: { ...process.env, GEMINI_API_KEY: '', ELEVENLABS_API_KEY: '' }
        });
        expect(result.status).to.equal(1);
        expect(result.stderr).to.include('Gemini and ElevenLabs credentials are required');
        expect(result.stdout).to.equal('');
    });
});
