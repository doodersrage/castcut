/**
 * In-memory film assemble jobs with optional disk spill for completed MP4 bytes.
 */

import type { CutSoundOptions } from '@/lib/video/cut-sound';
import { normalizeFilmTitleCard, type FilmTitleCard } from './polish';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolvePromptDataDir } from '../prompt/data-paths';
import type { FilmPlaylistShot } from '../media/kind';
import type { FilmOutputProbe } from './output-probe';
import { probeFilmOutput } from './output-probe-server';
import {
  encodeFilmPlaylistServer,
  isServerFilmEncodeAvailable,
  resolveFfmpegBinary,
  normalizeFilmCrossfadeSec,
  normalizeFilmResolution,
  type FilmResolutionPreset,
  type FilmServerEncodeResult,
} from './server-encode';

export type FilmAssembleJobStatus = 'queued' | 'running' | 'completed' | 'error';

export type FilmAssembleJob = {
  id: string;
  status: FilmAssembleJobStatus;
  ratio: number;
  label: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  mimeType?: string;
  extension?: string;
  byteLength?: number;
  width?: number;
  height?: number;
  /** The finished file read back (M4 F6): length, size, frame rate, sound, loudness. */
  outputProbe?: FilmOutputProbe;
  /** Relative path under data dir when completed. */
  outputRelativePath?: string;
  /** The film's subtitles as an .srt (cut-subtitles.ts), when there were any. */
  subtitlesSrt?: string;
};

type InternalJob = FilmAssembleJob & {
  buffer?: Buffer;
};

// On globalThis like the clip jobs (clip-jobs-server.ts): a dev reload of this module, or a
// second copy of it, still finds the jobs started before.
const jobs = ((globalThis as { __castcutFilmJobs?: Map<string, InternalJob> }).__castcutFilmJobs ??=
  new Map<string, InternalJob>());
/** Why the finished film couldn't be saved, in words a person can act on. */
export function filmWriteFailure(error: unknown, dataDir: string): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'ENOSPC') {
    return 'The server’s disk is full, so the film couldn’t be saved. Free some space and cut again.';
  }
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
    return `The server can’t write to its data folder (${dataDir}), so the film couldn’t be saved. Check that folder’s permissions.`;
  }
  return `The film couldn’t be saved on the server: ${error instanceof Error ? error.message : String(error)}`;
}

const MAX_JOBS = 40;
const MAX_AGE_MS = 60 * 60 * 1000;

function outputDir(): string {
  return path.join(/* turbopackIgnore: true */ resolvePromptDataDir(), 'film-output');
}

function pruneJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.updatedAt > MAX_AGE_MS) {
      jobs.delete(id);
      if (job.outputRelativePath) {
        void fs
          .unlink(
            path.join(/* turbopackIgnore: true */ resolvePromptDataDir(), job.outputRelativePath)
          )
          .catch(() => undefined);
      }
    }
  }
  while (jobs.size > MAX_JOBS) {
    const oldest = [...jobs.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
    if (!oldest) break;
    jobs.delete(oldest[0]);
  }
}

export function getFilmAssembleJob(id: string): FilmAssembleJob | null {
  const job = jobs.get(id.trim());
  if (!job) return null;
  const { buffer: _buffer, ...publicJob } = job;
  return publicJob;
}

export async function readFilmAssembleOutput(id: string): Promise<Buffer | null> {
  const job = jobs.get(id.trim());
  if (!job || job.status !== 'completed') {
    return null;
  }
  if (job.buffer) {
    return job.buffer;
  }
  if (!job.outputRelativePath) {
    return null;
  }
  try {
    return await fs.readFile(
      path.join(/* turbopackIgnore: true */ resolvePromptDataDir(), job.outputRelativePath)
    );
  } catch {
    return null;
  }
}

export type StartFilmAssembleInput = {
  shots: FilmPlaylistShot[];
  resolution?: FilmResolutionPreset | string;
  crossfadeSec?: number;
  audioBedUrl?: string;
  stillMotion?: boolean;
  captions?: boolean;
  subtitles?: boolean;
  titleCard?: FilmTitleCard | null;
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
  /** A logo / watermark over the whole film (cut-overlay.ts). */
  logo?: { url: string; corner?: 'tl' | 'tr' | 'bl' | 'br' } | null;
  /** Music start / fades and the ambience track (cut-sound.ts). */
  sound?: CutSoundOptions | null;
  requestOrigin?: string;
  userId?: string | null;
};

export async function startFilmAssembleJob(
  input: StartFilmAssembleInput
): Promise<FilmAssembleJob> {
  pruneJobs();
  if (!(await isServerFilmEncodeAvailable())) {
    throw new Error('ffmpeg is not available. Install ffmpeg or use browser Cut.');
  }
  if (!Array.isArray(input.shots) || input.shots.length === 0) {
    throw new Error('Include at least one shot in the cut.');
  }

  const id = randomUUID();
  const now = Date.now();
  const job: InternalJob = {
    id,
    status: 'queued',
    ratio: 0,
    label: 'Queued',
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(id, job);

  void runJob(id, input);
  return getFilmAssembleJob(id)!;
}

async function runJob(id: string, input: StartFilmAssembleInput): Promise<void> {
  const job = jobs.get(id);
  if (!job) return;
  job.status = 'running';
  job.label = 'Starting encode…';
  job.updatedAt = Date.now();

  try {
    const result: FilmServerEncodeResult = await encodeFilmPlaylistServer(
      input.shots,
      {
        resolution: normalizeFilmResolution(input.resolution),
        crossfadeSec: normalizeFilmCrossfadeSec(input.crossfadeSec),
        audioBedUrl: input.audioBedUrl,
        stillMotion: input.stillMotion === true,
        captions: input.captions === true,
        subtitles: input.subtitles === true,
        titleCard: normalizeFilmTitleCard(input.titleCard),
        musicLevel: input.musicLevel,
        voiceLevel: input.voiceLevel,
        look: input.look,
        lookStrength: input.lookStrength,
        matchShots: input.matchShots,
        followFaces: input.followFaces,
        smoothMotion: input.smoothMotion,
        sharpen: input.sharpen,
        logo: input.logo,
        sound: input.sound,
        userId: input.userId,
        onProgress: (ratio, label) => {
          const current = jobs.get(id);
          if (!current) return;
          current.ratio = ratio;
          current.label = label;
          current.updatedAt = Date.now();
        },
      },
      input.requestOrigin
    );

    const relative = path.join('film-output', `${id}.mp4`);
    const written = path.join(/* turbopackIgnore: true */ resolvePromptDataDir(), relative);
    try {
      await fs.mkdir(/* turbopackIgnore: true */ outputDir(), { recursive: true });
      await fs.writeFile(written, result.buffer);
    } catch (error) {
      // No half film left behind, and a reason a person can act on (H1, ROADMAP §10).
      await fs.rm(written, { force: true }).catch(() => undefined);
      throw new Error(filmWriteFailure(error, resolvePromptDataDir()));
    }
    // What the file turned out to be, checked against the cut's profile in Cut (M4 F6).
    const progress = jobs.get(id);
    if (progress) {
      progress.ratio = 0.99;
      progress.label = 'Checking the film…';
      progress.updatedAt = Date.now();
    }
    // Never fails the encode: the film is written; without a probe it just isn't checked.
    const outputProbe = await resolveFfmpegBinary()
      .then(ffmpeg => (ffmpeg ? probeFilmOutput(ffmpeg, written) : null))
      .catch(() => null);

    const current = jobs.get(id);
    if (!current) return;
    current.status = 'completed';
    current.ratio = 1;
    current.label = 'Encode complete';
    current.mimeType = result.mimeType;
    current.extension = result.extension;
    current.byteLength = result.buffer.byteLength;
    current.width = result.width;
    current.height = result.height;
    current.outputRelativePath = relative;
    if (result.subtitlesSrt) current.subtitlesSrt = result.subtitlesSrt;
    if (outputProbe) current.outputProbe = outputProbe;
    current.buffer = result.buffer;
    current.updatedAt = Date.now();
  } catch (error) {
    const current = jobs.get(id);
    if (!current) return;
    current.status = 'error';
    current.error = error instanceof Error ? error.message : 'Film encode failed.';
    current.label = 'Encode failed';
    current.updatedAt = Date.now();
  }
}
