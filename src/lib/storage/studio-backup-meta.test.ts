import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STUDIO_BACKUP_LAST_EXPORT_KEY } from './studio-backup-meta';

describe('studio-backup-meta', () => {
  it('exports the expected, stable localStorage/sessionStorage key', () => {
    assert.equal(STUDIO_BACKUP_LAST_EXPORT_KEY, 'studio-backup-last-export-v1');
  });
});
