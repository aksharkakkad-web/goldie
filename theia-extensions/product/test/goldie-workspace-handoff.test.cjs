// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, basename } = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { inspectGoldieWorkspaceHandoff } = require('../lib/node/goldie-workspace-handoff');
const { createGoldieApi } = require('../lib/node/goldie-api');

const headings = [
    'Project overview / existing architecture',
    'Requirements and user prompts (chronological; IDs)',
    'Implementation plan and dependencies',
    'Architectural decisions and tradeoffs',
    'Current implementation state',
    'Affected components and relevant file pointers',
    'Milestone history / changes since prior revision'
];
function handoff(revision = 1) {
    return `# Goldie Handoff\nRevision: ${revision}\nProject: TeamFlow\nUpdated: 2026-10-11T01:02:03.000Z\n\n`
        + headings.map((heading, index) => `## ${heading}\nEngineering context ${index + 1}.\n`).join('\n');
}
async function sandbox(run) {
    const root = await fs.mkdtemp(join(tmpdir(), 'goldie-workspace-test-'));
    try { await run(root, pathToFileURL(root).href); } finally { await fs.rm(root, { recursive: true, force: true }); }
}
async function save(root, text = handoff()) {
    await fs.mkdir(join(root, '.goldie'), { recursive: true });
    await fs.writeFile(join(root, '.goldie', 'HANDOFF.md'), text);
}
function safeError(error) {
    assert.ok([-32001, -32002].includes(error.code));
    assert.doesNotMatch(JSON.stringify(error.toJson()), /goldie-workspace-test-|sensitive-literal|\/Users\/|\/private\//);
    return true;
}

test('missing canonical handoff returns stable local identity without searching other files', async () => {
    await sandbox(async (root, uri) => {
        await fs.writeFile(join(root, 'HANDOFF.md'), handoff());
        const canonical = await fs.realpath(root);
        const expected = { kind: 'missing', name: basename(root), projectId: `goldie-workspace-${createHash('sha256').update(canonical).digest('hex').slice(0, 32)}` };
        assert.deepEqual(await inspectGoldieWorkspaceHandoff(uri), expected);
        await fs.mkdir(join(root, '.goldie'));
        assert.deepEqual(await inspectGoldieWorkspaceHandoff(uri), expected);
        // Local inspection is callable even when a backend address cannot be used.
        assert.deepEqual(await createGoldieApi('not-an-http-address').inspectWorkspaceHandoff(uri), expected);
    });
});

test('valid canonical handoff preserves full text, Project name, revision and content fingerprint', async () => {
    await sandbox(async (root, uri) => {
        const text = handoff(7);
        await save(root, text);
        const result = await inspectGoldieWorkspaceHandoff(uri);
        assert.equal(result.kind, 'ready');
        assert.equal(result.revision, 7);
        assert.equal(result.name, 'TeamFlow');
        assert.equal(result.handoff, text);
        assert.equal(result.fingerprint, createHash('sha256').update(text).digest('hex'));
        await fs.symlink(root, join(root, 'alias'));
        assert.equal((await inspectGoldieWorkspaceHandoff(pathToFileURL(join(root, 'alias')).href)).projectId, result.projectId);
        await fs.writeFile(join(root, '.goldie', 'HANDOFF.md'), text.replace('Goldie Handoff', 'gOlDiE   hAnDoFf')
            .replaceAll('## ', '  ##  ').replace(' / ', '  /   '));
        assert.equal((await inspectGoldieWorkspaceHandoff(uri)).revision, 7);
    });
});

test('invalid canonical fields and missing or empty sections are rejected without fabrication', async () => {
    await sandbox(async (root, uri) => {
        for (const text of [
            ...['0', '-1', '1.5', '9007199254740992', 'nope', '1e2'].map(value => handoff().replace('Revision: 1', `Revision: ${value}`)),
            handoff() + '\nRevision: 2\n', handoff().replace('Revision: 1\n', ''),
            handoff().replace('Project: TeamFlow', 'Project: '), handoff().replace('# Goldie Handoff', '# Other'),
            handoff().replace('2026-10-11T01:02:03.000Z', '2026-02-30T01:02:03Z'),
            handoff().replace('2026-10-11T01:02:03.000Z', 'yesterday'),
            handoff().replace('## Current implementation state', '## Something else'),
            handoff().replace('Engineering context 5.', ''),
            handoff() + '\n## Current implementation state\nDuplicate.\n'
        ]) {
            await save(root, text);
            await assert.rejects(inspectGoldieWorkspaceHandoff(uri), safeError);
        }
    });
});

test('byte, character, JSON payload and UTF-8 bounds reject rather than truncate context', async () => {
    await sandbox(async (root, uri) => {
        for (const text of [Buffer.alloc(128001), handoff() + 'x'.repeat(32000), handoff() + '界'.repeat(22000),
            handoff() + '\u0000'.repeat(12000), Buffer.from([0xc3, 0x28])]) {
            await save(root, text);
            await assert.rejects(inspectGoldieWorkspaceHandoff(uri), safeError);
        }
        const boundary = handoff() + 'x'.repeat(32000 - handoff().length);
        await save(root, boundary);
        assert.equal((await inspectGoldieWorkspaceHandoff(uri)).handoff.length, 32000);
    });
});

test('obvious credential literals never leave local inspection', async () => {
    await sandbox(async (root, uri) => {
        for (const secret of ['sk-sensitive-literal-123456', 'AIza-sensitive-literal-1234567890',
            'api_key = sensitive-literal', 'password: "sensitive-literal"', 'token = "sensitive-literal"']) {
            await save(root, `${handoff()}\n${secret}\n`);
            await assert.rejects(inspectGoldieWorkspaceHandoff(uri), safeError);
        }
    });
});

test('URI validation, parent and leaf links, and nonregular files cannot escape the workspace', async () => {
    await sandbox(async (root, uri) => {
        await fs.mkdir(join(root, 'outside'));
        await fs.writeFile(join(root, 'outside', 'HANDOFF.md'), `${handoff()}\nsensitive-literal\n`);
        await fs.symlink(join(root, 'outside'), join(root, '.goldie'));
        await assert.rejects(inspectGoldieWorkspaceHandoff(uri), safeError);
        await fs.unlink(join(root, '.goldie'));
        await fs.mkdir(join(root, '.goldie'));
        await fs.symlink(join(root, 'outside', 'HANDOFF.md'), join(root, '.goldie', 'HANDOFF.md'));
        await assert.rejects(inspectGoldieWorkspaceHandoff(uri), safeError);
        await fs.unlink(join(root, '.goldie', 'HANDOFF.md'));
        await fs.mkdir(join(root, '.goldie', 'HANDOFF.md'));
        await assert.rejects(inspectGoldieWorkspaceHandoff(uri), safeError);
        for (const invalid of ['https://example.com/project', 'file://server/project', 'invalid', `${uri}?secret=sensitive-literal`,
            `${uri}#sensitive-literal`, pathToFileURL(join(root, 'outside', 'HANDOFF.md')).href]) {
            await assert.rejects(inspectGoldieWorkspaceHandoff(invalid), safeError);
        }
    });
});

test('atomic replacement during an actual bounded read is rejected, then the next complete revision loads', async () => {
    await sandbox(async (root, uri) => {
        await save(root);
        const filename = join(await fs.realpath(root), '.goldie', 'HANDOFF.md');
        const next = join(root, '.goldie', 'next.md');
        await fs.writeFile(next, handoff(2));
        const originalOpen = fs.open;
        fs.open = async (...args) => {
            const file = await originalOpen(...args);
            if (args[0] === filename) {
                const read = file.read.bind(file);
                let replaced = false;
                file.read = async (...readArgs) => {
                    const result = await read(...readArgs);
                    if (!replaced) { replaced = true; await fs.rename(next, filename); }
                    return result;
                };
            }
            return file;
        };
        try {
            await assert.rejects(inspectGoldieWorkspaceHandoff(uri), error => {
                safeError(error); assert.equal(error.code, -32002); assert.equal(error.data.apiCode, 'HANDOFF_CHANGED'); return true;
            });
        } finally { fs.open = originalOpen; }
        assert.equal((await inspectGoldieWorkspaceHandoff(uri)).revision, 2);
    });
});

test('a directory replaced with an escaping link at open is rejected before content returns', async () => {
    await sandbox(async (root, uri) => {
        await save(root);
        const directory = join(await fs.realpath(root), '.goldie');
        const filename = join(directory, 'HANDOFF.md');
        await fs.mkdir(join(root, 'outside'));
        await fs.writeFile(join(root, 'outside', 'HANDOFF.md'), `${handoff(2)}\nsensitive-literal\n`);
        const originalOpen = fs.open;
        fs.open = async (...args) => {
            if (args[0] === filename) {
                await fs.rename(directory, join(root, '.goldie-old'));
                await fs.symlink(join(root, 'outside'), directory);
            }
            return originalOpen(...args);
        };
        try { await assert.rejects(inspectGoldieWorkspaceHandoff(uri), safeError); } finally { fs.open = originalOpen; }
    });
});
