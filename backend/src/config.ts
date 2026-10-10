/********************************************************************************
 * Copyright (C) 2026 Akshar Kakkad and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

export interface BackendConfig {
    host: string;
    port: number;
    allowedOrigin: string;
    elevenLabsApiKey?: string;
    elevenLabsBaseUrl: string;
    providerTimeoutMs: number;
}

function optionalTrimmed(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

function stringValue(value: string | undefined, fallback: string): string {
    return optionalTrimmed(value) ?? fallback;
}

function integerValue(
    value: string | undefined,
    fallback: number,
    name: string,
    minimum: number,
    maximum: number
): number {
    const trimmed = optionalTrimmed(value);
    if (trimmed === undefined) {
        return fallback;
    }
    if (!/^\d+$/.test(trimmed)) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
    return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
    return {
        host: stringValue(env.GOLDIE_BACKEND_HOST, '127.0.0.1'),
        port: integerValue(env.GOLDIE_BACKEND_PORT, 8787, 'GOLDIE_BACKEND_PORT', 1, 65535),
        allowedOrigin: stringValue(env.GOLDIE_ALLOWED_ORIGIN, 'http://127.0.0.1:3000'),
        elevenLabsApiKey: optionalTrimmed(env.ELEVENLABS_API_KEY),
        elevenLabsBaseUrl: stringValue(env.ELEVENLABS_BASE_URL, 'https://api.elevenlabs.io'),
        providerTimeoutMs: integerValue(
            env.GOLDIE_PROVIDER_TIMEOUT_MS,
            5000,
            'GOLDIE_PROVIDER_TIMEOUT_MS',
            1,
            60000
        )
    };
}
