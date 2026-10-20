/**
 * The Cut preview's timeline: where each shot sits, how long it holds, which part of a clip
 * plays, and how two shots overlap in a crossfade — the same arithmetic the encodes use
 * (cut-timeline.ts), so the preview plays the cut as it will come out. Pure.
 */

import { cutJoins, cutStarts, type CutTransitionIn, type CutTransitionKind } from '../cut-timeline';
import { clipTrimWindow } from '../clip-trim';
import { DEFAULT_STILL_HOLD_SEC, type FilmPlaylistShot } from '../media-kind';
import { filmShotCaption, TITLE_CARD_SEC } from '../video-polish';

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
  /** Clips: file seconds per cut second (1 = as shot). */
  speed?: number;
  caption: string;
  /** How long it overlaps the piece before, and how it comes in (cut-timeline.ts). */
  inSec: number;
  transition: CutTransitionKind;
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
  const pieces: Array<Omit<PreviewItem, 'startSec' | 'inSec' | 'transition'>> = [];
  const transitions: Array<CutTransitionIn | undefined> = [];
  if (input.titleCard) {
    pieces.push({
      kind: 'title',
      shot: -1,
      stillIndex: -1,
      durSec: TITLE_CARD_SEC,
      fromSec: 0,
      caption: '',
    });
    transitions.push(undefined);
  }
  input.shots.forEach((shot, index) => {
    const caption = input.captions ? filmShotCaption(shot) : '';
    if (shot.kind === 'clip') {
      const full = input.clipSecs[index] ?? null;
      const trim = clipTrimWindow(shot, full);
      const end = trim.end ?? full ?? (shot.holdSec && shot.holdSec > 0 ? shot.holdSec : 4);
      const speed =
        typeof shot.speed === 'number' && shot.speed > 0
          ? Math.min(4, Math.max(0.25, shot.speed))
          : 1;
      pieces.push({
        kind: 'clip',
        shot: index,
        stillIndex: -1,
        durSec: Math.max(0.5, (end - trim.start) / speed),
        fromSec: trim.start,
        ...(speed !== 1 ? { speed } : {}),
        caption,
      });
      transitions.push(shot.transitionIn);
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
    transitions.push(shot.transitionIn);
  });
  const joins = cutJoins({
    count: pieces.length,
    crossfadeSec: input.crossfadeSec,
    transitions,
  });
  const { starts, total } = cutStarts(
    pieces.map(piece => piece.durSec),
    joins.overlaps
  );
  const items: PreviewItem[] = pieces.map((piece, index) => ({
    ...piece,
    startSec: starts[index]!,
    inSec: joins.overlaps[index] ?? 0,
    transition: joins.kinds[index] ?? 'cut',
  }));
  return {
    items,
    totalSec: Math.round(total * 1000) / 1000,
    crossfadeSec: pieces.length >= 2 ? Math.max(0, input.crossfadeSec) : 0,
  };
}

/**
 * What is on screen at `t`: the shot playing, and — inside a crossfade — the next one fading
 * in over it (`alpha` 0→1).
 */
export function previewFrameAt(
  timeline: PreviewTimeline,
  t: number
): Array<{ item: PreviewItem; local: number; alpha: number; progress?: number }> {
  const on = timeline.items.filter(item => t >= item.startSec && t < item.startSec + item.durSec);
  if (on.length === 0) {
    const last = timeline.items[timeline.items.length - 1];
    return last && t >= timeline.totalSec ? [{ item: last, local: last.durSec, alpha: 1 }] : [];
  }
  return on.map((item, index) => {
    const progress =
      index === 0 || item.inSec <= 0
        ? 1
        : Math.min(1, Math.max(0, (t - item.startSec) / item.inSec));
    return {
      item,
      local: t - item.startSec,
      // A crossfade blends; the other transitions are drawn by the player from `progress`.
      alpha: item.transition === 'fade' || index === 0 ? progress : 1,
      ...(index > 0 && item.inSec > 0 ? { progress } : {}),
    };
  });
}
