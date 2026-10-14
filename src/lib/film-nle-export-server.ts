import 'server-only';

/**
 * Builds the editor export for a film's cut recipe (film-nle-export.ts writes the timelines):
 * every shot fetched and made editor-friendly — clips as H.264/AAC MP4 at 24 fps (WAN's animated
 * WebP imports nowhere), stills as PNG, the music as AAC — then zipped with the timelines.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { clipTrimWindow } from './clip-trim';
import type { CutRecipe } from './cut-recipe';
import {
  buildEdl,
  buildFcpxml,
  buildSrt,
  NLE_FPS,
  nleReadme,
  type NleShot,
} from './film-nle-export';
import { createZipFileFromDiskPaths, type ZipDiskEntry } from './gallery-zip-stream';
import { DEFAULT_STILL_HOLD_SEC } from './media-kind';
import { fetchFilmShotBytes } from './video-shot-fetch';
import { filmTempOsDir, resolveFfmpegBinary } from './video-server-encode';
import { FILM_PRESET_SIZE, normalizeFilmResolution } from './video-resolution';

function run(bin: string, args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise(resolve => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => {
      if (stderr.length < 64_000) stderr += String(chunk);
    });
    child.on('error', () => resolve({ code: -1, stderr }));
    child.on('close', code => resolve({ code, stderr }));
  });
}

async function durationOf(ffmpeg: string, file: string): Promise<number | null> {
  const { stderr } = await run(ffmpeg, ['-hide_banner', '-i', file]);
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const sec = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return sec > 0 ? sec : null;
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'shot'
  );
}

export type FilmNleExportResult = {
  zipPath: string;
  dir: string;
  shots: number;
  skipped: number;
};

export async function buildFilmNleExport(input: {
  recipe: CutRecipe;
  name: string;
  userId?: string | null;
  requestOrigin?: string;
}): Promise<FilmNleExportResult> {
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) throw new Error('ffmpeg is not available on this server.');
  const dir = path.join(/* turbopackIgnore: true */ filmTempOsDir(), `nle-${randomUUID()}`);
  const media = path.join(dir, 'media');
  await fs.mkdir(media, { recursive: true });
  const size = FILM_PRESET_SIZE[normalizeFilmResolution(input.recipe.resolution)];
  const shots: NleShot[] = [];
  let skipped = 0;

  for (const [index, shot] of input.recipe.shots.entries()) {
    const number = String(index + 1).padStart(2, '0');
    const base = `${number}-${slug(shot.title || shot.kind)}`;
    try {
      const fetched = await fetchFilmShotBytes({
        url: shot.url,
        entryId: shot.entryId,
        userId: input.userId,
        requestOrigin: input.requestOrigin,
      });
      const source = path.join(dir, `${base}.src`);
      await fs.writeFile(source, fetched.buffer);
      if (shot.kind === 'clip') {
        const file = `media/${base}.mp4`;
        const out = path.join(dir, file);
        const encoded = await run(ffmpeg, [
          '-y',
          '-v',
          'error',
          '-i',
          source,
          '-f',
          'lavfi',
          '-i',
          'anullsrc=r=48000:cl=stereo',
          '-map',
          '0:v:0',
          '-map',
          '0:a:0?',
          '-map',
          '1:a:0',
          '-shortest',
          '-vf',
          `fps=${NLE_FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2`,
          '-c:v',
          'libx264',
          '-crf',
          '16',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-ar',
          '48000',
          '-ac',
          '2',
          out,
        ]);
        if (encoded.code !== 0) throw new Error('could not convert the clip');
        const full = (await durationOf(ffmpeg, out)) ?? 0;
        const window = clipTrimWindow(shot, full);
        const end = window.end ?? full;
        shots.push({
          file,
          name: shot.title || `Shot ${index + 1}`,
          kind: 'clip',
          durationSec: Math.max(0.5, end - window.start),
          sourceStartSec: window.start,
          sourceDurationSec: full,
          ...(shot.caption?.trim() ? { caption: shot.caption.trim() } : {}),
        });
      } else {
        const file = `media/${base}.png`;
        const encoded = await run(ffmpeg, [
          '-y',
          '-v',
          'error',
          '-i',
          source,
          '-frames:v',
          '1',
          path.join(dir, file),
        ]);
        if (encoded.code !== 0) throw new Error('could not convert the still');
        shots.push({
          file,
          name: shot.title || `Shot ${index + 1}`,
          kind: 'still',
          durationSec: shot.holdSec && shot.holdSec > 0 ? shot.holdSec : DEFAULT_STILL_HOLD_SEC,
          ...(shot.caption?.trim() ? { caption: shot.caption.trim() } : {}),
        });
      }
      await fs.rm(source, { force: true });
    } catch {
      skipped += 1;
    }
  }
  if (shots.length === 0) throw new Error('None of this film’s shots could be fetched.');

  let music: { file: string; durationSec: number } | undefined;
  if (input.recipe.audioBedUrl?.trim()) {
    try {
      const fetched = await fetchFilmShotBytes({
        url: input.recipe.audioBedUrl,
        userId: input.userId,
        requestOrigin: input.requestOrigin,
      });
      const source = path.join(dir, 'music.src');
      await fs.writeFile(source, fetched.buffer);
      const file = 'media/music.m4a';
      const encoded = await run(ffmpeg, [
        '-y',
        '-v',
        'error',
        '-i',
        source,
        '-vn',
        '-c:a',
        'aac',
        '-b:a',
        '256k',
        path.join(dir, file),
      ]);
      await fs.rm(source, { force: true });
      const durationSec =
        encoded.code === 0 ? await durationOf(ffmpeg, path.join(dir, file)) : null;
      if (durationSec) music = { file, durationSec };
    } catch {
      // The cut still exports; the README lists what came along.
    }
  }

  const timeline = {
    name: input.name,
    width: size.width,
    height: size.height,
    shots,
    ...(music ? { music } : {}),
    crossfadeSec: input.recipe.crossfadeSec,
  };
  const texts: Array<[string, string]> = [
    ['timeline.fcpxml', buildFcpxml(timeline)],
    ['timeline.edl', buildEdl(timeline)],
    [
      'README.txt',
      nleReadme({ ...timeline, droppedShots: (input.recipe.droppedShots ?? 0) + skipped }),
    ],
  ];
  const srt = buildSrt(shots);
  if (srt) texts.push(['captions.srt', srt]);
  for (const [name, text] of texts) await fs.writeFile(path.join(dir, name), text, 'utf8');

  const folder = slug(input.name) || 'castcut-film';
  const entries: ZipDiskEntry[] = [
    ...texts.map(([name]) => ({
      archivePath: `${folder}/${name}`,
      diskPath: path.join(dir, name),
    })),
    ...shots.map(shot => ({
      archivePath: `${folder}/${shot.file}`,
      diskPath: path.join(dir, shot.file),
    })),
    ...(music
      ? [{ archivePath: `${folder}/${music.file}`, diskPath: path.join(dir, music.file) }]
      : []),
  ];
  const zipPath = path.join(dir, `${folder}.zip`);
  await createZipFileFromDiskPaths(zipPath, entries);
  return { zipPath, dir, shots: shots.length, skipped };
}
