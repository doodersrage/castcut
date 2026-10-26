/**
 * What a finished film file is (M4 F6, ROADMAP §7.6): its length, picture size, frame rate,
 * whether it has sound, and its loudness — read from one ffmpeg pass over the file (the input
 * header ffmpeg prints, and the ebur128 summary at the end). Pure; the pass runs on the server
 * (output-probe-server.ts) as the encode job finishes.
 */

export type FilmLoudness = {
  integratedLufs: number;
  rangeLu?: number;
  truePeakDbtp?: number;
};

export type FilmOutputProbe = {
  durationSec?: number;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio: boolean;
  loudness?: FilmLoudness;
};

const number = (text: string | undefined) => {
  const value = text === undefined ? NaN : Number(text);
  return Number.isFinite(value) ? value : undefined;
};

/** The summary ffmpeg's ebur128 filter prints at the end (stderr), or null. */
export function parseEbur128Summary(stderr: string): FilmLoudness | null {
  const at = stderr.lastIndexOf('Summary:');
  if (at < 0) return null;
  const summary = stderr.slice(at);
  const integrated = number(summary.match(/I:\s*(-?[\d.]+)\s*LUFS/)?.[1]);
  if (integrated === undefined) return null;
  const range = number(summary.match(/LRA:\s*(-?[\d.]+)\s*LU\b/)?.[1]);
  const peak = number(summary.match(/True peak:[\s\S]*?Peak:\s*(-?[\d.]+)\s*dBFS/)?.[1]);
  return {
    integratedLufs: integrated,
    ...(range !== undefined ? { rangeLu: range } : {}),
    ...(peak !== undefined ? { truePeakDbtp: peak } : {}),
  };
}

/** The input file's facts from ffmpeg's header (stderr of `ffmpeg -i file …`). */
export function parseFfmpegInputInfo(stderr: string): FilmOutputProbe {
  const header = stderr.split(/\nOutput #0|\nStream mapping:/)[0] ?? stderr;
  const duration = header.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const video = header.match(/Stream #0:\d+[^\n]*Video:[^\n]*/)?.[0] ?? '';
  const size = video.match(/,\s*(\d{2,5})x(\d{2,5})[\s,[]/);
  const fps = video.match(/,\s*([\d.]+)\s*fps/);
  return {
    ...(duration
      ? {
          durationSec: Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]),
        }
      : {}),
    ...(size ? { width: Number(size[1]), height: Number(size[2]) } : {}),
    ...(fps && number(fps[1]) ? { fps: number(fps[1]) } : {}),
    hasAudio: /Stream #0:\d+[^\n]*Audio:/.test(header),
  };
}

/** Both reads of one pass. */
export function parseFilmOutputProbe(stderr: string): FilmOutputProbe {
  const info = parseFfmpegInputInfo(stderr);
  const loudness = info.hasAudio ? parseEbur128Summary(stderr) : null;
  return { ...info, ...(loudness ? { loudness } : {}) };
}
