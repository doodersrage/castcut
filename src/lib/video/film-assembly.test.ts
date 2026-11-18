/**
 * The film's assembly from mismatched sources (synthetic ffmpeg testsrc / sine): clips at 16, 30
 * and 25 fps, landscape, portrait and square, a non-square pixel, mono 22 kHz, stereo 48 kHz and
 * no sound at all, and a still. Whatever comes in, the film comes out at the project's one frame
 * rate (FILM_FPS), its size, square pixels, yuv420p, stereo 48 kHz, as long as its shots.
 * Skipped without ffmpeg on the PATH.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it, mock } from 'node:test';

mock.module('server-only', { defaultExport: {}, namedExports: {} });

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const dir = mkdtempSync(path.join(tmpdir(), 'castcut-assembly-'));
const run = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);

/**
 * A synthetic clip as a data URL: a testsrc picture, a sine (or no) sound — each a lavfi source
 * then its filters ("testsrc=…,setsar=4/3"): the length goes on the source.
 */
function clip(name: string, video: string, audio: string | null, seconds: number): string {
  const file = path.join(dir, `${name}.mp4`);
  const [videoSource, ...videoFilters] = video.split(',');
  const [audioSource, ...audioFilters] = audio ? audio.split(',') : [];
  run([
    '-f', 'lavfi', '-i', `${videoSource}:duration=${seconds}`,
    ...(audioSource ? ['-f', 'lavfi', '-i', `${audioSource}:duration=${seconds}`] : []),
    ...(videoFilters.length ? ['-vf', videoFilters.join(',')] : []),
    ...(audioFilters.length ? ['-af', audioFilters.join(',')] : []),
    '-c:v', 'libx264', '-preset', 'ultrafast',
    ...(audioSource ? ['-c:a', 'aac'] : []),
    '-shortest', file,
  ]);
  return `data:video/mp4;base64,${readFileSync(file).toString('base64')}`;
}

function probe(file: string) {
  const json = JSON.parse(
    execFileSync('ffprobe', [
      '-v', 'error', '-show_streams', '-show_format', '-of', 'json', file,
    ]).toString()
  ) as {
    streams: Array<Record<string, string | number>>;
    format: { duration: string };
  };
  const video = json.streams.find(stream => stream.codec_type === 'video')!;
  const audio = json.streams.find(stream => stream.codec_type === 'audio');
  return { video, audio, duration: Number(json.format.duration) };
}

// CI installs ffmpeg and sets CASTCUT_REQUIRE_FFMPEG: there a missing ffmpeg fails, not skips.
if (!hasFfmpeg && process.env.CASTCUT_REQUIRE_FFMPEG === '1') {
  throw new Error('ffmpeg and ffprobe must be on the PATH (CASTCUT_REQUIRE_FFMPEG=1).');
}

describe('a film assembled from mismatched sources', { skip: !hasFfmpeg && 'no ffmpeg' }, () => {
  const previous = process.env.PROMPT_DATA_DIR;
  before(() => {
    process.env.PROMPT_DATA_DIR = path.join(dir, 'data');
  });
  after(() => {
    if (previous === undefined) delete process.env.PROMPT_DATA_DIR;
    else process.env.PROMPT_DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  });

  it('comes out at the one frame rate, size, pixel shape and sound format', async () => {
    const { FILM_FPS } = await import('./film-fps');
    const { encodeFilmPlaylistServer } = await import('./server-encode');
    const stillFile = path.join(dir, 'still.png');
    run(['-f', 'lavfi', '-i', 'testsrc2=size=800x800', '-frames:v', '1', stillFile]);
    const shots = [
      // WAN-like: 16 fps, 4:3, mono 22 kHz.
      {
        url: clip('wan', 'testsrc=size=640x480:rate=16', 'sine=frequency=330:sample_rate=22050', 1.5),
        title: 'wan',
        kind: 'clip' as const,
      },
      // 30 fps, 16:9 stored with a non-square pixel, stereo 48 kHz.
      {
        url: clip(
          'wide',
          'testsrc2=size=960x720:rate=30,setsar=4/3',
          'sine=frequency=440:sample_rate=48000,pan=stereo|c0=c0|c1=c0',
          1.5
        ),
        title: 'wide',
        kind: 'clip' as const,
      },
      // 25 fps portrait, no sound.
      {
        url: clip('tall', 'testsrc=size=480x854:rate=25', null, 1.2),
        title: 'tall',
        kind: 'clip' as const,
        // No sound to time it by: held as long as it runs, as the Cut sets it.
        holdSec: 1.2,
      },
      {
        url: `data:image/png;base64,${readFileSync(stillFile).toString('base64')}`,
        title: 'still',
        kind: 'still' as const,
        holdSec: 1,
      },
    ];
    const result = await encodeFilmPlaylistServer(shots, { resolution: '720p', crossfadeSec: 0 });
    const out = path.join(dir, 'film.mp4');
    writeFileSync(out, result.buffer);
    const { video, audio, duration } = probe(out);

    assert.equal(video.r_frame_rate, `${FILM_FPS}/1`, 'the film at the project frame rate');
    assert.equal(video.avg_frame_rate, `${FILM_FPS}/1`, 'every frame at it, no variable rate');
    assert.equal(video.width, 1280);
    assert.equal(video.height, 720);
    assert.equal(video.pix_fmt, 'yuv420p');
    assert.ok(
      video.sample_aspect_ratio === undefined || video.sample_aspect_ratio === '1:1',
      `square pixels (was ${video.sample_aspect_ratio})`
    );
    assert.ok(audio, 'the film has sound (the clips that had it)');
    assert.equal(audio!.sample_rate, '48000');
    assert.equal(audio!.channels, 2);
    // As long as its shots: 1.5 + 1.5 + 1.2 + 1 s, give or take a frame per join.
    assert.ok(Math.abs(duration - 5.2) < 0.25, `5.2 s of shots, the film ${duration} s`);
    // Whole frames at the rate: the frame count is the duration at FILM_FPS.
    const frames = Number(video.nb_frames);
    assert.ok(Math.abs(frames - Number(video.duration) * FILM_FPS) <= 1, `${frames} frames`);
  });

  it('every frame-rate reader uses the one rate', async () => {
    const { FILM_FPS } = await import('./film-fps');
    const { STILL_MOTION_FPS } = await import('./polish');
    const { buildFilmScaleFilter } = await import('./resolution');
    const { reframeScaleFilter } = await import('./cut-reframe');
    const { NLE_FPS } = await import('../film/nle-export');
    const { formatCutTimecode } = await import('../film/cut-preview');
    assert.equal(STILL_MOTION_FPS, FILM_FPS);
    assert.equal(NLE_FPS, FILM_FPS);
    assert.match(buildFilmScaleFilter(1280, 720), new RegExp(`fps=${FILM_FPS}\\b`));
    assert.match(
      reframeScaleFilter([{ t: 0, x: 0.5 }], { width: 720, height: 1280 }),
      new RegExp(`fps=${FILM_FPS}\\b`)
    );
    // The Cut room's timecode counts frames at the same rate: one second less a frame.
    assert.equal(formatCutTimecode(1 - 1 / FILM_FPS).split(':').at(-1), String(FILM_FPS - 1).padStart(2, '0'));
  });
});
