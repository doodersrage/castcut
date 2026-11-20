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
import { markJobLanded, markJobSeen } from '@/lib/sqlite/run-watch-jobs';
import { writeSceneRun } from '@/lib/sqlite/scene-runs';
import { getClothingSelectOptions } from '@/lib/wardrobe/clothing-catalog';
import { getClothingCatalogFieldCategories } from '@/lib/wardrobe/clothing-catalog-fields';
import { loadWardrobeGarmentThumbManifest } from '@/lib/wardrobe/garment-thumbs';
import type { DayDressPlateEntry } from './dress-plate-cache';
import { normalizeRunBundle, type RunBundle } from './run-bundle';
import { checkServerTake, roomReferenceFor } from './run-checks-server';
import { runPartnerFaceFinishInComfy } from '@/lib/face/finish-server';
import { faceSimilarityFromDistance } from '@/lib/face/match';
import { comfyInputViewUrl } from '@/lib/face/match-client';
import { comfyOutputViewUrl } from '@/lib/comfyui/job-wait-server';
import { decideAdultGate, decideBackdropGate } from '@/lib/adult/adult-appearance-gate';
import { judgeStillBackdrop } from '@/lib/checks/still-backdrop';
import { measureStillBackdropBytes } from '@/lib/checks/still-backdrop-server';
import { askAdultAppearanceVision } from '@/lib/adult/adult-appearance-gate-server';
import { parseLlmRequestOptions, sharedLlmRequestBody } from '@/lib/llm/request-options';
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
      // Kept for the job watcher: what it re-queues needs the job on its list; a landed job's
      // status answers for it once ComfyUI forgets it.
      onJob: (event, promptId, sceneId, status) =>
        event === 'queued'
          ? markJobSeen(promptId, { runId, sceneId, comfyUrl })
          : markJobLanded(promptId, status),
      // The adult-appearance gate on adult-mood takes, as the page asks it (useDayAdultGate).
      adultGate: async ({ imageUrl, clothed, strongTake, coveredTake, backdropTake, place }) => {
        const blob = await io.loadBlob([imageUrl]);
        const bytes = Buffer.from(await blob.arrayBuffer());
        // No scene (the plate handed back, a white void): pixels first, no vision call.
        const noScene = decideBackdropGate(
          judgeStillBackdrop(await measureStillBackdropBytes(bytes), { place }),
          backdropTake === true
        );
        if (noScene) return noScene;
        const vision = await askAdultAppearanceVision({
          imageDataUrl: `data:${blob.type || 'image/png'};base64,${bytes.toString('base64')}`,
          llm: parseLlmRequestOptions(sharedLlmRequestBody(bundle.queue!.shared)),
          clothed,
        });
        return decideAdultGate({
          visionAvailable: vision.available,
          reply: vision.reply,
          strongTake,
          clothed,
          coveredTake,
        });
      },
      // A two-person take: the partner's face finished against the crop they were sent.
      finishPartner: async ({ imageUrl, report }) => {
        const sent = report.partnerFace;
        const plate = report.plate;
        const leadFaceUrl = plate?.imageUrl?.includes('/api/comfyui/view?')
          ? plate.imageUrl
          : comfyInputViewUrl(plate?.filename);
        const partnerFaceUrl = comfyInputViewUrl(sent?.filename);
        if (!sent || !leadFaceUrl || !partnerFaceUrl) return null;
        const result = await runPartnerFaceFinishInComfy({
          imageUrl,
          leadFaceUrl,
          partnerFaceUrl,
          noun: sent.noun,
          comfyUrl,
        });
        if (result.finished) {
          return {
            imageUrl: comfyOutputViewUrl({ images: [result.image], comfyUrl }) ?? imageUrl,
            similarity: faceSimilarityFromDistance(result.after, 'cosine'),
            note: `the partner's face finished (${result.before.toFixed(2)} → ${result.after.toFixed(2)} from their face)`,
          };
        }
        return {
          ...(result.before !== undefined
            ? { similarity: faceSimilarityFromDistance(result.before, 'cosine') }
            : {}),
          note: `the partner's face left as it landed — ${result.reason}`,
        };
      },
      checkTake: async ({ imageUrl, report, sceneId, state: now }) =>
        report
          ? checkServerTake({
              imageUrl,
              report,
              // The scene's room photo or first kept shot: the same-room check (advisory).
              roomReferenceUrl: roomReferenceFor(now.sceneTool, sceneId),
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
