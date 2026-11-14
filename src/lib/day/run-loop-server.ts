/**
 * A Scene run rendered by the server (FINISHING_PLAN Phase 3, step 8): the page's run loop
 * (useSceneRun) on the run's working copy, with the same pure steps — the next Scene
 * (nextRunStep), its take (runServerTake), its landing (the job watcher's status), its filing on
 * the Scene (scenesWithWorking), its checks, the best take kept or the Scene tried again
 * (bestSceneTake, episodeRedosFor), the outcome recorded (withRunOutcome). What changes is sent
 * to the page as patches: the Scene as the server has it, the run's record, the takes' gallery
 * entries with their checks (Scenes stay the page's; it merges them).
 *
 * No duplicates after a restart (the server's or ComfyUI's): the take in flight is in the run's
 * record (`current.promptId`) before anything waits on it, and a run picked up again waits for
 * that job instead of queueing another — the job watcher follows it if ComfyUI queued it again.
 *
 * Stills only for now: no Animate (an episode run's clips stay the page's), no marks repair, no
 * auto-review — a take those did not see is flagged, as the page flags one.
 */
import { comfyOutputViewUrl } from '@/lib/comfyui/job-wait-server';
import type { ComfyPromptStatus } from '@/lib/comfyui/status';
import type { GalleryPlayChecks } from '@/lib/gallery/comfyui-gallery-entry';
import { bestSceneTake, episodeRedosFor } from './episode-run';
import { normalizeDaySlotStills, upsertDaySlotStill } from './planner';
import type { RunBundle } from './run-bundle';
import {
  runServerTake,
  runTakeState,
  type RunTakeState,
  type ServerTakeDeps,
  type ServerTakeReport,
} from './run-take-server';
import {
  nextRunStep,
  pausedNotQueued,
  runTakesTaken,
  withRunLog,
  withRunOutcome,
  withRunRedo,
  type SceneRun,
} from './scene-run';
import {
  SCENE_TAKE_NOTE_MAX,
  keepSceneTake,
  scenesWithWorking,
  sceneSlotOf,
  setSceneTakeNotes,
  upsertScene,
  type SavedScene,
} from './scenes';

/** A take's gallery entry as the page registers it, and its checks. */
export type RunPatchTake = {
  promptId: string;
  sceneId: string;
  status: 'completed' | 'error';
  imageUrl?: string;
  prompt?: string;
  model?: string;
  comfyUrl?: string;
  playChecks?: GalleryPlayChecks;
};

/** What the page applies from a server run (in order): the Scene, the run, the takes. */
export type RunPatch = {
  run: SceneRun;
  scene?: SavedScene;
  takes?: RunPatchTake[];
  /** The script's stand-ins and rooms, when a take made one. */
  scriptPartners?: unknown;
  scriptRooms?: unknown;
};

/** The server's state of a run: its working copy and the checks of its takes. */
export type ServerRunState = RunTakeState & { checks: Record<string, GalleryPlayChecks> };

export type ServerRunDeps = ServerTakeDeps & {
  /** A take that landed, checked: face, outfit, marks (run-checks-server.ts). */
  checkTake: (input: {
    promptId: string;
    imageUrl: string;
    sceneId: string;
    /** What the take decided (none for a take picked up after a restart: it goes unchecked). */
    report?: ServerTakeReport;
    state: ServerRunState;
    bundle: RunBundle;
  }) => Promise<GalleryPlayChecks | undefined>;
  /** Where the run's state and patches are kept (sqlite/scene-run-patches.ts). */
  saveState: (state: ServerRunState) => void;
  appendPatch: (patch: RunPatch) => void;
  /** The job's status (the watcher's: a job queued again or forgotten is followed). */
  jobStatus: (promptId: string) => Promise<ComfyPromptStatus>;
  /** Stop asked (Pause on the page, the lease lost): the run stops before its next step. */
  shouldStop?: () => string | null;
  now?: () => number;
  /** How long a take may render, and how often it is asked about. */
  renderTimeoutMs?: number;
  pollMs?: number;
};

const RENDER_TIMEOUT_MS = 20 * 60_000;

/** The stop reason that ends the run (Cancel) rather than pausing it. */
export const SERVER_RUN_CANCELLED = 'Cancelled';
const stoppedState = (why: string) => (why === SERVER_RUN_CANCELLED ? 'cancelled' : 'paused');

export function serverRunState(bundle: RunBundle, saved?: unknown): ServerRunState | null {
  const restored = saved as Partial<ServerRunState> | null | undefined;
  if (restored?.sceneTool && Array.isArray(restored.patches)) {
    return {
      sceneTool: restored.sceneTool,
      patches: [],
      checks: restored.checks ?? {},
    } as ServerRunState;
  }
  if (!bundle.page) return null;
  return { ...runTakeState(bundle.page), checks: {} };
}

/** Render a run's Scenes until it is done, paused or stopped; its last record. */
export async function runSceneRunOnServer(
  bundle: RunBundle,
  state: ServerRunState,
  deps: ServerRunDeps
): Promise<SceneRun | null> {
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(done => setTimeout(done, ms)));
  const runOf = () => state.sceneTool.run as SceneRun | undefined;
  const setRun = (run: SceneRun) => {
    state.sceneTool = { ...state.sceneTool, run };
  };
  const sceneOf = (sceneId: string) => state.sceneTool.scenes?.find(scene => scene.id === sceneId);
  const emit = (extra: Omit<RunPatch, 'run'> = {}) => {
    const run = runOf();
    if (!run) return;
    // Stand-ins and rooms the take made ride along with what it changed.
    const made = state.patches.reduce<Record<string, unknown>>((out, patch) => {
      if ('scriptPartners' in patch) out.scriptPartners = patch.scriptPartners;
      if ('scriptRooms' in patch) out.scriptRooms = patch.scriptRooms;
      return out;
    }, {});
    state.patches = [];
    deps.appendPatch({ run, ...made, ...extra });
    deps.saveState(state);
  };
  const save = () => deps.saveState(state);

  let run = runOf();
  if (!run) return null;
  if (run.state !== 'running') {
    run = withRunLog(
      { ...run, state: 'running', startedAt: run.startedAt ?? now() },
      { at: now(), event: 'resumed', detail: 'on the server' }
    );
    setRun(run);
    emit();
  }

  for (;;) {
    const stop = deps.shouldStop?.();
    if (stop) {
      const latest = runOf()!;
      setRun(
        withRunLog(
          {
            ...latest,
            state: stoppedState(stop),
            ...(stop === SERVER_RUN_CANCELLED ? {} : { stopReason: stop }),
          },
          {
            at: now(),
            event: stoppedState(stop) === 'cancelled' ? 'cancelled' : 'paused',
            detail: stop,
          }
        )
      );
      emit();
      return runOf()!;
    }
    const latest = runOf()!;
    const step = nextRunStep(latest, state.sceneTool.scenes ?? [], now());
    if (step.kind === 'done') {
      const { current: _current, ...rest } = latest;
      setRun(
        withRunLog(
          { ...rest, state: 'done' },
          { at: now(), event: 'done', detail: step.reason ?? 'finished' }
        )
      );
      emit();
      return runOf()!;
    }
    const sceneId = step.sceneId;
    const scene = sceneOf(sceneId);
    if (!scene) {
      setRun(withRunOutcome(latest, sceneId, 'skipped', 'the Scene is gone', now()));
      emit();
      continue;
    }

    // Its take: the one in flight (picked up after a restart) — never a second.
    let promptId = latest.current?.sceneId === sceneId ? latest.current.promptId : undefined;
    let report: ServerTakeReport | undefined;
    if (!promptId) {
      setRun({ ...latest, current: { sceneId, at: now() } });
      save();
      const before = activeStill(state)?.promptId;
      const result = await runServerTake(bundle, state, sceneId, deps);
      report = result.report;
      const still = activeStill(state);
      const queued =
        still?.promptId && still.promptId !== before && still.status !== 'error'
          ? still.promptId
          : undefined;
      if (!queued) {
        setRun(pausedNotQueued(runOf()!, sceneId, scene.name, result.error));
        emit({ scene: sceneOf(sceneId) });
        return runOf()!;
      }
      promptId = queued;
      setRun(
        withRunLog(
          { ...runOf()!, current: { sceneId, promptId, at: now() } },
          { at: now(), sceneId, event: 'queued', detail: promptId }
        )
      );
      emit({ scene: sceneOf(sceneId) });
    }

    // Wait for it to land (the watcher follows a job ComfyUI queued again).
    const landed = await waitForJob(promptId, deps, sleep, now);
    if (landed === 'stopped') {
      // Paused with the take still in flight: picked up again, the run waits for it.
      const why = deps.shouldStop?.() ?? 'stopped';
      setRun({
        ...runOf()!,
        state: stoppedState(why),
        ...(why === SERVER_RUN_CANCELLED ? {} : { stopReason: why }),
      });
      emit({ scene: sceneOf(sceneId) });
      return runOf()!;
    }
    const imageUrl = landed.status === 'completed' ? comfyOutputViewUrl(landed) : null;
    if (!imageUrl) {
      const why = landed.statusMessage?.trim() || landed.status || 'it timed out';
      markStill(state, promptId, { status: 'error' });
      setRun({
        ...withRunOutcome(runOf()!, sceneId, 'failed', `${scene.name}: ${why}`, now()),
        state: 'paused',
        stopReason: `${scene.name}’s take failed (${why}) — the run stopped there.`,
      });
      emit({
        scene: sceneOf(sceneId),
        takes: [{ promptId, sceneId, status: 'error', comfyUrl: deps.comfyUrl }],
      });
      return runOf()!;
    }

    // Landed: on the card, filed on its Scene, checked.
    markStill(state, promptId, { status: 'completed', imageUrl });
    const filed = scenesWithWorking(state.sceneTool, now());
    if (filed) state.sceneTool = { ...state.sceneTool, scenes: filed };
    const checks = await deps
      .checkTake({ promptId, imageUrl, sceneId, ...(report ? { report } : {}), state, bundle })
      .catch(() => undefined);
    if (checks) state.checks[promptId] = { ...(state.checks[promptId] ?? {}), ...checks };
    const take: RunPatchTake = {
      promptId,
      sceneId,
      status: 'completed',
      imageUrl,
      comfyUrl: deps.comfyUrl,
      ...(report?.prompt ? { prompt: report.prompt } : {}),
      ...(bundle.queue?.shared.model ? { model: bundle.queue.shared.model } : {}),
      ...(state.checks[promptId] ? { playChecks: state.checks[promptId] } : {}),
    };

    const now0 = runOf()!;
    if (!now0.auto?.keep) {
      setRun(withRunOutcome(now0, sceneId, 'landed', `${scene.name}: a take landed`, now()));
      emit({ scene: sceneOf(sceneId), takes: [take] });
      continue;
    }

    // An episode run: keep the best take, or try again.
    const filedScene = sceneOf(sceneId)!;
    const pick = bestSceneTake(filedScene, id => state.checks[id]);
    const tries = (now0.attempts?.[sceneId] ?? 0) + 1;
    const failing = !pick || pick.misses.length > 0;
    if (
      failing &&
      tries <= episodeRedosFor(now0.auto.redo, pick) &&
      runTakesTaken(now0) + 1 < now0.maxTakes
    ) {
      const why = pick ? pick.misses.join(', ') : 'no take to keep';
      setRun(withRunRedo(now0, sceneId, `${scene.name}: ${why} — rendering it again`, now()));
      emit({ scene: filedScene, takes: [take] });
      continue;
    }
    if (!pick) {
      setRun(withRunOutcome(now0, sceneId, 'failed', `${scene.name}: no take to keep`, now()));
      emit({ scene: filedScene, takes: [take] });
      continue;
    }
    let kept = keepSceneTake(filedScene, pick.take.id, now());
    if (kept.keptTakeId !== pick.take.id) kept = filedScene; // keeping it again would let it go
    let next: SceneRun = { ...now0, attempts: { ...(now0.attempts ?? {}), [sceneId]: tries } };
    // No check recorded on the kept take: said, not counted as passed (as the page says it).
    const keptChecks = state.checks[pick.take.promptId ?? pick.take.id];
    const unchecked = filedScene.slot.placeOnly
      ? ''
      : !pick.checked
        ? 'not checked'
        : keptChecks?.poseUnjudged
          ? `pose not judged (${keptChecks.poseUnjudged})`
          : '';
    if (pick.misses.length || unchecked) {
      const why = [...pick.misses, unchecked].filter(Boolean).join(', ');
      kept = setSceneTakeNotes(
        kept,
        pick.take.id,
        { note: `Kept by the run — check it: ${why}`.slice(0, SCENE_TAKE_NOTE_MAX) },
        now()
      );
      next = withRunLog(
        { ...next, flagged: { ...(next.flagged ?? {}), [sceneId]: why } },
        { at: now(), sceneId, event: 'flagged', detail: `${scene.name}: ${why}` }
      );
    } else {
      next = withRunLog(next, {
        at: now(),
        sceneId,
        event: 'kept',
        detail: `${scene.name}: passed its checks`,
      });
    }
    next = withRunOutcome(next, sceneId, 'landed', `${scene.name}: done`, now());
    state.sceneTool = {
      ...state.sceneTool,
      scenes: upsertScene(state.sceneTool.scenes ?? [], kept),
    };
    setRun(next);
    emit({ scene: kept, takes: [take] });
  }
}

function activeStill(state: RunTakeState) {
  const slot = sceneSlotOf(state.sceneTool.slots);
  return normalizeDaySlotStills(state.sceneTool.stills).find(still => still.slotId === slot.id);
}

function markStill(
  state: RunTakeState,
  promptId: string,
  patch: { status: 'completed' | 'error'; imageUrl?: string }
) {
  const still = activeStill(state);
  if (!still || still.promptId !== promptId) return;
  state.sceneTool = {
    ...state.sceneTool,
    stills: upsertDaySlotStill(state.sceneTool.stills, { ...still, ...patch }),
  };
}

async function waitForJob(
  promptId: string,
  deps: ServerRunDeps,
  sleep: (ms: number) => Promise<void>,
  now: () => number
): Promise<ComfyPromptStatus | 'stopped'> {
  const deadline = now() + (deps.renderTimeoutMs ?? RENDER_TIMEOUT_MS);
  let last: ComfyPromptStatus = { promptId, status: 'pending', comfyUrl: deps.comfyUrl };
  for (;;) {
    last = await deps.jobStatus(promptId).catch(() => last);
    if (last.status === 'completed' || last.status === 'error') return last;
    if (now() >= deadline) return { ...last, status: 'error', statusMessage: 'it timed out' };
    if (deps.shouldStop?.()) return 'stopped';
    await sleep(deps.pollMs ?? 3_000);
  }
}
