import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addStillToFilmCut,
  canStampAssembledFilm,
  clampStillHoldSec,
  defaultFilmCut,
  filmDownloadFilename,
  isAssembledFilmEntry,
  isFilmSourceClip,
  isFilmSourceStill,
  MAX_GALLERY_FILM_BYTES,
  moveFilmCutItem,
  normalizeFilmCut,
  resolveFilmPlaylist,
  roleplayWatchPlaylist,
  setFilmCutHoldSec,
  setFilmCutIncluded,
} from './character-film';
import type { RoleplayStoryBeat } from '../story/roleplay';

function clip(id: string, at: number) {
  return {
    id,
    status: 'completed' as const,
    derivedKind: 'i2v' as const,
    tool: 'video',
    queuedAt: at,
    completedAt: at,
    prompt: `Clip ${id}`,
    viewUrl: `http://local/${id}.mp4`,
    mediaKind: 'video',
  };
}

function still(id: string, at: number) {
  return {
    id,
    status: 'completed' as const,
    tool: 'roleplay',
    queuedAt: at,
    completedAt: at,
    prompt: `Still ${id}`,
    viewUrl: `http://local/${id}.png`,
    mediaKind: 'image',
  };
}

describe('character-film', () => {
  it('defaults the cut to completed clips in story order and skips assembled films', () => {
    const film = {
      id: 'film-1',
      status: 'completed' as const,
      derivedKind: 'film' as const,
      tool: 'roleplay',
      queuedAt: 3,
      completedAt: 3,
      viewUrl: 'http://local/film.webm',
      mediaKind: 'video',
    };
    const cut = defaultFilmCut([clip('b', 20), still('s', 5), clip('a', 10), film]);
    assert.deepEqual(
      cut.items.map(item => item.entryId),
      ['a', 'b']
    );
    assert.equal(cut.items.every(item => item.included), true);
    assert.equal(isAssembledFilmEntry(film), true);
    assert.equal(isFilmSourceClip(film), false);
    assert.equal(isFilmSourceStill(still('s', 1)), true);
  });

  it('appends new clips, drops missing ids, and keeps stills the user added', () => {
    const entries = [clip('a', 10), clip('c', 30), still('s', 15)];
    const cut = normalizeFilmCut(
      {
        items: [
          { entryId: 'gone', included: true },
          { entryId: 's', included: true, holdSec: 4 },
          { entryId: 'a', included: false },
        ],
        stillHoldSec: 2.5,
        updatedAt: 1,
      },
      entries
    );
    assert.deepEqual(
      cut.items.map(item => item.entryId),
      ['s', 'a', 'c']
    );
    assert.equal(cut.items[0]?.holdSec, 4);
    assert.equal(cut.items[1]?.included, false);
    assert.equal(cut.items[2]?.included, true);
  });

  it('resolves only included shots with a playable url', () => {
    const entries = [clip('a', 10), still('s', 15)];
    const cut = addStillToFilmCut(defaultFilmCut(entries), still('s', 15));
    const skipped = setFilmCutIncluded(cut, 'a', false);
    const playlist = resolveFilmPlaylist(skipped, entries);
    assert.equal(playlist.length, 1);
    assert.equal(playlist[0]?.kind, 'still');
    assert.equal(playlist[0]?.url, 'http://local/s.png');
    assert.equal(playlist[0]?.holdSec, 2.5);
  });

  it('reorders, clamps still holds, and names the download', () => {
    const cut = {
      items: [
        { entryId: 'a', included: true },
        { entryId: 'b', included: true },
      ],
      stillHoldSec: 2.5,
      updatedAt: 1,
    };
    const moved = moveFilmCutItem(cut, 'b', -1);
    assert.deepEqual(
      moved.items.map(item => item.entryId),
      ['b', 'a']
    );
    assert.equal(clampStillHoldSec(99), 12);
    assert.equal(clampStillHoldSec(0), 0.5);
    const held = setFilmCutHoldSec(cut, 'a', 8);
    assert.equal(held.items[0]?.holdSec, 8);
    assert.match(filmDownloadFilename('Rin Vale'), /^rin-vale-film-\d{4}-\d{2}-\d{2}\.webm$/);
  });

  it('builds a Roleplay watch playlist: clip when present, otherwise the still', () => {
    const story: RoleplayStoryBeat[] = [
      {
        id: 'a',
        title: 'Dock',
        blurb: 'Arrives',
        at: 1,
        imageUrl: 'http://local/still.png',
        stillStatus: 'completed',
        clipUrl: 'http://local/clip.mp4',
        clipStatus: 'completed',
      },
      {
        id: 'b',
        title: 'Hall',
        blurb: 'Walks',
        at: 2,
        imageUrl: 'http://local/hall.png',
        stillStatus: 'completed',
      },
    ];
    const playlist = roleplayWatchPlaylist(story, 3);
    assert.equal(playlist.length, 2);
    assert.equal(playlist[0]?.kind, 'clip');
    assert.equal(playlist[0]?.url, 'http://local/clip.mp4');
    assert.equal(playlist[1]?.kind, 'still');
    assert.equal(playlist[1]?.holdSec, 3);
  });

  it('treats completed animated webp beats as watch clips, not stills', () => {
    const playlist = roleplayWatchPlaylist(
      [
        {
          id: 'a',
          title: 'Dock',
          blurb: 'Arrives',
          at: 1,
          imageUrl: 'http://local/still.png',
          stillStatus: 'completed',
          clipUrl: '/api/comfyui/view?filename=clip.webp&type=output',
          clipStatus: 'completed',
        },
      ],
      3
    );
    assert.equal(playlist.length, 1);
    assert.equal(playlist[0]?.kind, 'clip');
    assert.match(playlist[0]?.url ?? '', /clip\.webp/);
  });

  it('stamps an already-cut film blob without requiring a new assemble', () => {
    assert.equal(canStampAssembledFilm(1), true);
    assert.equal(canStampAssembledFilm(MAX_GALLERY_FILM_BYTES), true);
    assert.equal(canStampAssembledFilm(0), false);
    assert.equal(canStampAssembledFilm(MAX_GALLERY_FILM_BYTES + 1), false);
    assert.equal(
      canStampAssembledFilm(MAX_GALLERY_FILM_BYTES + 1, { serverEncoded: true }),
      true
    );
  });
});
