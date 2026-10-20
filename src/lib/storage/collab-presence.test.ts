import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCollabShareUrl,
  mergeCollabDraftFields,
  readCollabProjectIdFromSearch,
  resolveCollabFieldValue,
  type CollabDraftPayload,
} from './collab-presence';

describe('resolveCollabFieldValue', () => {
  it('prefers structured fields over legacy draft text', () => {
    const payload: CollabDraftPayload = {
      projectId: 'p1',
      peerId: 'peer-a',
      draft: 'legacy whole draft',
      fields: { hints: 'structured hints' },
      updatedAt: Date.now(),
    };
    assert.equal(resolveCollabFieldValue(payload, 'hints'), 'structured hints');
  });

  it('falls back to legacy draft for hint-like fields', () => {
    const payload: CollabDraftPayload = {
      projectId: 'p1',
      peerId: 'peer-a',
      draft: 'legacy hints',
      updatedAt: Date.now(),
    };
    assert.equal(resolveCollabFieldValue(payload, 'hints'), 'legacy hints');
  });
});

describe('mergeCollabDraftFields', () => {
  it('layers patches without dropping untouched keys', () => {
    assert.deepEqual(
      mergeCollabDraftFields({ hints: 'a', model: 'flux' }, { hints: 'b' }),
      { hints: 'b', model: 'flux' }
    );
  });
});

describe('collab share URL', () => {
  it('reads project from search and falls back to the active id', () => {
    assert.equal(readCollabProjectIdFromSearch('?project=alpha', 'beta'), 'alpha');
    assert.equal(readCollabProjectIdFromSearch('', 'beta'), 'beta');
    assert.equal(readCollabProjectIdFromSearch(''), 'default');
  });

  it('sets or clears the project query on the current tool URL', () => {
    assert.equal(
      buildCollabShareUrl('/generate?foo=1', 'proj-1', 'https://studio.example'),
      'https://studio.example/generate?foo=1&project=proj-1'
    );
    assert.equal(
      buildCollabShareUrl('/generate?project=old&foo=1', 'default', 'https://studio.example'),
      'https://studio.example/generate?foo=1'
    );
  });
});
