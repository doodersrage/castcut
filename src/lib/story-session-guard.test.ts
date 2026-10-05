import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RoleplayStoryBeat } from './roleplay';
import { normalizeRoleplayLibrarySession } from './roleplay-library';
import { DEFAULT_ROLEPLAY_TOOL_CACHE } from './settings-cache';
import {
  castIdForStorySession,
  guardStoryForSession,
  restampStoryCast,
  storyHasOtherCastBeats,
} from './story-session-guard';

const beat = (id: string, castId?: string): RoleplayStoryBeat => ({
  id,
  title: id,
  blurb: `${id} blurb`,
  at: 1,
  ...(castId ? { castId } : {}),
});

describe('story-session-guard', () => {
  it('reads the Cast of a Cast-linked session only', () => {
    assert.equal(castIdForStorySession('cast-char-nora'), 'char-nora');
    assert.equal(castIdForStorySession('roleplay-123'), null);
    assert.equal(castIdForStorySession('cast-'), null);
    assert.equal(castIdForStorySession(undefined), null);
  });

  it('stamps unstamped scenes and drops another Cast’s', () => {
    const { story, dropped } = guardStoryForSession(
      [beat('door', 'char-nora'), beat('wardrobe'), beat('cinema', 'char-tomas')],
      'cast-char-tomas'
    );
    assert.deepEqual(
      story.map(entry => [entry.id, entry.castId]),
      [
        ['wardrobe', 'char-tomas'],
        ['cinema', 'char-tomas'],
      ]
    );
    assert.deepEqual(
      dropped.map(entry => entry.id),
      ['door']
    );
  });

  it('leaves a free-standing story and an already-stamped reel as they are', () => {
    const free = [beat('a', 'char-nora')];
    assert.equal(guardStoryForSession(free, 'roleplay-1').story, free);
    const own = [beat('a', 'char-nora')];
    assert.equal(guardStoryForSession(own, 'cast-char-nora').story, own);
  });

  it('re-stamps a story moved to a new Cast id', () => {
    const moved = restampStoryCast([beat('a', 'old'), beat('b')], 'old', 'new');
    assert.deepEqual(
      moved?.map(entry => entry.castId),
      ['new', 'new']
    );
    assert.equal(storyHasOtherCastBeats([beat('a', 'x')], 'y'), true);
    assert.equal(storyHasOtherCastBeats([beat('a')], 'y'), false);
  });

  it('a library session never keeps another Cast’s scenes', () => {
    const session = normalizeRoleplayLibrarySession({
      id: 'cast-char-tomas',
      createdAt: 1,
      updatedAt: 2,
      title: 'Tomas',
      snapshot: {
        ...DEFAULT_ROLEPLAY_TOOL_CACHE,
        bio: { name: 'Tomas', look: 'grey tee', personality: 'calm' },
        story: [beat('door', 'char-nora'), beat('cinema')],
      },
    });
    assert.deepEqual(
      session?.snapshot.story?.map(entry => [entry.id, entry.castId]),
      [['cinema', 'char-tomas']]
    );
  });
});
