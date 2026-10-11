/********************************************************************************
 * Copyright (C) 2026 Akshar Kakkad and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { expect } from 'chai';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('GET /health', () => {
    let directory: string;
    beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'goldie-health-')); });
    afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

    it('returns the exact shared health contract', async () => {
        const app = await buildApp(loadConfig({ GOLDIE_DATA_DIR: directory }));
        const response = await app.inject({ method: 'GET', url: '/health' });
        await app.close();
        expect(response.statusCode).to.equal(200);
        expect(response.json()).to.deep.equal({ ok: true });
    });

    it('allows only the configured local origin', async () => {
        const app = await buildApp(loadConfig({
            GOLDIE_DATA_DIR: directory,
            GOLDIE_ALLOWED_ORIGIN: 'http://127.0.0.1:3000'
        }));
        const allowed = await app.inject({
            method: 'GET',
            url: '/health',
            headers: { origin: 'http://127.0.0.1:3000' }
        });
        const rejected = await app.inject({
            method: 'GET',
            url: '/health',
            headers: { origin: 'https://attacker.example' }
        });
        await app.close();
        expect(allowed.headers['access-control-allow-origin']).to.equal('http://127.0.0.1:3000');
        expect(rejected.headers['access-control-allow-origin']).to.equal(undefined);
    });
});
