import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  encodeRunwayPromptId,
  mapRunwayTaskStatus,
  parseRunwayPromptId,
  runwayImageRatioFromSize,
  runwayModelToSubfolder,
  runwaySubfolderToModel,
  runwayVideoDurationSec,
  runwayVideoRatioFromSize,
  sanitizeRunwayModelId,
} from './runway-protocol';
import { resolveRunwayVideoModel } from '../video/clip-mode';
import {
  DEFAULT_RUNWAY_EXTEND_MODEL,
  DEFAULT_RUNWAY_I2V_MODEL,
  DEFAULT_RUNWAY_T2V_MODEL,
} from '../engine/capabilities';

describe('runway protocol', () => {
  it('round-trips model id and task id through the studio prompt id', () => {
    const promptId = encodeRunwayPromptId('gen4.5', '550e8400-e29b-41d4-a716-446655440000');
    assert.deepEqual(parseRunwayPromptId(promptId), {
      modelId: 'gen4.5',
      taskId: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('rejects unsafe model ids and prompt ids', () => {
    assert.throws(() => sanitizeRunwayModelId('../etc/passwd', 'gen4_image'));
    assert.equal(sanitizeRunwayModelId(' gen4_image ', 'gen4.5'), 'gen4_image');
    assert.equal(parseRunwayPromptId('not-a-runway-id'), null);
    assert.equal(parseRunwayPromptId('gen4_image::bad id'), null);
  });

  it('encodes dotted model ids as gallery subfolders', () => {
    assert.equal(runwayModelToSubfolder('gen4.5'), 'gen4_dot_5');
    assert.equal(runwaySubfolderToModel('gen4_dot_5'), 'gen4.5');
  });

  it('maps Runway task statuses onto studio job states', () => {
    assert.equal(mapRunwayTaskStatus('PENDING'), 'pending');
    assert.equal(mapRunwayTaskStatus('THROTTLED'), 'pending');
    assert.equal(mapRunwayTaskStatus('RUNNING'), 'running');
    assert.equal(mapRunwayTaskStatus('SUCCEEDED'), 'completed');
    assert.equal(mapRunwayTaskStatus('FAILED'), 'error');
  });

  it('picks image and video ratios from width/height', () => {
    assert.equal(runwayImageRatioFromSize(1024, 1024), '1024:1024');
    assert.equal(runwayVideoRatioFromSize(1280, 720), '1280:720');
    assert.equal(runwayVideoRatioFromSize(720, 1280), '720:1280');
  });

  it('snaps video duration into Gen-4 range', () => {
    assert.equal(runwayVideoDurationSec(undefined), 5);
    assert.equal(runwayVideoDurationSec(3), 2);
    assert.equal(runwayVideoDurationSec(5), 5);
    assert.equal(runwayVideoDurationSec(9), 10);
  });

  it('resolves Runway video models by clip mode', () => {
    assert.equal(resolveRunwayVideoModel({ clipMode: 't2v' }), DEFAULT_RUNWAY_T2V_MODEL);
    assert.equal(resolveRunwayVideoModel({ clipMode: 'i2v' }), DEFAULT_RUNWAY_I2V_MODEL);
    assert.equal(resolveRunwayVideoModel({ clipMode: 'extend' }), DEFAULT_RUNWAY_EXTEND_MODEL);
    assert.equal(
      resolveRunwayVideoModel({ clipMode: 'extend', extendModel: 'aleph2' }),
      'aleph2'
    );
  });
});
