/**
 * The server's watch over handed-off runs, run once a minute (instrumentation-node.ts) when the
 * server keeps storage (FINISHING_PLAN Phase 3, step 3). The decision is run-watcher.ts; this
 * asks ComfyUI, records what it saw, lands finished jobs and queues lost ones again.
 *
 * The browser needs nothing new: it asks /api/comfyui/status about its take's prompt id, and that
 * answer follows the watch (watchedPromptStatus) — the new job's status for one queued again, the
 * kept result for one ComfyUI has forgotten.
 */
import { buildComfyPromptPostBody, getComfyUiBaseUrl } from '@/lib/comfyui/client';
import {
  COMFY_PROMPT_LOST_MESSAGE,
  getComfyUiPromptStatus,
  type ComfyPromptStatus,
} from '@/lib/comfyui/status';
import type { ComfyUiRuntimeConfig } from '@/lib/comfyui/config';
import {
  claimJobRequeue,
  landedJobStatus,
  markJobLanded,
  markJobRequeuedAs,
  releaseJobRequeue,
  markJobSeen,
  readRunWatchState,
  requeuedJobOf,
} from '@/lib/sqlite/run-watch-jobs';
import { readSceneRuns } from '@/lib/sqlite/scene-runs';
import { getStudioDb } from '@/lib/sqlite/studio-db';
import { readSubmittedGraph, recordSubmittedGraph } from '@/lib/sqlite/submitted-graphs';
import { isServerStorageEnabled } from '@/lib/storage/server-storage';
import { runTakesOut, watchRunTakes, type WatchedJob } from './run-watcher';

/** Runs older than this aren't watched (a handed run left for days is the page's to settle). */
const WATCH_RUNS_UPDATED_WITHIN_MS = 3 * 24 * 60 * 60_000;

export type RunWatchDeps = {
  status?: (promptId: string, comfyUrl?: string) => Promise<ComfyPromptStatus>;
  /** Send a graph to ComfyUI; the new prompt id, or null. */
  submit?: (graph: Record<string, unknown>, comfyUrl: string) => Promise<string | null>;
  now?: () => number;
};

async function submitGraph(
  graph: Record<string, unknown>,
  comfyUrl: string
): Promise<string | null> {
  const response = await fetch(`${comfyUrl.replace(/\/+$/, '')}/prompt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      buildComfyPromptPostBody({ prompt: graph, clientId: 'castcut-run-watch' })
    ),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { prompt_id?: unknown } | null;
  return typeof body?.prompt_id === 'string' && body.prompt_id ? body.prompt_id : null;
}

function jobOf(status: ComfyPromptStatus): WatchedJob | null {
  if (status.status === 'pending' || status.status === 'running') return { state: 'queued' };
  if (status.status === 'completed') return { state: 'done', outputs: status };
  if (status.status === 'error')
    return status.statusMessage === COMFY_PROMPT_LOST_MESSAGE
      ? { state: 'unknown' }
      : { state: 'failed', message: status.statusMessage ?? 'error' };
  // ComfyUI didn't answer: nothing is decided about this job now.
  return null;
}

/**
 * A job ComfyUI lost (a restart, a cleared queue) queued again from the graph it was sent — once
 * per job (claimJobRequeue). Its new id is recorded, so watchedPromptStatus follows it: a take
 * waited for by its first id lands where it was waited for. The new id, or null.
 */
export async function requeueLostJob(
  promptId: string,
  owner: { runId: string; sceneId: string },
  deps: Pick<RunWatchDeps, 'submit' | 'now'> = {}
): Promise<string | null> {
  const now = deps.now?.() ?? Date.now();
  const graph = readSubmittedGraph(promptId);
  if (!graph || !claimJobRequeue(promptId, now)) return null;
  const comfyUrl = graph.comfyUrl || getComfyUiBaseUrl();
  const next = await (deps.submit ?? submitGraph)(graph.graph, comfyUrl).catch(() => null);
  if (!next) {
    releaseJobRequeue(promptId);
    return null;
  }
  markJobRequeuedAs(promptId, next);
  recordSubmittedGraph({ promptId: next, comfyUrl, model: graph.model, graph: graph.graph, now });
  markJobSeen(next, { runId: owner.runId, sceneId: owner.sceneId, comfyUrl }, now);
  console.info(`[run-watch] ${owner.runId}: ${promptId} was lost — queued again as ${next}`);
  return next;
}

export type RunWatchTick = { watched: number; landed: number; requeued: number };

export async function tickRunWatcher(deps: RunWatchDeps = {}): Promise<RunWatchTick> {
  const tick: RunWatchTick = { watched: 0, landed: 0, requeued: 0 };
  if (!isServerStorageEnabled()) return tick;
  const now = deps.now?.() ?? Date.now();
  const status =
    deps.status ?? ((id, url) => getComfyUiPromptStatus(id, url ? { apiUrl: url } : undefined));
  const submit = deps.submit ?? submitGraph;
  const scopes = (
    getStudioDb().prepare('SELECT DISTINCT scope FROM scene_runs').all() as Array<{ scope: string }>
  ).map(row => row.scope);
  const runs = scopes
    .flatMap(scope => readSceneRuns(scope))
    .filter(run => run.state === 'handed' && now - run.updatedAt < WATCH_RUNS_UPDATED_WITHIN_MS);
  const takes = runs.flatMap(run => runTakesOut(run));
  if (!takes.length) return tick;
  const state = readRunWatchState(takes.map(take => take.promptId));
  // Each take's job now (through its re-queues), asked once.
  const jobs = new Map<string, WatchedJob>();
  const statuses = new Map<string, ComfyPromptStatus>();
  for (const take of takes) {
    let id = take.promptId;
    for (let hops = 0; state.requeued.has(id) && hops < 8; hops += 1) id = state.requeued.get(id)!;
    if (jobs.has(id) || state.landed.has(id)) continue;
    const comfyUrl = readSubmittedGraph(id)?.comfyUrl;
    try {
      const answer = await status(id, comfyUrl);
      const job = jobOf(answer);
      if (!job) continue;
      jobs.set(id, job);
      statuses.set(id, answer);
      tick.watched += 1;
      if (job.state === 'queued' || job.state === 'done')
        markJobSeen(id, { runId: take.runId, sceneId: take.sceneId, comfyUrl }, now);
    } catch {
      // ComfyUI unreachable: this job waits for the next tick.
    }
  }
  const seen = new Set([
    ...state.seen,
    ...[...jobs].filter(([, job]) => job.state !== 'unknown').map(([id]) => id),
  ]);
  for (const id of state.cancelled) seen.delete(id);
  const actions = watchRunTakes({
    runs,
    // A job ComfyUI didn't answer about is waited for.
    job: id => jobs.get(id) ?? { state: 'queued' },
    requeued: state.requeued,
    landed: state.landed,
    seen,
  });
  for (const action of actions) {
    if (action.kind === 'land') {
      markJobLanded(action.promptId, statuses.get(action.promptId), now);
      tick.landed += 1;
    } else if (action.kind === 'requeue') {
      const next = await requeueLostJob(action.promptId, action, { submit, now: () => now });
      if (next) tick.requeued += 1;
    }
  }
  return tick;
}

/**
 * A job's status as the browser should see it: the job it was queued again as (under its own
 * id, so the take lands where it was waited for), or the result the watch kept for one ComfyUI
 * has since forgotten.
 */
export async function watchedPromptStatus(
  promptId: string,
  runtime?: ComfyUiRuntimeConfig,
  ask: (
    promptId: string,
    runtime?: ComfyUiRuntimeConfig
  ) => Promise<ComfyPromptStatus> = getComfyUiPromptStatus
): Promise<ComfyPromptStatus> {
  const next = requeuedJobOf(promptId);
  const asked = next ?? promptId;
  const url = next ? readSubmittedGraph(next)?.comfyUrl : undefined;
  const status = await ask(asked, url ? { apiUrl: url } : runtime);
  if (status.status === 'error' && status.statusMessage === COMFY_PROMPT_LOST_MESSAGE) {
    const kept = landedJobStatus(asked) as ComfyPromptStatus | null;
    if (kept?.status === 'completed') return { ...kept, promptId };
  }
  return next ? { ...status, promptId } : status;
}
