/**
 * Day "Two takes" for intimate stills (pure). Automatic defect checks on two-person sex stills
 * were unreliable (merged bodies, a mixed layout read as fine), so with this switch on the player
 * judges instead: each Intimate / Raunchy still is queued twice back to back — the same prompt,
 * two seeds — and when both land the card shows them side by side. The player taps the one to
 * keep; the other stays beside it as the alternate take (`previousTake.kind === 'two-takes'`), so
 * "Use the other take" swaps them back at any time.
 *
 * The state lives on the still: the first take is the still itself, the second `twoTakes` until
 * the pick. A take that fails (or that the adult check withholds) leaves the other on its own.
 * While the pick is open, and once the player has picked, the automatic pose checks (Best of two,
 * Redo pose misses, Auto-review) leave the still alone — the player has judged it.
 */

import type {
  DayGalleryEntry,
  DaySlotStill,
  DaySlotStillStatus,
  DayTwoTake,
} from '@/lib/day-planner';

/** Queue this still as two takes? Only a fresh intimate take (not a same-seed redo or a pair's second). */
export function dayTwoTakesApplies(input: {
  /** The Advanced switch (off by default). */
  enabled: boolean;
  /** The still plays as Intimate / Raunchy (adult mood with Intimate on). */
  intimateStill: boolean;
  /** A same-seed redo compares against the old take instead. */
  sameSeed?: boolean;
  /** A Best of two second take (or any queue that keeps a take beside it). */
  keepsATake?: boolean;
}): boolean {
  return input.enabled && input.intimateStill && !input.sameSeed && !input.keepsATake;
}

/** Is the player's pick between two takes still open (the second take is set)? */
export function dayTwoTakesPending(
  still: Pick<DaySlotStill, 'twoTakes'> | null | undefined
): boolean {
  return Boolean(still?.twoTakes?.promptId);
}

/** Did the player pick one of two takes (the other is the alternate)? */
export function dayTwoTakesJudged(
  still: Pick<DaySlotStill, 'previousTake'> | null | undefined
): boolean {
  return still?.previousTake?.kind === 'two-takes';
}

type StillForPick = Pick<
  DaySlotStill,
  | 'slotId'
  | 'promptId'
  | 'imageUrl'
  | 'status'
  | 'finishedUrl'
  | 'finishedFor'
  | 'adultHold'
  | 'twoTakes'
  | 'previousTake'
>;

/** The picture a take shows: its Face finish when that finish is for this take, else the image. */
function shownImage(
  still: Pick<DaySlotStill, 'promptId' | 'imageUrl' | 'finishedUrl' | 'finishedFor'>
): string {
  const finished = still.finishedUrl?.trim();
  if (finished && still.finishedFor && still.finishedFor === still.promptId) return finished;
  return still.imageUrl?.trim() || '';
}

/** Both takes have landed and can be shown (neither held by the adult check). */
export function dayTwoTakesReady(still: StillForPick | null | undefined): boolean {
  const second = still?.twoTakes;
  return Boolean(
    still &&
    second?.promptId &&
    second.status === 'completed' &&
    second.imageUrl?.trim() &&
    !second.adultHold &&
    still.status === 'completed' &&
    shownImage(still) &&
    !still.adultHold
  );
}

/** The two pictures to show side by side (first = the still, second = the other take). */
export function dayTwoTakesImages(still: StillForPick | null | undefined): {
  first: string;
  second: string;
} {
  return {
    first: still && still.status === 'completed' && !still.adultHold ? shownImage(still) : '',
    second:
      still?.twoTakes?.status === 'completed' && !still.twoTakes.adultHold
        ? still.twoTakes.imageUrl?.trim() || ''
        : '',
  };
}

function statusFromGallery(status: string | undefined): DaySlotStillStatus {
  if (status === 'completed') return 'completed';
  if (status === 'error' || status === 'failed' || status === 'cancelled') return 'error';
  if (status === 'running') return 'running';
  return 'queued';
}

function sameTake(a: DayTwoTake, b: DayTwoTake): boolean {
  return (
    a.promptId === b.promptId &&
    a.imageUrl === b.imageUrl &&
    a.status === b.status &&
    a.adultHold === b.adultHold
  );
}

/**
 * The second take after a gallery poll (its own entry): the same object when nothing moved. A
 * take the adult check is still reading has no image; a withheld one counts as failed.
 */
export function twoTakeFromGallery(
  take: DayTwoTake,
  entry: DayGalleryEntry | null | undefined
): DayTwoTake {
  if (!entry || entry.isClip) return take;
  const status = statusFromGallery(entry.status);
  let next: DayTwoTake;
  if (entry.adultCheck === 'withheld') {
    next = { promptId: take.promptId, status: 'error', adultHold: 'withheld' };
  } else if (entry.adultCheck === 'pending') {
    next =
      status === 'completed'
        ? { promptId: take.promptId, status: 'running', adultHold: 'checking' }
        : { promptId: take.promptId, status };
  } else {
    const imageUrl = entry.imageUrl?.trim() || '';
    next =
      status === 'completed' && imageUrl
        ? { promptId: take.promptId, status: 'completed', imageUrl }
        : {
            promptId: take.promptId,
            status: status === 'completed' ? 'running' : status,
            ...(take.imageUrl ? { imageUrl: take.imageUrl } : {}),
          };
  }
  return sameTake(take, next) ? take : next;
}

/**
 * Settle a pair whose take failed: the second failed (or was withheld) → the first stands alone;
 * the first failed and the second landed → the second becomes the still. The same object when
 * nothing changes (both rendering, both landed, or the first failed with the second in flight).
 */
export function settleDayTwoTakes<T extends StillForPick>(still: T): T {
  const second = still.twoTakes;
  if (!second) return still;
  if (second.status === 'error') return { ...still, twoTakes: undefined };
  if (
    still.status === 'error' &&
    second.status === 'completed' &&
    second.imageUrl?.trim() &&
    !second.adultHold
  ) {
    return {
      ...still,
      promptId: second.promptId,
      imageUrl: second.imageUrl,
      status: 'completed',
      adultHold: undefined,
      adultHoldCause: undefined,
      finishedUrl: undefined,
      finishedFor: undefined,
      twoTakes: undefined,
    };
  }
  return still;
}

export type DayTwoTakesPick = {
  patch: DaySlotStill;
  /** The kept take's prompt id and the other's (pose × engine stats: kept / replaced). */
  keptId?: string;
  otherId?: string;
};

/**
 * The player tapped a take: the first (the still) stays and the second becomes the alternate, or
 * the second becomes the still with the first as the alternate. Null until both have landed.
 */
export function dayTwoTakesPickPatch(
  still: StillForPick | null | undefined,
  keep: 'first' | 'second'
): DayTwoTakesPick | null {
  if (!still || !dayTwoTakesReady(still)) return null;
  const second = still.twoTakes!;
  const firstImage = shownImage(still);
  const firstId = still.promptId?.trim() || undefined;
  if (keep === 'first') {
    return {
      patch: {
        slotId: still.slotId,
        previousTake: {
          imageUrl: second.imageUrl!.trim(),
          promptId: second.promptId,
          kind: 'two-takes',
        },
        bestOfTwo: undefined,
        twoTakes: undefined,
      },
      keptId: firstId,
      otherId: second.promptId,
    };
  }
  return {
    patch: {
      slotId: still.slotId,
      promptId: second.promptId,
      imageUrl: second.imageUrl!.trim(),
      status: 'completed',
      finishedUrl: undefined,
      finishedFor: undefined,
      clipPromptId: undefined,
      clipUrl: undefined,
      clipStatus: undefined,
      previousTake: {
        imageUrl: firstImage,
        ...(firstId ? { promptId: firstId } : {}),
        kind: 'two-takes',
      },
      bestOfTwo: undefined,
      twoTakes: undefined,
    },
    keptId: second.promptId,
    otherId: firstId,
  };
}

/**
 * "Use the other take" after a pick: the alternate becomes the still and the shown take the
 * alternate — reversible, nothing is dropped. Null unless the still is a picked pair.
 */
export function dayTwoTakesSwapPatch(
  still: StillForPick | null | undefined
): DayTwoTakesPick | null {
  const other = still?.previousTake;
  if (!still || other?.kind !== 'two-takes' || !other.imageUrl?.trim()) return null;
  const shown = shownImage(still);
  const shownId = still.promptId?.trim() || undefined;
  return {
    patch: {
      slotId: still.slotId,
      promptId: other.promptId,
      imageUrl: other.imageUrl,
      status: 'completed',
      finishedUrl: undefined,
      finishedFor: undefined,
      clipPromptId: undefined,
      clipUrl: undefined,
      clipStatus: undefined,
      previousTake: shown
        ? { imageUrl: shown, ...(shownId ? { promptId: shownId } : {}), kind: 'two-takes' }
        : undefined,
    },
    keptId: other.promptId,
    otherId: shownId,
  };
}

/** The slot card's line for a pair: rendering, waiting for the pick, or picked. */
export function dayTwoTakesMark(still: StillForPick | null | undefined): string | null {
  if (!still) return null;
  if (dayTwoTakesPending(still)) {
    if (dayTwoTakesReady(still)) return 'Two takes — tap the one to keep';
    const images = dayTwoTakesImages(still);
    return images.first || images.second ? 'Two takes — the other is rendering…' : 'Two takes…';
  }
  if (dayTwoTakesJudged(still)) return 'Two takes · your pick (the other is kept)';
  return null;
}
