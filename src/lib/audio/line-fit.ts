/**
 * A read line laid over a talking clip (Cut's "kept voice on talking clips"): the voice engine's
 * reading, which MiniMax-H3 copied, stretched to the length H3 spoke it and started where H3
 * started — so the voice is the one kept voice and the lips still meet it. Pure.
 */

/** Below the loudest 20 ms by this much (dB), a window is not speech. */
const SPEECH_BELOW_PEAK_DB = 28;
/** And never quieter than this (dBFS): room tone is not speech. */
const SPEECH_FLOOR_DB = -42;
const WINDOW_SEC = 0.02;

/** Where speech starts and ends in mono samples (−1…1); null with no speech. */
export function speechSpan(
  samples: ArrayLike<number>,
  rate: number
): { startSec: number; endSec: number } | null {
  const size = Math.max(1, Math.round(rate * WINDOW_SEC));
  const levels: number[] = [];
  for (let at = 0; at + size <= samples.length; at += size) {
    let sum = 0;
    for (let i = at; i < at + size; i += 1) sum += samples[i]! * samples[i]!;
    levels.push(10 * Math.log10(sum / size + 1e-12));
  }
  if (!levels.length) return null;
  const peak = Math.max(...levels);
  const threshold = Math.max(SPEECH_FLOOR_DB, peak - SPEECH_BELOW_PEAK_DB);
  const first = levels.findIndex(level => level > threshold);
  if (first < 0 || peak < SPEECH_FLOOR_DB) return null;
  let last = first;
  for (let i = levels.length - 1; i > first; i -= 1) {
    if (levels[i]! > threshold) {
      last = i;
      break;
    }
  }
  return { startSec: first * WINDOW_SEC, endSec: (last + 1) * WINDOW_SEC };
}

/** The most a reading is sped up or slowed to fit (atempo); past it, it plays at its own pace. */
export const LINE_FIT_MAX_STRETCH = 1.25;

/**
 * How the reading (its speech `readSec` long, silence trimmed) is laid on the clip: from
 * `delaySec`, at `tempo` (ffmpeg atempo: >1 is faster). Null when the clip holds no speech.
 */
export function lineFitPlan(
  clipSpan: { startSec: number; endSec: number } | null,
  readSec: number
): { delaySec: number; tempo: number } | null {
  if (!clipSpan || !(readSec > 0)) return null;
  const spoken = clipSpan.endSec - clipSpan.startSec;
  if (!(spoken > 0.2)) return null;
  const tempo = Math.min(
    LINE_FIT_MAX_STRETCH,
    Math.max(1 / LINE_FIT_MAX_STRETCH, readSec / spoken)
  );
  return { delaySec: Math.max(0, clipSpan.startSec), tempo: Math.round(tempo * 1000) / 1000 };
}

/** Speech stretches closer than this (seconds) are one burst: a breath inside a sentence. */
const BURST_GAP_SEC = 0.45;
/** Shorter stretches are clicks or breaths, not words. */
const BURST_MIN_SEC = 0.3;

/** The stretches of speech in mono samples (−1…1), above the room as speechSpan reads it. */
export function speechBursts(
  samples: ArrayLike<number>,
  rate: number
): Array<{ startSec: number; endSec: number }> {
  const size = Math.max(1, Math.round(rate * WINDOW_SEC));
  const levels: number[] = [];
  for (let at = 0; at + size <= samples.length; at += size) {
    let sum = 0;
    for (let i = at; i < at + size; i += 1) sum += samples[i]! * samples[i]!;
    levels.push(10 * Math.log10(sum / size + 1e-12));
  }
  if (!levels.length) return [];
  const peak = Math.max(...levels);
  if (peak < SPEECH_FLOOR_DB) return [];
  const threshold = Math.max(SPEECH_FLOOR_DB, peak - SPEECH_BELOW_PEAK_DB);
  const bursts: Array<{ startSec: number; endSec: number }> = [];
  levels.forEach((level, index) => {
    if (level <= threshold) return;
    const startSec = index * WINDOW_SEC;
    const last = bursts.at(-1);
    if (last && startSec - last.endSec < BURST_GAP_SEC) last.endSec = startSec + WINDOW_SEC;
    else bursts.push({ startSec, endSec: startSec + WINDOW_SEC });
  });
  return bursts.filter(burst => burst.endSec - burst.startSec >= BURST_MIN_SEC);
}

/**
 * A one-sentence line said twice, by its sound: two bursts of speech of about its length. Whisper
 * heard the flagship's 3D ("You can't build a shelf.", said again quieter 1.4 s later) as one
 * line; the user heard it twice (2026-11-16). A line of more than one sentence pauses between
 * them, so it isn't read this way.
 */
export function singleLineSaidTwice(
  bursts: ReadonlyArray<{ startSec: number; endSec: number }>,
  line: string
): boolean {
  const sentences = line
    .trim()
    .split(/(?<=[.!?…])\s+(?=\S)/)
    .filter(part => /\w/.test(part));
  if (sentences.length !== 1 || bursts.length < 2) return false;
  const first = bursts[0]!.endSec - bursts[0]!.startSec;
  return bursts.slice(1).some(burst => burst.endSec - burst.startSec >= first * 0.5);
}

/** Kept before a line when a talking shot is tightened (seconds). */
export const TIGHT_LINE_LEAD_SEC = 0.35;
/** Kept after it. */
export const TIGHT_LINE_TAIL_SEC = 0.6;
/** The shortest a tightened talking shot plays. */
export const TIGHT_LINE_MIN_SEC = 1.6;

/**
 * A talking clip tightened to its line (Cut's "Tighten talking shots"): from just before its
 * speech to just after. The flagship's talking clips ran ~5 s for a 1–2 s line — two to three
 * seconds of standing about in every exchange (2026-11-16). A trim already there (a cut away, a
 * line said twice) is kept: the window only ever narrows. Null when it can't be tightened.
 */
export function tightLineTrim(
  span: { startSec: number; endSec: number } | null,
  current: { trimStartSec?: number; trimEndSec?: number } = {}
): { trimStartSec: number; trimEndSec: number } | null {
  if (!span || !(span.endSec > span.startSec)) return null;
  const floor = current.trimStartSec ?? 0;
  const ceiling = current.trimEndSec ?? Number.POSITIVE_INFINITY;
  const start = Math.max(floor, span.startSec - TIGHT_LINE_LEAD_SEC);
  let end = Math.min(ceiling, span.endSec + TIGHT_LINE_TAIL_SEC);
  if (end - start < TIGHT_LINE_MIN_SEC) end = Math.min(ceiling, start + TIGHT_LINE_MIN_SEC);
  if (!(end - start >= 1)) return null;
  return {
    trimStartSec: Math.round(start * 100) / 100,
    trimEndSec: Math.round(end * 100) / 100,
  };
}
