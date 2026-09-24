/**
 * In-memory film assemble jobs with optional disk spill for completed MP4 bytes.
 */

import { normalizeFilmTitleCard, type FilmTitleCard } from './film-polish';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolvePromptDataDir } from './prompt-data-paths';
import type { FilmPlaylistShot } from './character-film';
import {
  encodeFilmPlaylistServer,
  isServerFilmEncodeAvailable,
  normalizeFilmCrossfadeSec,
  normalizeFilmResolution,
  type FilmResolutionPreset,
  type FilmServerEncodeResult,
} from './film-server-encode';

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
  /** Relative path under data dir when completed. */
  outputRelativePath?: string;
};

type InternalJob = FilmAssembleJob & {
  buffer?: Buffer;
};

const jobs = new Map<string, InternalJob>();
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
  titleCard?: FilmTitleCard | null;
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
        titleCard: normalizeFilmTitleCard(input.titleCard),
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

    await fs.mkdir(/* turbopackIgnore: true */ outputDir(), { recursive: true });
    const relative = path.join('film-output', `${id}.mp4`);
    await fs.writeFile(
      path.join(/* turbopackIgnore: true */ resolvePromptDataDir(), relative),
      result.buffer
    );

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
