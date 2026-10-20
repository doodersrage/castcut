import 'server-only';
/**
 * Pack a cut for another editor (cut-project-export.ts): each shot's file in media/ (animated
 * WebP / GIF clips turned into MP4, which editors read), the music, timeline.fcpxml,
 * timeline.edl, subtitles.srt when given, and a short README — as one .zip on disk.
 */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createZipFileFromDiskPaths, type ZipDiskEntry } from './gallery/zip-stream';
import { buildEdl, buildFcpxml, projectMediaName, type ProjectClip } from './cut-project-export';
import { fetchFilmShotBytes } from './video-shot-fetch';
import { extForShot, filmTempOsDir, resolveFfmpegBinary } from './video-server-encode';

export type ProjectExportShot = {
  url: string;
  title: string;
  kind: 'still' | 'clip';
  entryId?: string;
  fromSec: number;
  durSec: number;
};

const run = (bin: string, args: string[], input?: Buffer) =>
  new Promise<string>((resolve, reject) => {
    const child = execFile(bin, args, { maxBuffer: 64 * 1024 * 1024 }, (error, _out, stderr) =>
      error
        ? reject(new Error(String(stderr).slice(-400) || error.message))
        : resolve(String(stderr))
    );
    if (input) child.stdin?.end(input);
  });

/** A media file's length and whether it has sound (ffmpeg's header read). */
async function probeMedia(
  ffmpeg: string,
  file: string
): Promise<{ sec: number | null; audio: boolean }> {
  const log = await run(ffmpeg, ['-hide_banner', '-i', file]).catch(error => String(error));
  const match = log.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return {
    sec: match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : null,
    audio: /Stream #\S+.*Audio:/.test(log),
  };
}

/** An animated WebP / GIF as an H.264 MP4 (sharp reads the pages; ffmpeg misreads WebP). */
export async function animatedToMp4(ffmpeg: string, bytes: Buffer, out: string): Promise<void> {
  const sharp = (await import('sharp')).default;
  const meta = await sharp(bytes, { animated: true }).metadata();
  const pages = meta.pages ?? 1;
  const width = meta.width ?? 0;
  const height = meta.pageHeight ?? meta.height ?? 0;
  if (!width || !height) throw new Error('Could not read that clip.');
  const delays = meta.delay ?? [];
  const meanDelay = delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : 62.5;
  const fps = Math.max(1, Math.min(60, Math.round(1000 / Math.max(1, meanDelay))));
  const raw = await sharp(bytes, { animated: true, pages: -1 }).raw().ensureAlpha().toBuffer();
  await run(
    ffmpeg,
    [
      '-y',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgba',
      '-s',
      `${width}x${height}`,
      '-r',
      String(fps),
      '-i',
      'pipe:0',
      '-frames:v',
      String(pages),
      '-vf',
      'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-c:v',
      'libx264',
      '-crf',
      '16',
      '-pix_fmt',
      'yuv420p',
      out,
    ],
    raw
  );
}

/** Build the project .zip; returns its path (the caller streams and removes it). */
export async function packCutProject(input: {
  name: string;
  width: number;
  height: number;
  shots: ReadonlyArray<ProjectExportShot>;
  music?: { url: string; fromSec: number } | null;
  srt?: string | null;
  requestOrigin?: string;
  userId?: string | null;
}): Promise<{ zipPath: string; cleanup: () => Promise<void> }> {
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) throw new Error('ffmpeg is not available on this server.');
  const dir = path.join(/* turbopackIgnore: true */ filmTempOsDir(), `project-${randomUUID()}`);
  const mediaDir = path.join(/* turbopackIgnore: true */ dir, 'media');
  await fs.mkdir(/* turbopackIgnore: true */ mediaDir, { recursive: true });
  const cleanup = () =>
    fs.rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true }).catch(() => undefined);
  try {
    const entries: ZipDiskEntry[] = [];
    const clips: ProjectClip[] = [];
    // One file per source (a shot used twice points at the same file).
    const byUrl = new Map<string, { file: string; fileSec: number | null; audio: boolean }>();
    for (const [index, shot] of input.shots.entries()) {
      let media = byUrl.get(shot.url);
      if (!media) {
        const fetched = await fetchFilmShotBytes({
          url: shot.url,
          entryId: shot.entryId,
          userId: input.userId,
          requestOrigin: input.requestOrigin,
        });
        let ext = extForShot(shot.kind, fetched.contentType, fetched.filenameHint || shot.url);
        const animated = shot.kind === 'clip' && (ext === 'webp' || ext === 'gif');
        if (animated) ext = 'mp4';
        if (shot.kind === 'still' && !['png', 'jpg'].includes(ext)) ext = 'png';
        const file = projectMediaName(index, shot.title, ext);
        const out = path.join(/* turbopackIgnore: true */ mediaDir, file);
        if (animated) {
          await animatedToMp4(ffmpeg, fetched.buffer, out);
        } else if (shot.kind === 'still' && ext === 'png') {
          const sharp = (await import('sharp')).default;
          await fs.writeFile(
            /* turbopackIgnore: true */ out,
            await sharp(fetched.buffer).png().toBuffer()
          );
        } else {
          await fs.writeFile(/* turbopackIgnore: true */ out, fetched.buffer);
        }
        const probed =
          shot.kind === 'clip' ? await probeMedia(ffmpeg, out) : { sec: null, audio: false };
        media = { file, fileSec: probed.sec, audio: probed.audio };
        byUrl.set(shot.url, media);
        entries.push({ archivePath: `media/${file}`, diskPath: out });
      }
      clips.push({
        file: media.file,
        name: shot.title || `Shot ${index + 1}`,
        kind: shot.kind,
        fromSec: shot.kind === 'clip' ? shot.fromSec : 0,
        durSec: shot.durSec,
        fileSec: media.fileSec,
        hasAudio: media.audio,
      });
    }
    let music: { file: string; fromSec: number; fileSec: number | null } | null = null;
    if (input.music?.url) {
      const fetched = await fetchFilmShotBytes({
        url: input.music.url,
        userId: input.userId,
        requestOrigin: input.requestOrigin,
      });
      const ext =
        (fetched.filenameHint || input.music.url).match(
          /\.(mp3|wav|flac|m4a|aac|ogg)(\?|$)/i
        )?.[1] ??
        (fetched.contentType?.includes('wav')
          ? 'wav'
          : fetched.contentType?.includes('flac')
            ? 'flac'
            : 'mp3');
      const file = `music.${ext.toLowerCase()}`;
      const out = path.join(/* turbopackIgnore: true */ mediaDir, file);
      await fs.writeFile(/* turbopackIgnore: true */ out, fetched.buffer);
      music = { file, fromSec: input.music.fromSec, fileSec: (await probeMedia(ffmpeg, out)).sec };
      entries.push({ archivePath: `media/${file}`, diskPath: out });
    }
    const project = {
      name: input.name,
      fps: 30,
      width: input.width,
      height: input.height,
      clips,
      music,
    };
    const write = async (name: string, text: string) => {
      const file = path.join(/* turbopackIgnore: true */ dir, name);
      await fs.writeFile(/* turbopackIgnore: true */ file, text, 'utf8');
      entries.push({ archivePath: name, diskPath: file });
    };
    await write('timeline.fcpxml', buildFcpxml(project));
    await write('timeline.edl', buildEdl(project));
    if (input.srt?.trim()) await write('subtitles.srt', input.srt);
    await write(
      'README.txt',
      [
        `${input.name} — exported from Castcut's Cut.`,
        '',
        'timeline.fcpxml  Final Cut Pro, DaVinci Resolve (File > Import > Timeline) or Premiere (File > Import).',
        'timeline.edl     Any editor that reads CMX 3600 EDLs (video only; link media from media/).',
        input.srt?.trim() ? "subtitles.srt    The film's subtitles, timed to the cut." : '',
        '',
        'Keep media/ next to the timeline; if your editor asks, point it at that folder.',
        'Shots butt together here — add transitions, grade and effects in your editor.',
        '',
      ].join('\n')
    );
    const zipPath = path.join(/* turbopackIgnore: true */ dir, 'project.zip');
    await createZipFileFromDiskPaths(zipPath, entries);
    return { zipPath, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
