// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, writeFile, symlink, rm, mkdir } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { loadGoldieHandoff } = require('../lib/node/goldie-context');

async function sandbox(run) {
    const directory = await mkdtemp(join(tmpdir(), 'goldie-handoff-test-'));
    try { await run(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

test('reads precisely the selected Markdown file, returning its text and basename', async () => {
    await sandbox(async directory => {
        const selected = join(directory, 'Architecture handoff.md');
        await writeFile(selected, '# Architecture\nA supplied plan.');
        await writeFile(join(directory, 'unselected.md'), 'Unselected private text.');
        assert.deepEqual(await loadGoldieHandoff(pathToFileURL(selected).href), {
            handoff: '# Architecture\nA supplied plan.', name: 'Architecture handoff.md'
        });
    });
});

test('rejects HTTP, non-Markdown, malformed URI and missing file without leaking paths', async () => {
    for (const uri of ['https://example.com/HANDOFF.md', 'file:///private/secret.env', 'bad',
        'file://server/private/HANDOFF.md', 'file:///missing-private/HANDOFF.md?key=secret', 'file:///missing-private/HANDOFF.md']) {
        await assert.rejects(loadGoldieHandoff(uri), error => {
            assert.equal(error.code, -32001);
            assert.doesNotMatch(JSON.stringify(error.toJson()), /missing-private|\/private|key=secret|server/);
            return true;
        });
    }
});

test('rejects symlinks and directories instead of reading their targets', async () => {
    await sandbox(async directory => {
        const target = join(directory, 'secret.txt');
        const link = join(directory, 'HANDOFF.md');
        const folder = join(directory, 'folder.md');
        await writeFile(target, 'Sensitive content.');
        await symlink(target, link);
        await mkdir(folder);
        for (const filename of [link, folder]) {
            await assert.rejects(loadGoldieHandoff(pathToFileURL(filename).href), error => {
                assert.equal(error.code, -32001);
                assert.doesNotMatch(JSON.stringify(error.toJson()), /Sensitive|secret\.txt/);
                return true;
            });
        }
    });
});

test('rejects oversized, empty or invalid UTF-8 handoffs without truncation', async () => {
    await sandbox(async directory => {
        const selected = join(directory, 'HANDOFF.md');
        for (const [body, expected] of [
            ['x'.repeat(32001), /too large/], [Buffer.alloc(128001), /too large/],
            [' \n\t', /empty/], [Buffer.from([0xc3, 0x28]), /UTF-8/]
        ]) {
            await writeFile(selected, body);
            await assert.rejects(loadGoldieHandoff(pathToFileURL(selected).href), expected);
        }
        await writeFile(selected, 'x'.repeat(32000));
        assert.equal((await loadGoldieHandoff(pathToFileURL(selected).href)).handoff.length, 32000);
    });
});
