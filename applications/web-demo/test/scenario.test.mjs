import test from 'node:test';
import assert from 'node:assert/strict';
import { replayAt, files, handoff } from '../src/scenario.js';

test('replay does not release a handoff before the final milestone', () => {
    assert.equal(replayAt(0).ready, false);
    assert.equal(replayAt(2).ready, false);
    assert.equal(replayAt(4).ready, true);
    assert.equal(replayAt(99).step, 4);
    assert.match(handoff, /real local Codex build/i);
});
test('replay reveals the recorded Team Tasks source without claiming live coding', () => {
    assert.deepEqual(replayAt(1).visibleFiles, ['app/task-board.js']);
    assert.ok(replayAt(4).visibleFiles.includes('.goldie/HANDOFF.md'));
    assert.match(files['app/api/tasks/route.js'], /120/);
    assert.match(files['lib/task-store.js'], /writeFile/);
    assert.match(replayAt(4).terminal.join('\n'), /Prepared replay/);
});
