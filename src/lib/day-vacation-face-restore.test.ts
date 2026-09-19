import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  galleryEntryNeedsDayVacationFaceRestore,
  isDayVacationFaceBreakFilename,
  isDayVacationFaceRestorePrompt,
  resetDayVacationFaceRestoreScheduleForTests,
  resolveDayVacationFaceRestoreRefFilename,
} from './day-vacation-face-restore';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

function entry(
  overrides: Partial<ComfyGalleryEntry> & Pick<ComfyGalleryEntry, 'id' | 'promptId'>
): ComfyGalleryEntry {
  return {
    prompt: 'vacation still',
    comfyUrl: 'http://127.0.0.1:8188',
    status: 'completed',
    queuedAt: Date.now(),
    images: [{ filename: 'out.png', subfolder: '', type: 'output' }],
    tool: 'image-prompt',
    model: 'qwen-image-edit-2511-lightning-8',
    queueParams: {
      inputImageFilenames: ['day-vacation-face-day-shared.png'],
      ipAdapterImageFilename: 'day-vacation-face-day-shared.png',
    },
    ...overrides,
  };
}

describe('day-vacation-face-restore', () => {
  beforeEach(() => {
    resetDayVacationFaceRestoreScheduleForTests();
  });

  it('detects Day face-break crop filenames including cast prefix', () => {
    assert.equal(isDayVacationFaceBreakFilename('day-vacation-face-day-shared.png'), true);
    assert.equal(isDayVacationFaceBreakFilename('day-vacation-face-cast-day-shared.png'), true);
    assert.equal(isDayVacationFaceBreakFilename('plate.png'), false);
  });

  it('resolves face ref from ipAdapter or inputImageFilenames', () => {
    assert.equal(
      resolveDayVacationFaceRestoreRefFilename({
        queueParams: { ipAdapterImageFilename: 'day-vacation-face-1.png' },
      }),
      'day-vacation-face-1.png'
    );
  });

  it('never auto-schedules a second Edit pass', () => {
    assert.equal(galleryEntryNeedsDayVacationFaceRestore(entry({ id: 'a', promptId: 'p1' })), false);
  });

  it('detects wrecked restore prompts so Day will not adopt them', () => {
    assert.equal(
      isDayVacationFaceRestorePrompt(
        'Change only the face of the person in Image 1 to match the person in Image 2.'
      ),
      true
    );
    assert.equal(isDayVacationFaceRestorePrompt('Edit Image 1. Image 1 is a FACE CROP only'), false);
  });
});
