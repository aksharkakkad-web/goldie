/********************************************************************************
 * Copyright (C) 2026 Akshar Kakkad and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { expect } from 'chai';
import { loadConfig } from '../src/config';

describe('backend configuration', () => {
    it('uses loopback-only defaults', () => {
        const config = loadConfig({});
        expect(config.host).to.equal('127.0.0.1');
        expect(config.port).to.equal(8787);
        expect(config.allowedOrigin).to.equal('http://127.0.0.1:3000');
    });

    it('rejects an invalid port', () => {
        expect(() => loadConfig({ GOLDIE_BACKEND_PORT: 'not-a-port' }))
            .to.throw('GOLDIE_BACKEND_PORT must be an integer between 1 and 65535');
    });

    it('normalizes a whitespace-only provider key to missing', () => {
        expect(loadConfig({ ELEVENLABS_API_KEY: '   ' }).elevenLabsApiKey).to.equal(undefined);
    });

    it('defaults speech to George, a bounded timeout and a local data directory', () => {
        const config = loadConfig({});
        expect(config.elevenLabsVoiceId).to.equal('JBFqnCBsd6RMkjVDRZzb');
        expect(config.elevenLabsModelId).to.equal('eleven_multilingual_v2');
        expect(config.speechTimeoutMs).to.equal(20000);
        expect(config.dataDir).to.match(/backend\/\.data$/);
    });

    it('validates configurable speech timeouts and voice identifiers', () => {
        expect(() => loadConfig({ GOLDIE_SPEECH_TIMEOUT_MS: '999999' })).to.throw();
        expect(() => loadConfig({ ELEVENLABS_VOICE_ID: '../bad' })).to.throw();
        expect(loadConfig({ ELEVENLABS_VOICE_ID: 'customVoice123', GOLDIE_SPEECH_TIMEOUT_MS: '15000' }))
            .to.deep.include({ elevenLabsVoiceId: 'customVoice123', speechTimeoutMs: 15000 });
    });
});
