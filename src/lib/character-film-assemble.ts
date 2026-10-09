/**
 * Play's film cut: fit the shots to the music / length (film-cut-media), assemble them
 * (video-assemble.ts, shared) and keep the cut on the Cast.
 */

import { prepareCutShots } from './film-cut-media';
import type { FilmCutLength } from './film-cut-plan';
import { filmDownloadFilename, type FilmPlaylistShot } from './media-kind';
import { assembleFilmBlob, stampAssembledFilm, type AssembleFilmProgress } from './video-assemble';
import type { FilmResolutionPreset } from './video-resolution';
import type { FilmTitleCard } from './video-polish';

export * from './video-assemble';

export async function assembleAndStampFilm(input: {
  shots: FilmPlaylistShot[];
  characterId: string;
  characterName: string;
  lookId?: string;
  resolution?: FilmResolutionPreset;
  crossfadeSec?: number;
  audioBedUrl?: string;
  stillMotion?: boolean;
  captions?: boolean;
  titleCard?: FilmTitleCard | null;
  preferServer?: boolean;
  /** How long the cut runs (fit stills to the music / a set length). Default: as the shots hold. */
  length?: FilmCutLength;
  /** Land still cuts on the music's beat. */
  beatSnap?: boolean;
  onProgress?: (progress: AssembleFilmProgress) => void;
}): Promise<{
  filename: string;
  blob: Blob;
  persisted: boolean;
  entryId?: string;
  encodePath: 'server' | 'browser';
  /** What the cut plan did (length fit, beat snap). */
  cutNotes: string[];
}> {
  input.onProgress?.({ ratio: 0.01, label: 'Timing the cut…' });
  const prepared = await prepareCutShots(input.shots, {
    length: input.length,
    beatSnap: input.beatSnap,
    audioBedUrl: input.audioBedUrl,
    crossfadeSec: input.crossfadeSec,
    titleCard: Boolean(input.titleCard?.title?.trim()),
    captions: input.captions,
  });
  const assembled = await assembleFilmBlob(prepared.shots, {
    onProgress: input.onProgress,
    preferServer: input.preferServer,
    resolution: input.resolution,
    crossfadeSec: input.crossfadeSec,
    audioBedUrl: input.audioBedUrl,
    stillMotion: input.stillMotion,
    captions: input.captions,
    titleCard: input.titleCard,
  });
  const filename = filmDownloadFilename(input.characterName, assembled.extension);
  const stamped = await stampAssembledFilm({
    blob: assembled.blob,
    filename,
    characterId: input.characterId,
    characterName: input.characterName,
    lookId: input.lookId,
    mimeType: assembled.mimeType,
    serverEncoded: assembled.encodePath === 'server',
    onProgress: input.onProgress,
  });
  return {
    filename,
    blob: assembled.blob,
    encodePath: assembled.encodePath,
    cutNotes: prepared.notes,
    ...stamped,
  };
}
