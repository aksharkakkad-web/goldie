// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGoldieContext, parseGoldieContext } = require('../lib/browser/goldie/goldie-context');
test('context snapshots preserve handoff bytes and freeze both snapshot and profile', () => {
    const handoff = '# Team app\n\nStatus: planned\n';
    const snapshot = createGoldieContext(handoff, 'intermediate', 7, 'Architecture');
    assert.equal(snapshot.handoff, handoff); assert.equal(snapshot.projectId, 'goldie-stage2-sample');
    assert.ok(Object.isFrozen(snapshot)); assert.ok(Object.isFrozen(snapshot.profile));
    assert.deepEqual(parseGoldieContext(JSON.parse(JSON.stringify(snapshot))), snapshot);
});
test('invalid context never becomes a request snapshot', () => {
    for (const handoff of ['', '   ', null, 'a'.repeat(32001), '界'.repeat(32000), '\u0000'.repeat(32000)]) {
        assert.throws(() => createGoldieContext(handoff, 'beginner', 1));
    }
    for (const level of ['expert', '', null]) { assert.throws(() => createGoldieContext('Build an API', level, 1)); }
    for (const revision of [-1, 0, 1.1, NaN, Number.MAX_SAFE_INTEGER + 1]) { assert.throws(() => createGoldieContext('Build an API', 'beginner', revision)); }
    for (const value of [null, {}, { projectId: 'other' }, { ...createGoldieContext('Build', 'beginner', 1), profile: { level: 'expert' } }]) {
        assert.throws(() => parseGoldieContext(value));
    }
});
