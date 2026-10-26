/**
 * Read a finished film file back (M4 F6): one ffmpeg pass — the input header (length, size,
 * frame rate, sound) and, when it has sound, ebur128's loudness summary (output-probe.ts).
 * Server code (Node child_process), imported by the encode job like video-server-encode.ts.
 */

import { spawn } from 'node:child_process';
import { parseFilmOutputProbe, type FilmOutputProbe } from './output-probe';

const PROBE_TIMEOUT_MS = 180_000;

export function probeFilmOutput(ffmpeg: string, file: string): Promise<FilmOutputProbe | null> {
  return new Promise(resolve => {
    const child = spawn(
      ffmpeg,
      [
        '-hide_banner',
        '-nostats',
        '-i',
        file,
        '-map',
        '0:a:0?',
        '-filter:a',
        'ebur128=peak=true',
        '-f',
        'null',
        '-',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    let head = '';
    let tail = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), PROBE_TIMEOUT_MS);
    child.stderr.on('data', chunk => {
      const text = String(chunk);
      // The header is at the start, the summary at the end: keep both, not the frames between.
      if (head.length < 16_000) head += text;
      tail = (tail + text).slice(-16_000);
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on('close', () => {
      clearTimeout(timer);
      const probe = parseFilmOutputProbe(`${head}\n${tail}`);
      resolve(probe.durationSec || probe.width ? probe : null);
    });
  });
}
