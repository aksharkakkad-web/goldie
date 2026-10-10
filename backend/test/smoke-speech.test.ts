// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { expect } from 'chai';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

describe('real-speech smoke CLI safety', () => {
    it('fails before creating sessions or spending credits when credentials are absent', () => {
        // Lerna sets FORCE_COLOR while some terminals set NO_COLOR. Their Node warning
        // must not become part of the child CLI's stderr contract under test.
        const env: NodeJS.ProcessEnv = { ...process.env, ELEVENLABS_API_KEY: '' };
        delete env.FORCE_COLOR;
        delete env.NO_COLOR;
        const result = spawnSync(process.execPath, [path.resolve(__dirname, '../src/smoke-speech.js')], {
            encoding: 'utf8', env
        });
        expect(result.status).to.equal(1);
        expect(result.stdout).to.equal('');
        expect(result.stderr).to.equal('ELEVENLABS_API_KEY is required for the real-speech smoke test.\n');
    });
});
