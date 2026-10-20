/**
 * Re-cut a film from the recipe on its Gallery entry (cut-recipe.ts): the same shots, trims,
 * framing, music and levels, in another shape or size — a vertical copy of a widescreen Day for
 * Reels, a 1080p master — without opening the Day or Story again. The new film is stamped on
 * the same Cast, its parent the film it was cut from.
 */

import { isCutRecipe } from '../cut-recipe';
import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery-entry';
import { assembleAndStampFilm, downloadFilmBlob } from './character-film-assemble-lazy';
import {
  filmResolutionForCutOptions,
  normalizeFilmResolution,
  type FilmShape,
} from '../video-resolution';

/** Shape and size a recipe was cut at (for the Re-cut pickers' starting values). */
export function recipeShapeAndSize(resolution?: string): {
  shape: FilmShape;
  quality: '720p' | '1080p';
} {
  const preset = normalizeFilmResolution(resolution);
  return {
    shape: preset.endsWith('-vertical')
      ? 'vertical'
      : preset.endsWith('-square')
        ? 'square'
        : 'wide',
    quality: preset.startsWith('1080') ? '1080p' : '720p',
  };
}

export async function recutFilm(input: {
  entry: ComfyGalleryEntry;
  characterName: string;
  shape: FilmShape;
  quality: '720p' | '1080p';
  onProgress?: (label: string) => void;
}): Promise<{ filename: string; persisted: boolean; entryId?: string }> {
  const recipe = input.entry.cutRecipe;
  if (!isCutRecipe(recipe) || recipe.shots.length === 0) {
    throw new Error('This film has no recipe to re-cut from (cut before 2.6).');
  }
  const characterId = input.entry.characterId?.trim();
  if (!characterId) throw new Error('This film is not on a Cast.');
  const result = await assembleAndStampFilm({
    shots: recipe.shots,
    characterId,
    characterName: input.characterName,
    lookId: input.entry.lookId,
    source: recipe.source,
    parentGalleryEntryId: input.entry.id,
    resolution: filmResolutionForCutOptions({ shape: input.shape, quality: input.quality }),
    crossfadeSec: recipe.crossfadeSec,
    audioBedUrl: recipe.audioBedUrl,
    stillMotion: recipe.stillMotion,
    captions: recipe.captions,
    titleCard: recipe.titleCard,
    length: recipe.length,
    beatSnap: recipe.beatSnap,
    musicLevel: recipe.musicLevel,
    voiceLevel: recipe.voiceLevel,
    look: recipe.look,
    lookStrength: recipe.lookStrength,
    matchShots: recipe.matchShots,
    followFaces: recipe.followFaces,
    smoothMotion: recipe.smoothMotion,
    sharpen: recipe.sharpen,
    logo: recipe.logo,
    sound: recipe.sound,
    onProgress: progress => input.onProgress?.(progress.label),
  });
  downloadFilmBlob(result.blob, result.filename);
  return { filename: result.filename, persisted: result.persisted, entryId: result.entryId };
}
