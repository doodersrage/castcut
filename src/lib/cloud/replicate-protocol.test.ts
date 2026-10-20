import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aspectRatioFromSize,
  encodeReplicatePromptId,
  isAllowedReplicateMediaUrl,
  mapReplicateStatus,
  parseReplicatePromptId,
  replicateModelToSubfolder,
  replicateSubfolderToModel,
  sanitizeReplicateModelId,
} from './replicate-protocol';

describe('replicate protocol', () => {
  it('round-trips model id and prediction id through the studio prompt id', () => {
    const promptId = encodeReplicatePromptId(
      'black-forest-labs/flux-schnell',
      'abc123xyz'
    );
    assert.deepEqual(parseReplicatePromptId(promptId), {
      modelId: 'black-forest-labs/flux-schnell',
      predictionId: 'abc123xyz',
    });
  });

  it('rejects unsafe model ids and prompt ids', () => {
    assert.throws(() =>
      sanitizeReplicateModelId('../etc/passwd', 'black-forest-labs/flux-schnell')
    );
    assert.equal(
      sanitizeReplicateModelId(
        ' black-forest-labs/flux-dev ',
        'black-forest-labs/flux-schnell'
      ),
      'black-forest-labs/flux-dev'
    );
    assert.equal(parseReplicatePromptId('not-a-replicate-id'), null);
    assert.equal(
      parseReplicatePromptId('black-forest-labs/flux-schnell::bad id'),
      null
    );
  });

  it('encodes model paths as gallery subfolders', () => {
    assert.equal(
      replicateModelToSubfolder('black-forest-labs/flux-dev'),
      'black-forest-labs--flux-dev'
    );
    assert.equal(
      replicateSubfolderToModel('black-forest-labs--flux-dev'),
      'black-forest-labs/flux-dev'
    );
  });

  it('maps Replicate prediction statuses onto studio job states', () => {
    assert.equal(mapReplicateStatus('starting'), 'pending');
    assert.equal(mapReplicateStatus('processing'), 'running');
    assert.equal(mapReplicateStatus('succeeded'), 'completed');
    assert.equal(mapReplicateStatus('failed'), 'error');
    assert.equal(mapReplicateStatus('canceled'), 'error');
  });

  it('only fetches result pixels from Replicate delivery hosts', () => {
    assert.equal(
      isAllowedReplicateMediaUrl('https://replicate.delivery/pbxt/out.png'),
      true
    );
    assert.equal(
      isAllowedReplicateMediaUrl('https://pbxt.replicate.delivery/x.jpg'),
      true
    );
    assert.equal(isAllowedReplicateMediaUrl('https://evil.example/x.png'), false);
    assert.equal(isAllowedReplicateMediaUrl('http://replicate.delivery/x.png'), false);
  });

  it('picks the closest common aspect ratio for the queued size', () => {
    assert.equal(aspectRatioFromSize(1024, 1024), '1:1');
    assert.equal(aspectRatioFromSize(1280, 720), '16:9');
    assert.equal(aspectRatioFromSize(768, 1024), '3:4');
  });
});
