// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { expect } from 'chai';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

describe('real-speech smoke CLI safety', () => {
    it('fails before creating sessions or spending credits when credentials are absent', () => {
        const result = spawnSync(process.execPath, [path.resolve(__dirname, '../src/smoke-speech.js')], {
            encoding: 'utf8', env: { ...process.env, ELEVENLABS_API_KEY: '' }
        });
        expect(result.status).to.equal(1);
        expect(result.stdout).to.equal('');
        expect(result.stderr).to.equal('ELEVENLABS_API_KEY is required for the real-speech smoke test.\n');
    });
});
