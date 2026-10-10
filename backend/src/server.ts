/********************************************************************************
 * Copyright (C) 2026 Akshar Kakkad and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as dotenv from 'dotenv';
import * as path from 'node:path';
import { buildApp } from './app';
import { loadConfig } from './config';

async function main(): Promise<void> {
    dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
    const config = loadConfig();
    const app = await buildApp(config);

    const close = async (): Promise<void> => {
        await app.close();
    };

    process.once('SIGINT', close);
    process.once('SIGTERM', close);

    await app.listen({ host: config.host, port: config.port });
    process.stdout.write(`Goldie backend listening at http://${config.host}:${config.port}\n`);
}

main().catch(error => {
    const message = error instanceof Error ? error.message : 'Unknown startup error';
    process.stderr.write(`Goldie backend failed to start: ${message}\n`);
    process.exitCode = 1;
});
