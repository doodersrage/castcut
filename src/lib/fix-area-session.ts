/**
 * "Fix an area" sessions: the takes of one Fix, tracked outside the dialog so closing it (or a
 * remount — React's dev double mount, the lightbox re-rendering, a Day card refresh) never loses
 * a take that ComfyUI is rendering. The store polls every unfinished take on one timer, runs the
 * adult gate when the still is adult, and keeps a landed session until the player compares it
 * ("Fix ready — compare") or discards it.
 *
 * Pure: the store is a factory over injected IO (the real one is fix-area-session-store.ts) so
 * the lifecycle — open, close while rendering, land, reopen — is unit-tested without React.
 */

import type { ComfyOutputImage } from '@/lib/comfyui-outputs';
import type { FixAreaJob, FixAreaPoll, FixAreaTarget } from '@/lib/fix-area-client';
import type { FixAreaBox, FixAreaMode } from '@/lib/fix-area';

export type FixAreaCandidateState =
  | { status: 'queued' | 'running' }
  | { status: 'checking'; image: ComfyOutputImage }
  | { status: 'ready'; image: ComfyOutputImage; adultCheck?: 'passed' | 'unchecked' }
  /** Withheld by the adult gate; the picture stays so "Check again" can ask once more. */
  | { status: 'withheld'; reason: string; image?: ComfyOutputImage }
  | { status: 'failed'; message: string };

export type FixAreaCandidate = FixAreaJob & { state: FixAreaCandidateState };

export type FixAreaSession = {
  id: string;
  target: FixAreaTarget;
  /** The painted mask (white = fix) as a PNG data URL. */
  maskUrl: string;
  /** The painted area's box, as fractions of the picture (zoom to the area). */
  maskBox: FixAreaBox | null;
  /** The picture's width / height. */
  aspect: number;
  text: string;
  mode: FixAreaMode;
  /** The engine took the Cast face as an identity reference (Fix the face). */
  identity: boolean;
  candidates: FixAreaCandidate[];
  createdAt: number;
  /** A dialog is showing this session. */
  open: boolean;
};

export type FixAreaGateVerdict = {
  pass: boolean;
  reason: string;
  verdict?: 'passed' | 'unchecked';
};

export type FixAreaSessionDeps = {
  poll: (promptId: string) => Promise<FixAreaPoll>;
  gate: (
    imageUrl: string,
    adult: NonNullable<FixAreaTarget['adult']>
  ) => Promise<FixAreaGateVerdict>;
  cancel: (promptIds: string[]) => void;
  imageUrl: (image: ComfyOutputImage) => string;
  /** Start a repeating tick; returns the stop function. */
  schedule: (tick: () => void, intervalMs: number) => () => void;
  now?: () => number;
  id?: () => string;
};

export const FIX_AREA_POLL_MS = 1500;
/** Reads in a row that find the job neither in the queue nor in history before it counts as lost. */
export const FIX_AREA_MISSING_READS = 3;

export function isUnfinishedCandidate(candidate: FixAreaCandidate): boolean {
  return candidate.state.status === 'queued' || candidate.state.status === 'running';
}

export function fixAreaSessionProgress(session: Pick<FixAreaSession, 'candidates'>): {
  total: number;
  /** Takes that have landed (ready, withheld or failed). */
  landed: number;
  ready: number;
  /** Nothing is rendering or being checked any more. */
  settled: boolean;
} {
  let landed = 0;
  let ready = 0;
  let settled = true;
  for (const candidate of session.candidates) {
    const status = candidate.state.status;
    if (status === 'ready') ready += 1;
    if (status === 'ready' || status === 'withheld' || status === 'failed') landed += 1;
    else settled = false;
  }
  return { total: session.candidates.length, landed, ready, settled };
}

/** The chip on the source card: "Fixing… 1 of 2", "Fix ready — compare", or null when nothing is tracked. */
export function fixAreaSessionChipLabel(
  session: Pick<FixAreaSession, 'candidates' | 'open'> | null | undefined
): string | null {
  if (!session || session.open) return null;
  const progress = fixAreaSessionProgress(session);
  if (progress.total === 0) return null;
  if (!progress.settled) return `Fixing… ${progress.landed} of ${progress.total}`;
  return progress.ready > 0 ? 'Fix ready — compare' : 'Fix failed — see why';
}

/** The caption under an unfinished take; `seconds` since the Fix was queued (shown from 5 s). */
export function fixAreaCandidateCaption(state: FixAreaCandidateState, seconds = 0): string {
  const elapsed = seconds >= 5 ? ` (${seconds}s)` : '';
  switch (state.status) {
    case 'queued':
      return `Waiting in the ComfyUI queue…${elapsed}`;
    case 'running':
      return `Rendering…${elapsed}`;
    case 'checking':
      return `Checking it reads as adult…${elapsed}`;
    case 'withheld':
      return `Withheld: it did not read as clearly adult (${state.reason}).`;
    case 'failed':
      return state.message;
    default:
      return '';
  }
}

/** A session keyed to a still: its shown picture or its ComfyUI output. */
export function fixAreaSessionMatchesStill(
  session: Pick<FixAreaSession, 'target'>,
  url: string | null | undefined
): boolean {
  const key = url?.trim();
  if (!key) return false;
  return session.target.displayUrl === key || session.target.comfyUrl === key;
}

export type FixAreaSessionStore = {
  start: (input: {
    target: FixAreaTarget;
    maskUrl: string;
    maskBox: FixAreaBox | null;
    aspect: number;
    text: string;
    mode: FixAreaMode;
    identity: boolean;
    jobs: FixAreaJob[];
    /** The dialog that queued it is showing it (false when it closed while Fix was queueing). */
    open?: boolean;
  }) => FixAreaSession;
  get: (id: string) => FixAreaSession | null;
  all: () => readonly FixAreaSession[];
  subscribe: (listener: () => void) => () => void;
  setOpen: (id: string, open: boolean) => void;
  /** Drop a session: unstarted takes leave the queue; a running one finishes unseen. */
  discard: (id: string) => void;
  /** Ask the adult gate again about a withheld take (it kept its picture). */
  recheck: (id: string, promptId: string) => Promise<void>;
  /** One poll round over every unfinished take (the timer calls this). */
  tick: () => Promise<void>;
  /** For tests: whether the timer is running. */
  polling: () => boolean;
};

export function createFixAreaSessionStore(deps: FixAreaSessionDeps): FixAreaSessionStore {
  const now = deps.now ?? (() => Date.now());
  let counter = 0;
  const nextId = deps.id ?? (() => `fix-${now().toString(36)}-${(counter += 1)}`);
  let sessions: readonly FixAreaSession[] = [];
  const listeners = new Set<() => void>();
  const inFlight = new Set<string>();
  const misses = new Map<string, number>();
  let stop: (() => void) | null = null;

  const emit = () => {
    for (const listener of listeners) listener();
  };
  const replace = (next: readonly FixAreaSession[]) => {
    sessions = next;
    emit();
    syncTimer();
  };
  const patchSession = (id: string, patch: (session: FixAreaSession) => FixAreaSession) => {
    let changed = false;
    const next = sessions.map(session => {
      if (session.id !== id) return session;
      const patched = patch(session);
      if (patched !== session) changed = true;
      return patched;
    });
    if (changed) replace(next);
  };
  const setCandidateState = (sessionId: string, promptId: string, state: FixAreaCandidateState) => {
    patchSession(sessionId, session => ({
      ...session,
      candidates: session.candidates.map(entry =>
        entry.promptId !== promptId ||
        // A landed take never goes back (a late poll can't undo it).
        (entry.state.status !== 'queued' && entry.state.status !== 'running')
          ? entry
          : { ...entry, state }
      ),
    }));
  };
  const hasUnfinished = () =>
    sessions.some(session => session.candidates.some(isUnfinishedCandidate));
  function syncTimer() {
    if (hasUnfinished()) {
      if (!stop) stop = deps.schedule(() => void tick(), FIX_AREA_POLL_MS);
    } else if (stop) {
      stop();
      stop = null;
    }
  }

  /** The adult gate on a landed take: "checking", then ready or withheld (with its picture). */
  async function gateOne(
    sessionId: string,
    promptId: string,
    image: ComfyOutputImage,
    adult: NonNullable<FixAreaTarget['adult']>
  ): Promise<void> {
    patchSession(sessionId, current => ({
      ...current,
      candidates: current.candidates.map(entry =>
        entry.promptId === promptId ? { ...entry, state: { status: 'checking', image } } : entry
      ),
    }));
    const verdict = await deps
      .gate(deps.imageUrl(image), adult)
      .catch((): FixAreaGateVerdict => ({ pass: false, reason: 'the check failed' }));
    patchSession(sessionId, current => ({
      ...current,
      candidates: current.candidates.map(entry =>
        entry.promptId !== promptId || entry.state.status !== 'checking'
          ? entry
          : {
              ...entry,
              state: verdict.pass
                ? { status: 'ready', image, adultCheck: verdict.verdict ?? 'passed' }
                : { status: 'withheld', reason: verdict.reason, image },
            }
      ),
    }));
  }

  async function pollOne(session: FixAreaSession, candidate: FixAreaCandidate): Promise<void> {
    const { promptId } = candidate;
    inFlight.add(promptId);
    try {
      const poll = await deps.poll(promptId);
      // The session may have been discarded while the read was out.
      if (!sessions.some(entry => entry.id === session.id)) return;
      if (poll.status === 'pending') return;
      if (poll.status === 'running') {
        setCandidateState(session.id, promptId, { status: 'running' });
        return;
      }
      if (poll.status === 'error') {
        setCandidateState(session.id, promptId, { status: 'failed', message: poll.message });
        return;
      }
      if (poll.status === 'missing') {
        // Several reads in a row, so a job between the queue and its history isn't lost.
        const count = (misses.get(promptId) ?? 0) + 1;
        misses.set(promptId, count);
        if (count < FIX_AREA_MISSING_READS) return;
        setCandidateState(session.id, promptId, {
          status: 'failed',
          message: 'The job left the ComfyUI queue without a picture.',
        });
        return;
      }
      if (!session.target.adult) {
        setCandidateState(session.id, promptId, { status: 'ready', image: poll.image });
        return;
      }
      await gateOne(session.id, promptId, poll.image, session.target.adult);
    } finally {
      inFlight.delete(promptId);
    }
  }

  async function tick(): Promise<void> {
    const reads: Promise<void>[] = [];
    for (const session of sessions) {
      for (const candidate of session.candidates) {
        if (!isUnfinishedCandidate(candidate)) continue;
        // One status request per job at a time: the server drops a landed job's history once
        // read, so an overlapping second poll would find it gone.
        if (inFlight.has(candidate.promptId)) continue;
        reads.push(pollOne(session, candidate));
      }
    }
    await Promise.all(reads);
  }

  return {
    start(input) {
      const session: FixAreaSession = {
        id: nextId(),
        target: input.target,
        maskUrl: input.maskUrl,
        maskBox: input.maskBox,
        aspect: input.aspect > 0 ? input.aspect : 3 / 4,
        text: input.text,
        mode: input.mode,
        identity: input.identity,
        candidates: input.jobs.map(job => ({ ...job, state: { status: 'queued' } })),
        createdAt: now(),
        open: input.open ?? true,
      };
      replace([...sessions, session]);
      return session;
    },
    get: id => sessions.find(session => session.id === id) ?? null,
    all: () => sessions,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setOpen(id, open) {
      patchSession(id, session => (session.open === open ? session : { ...session, open }));
    },
    discard(id) {
      const session = sessions.find(entry => entry.id === id);
      if (!session) return;
      const unfinished = session.candidates.filter(isUnfinishedCandidate).map(c => c.promptId);
      if (unfinished.length > 0) deps.cancel(unfinished);
      for (const candidate of session.candidates) misses.delete(candidate.promptId);
      replace(sessions.filter(entry => entry.id !== id));
    },
    async recheck(id, promptId) {
      const session = sessions.find(entry => entry.id === id);
      const candidate = session?.candidates.find(entry => entry.promptId === promptId);
      if (
        !session?.target.adult ||
        !candidate ||
        candidate.state.status !== 'withheld' ||
        !candidate.state.image
      ) {
        return;
      }
      await gateOne(id, promptId, candidate.state.image, session.target.adult);
    },
    tick,
    polling: () => stop !== null,
  };
}
