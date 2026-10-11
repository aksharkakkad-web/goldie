// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { expect } from 'chai';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { synthesizeSpeech } from '../src/providers/speech';

async function provider(
    handler: (request: IncomingMessage, response: ServerResponse) => void,
    run: (baseUrl: string) => Promise<void>
): Promise<void> {
    const server = createServer(handler);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    } finally {
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
}

async function failure(operation: Promise<unknown>): Promise<Error> {
    try {
        await operation;
    } catch (error) {
        expect(error).to.be.instanceOf(Error);
        return error as Error;
    }
    throw new Error('Expected rejection');
}

const options = { apiKey: 'private-test-key', voiceId: 'voice1', modelId: 'eleven_multilingual_v2', timeoutMs: 1000 };

describe('ElevenLabs speech adapter', () => {
    it('distinguishes credit exhaustion returned as HTTP 401 from rejected credentials without exposing provider text', async () => {
        await provider((_request, response) => {
            response.writeHead(401, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ detail: { status: 'quota_exceeded', message: 'private-test-key account details' } }));
        }, async baseUrl => {
            const error = await failure(synthesizeSpeech('Approved text', { ...options, baseUrl }));
            expect(error).to.have.property('code', 'SPEECH_QUOTA');
            expect(error.message).to.include('credits');
            expect(JSON.stringify(error)).not.to.include('private-test-key');
        });
    });
    it('posts only approved teaching text and returns MP3 bytes', async () => {
        await provider((request, response) => {
            expect(request.method).to.equal('POST');
            expect(request.url).to.equal('/v1/text-to-speech/voice1?output_format=mp3_44100_128');
            expect(request.headers['xi-api-key']).to.equal('private-test-key');
            let body = '';
            request.on('data', chunk => body += chunk);
            request.on('end', () => {
                expect(JSON.parse(body)).to.deep.equal({
                    text: 'An API connects the frontend and backend.', model_id: 'eleven_multilingual_v2',
                    voice_settings: { stability: 0.5, similarity_boost: 0.75 }
                });
                response.writeHead(200, { 'content-type': 'audio/mpeg' });
                response.end(Buffer.from('ID3approved-audio'));
            });
        }, async baseUrl => {
            expect(await synthesizeSpeech('An API connects the frontend and backend.', { ...options, baseUrl }))
                .to.deep.equal(Buffer.from('ID3approved-audio'));
        });
    });

    it('rejects missing credentials and oversized text before any paid call', async () => {
        let calls = 0;
        await provider((_request, response) => { calls++; response.end(); }, async baseUrl => {
            expect((await failure(synthesizeSpeech('Approved text', { ...options, baseUrl, apiKey: '' }))).message)
                .to.equal('Speech is not configured. Set ELEVENLABS_API_KEY in the backend.');
            await failure(synthesizeSpeech('x'.repeat(4001), { ...options, baseUrl }));
        });
        expect(calls).to.equal(0);
    });

    it('sanitizes provider errors without retrying or disclosing credentials', async () => {
        let calls = 0;
        await provider((_request, response) => {
            calls++;
            response.writeHead(401);
            response.end('private-test-key and private provider details');
        }, async baseUrl => {
            const error = await failure(synthesizeSpeech('Approved text', { ...options, baseUrl }));
            expect(error.message).to.equal('Speech provider rejected the configured credentials.');
            expect(JSON.stringify(error)).not.to.include('private-test-key');
        });
        expect(calls).to.equal(1);
    });

    it('never forwards a credential through a redirect', async () => {
        let redirected = 0;
        await provider((_request, response) => { redirected++; response.end('ID3bad'); }, async destination => {
            await provider((_request, response) => {
                response.writeHead(307, { location: destination }); response.end();
            }, async baseUrl => { await failure(synthesizeSpeech('Approved text', { ...options, baseUrl })); });
        });
        expect(redirected).to.equal(0);
    });

    it('bounds a stalled response body, not just the response headers', async () => {
        await provider((_request, response) => {
            response.writeHead(200, { 'content-type': 'audio/mpeg' });
            response.write('ID3');
        }, async baseUrl => {
            const started = Date.now();
            const error = await failure(synthesizeSpeech('Approved text', { ...options, baseUrl, timeoutMs: 35 }));
            expect(error.message).to.equal('Speech generation timed out. Text is still available.');
            expect(Date.now() - started).to.be.lessThan(1000);
        });
    });

    it('rejects oversized, empty and non-audio provider responses', async () => {
        for (const sample of ['oversized', 'empty', 'json', 'invalid']) {
            await provider((_request, response) => {
                if (sample === 'oversized') {
                    response.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': 3000000 });
                    response.flushHeaders();
                } else {
                    response.writeHead(200, { 'content-type': sample === 'json' ? 'application/json' : 'audio/mpeg' });
                    response.end(sample === 'empty' ? '' : 'not-mp3');
                }
            }, async baseUrl => { await failure(synthesizeSpeech('Approved text', { ...options, baseUrl })); });
        }
    });

    it('bounds chunked audio without trusting content-length', async () => {
        await provider((_request, response) => {
            response.writeHead(200, { 'content-type': 'audio/mpeg' });
            response.write('ID3');
            response.end(Buffer.alloc(2 * 1024 * 1024));
        }, async baseUrl => { await failure(synthesizeSpeech('Approved text', { ...options, baseUrl })); });
    });
});
