import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { backupAgeLabel, compareBackup, summarizeBackup } from './backup-preview';

const backup = (cast: string[], renders: number, films = 0, kept = renders) => ({
  version: 5,
  exportedAt: '2026-10-08T10:00:00.000Z',
  history: [1, 2, 3],
  comfyGallery: [
    ...Array.from({ length: renders }, (_, index) => ({
      status: 'completed',
      ...(index < kept ? { durableOriginalPath: `/media/${index}.png` } : {}),
    })),
    ...Array.from({ length: films }, () => ({ status: 'completed', derivedKind: 'film' })),
    { status: 'error' },
  ],
  comfyWorkflowFiles: [{}],
  extras: { characters: cast.map(name => ({ name })) },
});

describe('backup preview', () => {
  it('summarises a backup file', () => {
    const summary = summarizeBackup(backup(['Nora', 'Tomas'], 5, 2, 3));
    assert.deepEqual(summary, {
      exportedAt: '2026-10-08T10:00:00.000Z',
      version: 5,
      cast: ['Nora', 'Tomas'],
      renders: 5,
      films: 2,
      history: 3,
      workflows: 1,
      rendersNotKept: 2,
    });
  });

  it('flags what a restore would lose', () => {
    const rows = compareBackup(
      summarizeBackup(backup(['Nora'], 5)),
      summarizeBackup(backup(['Nora', 'Sam'], 8, 1))
    );
    assert.deepEqual(rows[0], { label: 'Cast', file: '1 · Nora', here: '2 · Nora, Sam', fewer: true });
    assert.equal(rows.find(row => row.label === 'Renders')!.fewer, true);
    assert.equal(rows.find(row => row.label === 'Workflows')!.fewer, false);
  });

  it('dates a backup', () => {
    const now = Date.parse('2026-10-11T12:00:00.000Z');
    assert.equal(backupAgeLabel('2026-10-08T10:00:00.000Z', now), 'Saved 3 days ago (2026-10-08)');
    assert.equal(backupAgeLabel('2026-10-11T08:00:00.000Z', now), 'Saved today (2026-10-11)');
    assert.equal(backupAgeLabel(null, now), null);
  });
});
