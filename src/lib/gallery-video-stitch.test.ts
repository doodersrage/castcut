import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FilmMediaRef } from './media-kind';
import {
  galleryStitchShotsFromMedia,
  isGalleryStitchableVideo,
} from './gallery-video-stitch';

function clip(id: string, at: number, extras: Partial<FilmMediaRef> = {}): FilmMediaRef {
  return {
    id,
    status: 'completed',
    derivedKind: 'i2v',
    tool: 'video',
    queuedAt: at,
    completedAt: at,
    prompt: `Clip ${id}`,
    viewUrl: `http://local/${id}.mp4`,
    mediaKind: 'video',
    ...extras,
  };
}

function still(id: string, at: number): FilmMediaRef {
  return {
    id,
    status: 'completed',
    tool: 'generate',
    queuedAt: at,
    completedAt: at,
    prompt: `Still ${id}`,
    viewUrl: `http://local/${id}.png`,
    mediaKind: 'image',
  };
}

describe('gallery-video-stitch', () => {
  it('accepts completed mp4/webm clips and assembled films', () => {
    assert.equal(isGalleryStitchableVideo(clip('a', 1)), true);
    assert.equal(
      isGalleryStitchableVideo(
        clip('film', 2, {
          derivedKind: 'film',
          tool: 'gallery',
          viewUrl: 'http://local/film.webm',
        })
      ),
      true
    );
    assert.equal(
      isGalleryStitchableVideo(
        clip('durable', 3, {
          viewUrl: '/api/gallery-media/abc/original',
          sourceImageUrl: undefined,
        })
      ),
      true
    );
  });

  it('accepts animated webp/gif clips and skips stills or unfinished jobs', () => {
    assert.equal(isGalleryStitchableVideo(still('s', 1)), false);
    assert.equal(isGalleryStitchableVideo(clip('running', 2, { status: 'running' })), false);
    assert.equal(
      isGalleryStitchableVideo(
        clip('webp', 3, {
          viewUrl: 'http://local/clip.webp',
          mediaKind: 'video',
        })
      ),
      true
    );
    assert.equal(
      isGalleryStitchableVideo(
        clip('gif', 4, {
          viewUrl: '/api/comfyui/view?filename=clip.gif&type=output',
          derivedKind: 't2v',
        })
      ),
      true
    );
    assert.equal(
      isGalleryStitchableVideo({
        id: 'empty',
        status: 'completed',
        derivedKind: 't2v',
        tool: 'video',
        queuedAt: 1,
        viewUrl: '',
      }),
      false
    );
  });

  it('builds shots oldest-first and drops stills from a mixed selection', () => {
    const shots = galleryStitchShotsFromMedia([
      clip('c', 30),
      still('s', 5),
      clip('webp', 15, { viewUrl: 'http://local/webp.webp' }),
      clip('a', 10),
      clip('b', 20),
    ]);
    assert.deepEqual(
      shots.map(shot => shot.entryId),
      ['a', 'webp', 'b', 'c']
    );
    assert.equal(
      shots.every(shot => shot.kind === 'clip'),
      true
    );
    assert.equal(shots[0]?.url, 'http://local/a.mp4');
  });
});
