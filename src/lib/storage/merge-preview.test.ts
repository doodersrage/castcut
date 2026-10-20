import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { previewMergeChoice, previewMergeChoices } from './merge-preview';

describe('storage-merge-preview', () => {
  it('summarizes keep-local / prefer-server / merge counts', () => {
    const conflict = { namespace: 'settings', localCount: 3, serverCount: 5 };
    assert.match(previewMergeChoice(conflict, 'local').summary, /Keep 3 local/);
    assert.match(previewMergeChoice(conflict, 'server').summary, /Keep 5 server/);
    assert.match(previewMergeChoice(conflict, 'merge').summary, /Union/i);
  });

  it('skips namespaces without a chosen strategy', () => {
    const rows = previewMergeChoices(
      [
        { namespace: 'a', localCount: 1, serverCount: 2 },
        { namespace: 'b', localCount: 4, serverCount: 1 },
      ],
      { a: 'local' }
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.namespace, 'a');
  });
});
