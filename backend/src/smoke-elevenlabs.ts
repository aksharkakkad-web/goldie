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
import { loadConfig } from './config';
import { checkElevenLabsCredential } from './providers/elevenlabs';

async function main(): Promise<void> {
    dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
    const config = loadConfig();
    await checkElevenLabsCredential({
        apiKey: config.elevenLabsApiKey ?? '',
        baseUrl: config.elevenLabsBaseUrl,
        timeoutMs: config.providerTimeoutMs
    });
    process.stdout.write('ElevenLabs credential check passed.\n');
}

main().catch(error => {
    const message = error instanceof Error ? error.message : 'ElevenLabs credential check failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
});
