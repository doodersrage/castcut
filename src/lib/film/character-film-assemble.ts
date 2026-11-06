/**
 * Play's film cut: fit the shots to the music / length (film-cut-media), assemble them
 * (video-assemble.ts, shared) and keep the cut on the Cast.
 */

import type { SubtitleStyle } from '../video/subtitle-style';
import type { FilmOutputProbe } from '../video/output-probe';
import type {
  ContentCredentialsRequest,
  ContentCredentialsResult,
} from '../video/content-credentials';
import type { CutSoundOptions } from '@/lib/video/cut-sound';
import { frameCutStills, prepareCutShots } from './cut-media';
import { framingAspect, type FilmCutLength } from './cut-plan';
import { filmDownloadFilename, type FilmPlaylistShot } from '../media/kind';
import { assembleFilmBlob, stampAssembledFilm, type AssembleFilmProgress } from '../video/assemble';
import type { FilmResolutionPreset } from '../video/resolution';
import type { FilmTitleCard } from '../video/polish';
import { cutRecipeFrom, type CutRecipe } from '../video/cut-recipe';
import type { FilmChapter, FilmRange } from '../video/film-finish';
import type { StoredLut } from '../video/cut-lut';

export * from '../video/assemble';

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
  /** Burn in what is said (else the narration) — server encode. */
  subtitles?: boolean;
  titleCard?: FilmTitleCard | null;
  preferServer?: boolean;
  /** How long the cut runs (fit stills to the music / a set length). Default: as the shots hold. */
  length?: FilmCutLength;
  /** Land still cuts on the music's beat. */
  beatSnap?: boolean;
  /** Music bed / lines gain (server encode). */
  musicLevel?: number;
  voiceLevel?: number;
  /** The film's colour look, its strength (0–1) and the automatic shot match (cut-look.ts). */
  look?: string;
  lookStrength?: number;
  matchShots?: boolean;
  /** Vertical / square cuts: the crop follows the face (cut-reframe.ts) — default on. */
  followFaces?: boolean;
  /** Clips under 25 fps get RIFE in-between frames; a light sharpen over the picture. */
  smoothMotion?: boolean;
  sharpen?: boolean;
  /** How the subtitles look (subtitle-style.ts). */
  subtitleStyle?: SubtitleStyle;
  /** A logo / watermark over the whole film (cut-overlay.ts). */
  logo?: { url: string; corner?: 'tl' | 'tr' | 'bl' | 'br' } | null;
  /** Music start / fades and the ambience track (cut-sound.ts). */
  sound?: CutSoundOptions | null;
  /** Where the cut came from — kept in its recipe. */
  source?: CutRecipe['source'];
  /** Film this one re-cuts (its parent in the Gallery). */
  parentGalleryEntryId?: string;
  /** Just this part (the Cut monitor's seconds): a review copy, downloaded and not kept. */
  range?: FilmRange | null;
  /** Chapter marks (Cut's chapter markers, monitor seconds). */
  chapters?: FilmChapter[];
  /** Shots before the ones the monitor shows (a "Previously on" recap). */
  leadShots?: number;
  /** Bring the film to this loudness (the export profile's target; film-finish.ts). */
  loudness?: { lufs: number; peakDbtp: number } | null;
  /** Also write the mix's stems — dialogue, music, ambience, effects — as WAVs in a .zip. */
  stems?: boolean;
  /** The subtitles as a track in the MP4 too (players turn it on and off). */
  subtitleTrack?: boolean;
  /** Sign the film with Content Credentials (C2PA). */
  contentCredentials?: ContentCredentialsRequest;
  /** A master: ProRes .mov — a download, not kept (the Gallery plays MP4s). */
  master?: boolean;
  /** false: a hand-off render (the render queue) — downloaded, not kept on the Cast. */
  keep?: boolean;
  /** "REVIEW" and the film's running timecode burned into the picture, top left. */
  reviewBurnIn?: boolean;
  /** Match every shot's colour to this one (its index in the shots) instead of the film's middle. */
  matchTo?: number | null;
  /** End credits, one line each, rolled after the last shot (polish.ts). */
  credits?: string[];
  /** The film's LUT as the cut keeps it (cut-lut.ts). */
  lut?: StoredLut | null;
  onProgress?: (progress: AssembleFilmProgress) => void;
}): Promise<{
  filename: string;
  blob: Blob;
  persisted: boolean;
  /** Why it wasn't kept on the Cast, when it wasn't (M6 D16). */
  reason?: 'too-large' | 'storage';
  entryId?: string;
  encodePath: 'server' | 'browser';
  /** What the cut plan did (length fit, beat snap). */
  cutNotes: string[];
  /** The film's subtitles as an .srt, when it has any. */
  subtitlesSrt?: string;
  /** The finished file read back on the server (M4 F6). */
  outputProbe?: FilmOutputProbe;
  /** The chapters written into the file (file seconds). */
  chapters?: FilmChapter[];
  /** The stems .zip, when asked for. */
  stemsZip?: Blob;
  /** Whether the film was signed with Content Credentials (when asked). */
  contentCredentials?: ContentCredentialsResult;
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
  // Waist-up / chest-up stills: cropped around the face before either encoder sees them.
  const framed = await frameCutStills(prepared.shots, framingAspect(input.resolution));
  if (framed.notes.length > 0) prepared.notes.push(...framed.notes);
  const assembled = await assembleFilmBlob(framed.shots, {
    onProgress: input.onProgress,
    preferServer: input.preferServer,
    resolution: input.resolution,
    crossfadeSec: input.crossfadeSec,
    audioBedUrl: input.audioBedUrl,
    stillMotion: input.stillMotion,
    captions: input.captions,
    subtitles: input.subtitles,
    titleCard: input.titleCard,
    musicLevel: input.musicLevel,
    voiceLevel: input.voiceLevel,
    look: input.look,
    lookStrength: input.lookStrength,
    matchShots: input.matchShots,
    followFaces: input.followFaces,
    smoothMotion: input.smoothMotion,
    sharpen: input.sharpen,
    subtitleStyle: input.subtitleStyle,
    logo: input.logo,
    sound: input.sound,
    ...(input.range ? { range: input.range } : {}),
    ...(input.chapters?.length ? { chapters: input.chapters } : {}),
    ...(input.leadShots ? { leadShots: input.leadShots } : {}),
    ...(input.loudness ? { loudness: input.loudness } : {}),
    ...(input.stems ? { stems: true } : {}),
    ...(input.subtitleTrack ? { subtitleTrack: true } : {}),
    ...(input.contentCredentials ? { contentCredentials: input.contentCredentials } : {}),
    ...(input.master ? { master: true } : {}),
    ...(input.reviewBurnIn ? { reviewBurnIn: true } : {}),
    ...(input.matchTo != null ? { matchTo: input.matchTo } : {}),
    ...(input.credits?.length ? { credits: input.credits } : {}),
    ...(input.lut ? { lut: input.lut } : {}),
  });
  if ((input.range || input.master) && assembled.encodePath !== 'server') {
    throw new Error(
      input.master
        ? 'A ProRes master needs the server encode (ffmpeg).'
        : 'Rendering just a part needs the server encode (ffmpeg).'
    );
  }
  // The browser recorder draws pictures only: say what the server encode would have added.
  if (assembled.encodePath === 'browser') {
    const lost = [
      framed.shots.some(shot => shot.narrationUrl) ? 'narration' : '',
      input.audioBedUrl?.trim() ? 'music' : '',
      framed.shots.some(shot => shot.kind === 'clip') ? "the clips' sound" : '',
    ].filter(Boolean);
    if (lost.length) {
      prepared.notes.push(
        `made in the browser without ${lost.join(', ')} — the server encode (ffmpeg) was not available; cut again once it is`
      );
    }
  }
  const filename = input.range
    ? filmDownloadFilename(input.characterName, assembled.extension).replace(
        /(\.[a-z0-9]+)$/i,
        `-part-${Math.round(input.range.fromSec)}s-${Math.round(input.range.toSec)}s$1`
      )
    : input.master
      ? filmDownloadFilename(input.characterName, assembled.extension).replace(
          /(\.[a-z0-9]+)$/i,
          '-master$1'
        )
      : filmDownloadFilename(input.characterName, assembled.extension);
  // A part is a review copy, a master a handoff file: downloaded, not kept on the Cast or in the
  // Gallery.
  if (input.range || input.master || input.keep === false) {
    return {
      filename,
      blob: assembled.blob,
      encodePath: assembled.encodePath,
      cutNotes: prepared.notes,
      persisted: false,
      ...(assembled.subtitlesSrt ? { subtitlesSrt: assembled.subtitlesSrt } : {}),
      ...(assembled.outputProbe ? { outputProbe: assembled.outputProbe } : {}),
      ...(assembled.chapters?.length ? { chapters: assembled.chapters } : {}),
      ...(assembled.stemsZip ? { stemsZip: assembled.stemsZip } : {}),
      ...(assembled.contentCredentials ? { contentCredentials: assembled.contentCredentials } : {}),
    };
  }
  const stamped = await stampAssembledFilm({
    blob: assembled.blob,
    filename,
    characterId: input.characterId,
    characterName: input.characterName,
    lookId: input.lookId,
    mimeType: assembled.mimeType,
    serverEncoded: assembled.encodePath === 'server',
    ...(assembled.serverJobId ? { serverJobId: assembled.serverJobId } : {}),
    parentGalleryEntryId: input.parentGalleryEntryId,
    cutRecipe: cutRecipeFrom({
      source: input.source,
      shots: input.shots,
      resolution: input.resolution,
      crossfadeSec: input.crossfadeSec,
      audioBedUrl: input.audioBedUrl,
      stillMotion: input.stillMotion,
      captions: input.captions,
      titleCard: input.titleCard,
      length: input.length,
      beatSnap: input.beatSnap,
      musicLevel: input.musicLevel,
      voiceLevel: input.voiceLevel,
      look: input.look,
      lookStrength: input.lookStrength,
      matchShots: input.matchShots,
      followFaces: input.followFaces,
      smoothMotion: input.smoothMotion,
      sharpen: input.sharpen,
      subtitleStyle: input.subtitleStyle,
      logo: input.logo,
      sound: input.sound,
    }),
    onProgress: input.onProgress,
  });
  return {
    filename,
    blob: assembled.blob,
    encodePath: assembled.encodePath,
    cutNotes: prepared.notes,
    ...(assembled.subtitlesSrt ? { subtitlesSrt: assembled.subtitlesSrt } : {}),
    ...(assembled.outputProbe ? { outputProbe: assembled.outputProbe } : {}),
    ...(assembled.chapters?.length ? { chapters: assembled.chapters } : {}),
    ...(assembled.stemsZip ? { stemsZip: assembled.stemsZip } : {}),
    ...(assembled.contentCredentials ? { contentCredentials: assembled.contentCredentials } : {}),
    ...stamped,
  };
}
