// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { expect } from 'chai';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { SpeechService } from '../src/speech';

describe('speech cache', () => {
    let directory: string;
    beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), 'goldie-audio-test-')); });
    afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

    it('deduplicates paid generation and reuses persisted audio after restart', async () => {
        let calls = 0;
        const server = createServer((_request, response) => {
            calls++;
            setTimeout(() => { response.writeHead(200, { 'content-type': 'audio/mpeg' }); response.end('ID3cached-audio'); }, 15);
        });
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        const options = {
            apiKey: 'test-key', baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
            voiceId: 'voice1', modelId: 'model1', timeoutMs: 500
        };
        const resolveText = async (): Promise<string> => 'An API connects the frontend and backend.';
        const service = new SpeechService(directory, options, resolveText);
        try {
            const [first, second] = await Promise.all([
                service.create({ sessionId: 's1', contentId: 'c1' }), service.create({ sessionId: 's2', contentId: 'c2' })
            ]);
            expect(first).to.deep.equal(second);
            expect(calls).to.equal(1);
            expect(await service.audio(first.audioId)).to.deep.equal(Buffer.from('ID3cached-audio'));
            const restarted = new SpeechService(directory, options, resolveText);
            expect(await restarted.create({ sessionId: 's1', contentId: 'c1' })).to.deep.equal(first);
            expect(calls).to.equal(1);
            const changedVoice = new SpeechService(directory, { ...options, voiceId: 'voice2' }, resolveText);
            expect((await changedVoice.create({ sessionId: 's1', contentId: 'c1' })).audioId).not.to.equal(first.audioId);
            expect(calls).to.equal(2);
        } finally {
            server.closeAllConnections();
            await new Promise<void>(resolve => server.close(() => resolve()));
        }
    });

    it('checks session/content authorization even before serving cached speech', async () => {
        const service = new SpeechService(directory, {
            apiKey: '', baseUrl: 'http://127.0.0.1:1', voiceId: 'voice1', modelId: 'model1', timeoutMs: 100
        }, async () => { throw new Error('Content was never published'); });
        let captured: unknown;
        try { await service.create({ sessionId: 'unaccepted', contentId: 'c1' }); } catch (error) { captured = error; }
        expect((captured as Error).message).to.equal('Content was never published');
    });

    it('rejects path traversal, missing files and malformed cached audio', async () => {
        const service = new SpeechService(directory, {
            baseUrl: 'http://127.0.0.1:1', voiceId: 'voice1', modelId: 'model1', timeoutMs: 100
        }, async () => 'Approved text');
        for (const invalidId of ['../secret', 'b'.repeat(64)]) {
            let invalidRejected = false;
            try { await service.audio(invalidId); } catch { invalidRejected = true; }
            expect(invalidRejected).to.equal(true);
        }
        const audioId = 'c'.repeat(64);
        await writeFile(path.join(directory, audioId + '.mp3'), 'not-audio');
        let rejected = false;
        try { await service.audio(audioId); } catch { rejected = true; }
        expect(rejected).to.equal(true);
    });

    it('allows an explicit retry after failure without retaining a rejected in-flight promise', async () => {
        let calls = 0;
        const server = createServer((_request, response) => {
            calls++;
            response.writeHead(calls === 1 ? 503 : 200, { 'content-type': 'audio/mpeg' });
            response.end('ID3retry-audio');
        });
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        const service = new SpeechService(directory, {
            apiKey: 'test', baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
            voiceId: 'voice1', modelId: 'model1', timeoutMs: 500
        }, async () => 'Approved text');
        try {
            let failed = false;
            try { await service.create({ sessionId: 's1', contentId: 'c1' }); } catch { failed = true; }
            expect(failed).to.equal(true);
            expect(calls).to.equal(1);
            expect((await service.create({ sessionId: 's1', contentId: 'c1' })).mimeType).to.equal('audio/mpeg');
            expect(calls).to.equal(2);
        } finally {
            server.closeAllConnections();
            await new Promise<void>(resolve => server.close(() => resolve()));
        }
    });

    it('reports unwritable cache storage without making a paid request', async () => {
        const blockedDirectory = path.join(directory, 'read-only-cache');
        await mkdir(blockedDirectory);
        await chmod(blockedDirectory, 0o500);
        let calls = 0;
        const server = createServer((_request, response) => {
            calls++;
            response.writeHead(200, { 'content-type': 'audio/mpeg' });
            response.end('ID3should-not-be-billed');
        });
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        const service = new SpeechService(blockedDirectory, {
            apiKey: 'test', baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
            voiceId: 'voice1', modelId: 'model1', timeoutMs: 500
        }, async () => 'Approved text');
        try {
            let caught: unknown;
            try { await service.create({ sessionId: 's1', contentId: 'c1' }); } catch (error) { caught = error; }
            expect(caught).to.deep.include({ statusCode: 503, retryable: true });
            expect(calls).to.equal(0);
        } finally {
            await chmod(blockedDirectory, 0o700);
            server.closeAllConnections();
            await new Promise<void>(resolve => server.close(() => resolve()));
        }
    });
});
