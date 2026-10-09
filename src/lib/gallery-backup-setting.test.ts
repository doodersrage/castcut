import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { changedSettings } from './settings-defaults-diff';
import { DEFAULT_SHARED_SETTINGS } from './settings-cache';

describe('Gallery backups setting', () => {
  it('is on by default; turned off it is listed under Gallery storage', () => {
    assert.equal(DEFAULT_SHARED_SETTINGS.galleryBackupCopies, true);
    assert.equal(
      changedSettings({ galleryBackupCopies: true }, DEFAULT_SHARED_SETTINGS).some(
        row => row.key === 'galleryBackupCopies'
      ),
      false
    );
    const row = changedSettings({ galleryBackupCopies: false }, DEFAULT_SHARED_SETTINGS).find(
      item => item.key === 'galleryBackupCopies'
    );
    assert.equal(row?.area.label, 'Gallery storage');
    assert.equal(row?.area.tab, 'data');
  });
});
