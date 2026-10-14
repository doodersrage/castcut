/**
 * Where each shot of a cut sits in time — shared by the server mix (video-server-encode.ts) and
 * the browser's Preview the mix (film-mix-preview.ts), so the preview puts each line where the
 * encode will. Pure.
 */

import { DEFAULT_STILL_HOLD_SEC } from './media-kind';

/** A shot's kind in the joined film; `title` is the opening card. */
export type CutTimelineKind = 'still' | 'clip' | 'title';

/**
 * Where each talking clip starts in the cut — the same arithmetic as the video joins (xfade
 * offsets overlap shots by the crossfade; concat lays them end to end).
 */
/** When each shot starts in the cut (seconds), crossfades counted — as filmSpeechStarts walks it. */
export function filmShotStarts(input: {
  kinds: CutTimelineKind[];
  holdSecs: number[];
  crossfadeSec: number;
}): number[] {
  const overlap = input.kinds.length >= 2 ? Math.max(0, input.crossfadeSec) : 0;
  const starts: number[] = [];
  let start = 0;
  for (let i = 0; i < input.kinds.length; i += 1) {
    const hold =
      input.kinds[i] === 'clip'
        ? input.holdSecs[i] && input.holdSecs[i]! > 0
          ? input.holdSecs[i]!
          : 4
        : (input.holdSecs[i] ?? DEFAULT_STILL_HOLD_SEC);
    starts.push(Number(start.toFixed(3)));
    start += overlap > 0 ? Math.max(0.1, hold - overlap) : hold;
  }
  return starts;
}

export function filmSpeechStarts(input: {
  kinds: CutTimelineKind[];
  holdSecs: number[];
  crossfadeSec: number;
  speech?: boolean[];
}): Array<{ index: number; startSec: number; holdSec: number }> {
  const out: Array<{ index: number; startSec: number; holdSec: number }> = [];
  if (!input.speech?.some(Boolean)) return out;
  const overlap = input.kinds.length >= 2 ? Math.max(0, input.crossfadeSec) : 0;
  let start = 0;
  for (let i = 0; i < input.kinds.length; i += 1) {
    const kind = input.kinds[i];
    const hold =
      kind === 'clip'
        ? input.holdSecs[i] && input.holdSecs[i]! > 0
          ? input.holdSecs[i]!
          : 4
        : (input.holdSecs[i] ?? DEFAULT_STILL_HOLD_SEC);
    if (kind === 'clip' && input.speech[i]) {
      out.push({ index: i, startSec: Number(start.toFixed(3)), holdSec: hold });
    }
    start += overlap > 0 ? Math.max(0.1, hold - overlap) : hold;
  }
  return out;
}
