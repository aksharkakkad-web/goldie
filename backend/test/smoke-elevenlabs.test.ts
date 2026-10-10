/********************************************************************************
 * Copyright (C) 2026 Akshar Kakkad and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { expect } from 'chai';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

describe('ElevenLabs smoke CLI', () => {
    it('prints only the actionable error when the key is missing', () => {
        const result = spawnSync(process.execPath, [path.resolve(__dirname, '../src/smoke-elevenlabs.js')], {
            encoding: 'utf8',
            env: {
                ...process.env,
                ELEVENLABS_API_KEY: ''
            }
        });

        expect(result.status).to.equal(1);
        expect(result.stdout).to.equal('');
        expect(result.stderr).to.equal('ELEVENLABS_API_KEY is required\n');
    });
});
