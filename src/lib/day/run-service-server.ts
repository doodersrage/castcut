/**
 * Scene runs the server renders (FINISHING_PLAN Phase 3, step 8): started from the page (POST
 * /api/scene-runs/server), held by the server's lease while they render (the page then leaves the
 * run to it, as to another device), picked up again when the server starts (instrumentation-node:
 * a run whose working copy says "running"). The loop is run-loop-server.ts; its state and
 * patches are kept in the server store (sqlite/scene-run-patches.ts); the page applies them.
 */
import { getComfyUiBaseUrl } from '@/lib/comfyui/client';
import { fetchComfyObjectInfoPayload } from '@/lib/comfyui/object-info';
import { serverPictureIo } from '@/lib/media/picture-io-server';
import { requeueLostJob, watchedPromptStatus } from '@/lib/server/run-watcher-server';
import { getStudioDb } from '@/lib/sqlite/studio-db';
import { claimRunLease, releaseRunLease } from '@/lib/sqlite/scene-run-leases';
import { readRunBundle } from '@/lib/sqlite/scene-run-bundles';
import { appendRunPatch, readRunState, writeRunState } from '@/lib/sqlite/scene-run-patches';
import { writeSceneRun } from '@/lib/sqlite/scene-runs';
import { getClothingSelectOptions } from '@/lib/wardrobe/clothing-catalog';
import { getClothingCatalogFieldCategories } from '@/lib/wardrobe/clothing-catalog-fields';
import { loadWardrobeGarmentThumbManifest } from '@/lib/wardrobe/garment-thumbs';
import type { DayDressPlateEntry } from './dress-plate-cache';
import { normalizeRunBundle, type RunBundle } from './run-bundle';
import { checkServerTake } from './run-checks-server';
import {
  runSceneRunOnServer,
  serverRunState,
  type RunPatch,
  type ServerRunState,
} from './run-loop-server';
import type { SceneRun } from './scene-run';

/** The server's name on a run's lease. */
export const SERVER_RUN_HOLDER = 'castcut-server';
const LEASE_RENEW_MS = 10_000;

type Active = { stop: string | null; done: Promise<SceneRun | null> };
const active = new Map<string, Active>();
const keyOf = (scope: string, runId: string) => `${scope}\u0000${runId}`;

export type StartServerRun =
  { ok: true; started: boolean } | { ok: false; error: string; status: number };

/** Start (or resume) rendering `runId` on the server. */
export function startServerRun(
  scope: string,
  runId: string,
  /** The app's own origin (the request's): where its picture paths are fetched from. */
  appOrigin: string
): StartServerRun {
  const key = keyOf(scope, runId);
  if (active.has(key)) return { ok: true, started: false };
  const bundle = normalizeRunBundle(readRunBundle(scope, runId));
  if (!bundle) return { ok: false, error: 'No bundle for that run.', status: 404 };
  if (!bundle.queue || !bundle.page) {
    return {
      ok: false,
      error: 'This run was started before the server could render its takes.',
      status: 409,
    };
  }
  const state = serverRunState(bundle, readRunState(scope, runId));
  if (!state?.sceneTool.run)
    return { ok: false, error: 'The run is not in its bundle.', status: 409 };
  const claim = claimRunLease(scope, runId, SERVER_RUN_HOLDER);
  if (!claim?.held) {
    return { ok: false, error: 'The run is rendering somewhere else.', status: 409 };
  }
  const entry: Active = { stop: null, done: Promise.resolve(null) };
  active.set(key, entry);
  entry.done = renderOnServer(scope, runId, bundle, state, entry, appOrigin).finally(() => {
    active.delete(key);
    releaseRunLease(scope, runId, SERVER_RUN_HOLDER);
  });
  return { ok: true, started: true };
}

/** Pause it after the step it is on (a take in flight stays the run's: Resume waits for it). */
export function pauseServerRun(scope: string, runId: string, why = 'Paused'): boolean {
  const entry = active.get(keyOf(scope, runId));
  if (!entry) return false;
  entry.stop = why;
  return true;
}

export function serverRunActive(scope: string, runId: string): boolean {
  return active.has(keyOf(scope, runId));
}

/** Runs the server was rendering when it stopped: picked up again (at start). */
export function resumeServerRuns(appOrigin: string): number {
  const rows = getStudioDb()
    .prepare('SELECT scope, run_id, json FROM scene_run_state')
    .all() as Array<{ scope: string; run_id: string; json: string }>;
  let resumed = 0;
  for (const row of rows) {
    try {
      const saved = JSON.parse(row.json) as { sceneTool?: { run?: { state?: string } } };
      if (saved.sceneTool?.run?.state !== 'running') continue;
      if (startServerRun(row.scope, row.run_id, appOrigin).ok) resumed += 1;
    } catch {
      // A row that can't be read is left for the page.
    }
  }
  return resumed;
}

async function renderOnServer(
  scope: string,
  runId: string,
  bundle: RunBundle,
  state: ServerRunState,
  entry: Active,
  appOrigin: string
): Promise<SceneRun | null> {
  const comfyUrl = bundle.queue?.comfyUi.apiUrl?.trim() || getComfyUiBaseUrl().replace(/\/+$/, '');
  const inventory = (await fetchComfyObjectInfoPayload().catch(() => null))?.models ?? null;
  await loadWardrobeGarmentThumbManifest().catch(() => null);
  const catalog = getClothingSelectOptions(getClothingCatalogFieldCategories('wardrobeCatalog'), {
    gender: bundle.settings.clothingGender,
  });
  const io = serverPictureIo({ comfyUrl, appOrigin });
  // The run's own dressed plates (the page's shared store reaches it through the patches).
  const plates = new Map<string, DayDressPlateEntry>(
    ((state as { dressPlates?: DayDressPlateEntry[] }).dressPlates ?? []).map(plate => [
      plate.key,
      plate,
    ])
  );
  let leaseLost = false;
  const renew = setInterval(() => {
    const claim = claimRunLease(scope, runId, SERVER_RUN_HOLDER);
    if (!claim?.held) leaseLost = true;
  }, LEASE_RENEW_MS);
  renew.unref?.();
  try {
    return await runSceneRunOnServer(bundle, state, {
      comfyUrl,
      appOrigin,
      inventory,
      catalog: catalog as never,
      dressPlateStore: {
        all: () => [...plates.values()],
        find: key => plates.get(key) ?? null,
        save: plate => void plates.set(plate.key, plate),
      },
      jobStatus: promptId => watchedPromptStatus(promptId, { apiUrl: comfyUrl }),
      requeueLost: (promptId, sceneId) => requeueLostJob(promptId, { runId, sceneId }),
      checkTake: async ({ imageUrl, report }) =>
        report
          ? checkServerTake({
              imageUrl,
              report,
              shared: bundle.queue!.shared,
              comfyUrl,
              io,
            })
          : undefined,
      saveState: next =>
        writeRunState(scope, runId, { ...next, dressPlates: [...plates.values()] }),
      appendPatch: (patch: RunPatch) => {
        appendRunPatch(scope, runId, { ...patch, dressPlates: [...plates.values()] });
        // The run's record as the server renders it (what the watcher and the run list read).
        writeSceneRun(scope, patch.run);
      },
      shouldStop: () => entry.stop ?? (leaseLost ? 'Another device took the run over.' : null),
    });
  } catch (error) {
    console.error('[server-run] stopped:', error);
    const run = state.sceneTool.run as SceneRun | undefined;
    if (run) {
      const paused = {
        ...run,
        state: 'paused' as const,
        stopReason: `The server stopped: ${error instanceof Error ? error.message : String(error)}`,
      };
      state.sceneTool = { ...state.sceneTool, run: paused };
      writeRunState(scope, runId, state);
      appendRunPatch(scope, runId, { run: paused });
      writeSceneRun(scope, paused);
    }
    return null;
  } finally {
    clearInterval(renew);
  }
}
