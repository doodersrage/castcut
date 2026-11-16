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
