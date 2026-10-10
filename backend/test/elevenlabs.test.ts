/********************************************************************************
 * Copyright (C) 2026 Akshar Kakkad and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { expect } from 'chai';
import { AddressInfo } from 'node:net';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { checkElevenLabsCredential } from '../src/providers/elevenlabs';

type RequestHandler = (request: IncomingMessage, response: ServerResponse) => void;

async function withServer(
    handler: RequestHandler,
    test: (baseUrl: string) => Promise<void>
): Promise<void> {
    const server = createServer(handler);
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as AddressInfo;
    try {
        await test(`http://127.0.0.1:${address.port}`);
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
        });
    }
}

async function captureError(promise: Promise<unknown>): Promise<Error> {
    let captured: unknown;
    try {
        await promise;
    } catch (error) {
        captured = error;
    }
    expect(captured).to.be.instanceOf(Error);
    return captured as Error;
}

async function expectRejected(promise: Promise<unknown>, message: string): Promise<void> {
    const error = await captureError(promise);
    expect(error.message).to.equal(message);
}

describe('ElevenLabs credential check', () => {
    it('sends the credential only in the xi-api-key header to /v1/models', async () => {
        await withServer((request, response) => {
            expect(request.method).to.equal('GET');
            expect(request.url).to.equal('/v1/models');
            expect(request.headers['xi-api-key']).to.equal('test-secret');
            expect(request.headers.accept).to.equal('application/json');
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end('[]');
        }, async baseUrl => {
            const result = await checkElevenLabsCredential({
                apiKey: 'test-secret',
                baseUrl,
                timeoutMs: 500
            });
            expect(result).to.deep.equal({ ok: true });
        });
    });

    it('rejects a blank key before making a request', async () => {
        let requestCount = 0;
        await withServer((_request, response) => {
            requestCount += 1;
            response.writeHead(200);
            response.end();
        }, async baseUrl => {
            await expectRejected(checkElevenLabsCredential({
                apiKey: '   ',
                baseUrl,
                timeoutMs: 500
            }), 'ELEVENLABS_API_KEY is required');
        });
        expect(requestCount).to.equal(0);
    });

    it('sanitizes provider authentication failures', async () => {
        await withServer((_request, response) => {
            response.writeHead(401, {
                'content-type': 'text/plain',
                'x-request-id': 'request-for-test-secret'
            });
            response.end('account-for-test-secret');
        }, async baseUrl => {
            const error = await captureError(checkElevenLabsCredential({
                apiKey: 'test-secret',
                baseUrl,
                timeoutMs: 500
            }));
            expect(error.message).to.equal('ElevenLabs credential check failed with status 401');
            expect(error.message).not.to.contain('test-secret');
            expect(error.message).not.to.contain('account-for-test-secret');
        });
    });

    it('aborts a stalled provider request', async () => {
        await withServer((_request, response) => {
            setTimeout(() => {
                if (!response.destroyed) {
                    response.writeHead(200);
                    response.end('[]');
                }
            }, 100);
        }, async baseUrl => {
            await expectRejected(checkElevenLabsCredential({
                apiKey: 'test-secret',
                baseUrl,
                timeoutMs: 20
            }), 'ElevenLabs credential check timed out');
        });
    });

    it('does not forward the credential across redirects', async () => {
        let redirectedRequests = 0;
        await withServer((_request, response) => {
            redirectedRequests += 1;
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end('[]');
        }, async redirectBaseUrl => {
            await withServer((_request, response) => {
                response.writeHead(302, { location: `${redirectBaseUrl}/capture` });
                response.end();
            }, async baseUrl => {
                await expectRejected(checkElevenLabsCredential({
                    apiKey: 'test-secret',
                    baseUrl,
                    timeoutMs: 500
                }), 'ElevenLabs credential check could not reach the provider');
            });
        });
        expect(redirectedRequests).to.equal(0);
    });
});
