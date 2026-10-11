/**
 * Cast home "What's next" checklist — one row per step of making a film with this Cast, done or
 * not, with where to go for it. The first step not done is the one the page calls Next.
 * Pure: the Cast home gathers the facts (plate, traits, bible, keepers, Day stills, films, Story).
 */

import type { DayToolCache } from './play-settings';

export type CastChecklistItemId =
  'plate' | 'traits' | 'bible' | 'outfit' | 'day' | 'film' | 'story';

/** Where a checklist row takes you: a tab on the Cast home, or another page. */
export type CastChecklistTarget =
  { kind: 'tab'; tab: 'overview' | 'bible' | 'film' } | { kind: 'href'; href: string };

export type CastChecklistItem = {
  id: CastChecklistItemId;
  label: string;
  done: boolean;
  /** Short state line ("3 stills", "not yet"). */
  detail: string;
  /** Not needed for a film (traits, bible, outfit, Story) — never marked Next. */
  optional?: boolean;
  /** Button text for the step. */
  action: string;
  target: CastChecklistTarget;
};

export type CastChecklist = {
  items: CastChecklistItem[];
  doneCount: number;
  /** The first film step not done (plate → Day → film); never an optional row. */
  nextId: CastChecklistItemId | null;
  allDone: boolean;
};

export type CastChecklistFacts = {
  characterId: string;
  plateReady: boolean;
  /** The plate was prepared (stance / clean-up) — only when the look records it. */
  platePrepared?: boolean;
  traitsSet: boolean;
  bibleWritten: boolean;
  /** Keepers marked on the active look. */
  keeperCount: number;
  /** Day stills rendered for this Cast. */
  dayStillCount: number;
  /** Assembled films stamped on this Cast. */
  filmCount: number;
  /** Shots in the Cast's cut list (not yet assembled). */
  cutShotCount?: number;
  /** Beats in this Cast's Story session. */
  storyBeatCount: number;
};

const OPTIONAL_ITEMS = new Set<CastChecklistItemId>(['traits', 'bible', 'outfit', 'story']);

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function castChecklist(facts: CastChecklistFacts): CastChecklist {
  const id = encodeURIComponent(facts.characterId.trim());
  const keepers = Math.max(0, facts.keeperCount);
  const dayStills = Math.max(0, facts.dayStillCount);
  const films = Math.max(0, facts.filmCount);
  const cutShots = Math.max(0, facts.cutShotCount ?? 0);
  const beats = Math.max(0, facts.storyBeatCount);

  const items: CastChecklistItem[] = [
    {
      id: 'plate',
      label: 'Plate ready',
      done: facts.plateReady,
      detail: facts.plateReady
        ? facts.platePrepared
          ? 'ready · prepared'
          : 'ready'
        : 'add a look plate',
      action: facts.plateReady ? 'Look plate' : 'Add plate',
      target: { kind: 'tab', tab: 'overview' },
    },
    {
      id: 'traits',
      label: 'Appearance traits set',
      done: facts.traitsSet,
      detail: facts.traitsSet ? 'set' : 'pick sex, age, build…',
      action: 'Appearance',
      target: { kind: 'tab', tab: 'bible' },
    },
    {
      id: 'bible',
      label: 'Bible written',
      done: facts.bibleWritten,
      detail: facts.bibleWritten ? 'written' : 'look and personality',
      action: 'Bible',
      target: { kind: 'tab', tab: 'bible' },
    },
    {
      id: 'outfit',
      label: 'Outfit kept',
      done: keepers > 0,
      detail: keepers > 0 ? plural(keepers, 'keeper') : 'keep a try-on',
      action: 'Outfit',
      target: { kind: 'href', href: `/fitting?character=${id}` },
    },
    {
      id: 'day',
      label: 'Day stills rendered',
      done: dayStills > 0,
      detail: dayStills > 0 ? plural(dayStills, 'still') : 'not yet',
      action: 'Day',
      target: { kind: 'href', href: `/day?character=${id}` },
    },
    {
      id: 'film',
      label: 'Film cut',
      done: films > 0,
      detail:
        films > 0
          ? plural(films, 'film')
          : cutShots > 0
            ? `${plural(cutShots, 'shot')} in the cut — assemble it`
            : 'not yet',
      action: 'Film studio',
      target: { kind: 'tab', tab: 'film' },
    },
    {
      id: 'story',
      label: 'Story started',
      done: beats > 0,
      detail: beats > 0 ? plural(beats, 'beat') : 'not yet',
      action: 'Story',
      target: { kind: 'href', href: `/story?character=${id}` },
    },
  ];

  // Next is the film's next step. UI audit (2026-10-11): with a film cut, Next sat on the optional
  // "Outfit kept" while the header said "Continue to Day".
  for (const item of items) {
    if (OPTIONAL_ITEMS.has(item.id)) item.optional = true;
  }
  const doneCount = items.filter(item => item.done).length;
  const next = items.find(item => !item.done && !item.optional);
  return {
    items,
    doneCount,
    nextId: next?.id ?? null,
    allDone: items.every(item => item.done),
  };
}

type DayStillLike = Pick<NonNullable<DayToolCache['stills']>[number], 'status' | 'imageUrl'>;

function completedStills(stills: readonly DayStillLike[] | undefined): number {
  return (stills ?? []).filter(
    still => still.status === 'completed' && Boolean(still.imageUrl?.trim())
  ).length;
}

/**
 * Day stills this Cast has: the Day board when it is theirs (owned, or unowned while they are
 * the active Cast), plus their parked Day — or the Day stills in the Gallery stamped with them,
 * whichever is more (a cleared board still leaves its stills in the Gallery).
 */
export function countCastDayStills(input: {
  characterId: string;
  activeCharacterId?: string | null;
  day?: Pick<DayToolCache, 'stills' | 'stillsCharacterId' | 'parkedDays'> | null;
  /** Completed gallery stills from Day stamped with this Cast. */
  galleryDayStillCount?: number;
}): number {
  const id = input.characterId.trim();
  if (!id) {
    return 0;
  }
  const day = input.day ?? null;
  const owner = day?.stillsCharacterId?.trim() || input.activeCharacterId?.trim() || '';
  const board = day && owner === id ? completedStills(day.stills) : 0;
  const parked = completedStills(day?.parkedDays?.[id]?.stills);
  return Math.max(board + parked, Math.max(0, input.galleryDayStillCount ?? 0));
}
