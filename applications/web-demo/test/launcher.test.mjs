import test from 'node:test';
import assert from 'node:assert/strict';
import { startConnectedDemo } from '../start-connected.mjs';

test('connected launcher refuses missing or relative backend/config paths before starting services', async () => {
    await assert.rejects(startConnectedDemo({}), /GOLDIE_DEMO_BACKEND_ROOT/);
    await assert.rejects(startConnectedDemo({ backendRoot: 'backend', envFile: '/tmp/example.env' }), /absolute/);
    await assert.rejects(startConnectedDemo({ backendRoot: '/tmp/example', envFile: 'example.env' }), /absolute/);
});
