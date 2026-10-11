/**
 * The Cut preview's timeline: where each shot sits, how long it holds, which part of a clip
 * plays, and how two shots overlap in a crossfade — the same arithmetic the encodes use
 * (cut-timeline.ts), so the preview plays the cut as it will come out. Pure.
 */

import { clipTrimWindow } from './clip-trim';
import { DEFAULT_STILL_HOLD_SEC, type FilmPlaylistShot } from './media-kind';
import { filmShotCaption, TITLE_CARD_SEC } from './video-polish';

export type PreviewItem = {
  kind: 'title' | 'still' | 'clip';
  /** Index in the cut's shots (−1 for the title card). */
  shot: number;
  /** Position among all pieces (title included): the push-in / pull-out direction. */
  stillIndex: number;
  startSec: number;
  durSec: number;
  /** Clips: where in the file this piece starts. */
  fromSec: number;
  caption: string;
};

export type PreviewTimeline = { items: PreviewItem[]; totalSec: number; crossfadeSec: number };

export function previewTimeline(input: {
  shots: FilmPlaylistShot[];
  /** Measured clip lengths (null when unknown). */
  clipSecs: Array<number | null>;
  crossfadeSec: number;
  titleCard: boolean;
  captions: boolean;
}): PreviewTimeline {
  const pieces: Array<Omit<PreviewItem, 'startSec'>> = [];
  if (input.titleCard) {
    pieces.push({
      kind: 'title',
      shot: -1,
      stillIndex: -1,
      durSec: TITLE_CARD_SEC,
      fromSec: 0,
      caption: '',
    });
  }
  input.shots.forEach((shot, index) => {
    const caption = input.captions ? filmShotCaption(shot) : '';
    if (shot.kind === 'clip') {
      const full = input.clipSecs[index] ?? null;
      const trim = clipTrimWindow(shot, full);
      const end = trim.end ?? full ?? (shot.holdSec && shot.holdSec > 0 ? shot.holdSec : 4);
      pieces.push({
        kind: 'clip',
        shot: index,
        stillIndex: -1,
        durSec: Math.max(0.5, end - trim.start),
        fromSec: trim.start,
        caption,
      });
      return;
    }
    pieces.push({
      kind: 'still',
      shot: index,
      // The server encode alternates zoom direction by position in its graph (title and clips
      // count), so the preview does too.
      stillIndex: pieces.length,
      durSec: shot.holdSec && shot.holdSec > 0 ? shot.holdSec : DEFAULT_STILL_HOLD_SEC,
      fromSec: 0,
      caption,
    });
  });
  const overlap = pieces.length >= 2 ? Math.max(0, input.crossfadeSec) : 0;
  let start = 0;
  const items: PreviewItem[] = pieces.map(piece => {
    const item = { ...piece, startSec: Math.round(start * 1000) / 1000 };
    start += overlap > 0 ? Math.max(0.1, piece.durSec - overlap) : piece.durSec;
    return item;
  });
  const last = items[items.length - 1];
  const totalSec = last ? last.startSec + last.durSec : 0;
  return { items, totalSec: Math.round(totalSec * 1000) / 1000, crossfadeSec: overlap };
}

/**
 * What is on screen at `t`: the shot playing, and — inside a crossfade — the next one fading
 * in over it (`alpha` 0→1).
 */
export function previewFrameAt(
  timeline: PreviewTimeline,
  t: number
): Array<{ item: PreviewItem; local: number; alpha: number }> {
  const on = timeline.items.filter(item => t >= item.startSec && t < item.startSec + item.durSec);
  if (on.length === 0) {
    const last = timeline.items[timeline.items.length - 1];
    return last && t >= timeline.totalSec ? [{ item: last, local: last.durSec, alpha: 1 }] : [];
  }
  return on.map((item, index) => ({
    item,
    local: t - item.startSec,
    alpha:
      index === 0 || timeline.crossfadeSec <= 0
        ? 1
        : Math.min(1, Math.max(0, (t - item.startSec) / timeline.crossfadeSec)),
  }));
}
