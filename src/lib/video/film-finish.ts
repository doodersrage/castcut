/**
 * What happens to a finished film file before it is handed back: just a part of it (an In / Out
 * range, for a quick review copy of one scene) and chapter marks from Cut's markers (MP4
 * chapters, and the same list as text for a video description). Pure; the ffmpeg pass that
 * applies them is in server-encode.ts.
 *
 * Times come in as the Cut monitor shows them. A film with a "Previously on" recap starts with
 * shots the monitor doesn't show, so the server moves every time by the recap's length.
 */

export type FilmRange = { fromSec: number; toSec: number };
export type FilmChapter = { atSec: number; title: string };

/** A part shorter than this isn't worth a render. */
export const FILM_RANGE_MIN_SEC = 0.5;
const CHAPTERS_MAX = 100;
const TITLE_MAX = 80;

const sec = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value * 1000) / 1000
    : null;

/** A range from untrusted input, or null (missing, reversed, too short). */
export function normalizeFilmRange(raw: unknown): FilmRange | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const fromSec = sec(record.fromSec);
  const toSec = sec(record.toSec);
  if (fromSec == null || toSec == null || toSec - fromSec < FILM_RANGE_MIN_SEC) return null;
  return { fromSec, toSec };
}

/** Chapters from untrusted input: timed, titled, sorted, one per moment. */
export function normalizeFilmChapters(raw: unknown): FilmChapter[] {
  if (!Array.isArray(raw)) return [];
  const out: FilmChapter[] = [];
  for (const item of raw) {
    const record = item as Record<string, unknown> | null;
    const atSec = sec(record?.atSec);
    const title =
      typeof record?.title === 'string'
        ? record.title.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX)
        : '';
    if (atSec == null || !title) continue;
    out.push({ atSec, title });
  }
  out.sort((a, b) => a.atSec - b.atSec);
  return out
    .filter((chapter, index) => index === 0 || chapter.atSec - out[index - 1]!.atSec >= 0.5)
    .slice(0, CHAPTERS_MAX);
}

/**
 * The chapters as they fall in the output file: moved by the recap (`offsetSec`, with its own
 * "Previously" chapter), cut to the range and moved to its start, and always one at 0 so players
 * and video sites read the list.
 */
export function chaptersForFile(input: {
  chapters: readonly FilmChapter[];
  offsetSec?: number;
  range?: FilmRange | null;
}): FilmChapter[] {
  if (!input.chapters.length) return [];
  const offset = Math.max(0, input.offsetSec ?? 0);
  let list: FilmChapter[] = input.chapters.map(chapter => ({
    atSec: chapter.atSec + offset,
    title: chapter.title,
  }));
  if (offset > 0) list.unshift({ atSec: 0, title: 'Previously' });
  if (input.range) {
    const from = input.range.fromSec + offset;
    const to = input.range.toSec + offset;
    // The chapter the part starts inside carries on at its 0.
    const opening = [...list].reverse().find(chapter => chapter.atSec <= from);
    list = list
      .filter(chapter => chapter.atSec > from && chapter.atSec < to)
      .map(chapter => ({ atSec: chapter.atSec - from, title: chapter.title }));
    list.unshift({ atSec: 0, title: opening?.title ?? 'Opening' });
  } else if (list[0]!.atSec > 0) {
    list.unshift({ atSec: 0, title: 'Opening' });
  }
  return normalizeFilmChapters(list);
}

const escapeMeta = (value: string) => value.replace(/([=;#\\\n])/g, '\\$1');

/** An ffmetadata file with the chapters (each runs to the next, the last to `totalSec`). */
export function chaptersFfmetadata(chapters: readonly FilmChapter[], totalSec: number): string {
  const ms = (value: number) => Math.max(0, Math.round(value * 1000));
  const lines = [';FFMETADATA1'];
  chapters.forEach((chapter, index) => {
    const end = chapters[index + 1]?.atSec ?? totalSec;
    if (end <= chapter.atSec) return;
    lines.push(
      '[CHAPTER]',
      'TIMEBASE=1/1000',
      `START=${ms(chapter.atSec)}`,
      `END=${ms(end)}`,
      `title=${escapeMeta(chapter.title)}`
    );
  });
  return `${lines.join('\n')}\n`;
}

/** "1:23 Title" lines — the chapter list a video description takes (first at 0:00). */
export function chapterListText(chapters: readonly FilmChapter[]): string {
  const stamp = (value: number) => {
    const s = Math.floor(value);
    const h = Math.floor(s / 3600);
    const m = Math.floor(s / 60) % 60;
    const r = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
  };
  return chapters.map(chapter => `${stamp(chapter.atSec)} ${chapter.title}`).join('\n');
}

const srtStamp = (value: number) => {
  const total = Math.max(0, Math.round(value * 1000));
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(Math.floor(total / 3_600_000))}:${pad(Math.floor(total / 60_000) % 60)}:${pad(Math.floor(total / 1000) % 60)},${pad(total % 1000, 3)}`;
};

const srtSec = (stamp: string): number => {
  const match = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(stamp);
  if (!match) return 0;
  return (
    Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000
  );
};

/** An .srt cut to a range (file seconds) and moved to its start; cues outside it go. */
export function srtForRange(srt: string, range: FilmRange): string {
  const cues = srt
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)
    .flatMap(block => {
      const lines = block.split('\n');
      const timing = lines.findIndex(line => line.includes('-->'));
      if (timing < 0) return [];
      const [a, b] = lines[timing]!.split('-->');
      const from = Math.max(srtSec(a ?? ''), range.fromSec) - range.fromSec;
      const to = Math.min(srtSec(b ?? ''), range.toSec) - range.fromSec;
      if (to <= from) return [];
      return [{ from, to, text: lines.slice(timing + 1).join('\n') }];
    });
  return cues
    .map(
      (cue, index) => `${index + 1}\n${srtStamp(cue.from)} --> ${srtStamp(cue.to)}\n${cue.text}\n`
    )
    .join('\n');
}

/** What a loudnorm measuring pass read (its JSON summary). */
export type LoudnormMeasure = {
  inputI: number;
  inputTp: number;
  inputLra: number;
  inputThresh: number;
  targetOffset: number;
};

/** The JSON block ffmpeg's loudnorm prints at the end of a measuring pass, or null. */
export function parseLoudnormMeasure(stderr: string): LoudnormMeasure | null {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    const json = JSON.parse(stderr.slice(start, end + 1)) as Record<string, string>;
    const num = (key: string) => Number(json[key]);
    const out = {
      inputI: num('input_i'),
      inputTp: num('input_tp'),
      inputLra: num('input_lra'),
      inputThresh: num('input_thresh'),
      targetOffset: num('target_offset'),
    };
    // Silence reads as -inf: nothing to bring up.
    return Object.values(out).every(Number.isFinite) ? out : null;
  } catch {
    return null;
  }
}

/** The loudness range the films aim under (LU) — loudnorm's own default. */
const TARGET_LRA = 11;

/** The measuring pass's filter, and the applying pass's (linear: one gain for the whole film). */
export function loudnormFilters(
  target: { lufs: number; peakDbtp: number },
  measured?: LoudnormMeasure | null
): string {
  const base = `loudnorm=I=${target.lufs}:TP=${target.peakDbtp}:LRA=${TARGET_LRA}`;
  if (!measured) return `${base}:print_format=json`;
  return (
    `${base}:measured_I=${measured.inputI}:measured_TP=${measured.inputTp}` +
    `:measured_LRA=${measured.inputLra}:measured_thresh=${measured.inputThresh}` +
    `:offset=${measured.targetOffset}:linear=true:print_format=summary`
  );
}

/** A loudness target from untrusted input (LUFS −40…−5, true peak −9…0 dBTP), or null. */
export function normalizeFilmLoudnessTarget(
  raw: unknown
): { lufs: number; peakDbtp: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const lufs = Number(record.lufs);
  const peak = Number(record.peakDbtp);
  if (!Number.isFinite(lufs) || lufs < -40 || lufs > -5) return null;
  if (!Number.isFinite(peak) || peak < -9 || peak > 0) return null;
  return { lufs, peakDbtp: peak };
}

/** The stems a film's mix is handed off in: what is said, the music, the room, the effects. */
export type FilmStemName = 'dialogue' | 'music' | 'ambience' | 'effects';
export const FILM_STEM_NAMES: readonly FilmStemName[] = [
  'dialogue',
  'music',
  'ambience',
  'effects',
];

/** An .srt as WebVTT (the web's subtitle format): a header, dots for commas, no cue numbers. */
export function srtToVtt(srt: string): string {
  const blocks = srt
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)
    .flatMap(block => {
      const lines = block.split('\n');
      const timing = lines.findIndex(line => line.includes('-->'));
      if (timing < 0) return [];
      return [
        [
          lines[timing]!.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2'),
          ...lines.slice(timing + 1),
        ].join('\n'),
      ];
    });
  return `WEBVTT\n\n${blocks.join('\n\n')}\n`;
}

/**
 * How a film file is written: the everyday H.264 / AAC MP4, or a master — ProRes 422 HQ, 10-bit
 * 4:2:2, with 24-bit PCM sound in a .mov — for a colourist, a broadcaster or a festival copy.
 */
export function filmCodec(master: boolean): {
  video: string[];
  audio: string[];
  extension: 'mp4' | 'mov';
  mimeType: 'video/mp4' | 'video/quicktime';
  /** Container flags (the MP4's index up front for the web; nothing for a master). */
  container: string[];
} {
  return master
    ? {
        video: [
          '-c:v',
          'prores_ks',
          '-profile:v',
          '3',
          '-pix_fmt',
          'yuv422p10le',
          '-vendor',
          'apl0',
        ],
        audio: ['-c:a', 'pcm_s24le'],
        extension: 'mov',
        mimeType: 'video/quicktime',
        container: [],
      }
    : {
        video: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p'],
        audio: ['-c:a', 'aac', '-b:a', '192k'],
        extension: 'mp4',
        mimeType: 'video/mp4',
        container: ['-movflags', '+faststart'],
      };
}
