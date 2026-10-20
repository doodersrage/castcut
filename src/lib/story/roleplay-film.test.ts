import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isGalleryClipEntry,
  lastRoleplayMotionSource,
  looksLikeMotionUrl,
  looksLikeVideoUrl,
  nextRoleplayMotionKind,
  normalizeRoleplayBeatOutput,
  shouldAutoQueueRoleplayClip,
} from './roleplay-film';
import type { RoleplayStoryBeat } from './roleplay';

describe('roleplay-film', () => {
  it('defaults beat output to clip', () => {
    assert.equal(normalizeRoleplayBeatOutput(undefined), 'clip');
    assert.equal(normalizeRoleplayBeatOutput('still'), 'still');
  });

  it('extends when the parent is already a clip', () => {
    assert.equal(nextRoleplayMotionKind({ derivedKind: 'i2v', tool: 'video' }), 'extend');
    assert.equal(nextRoleplayMotionKind({ derivedKind: 't2v', tool: 'video' }), 'extend');
    assert.equal(nextRoleplayMotionKind({ tool: 'character' }), 'i2v');
    assert.equal(nextRoleplayMotionKind(undefined), 't2v');
  });

  it('prefers a completed clip over the still for the next init frame', () => {
    const story: RoleplayStoryBeat[] = [
      {
        id: 'a',
        title: 'Dock',
        blurb: 'Arrives',
        at: 1,
        promptId: 'still-1',
        imageUrl: 'http://local/still.png',
        stillStatus: 'completed',
        clipPromptId: 'clip-1',
        clipUrl: 'http://local/clip.mp4',
        clipStatus: 'completed',
      },
    ];
    const source = lastRoleplayMotionSource(story);
    assert.equal(source?.fromClip, true);
    assert.equal(source?.imageUrl, 'http://local/clip.mp4');
    assert.equal(source?.parentPromptId, 'clip-1');
  });

  it('auto-queues a clip once the still lands', () => {
    assert.equal(
      shouldAutoQueueRoleplayClip({
        id: 'a',
        title: 'Dock',
        blurb: 'Arrives',
        at: 1,
        imageUrl: 'http://local/still.png',
        stillStatus: 'completed',
      }),
      true
    );
    assert.equal(
      shouldAutoQueueRoleplayClip({
        id: 'a',
        title: 'Dock',
        blurb: 'Arrives',
        at: 1,
        imageUrl: 'http://local/still.png',
        stillStatus: 'completed',
        clipPromptId: 'clip-1',
      }),
      false
    );
    assert.equal(
      shouldAutoQueueRoleplayClip({
        id: 'b',
        title: 'Dock',
        blurb: 'Arrives',
        at: 1,
        prompt: 'walks onto the pier',
      }),
      true
    );
    assert.equal(
      shouldAutoQueueRoleplayClip({
        id: 'c',
        title: 'Dock',
        blurb: 'Arrives',
        at: 1,
        imageUrl: 'http://local/still.png',
        stillStatus: 'completed',
        clipStatus: 'error',
        clipTakes: [{ clipStatus: 'error' }],
      }),
      false
    );
  });

  it('treats mp4 and i2v/extend entries as clips', () => {
    assert.equal(looksLikeVideoUrl('http://local/clip.mp4'), true);
    assert.equal(looksLikeVideoUrl('http://local/still.png'), false);
    assert.equal(
      looksLikeVideoUrl('/api/comfyui/view?filename=clip.mp4&type=output'),
      true,
    );
    assert.equal(
      looksLikeVideoUrl('/api/fal/view?filename=job.mp4&promptId=abc'),
      true,
    );
    assert.equal(
      looksLikeVideoUrl('/api/comfyui/view?filename=clip.webp&type=output'),
      false,
    );
    assert.equal(
      looksLikeMotionUrl('/api/comfyui/view?filename=clip.webp&type=output'),
      true,
    );
    assert.equal(isGalleryClipEntry({ derivedKind: 'extend', tool: 'video' }), true);
    assert.equal(isGalleryClipEntry({ derivedKind: 'film', tool: 'roleplay' }), true);
    assert.equal(isGalleryClipEntry({ tool: 'character', mediaKind: 'image' }), false);
  });
});
