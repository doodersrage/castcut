/**
 * The server's watch over a Queue-all run (FINISHING_PLAN Phase 3, step 3, 2026-11-13): its takes
 * were handed to ComfyUI and the page may be closed. Each take still out is looked for in
 * ComfyUI — queued or rendering: wait; finished: landed here, so it reaches the Gallery even if
 * ComfyUI restarts and forgets its history before a page opens; unknown to ComfyUI (a restart
 * lost it): queued again from its recorded graph, once, and the browser swaps the new job in.
 *
 * Only a job this watch saw in ComfyUI (queued or rendering) and that then vanished — from the
 * queue and its history both — is queued again: one it never saw may have been deleted from
 * ComfyUI's queue by hand, or finished before a history clear, and queueing it would undo a
 * cancel or render a take twice.
 *
 * This is the decision, pure. The run is read as stored (sqlite/scene-runs.ts, raw: the runs'
 * own types are Play's, which this shared module doesn't import), and only its hand-off fields.
 */

/** What ComfyUI says about a job. */
export type WatchedJob =
  | { state: 'queued' }
  | { state: 'done'; outputs: unknown }
  | { state: 'failed'; message: string }
  /** Neither queued nor in history: a restart lost it (or its history was cleared). */
  | { state: 'unknown' };

export type WatchAction =
  | { kind: 'land'; runId: string; sceneId: string; promptId: string; outputs: unknown }
  | { kind: 'requeue'; runId: string; sceneId: string; promptId: string }
  | { kind: 'wait'; runId: string; sceneId: string; promptId: string };

/** A take is queued again at most this many times (a graph ComfyUI keeps losing isn't tried forever). */
export const RUN_WATCH_MAX_REQUEUES = 1;

type HandedRun = {
  id: string;
  state?: unknown;
  outcomes?: Record<string, unknown>;
  handOff?: { handed?: Record<string, unknown> };
};

/** The takes a stored run still has out with ComfyUI (handed, no outcome): Scene id → prompt id. */
export function runTakesOut(
  raw: unknown
): Array<{ runId: string; sceneId: string; promptId: string }> {
  if (!raw || typeof raw !== 'object') return [];
  const run = raw as HandedRun;
  // Only a handed-off run: a run rendering on a page waits for its own take there.
  if (run.state !== 'handed' || typeof run.id !== 'string') return [];
  const handed = run.handOff?.handed;
  if (!handed || typeof handed !== 'object') return [];
  return Object.entries(handed)
    .filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && entry[1].trim() !== '' && !run.outcomes?.[entry[0]]
    )
    .map(([sceneId, promptId]) => ({ runId: run.id, sceneId, promptId: promptId.trim() }));
}

/**
 * What to do about each take a run still has out. `requeued`: prompt id → the job it was queued
 * again as (followed to the newest); `landed`: prompt ids already landed here.
 */
export function watchRunTakes(input: {
  runs: readonly unknown[];
  job: (promptId: string) => WatchedJob;
  requeued: ReadonlyMap<string, string>;
  landed: ReadonlySet<string>;
  /** Prompt ids this watch has seen queued or rendering in ComfyUI. */
  seen: ReadonlySet<string>;
}): WatchAction[] {
  const actions: WatchAction[] = [];
  for (const run of input.runs) {
    for (const take of runTakesOut(run)) {
      // The job it is now: followed through its re-queues.
      let promptId = take.promptId;
      let requeues = 0;
      const followed = new Set<string>();
      while (input.requeued.has(promptId) && !followed.has(promptId)) {
        followed.add(promptId);
        promptId = input.requeued.get(promptId)!;
        requeues += 1;
      }
      const at = { runId: take.runId, sceneId: take.sceneId, promptId };
      if (input.landed.has(promptId)) continue;
      const job = input.job(promptId);
      if (job.state === 'done') actions.push({ kind: 'land', ...at, outputs: job.outputs });
      else if (
        job.state === 'unknown' &&
        input.seen.has(promptId) &&
        requeues < RUN_WATCH_MAX_REQUEUES
      )
        actions.push({ kind: 'requeue', ...at });
      // Failed: the page says why when it opens (as it does today). Queued: wait.
      else actions.push({ kind: 'wait', ...at });
    }
  }
  return actions;
}
