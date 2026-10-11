/********************************************************************************
 * Copyright (C) 2026 Akshar Kakkad and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as path from 'node:path';

export interface BackendConfig {
    host: string;
    port: number;
    allowedOrigin: string;
    elevenLabsApiKey?: string;
    elevenLabsBaseUrl: string;
    providerTimeoutMs: number;
    dataDir: string;
    elevenLabsVoiceId: string;
    elevenLabsModelId: string;
    speechTimeoutMs: number;
    geminiApiKey?: string;
    geminiModel: string;
    geminiTimeoutMs: number;
    whisperBin?: string;
    whisperModelPath?: string;
    ffmpegBin?: string;
}

function optionalTrimmed(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

function stringValue(value: string | undefined, fallback: string): string {
    return optionalTrimmed(value) ?? fallback;
}

function providerIdentifier(value: string | undefined, fallback: string, name: string, allowDots = false): string {
    const identifier = stringValue(value, fallback);
    if (!(allowDots ? /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/ : /^[a-zA-Z0-9_-]{1,128}$/).test(identifier)) {
        throw new Error(`${name} must be an alphanumeric provider identifier`);
    }
    return identifier;
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
        geminiApiKey: optionalTrimmed(env.GEMINI_API_KEY),
        geminiModel: providerIdentifier(env.GEMINI_MODEL, 'gemini-3.5-flash-lite', 'GEMINI_MODEL', true),
        geminiTimeoutMs: integerValue(env.GOLDIE_GEMINI_TIMEOUT_MS, 20000, 'GOLDIE_GEMINI_TIMEOUT_MS', 1, 20000),
        whisperBin: optionalTrimmed(env.GOLDIE_WHISPER_BIN),
        whisperModelPath: optionalTrimmed(env.GOLDIE_WHISPER_MODEL_PATH),
        ffmpegBin: optionalTrimmed(env.GOLDIE_FFMPEG_BIN),
        dataDir: path.resolve(stringValue(env.GOLDIE_DATA_DIR, path.resolve(__dirname, '../../.data'))),
        elevenLabsVoiceId: providerIdentifier(env.ELEVENLABS_VOICE_ID, 'JBFqnCBsd6RMkjVDRZzb', 'ELEVENLABS_VOICE_ID'),
        elevenLabsModelId: providerIdentifier(env.ELEVENLABS_MODEL_ID, 'eleven_multilingual_v2', 'ELEVENLABS_MODEL_ID'),
        speechTimeoutMs: integerValue(env.GOLDIE_SPEECH_TIMEOUT_MS, 20000, 'GOLDIE_SPEECH_TIMEOUT_MS', 1, 60000),
        providerTimeoutMs: integerValue(
            env.GOLDIE_PROVIDER_TIMEOUT_MS,
            5000,
            'GOLDIE_PROVIDER_TIMEOUT_MS',
            1,
            60000
        )
    };
}
