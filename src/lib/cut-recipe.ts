/**
 * How a film was cut — its shots in order (with trims, framing, captions, holds) and the cut
 * options — kept on the film's Gallery entry, so it can be shown ("what's in this film") and cut
 * again in another shape or size without rebuilding the Day or Story (roadmap review 2026-10-11:
 * a durable home for each film, export presets). Shared: the shared stamp step stores it.
 */

import type { CutSoundOptions } from '@/lib/cut-sound';
import type { FilmPlaylistShot } from './media-kind';
import type { FilmTitleCard } from './video-polish';
import type { FilmResolutionPreset } from './video-resolution';

export type CutRecipe = {
  version: 1;
  /** Where the cut came from. */
  source?: 'day' | 'story' | 'episode' | 'cast';
  shots: FilmPlaylistShot[];
  resolution?: FilmResolutionPreset;
  crossfadeSec?: number;
  audioBedUrl?: string;
  stillMotion?: boolean;
  captions?: boolean;
  titleCard?: FilmTitleCard | null;
  length?: 'shots' | 'music' | 15 | 30 | 60;
  beatSnap?: boolean;
  musicLevel?: number;
  voiceLevel?: number;
  /** The film's colour look, its strength (0–1) and the automatic shot match (cut-look.ts). */
  look?: string;
  lookStrength?: number;
  matchShots?: boolean;
  /** Music start / fades and the ambience track (cut-sound.ts). */
  sound?: CutSoundOptions | null;
  /** Shots a re-cut can't bring back (a demo / uploaded still held only in the browser). */
  droppedShots?: number;
};

const isData = (url?: string) => Boolean(url?.trim().startsWith('data:'));

/**
 * The recipe to keep: data: URLs are not kept (they would bloat every entry, and a re-cut
 * can't fetch them from another device) — those shots are counted instead.
 */
export function cutRecipeFrom(input: Omit<CutRecipe, 'version' | 'droppedShots'>): CutRecipe {
  const shots = input.shots
    .filter(shot => !isData(shot.url))
    .map(shot => {
      const keep: FilmPlaylistShot = {
        title: shot.title,
        url: shot.url,
        kind: shot.kind,
      };
      for (const field of [
        'entryId',
        'key',
        'holdSec',
        'caption',
        'trimStartSec',
        'trimEndSec',
        'framing',
        'transitionIn',
        'spoken',
        'volume',
        'motion',
      ] as const) {
        if (shot[field] !== undefined) (keep as Record<string, unknown>)[field] = shot[field];
      }
      return keep;
    });
  const dropped = input.shots.length - shots.length;
  return {
    version: 1,
    ...input,
    shots,
    audioBedUrl: isData(input.audioBedUrl) ? undefined : input.audioBedUrl?.trim() || undefined,
    ...(dropped > 0 ? { droppedShots: dropped } : {}),
  };
}

export function isCutRecipe(value: unknown): value is CutRecipe {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as CutRecipe).version === 1 &&
    Array.isArray((value as CutRecipe).shots)
  );
}

/** "6 shots · 2 clips · vertical 720p · music · 1 shot can't be re-cut". */
export function cutRecipeSummary(recipe: CutRecipe): string {
  const clips = recipe.shots.filter(shot => shot.kind === 'clip').length;
  const resolution = recipe.resolution ?? '720p';
  const [size, shape] = resolution.split('-');
  return [
    `${recipe.shots.length} shot${recipe.shots.length === 1 ? '' : 's'}`,
    clips ? `${clips} clip${clips === 1 ? '' : 's'}` : '',
    `${shape ? `${shape} ` : ''}${size}`,
    recipe.audioBedUrl ? 'music' : '',
    recipe.droppedShots
      ? `${recipe.droppedShots} shot${recipe.droppedShots === 1 ? '' : 's'} can't be re-cut`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
