/**
 * "Make a reel": a short vertical cut of the film — 15, 30 or 60 s of its shots, picked evenly
 * across it so the story still reads (moving clips preferred), each clip trimmed to its middle,
 * stills held briefly, hard cuts. Pure: returns the shot edits; Cut saves the full edit as a
 * version first and the reel as another.
 */

/** The parts of a shot's edit a reel reads and sets (film-cut-plan.ts CutShotEdit). */
type CutShotEdit = {
  include?: boolean;
  holdSec?: number;
  trimStartSec?: number;
  trimEndSec?: number;
  transition?: string;
};

export type ReelShot<E extends CutShotEdit = CutShotEdit> = {
  key: string;
  kind: 'still' | 'clip' | 'title';
  /** A clip's length in seconds (unknown: treated as 5). */
  durationSec?: number | null;
  /** Kept edits (trim, volume…). */
  edit?: E;
};

export type ReelLength = 15 | 30 | 60;

/** How long one shot plays in a reel: clips a little longer than stills. */
export const REEL_CLIP_SEC = 3;
export const REEL_STILL_SEC = 1.8;

/**
 * Which shots, in film order, and how each plays: about `targetSec` in all. Shots left out of the
 * film stay out; when there are more than fit, picks are spread evenly with clips weighted up.
 */
export function planReel<E extends CutShotEdit>(input: {
  shots: ReadonlyArray<ReelShot<E>>;
  targetSec: ReelLength;
}): { keys: string[]; edits: Record<string, E> } {
  type Shot = ReelShot<E>;
  const usable = input.shots.filter(shot => shot.kind !== 'title' && shot.edit?.include !== false);
  const lengthOf = (shot: Shot) => (shot.kind === 'clip' ? REEL_CLIP_SEC : REEL_STILL_SEC);
  // Pick evenly: walk the film in equal steps, taking the best shot (a clip) near each step.
  const total = usable.reduce((sum, shot) => sum + lengthOf(shot), 0);
  let picked: Shot[];
  if (total <= input.targetSec) {
    picked = [...usable];
  } else {
    const count = Math.max(1, Math.round(input.targetSec / ((REEL_CLIP_SEC + REEL_STILL_SEC) / 2)));
    const step = usable.length / count;
    const chosen = new Set<number>();
    for (let k = 0; k < count; k += 1) {
      const lo = Math.floor(k * step);
      const hi = Math.max(lo + 1, Math.floor((k + 1) * step));
      const window = usable.slice(lo, hi).map((shot, offset) => ({ shot, index: lo + offset }));
      const best =
        window.find(entry => entry.shot.kind === 'clip' && !chosen.has(entry.index)) ??
        window.find(entry => !chosen.has(entry.index));
      if (best) chosen.add(best.index);
    }
    picked = [...chosen].sort((a, b) => a - b).map(index => usable[index]!);
    // Trim from the end of the budget: drop the shot nearest the middle of the longest run.
    while (
      picked.length > 1 &&
      picked.reduce((sum, s) => sum + lengthOf(s), 0) > input.targetSec + 1
    ) {
      picked.splice(Math.floor(picked.length / 2), 1);
    }
  }
  const edits: Record<string, E> = {};
  for (const shot of picked) {
    const base = { ...shot.edit, include: true, transition: 'cut' } as E;
    if (shot.kind === 'clip') {
      // The middle of what the clip plays (its own trim, else the whole file).
      const from = shot.edit?.trimStartSec ?? 0;
      const to = shot.edit?.trimEndSec ?? shot.durationSec ?? from + 5;
      const span = Math.max(0.5, to - from);
      const take = Math.min(span, REEL_CLIP_SEC);
      const start = from + (span - take) / 2;
      edits[shot.key] = {
        ...base,
        trimStartSec: Math.round(start * 100) / 100,
        trimEndSec: Math.round((start + take) * 100) / 100,
      } as E;
    } else {
      edits[shot.key] = { ...base, holdSec: REEL_STILL_SEC } as E;
    }
  }
  for (const shot of input.shots) {
    if (!edits[shot.key] && shot.kind !== 'title')
      edits[shot.key] = { ...shot.edit, include: false } as E;
  }
  return { keys: picked.map(shot => shot.key), edits };
}
