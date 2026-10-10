// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../backend/lib/src/app');
const { loadConfig } = require('../backend/lib/src/config');
const { checkGoldieHealth } = require('../theia-extensions/product/lib/node/goldie-health');

test('Theia health client connects to the real backend and handles it going offline', async () => {
    const app = await buildApp(loadConfig({}));
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    try {
        const result = await checkGoldieHealth(address);
        assert.equal(result.connected, true);
    } finally {
        await app.close();
    }

    const unavailable = await checkGoldieHealth(address);
    assert.equal(unavailable.connected, false);
    assert.match(unavailable.message, /Start the teaching service/);
});
