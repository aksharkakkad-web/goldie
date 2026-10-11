import test from 'node:test';
import assert from 'node:assert/strict';
import { replayAt, files, handoff } from '../src/scenario.js';

test('replay does not release a handoff before the final milestone', () => {
    assert.equal(replayAt(0).ready, false);
    assert.equal(replayAt(2).ready, false);
    assert.equal(replayAt(4).ready, true);
    assert.equal(replayAt(99).step, 4);
    assert.match(handoff, /transaction/i);
});
test('replay reveals synthetic source and terminal history without executing code', () => {
    assert.deepEqual(replayAt(1).visibleFiles, ['app/page.tsx']);
    assert.ok(replayAt(4).visibleFiles.includes('.goldie/HANDOFF.md'));
    assert.match(files['app/api/teams/route.ts'], /transaction/);
    assert.match(replayAt(4).terminal.join('\n'), /Prepared replay/);
});
