import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpApi } from '../src/api.js';

test('safe backend errors do not leak provider internals', async () => {
    const api = new HttpApi(async () => new Response('secret-provider-debug', { status: 500 }));
    await assert.rejects(api.request('/api/offer', {}), error => !error.message.includes('secret-provider-debug'));
});
test('rejects unsafe speech URL before browser audio requests', async () => {
    const api = new HttpApi(async () => Response.json({ audioUrl: 'https://evil.example/audio', mimeType: 'audio/mpeg' }));
    await assert.rejects(api.request('/api/speech', {}), /invalid/i);
});
test('distinguishes Stage 3 not yet available from an empty valid response', async () => {
    const api = new HttpApi(async () => Response.json({ error: { message: 'Route not found.', retryable: false } }, { status: 404 }));
    await assert.rejects(api.request('/api/transcribe', {}), /Stage 3/);
});
