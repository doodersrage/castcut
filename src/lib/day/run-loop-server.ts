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
import { COMFY_PROMPT_LOST_MESSAGE, type ComfyPromptStatus } from '@/lib/comfyui/status';
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
import { runTierEngine } from './run-tier';
import { resolveRenderingTakes, type SceneToolCache } from './scenes';
import {
  ADULT_GATE_WITHHELD_MESSAGE,
  CLOTHED_GATE_WITHHELD_MESSAGE,
  dayMoodNeedsAdultSafeguards,
  type AdultGateDecision,
} from '../adult/adult-appearance-gate';
import type { GalleryAdultCheck } from '../gallery/adult-check';
import { dayMoodMustStayClothed } from '../wardrobe/clothed-coverage';
import { dayPlayedMood } from './still-prompt';

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
  /** The adult-appearance gate's verdict on an adult-mood take (withheld: hidden for good). */
  adultCheck?: Omit<GalleryAdultCheck, 'at'>;
};

/** What the page applies from a server run (in order): the Scene, the run, the takes. */
/** What the partner's face finish did: the finished picture (when kept), their score, a note. */
export type PartnerFinishOutcome = {
  imageUrl?: string;
  /** 0–1, as the lead's face score. */
  similarity?: number;
  note?: string;
} | null;

export type RunPatch = {
  run: SceneRun;
  scene?: SavedScene;
  takes?: RunPatchTake[];
  /** The script's stand-ins and rooms, when a take made one. */
  scriptPartners?: unknown;
  scriptRooms?: unknown;
};

/** The server's state of a run: its working copy and the checks of its takes. */
export type ServerRunState = RunTakeState & {
  checks: Record<string, GalleryPlayChecks>;
  /**
   * Scenes being rendered again because the adult-appearance gate withheld their take: what the
   * one redo is for (the stronger age line, or the coverage line on a clothed-mood still).
   */
  gateRedo?: Record<string, 'age' | 'bare'>;
};

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
  /**
   * The partner's face on a two-person take, finished against the crop they were sent
   * (partner-finish-server.ts). Unset: the take is left as it landed.
   */
  finishPartner?: (input: {
    imageUrl: string;
    report: ServerTakeReport;
  }) => Promise<PartnerFinishOutcome>;
  /**
   * The adult-appearance gate (adult-appearance-gate.ts) on an adult-mood take, as the page runs
   * it (useDayAdultGate). Unset: no vision model here — allowed unchecked, as on the page.
   */
  adultGate?: (input: {
    imageUrl: string;
    clothed: boolean;
    strongTake: boolean;
    coveredTake: boolean;
  }) => Promise<AdultGateDecision>;
  /** Where the run's state and patches are kept (sqlite/scene-run-patches.ts). */
  saveState: (state: ServerRunState) => void;
  appendPatch: (patch: RunPatch) => void;
  /** The job's status (the watcher's: a job queued again or forgotten is followed). */
  jobStatus: (promptId: string) => Promise<ComfyPromptStatus>;
  /**
   * A job ComfyUI lost (it restarted, its queue was cleared), queued again once from the graph
   * it was sent (the job watcher's requeueLostJob): its new id, or null. The run keeps waiting
   * on the first id (the watcher's status follows it).
   */
  requeueLost?: (promptId: string, sceneId: string) => Promise<string | null>;
  /** A take's job queued, and landed: kept for the job watcher (it follows and re-queues it). */
  onJob?: (
    event: 'queued' | 'landed',
    promptId: string,
    sceneId: string,
    status?: ComfyPromptStatus
  ) => void;
  /** Stop asked (Pause on the page, the lease lost): the run stops before its next step. */
  shouldStop?: () => string | null;
  now?: () => number;
  /** How long between tries to queue a lost take again (ComfyUI still starting). */
  lostRetryMs?: number;
  /** How long before a take that wasn't queued is tried again (ComfyUI restarting). */
  notQueuedRetryMs?: number;
  /** How long a take may render, and how often it is asked about. */
  renderTimeoutMs?: number;
  pollMs?: number;
  /** How long ComfyUI may not answer at all, a take in flight, before the run pauses. */
  unresponsiveMs?: number;
};

const RENDER_TIMEOUT_MS = 20 * 60_000;
/**
 * ComfyUI not answering at all (every status call timing out) this long, a take of the run's in
 * flight: it has hung — the run pauses and says so, instead of waiting out the render timeout
 * (2026-11-19: frozen mid-preview, its HTTP queue full, 0% CPU). A healthy ComfyUI went at most
 * 24 s without answering over s25's 75 min (loading models).
 */
export const COMFY_UNRESPONSIVE_MS = 3 * 60_000;

/** Why a run paused on a hung ComfyUI (its take stays in flight; Resume waits for it again). */
export function comfyUnresponsiveReason(minutes: number): string {
  return `ComfyUI stopped answering (${minutes} min) — restart it, then Resume: the take in flight is queued again.`;
}
/** Tries to queue a lost take again before it is called failed. */
const LOST_REQUEUE_TRIES = 6;

/** The stop reason that ends the run (Cancel) rather than pausing it. */
/** The Scene without this job's take (the adult check withheld it). */
function withoutSceneTake(tool: SceneToolCache, sceneId: string, promptId: string): SceneToolCache {
  const scenes = tool.scenes?.map(scene => {
    if (scene.id !== sceneId) return scene;
    const takes = scene.takes.filter(take => (take.promptId ?? take.id) !== promptId);
    // Removed for good: the card's still (and its earlier take) would file it again otherwise.
    const removedTakeIds = [...new Set([...(scene.removedTakeIds ?? []), promptId])];
    const kept = takes.some(take => take.id === scene.keptTakeId);
    const { keptTakeId: _gone, ...rest } = scene;
    return kept ? { ...scene, takes, removedTakeIds } : { ...rest, takes, removedTakeIds };
  });
  return scenes ? { ...tool, scenes } : tool;
}

/** The Scene's take of this job marked a preview (run-tier.ts). */
function markPreviewTake(tool: SceneToolCache, sceneId: string, promptId: string): SceneToolCache {
  const scenes = tool.scenes?.map(scene =>
    scene.id !== sceneId
      ? scene
      : {
          ...scene,
          takes: scene.takes.map(take =>
            (take.promptId ?? take.id) === promptId ? { ...take, tier: 'preview' as const } : take
          ),
        }
  );
  return scenes ? { ...tool, scenes } : tool;
}

export const SERVER_RUN_CANCELLED = 'Cancelled';
const stoppedState = (why: string) => (why === SERVER_RUN_CANCELLED ? 'cancelled' : 'paused');

export function serverRunState(bundle: RunBundle, saved?: unknown): ServerRunState | null {
  const restored = saved as Partial<ServerRunState> | null | undefined;
  if (restored?.sceneTool && Array.isArray(restored.patches)) {
    return {
      sceneTool: restored.sceneTool,
      patches: [],
      checks: restored.checks ?? {},
      ...(restored.gateRedo ? { gateRedo: restored.gateRedo } : {}),
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

  /**
   * A Preview's next take, queued while `currentScene`'s renders: recorded as the run's `ahead`
   * before it is sent and with its job once queued. Not queued (ComfyUI said no): dropped — the
   * loop queues that Scene in turn.
   */
  /**
   * What each take queued ahead was rendered from (its prompt, settings, references), by job: the
   * checks need it once it becomes the current take. Without it every Final take queued ahead went
   * unchecked (s26, 2026-11-19: 42 of 43 "not checked"). Lost on a restart, as a take picked up
   * mid-render always was.
   */
  const aheadReports = new Map<string, ServerTakeReport>();
  const queueAhead = async (currentScene: string) => {
    const now0 = runOf()!;
    // The next Scene as if the one in flight were done.
    const step = nextRunStep(
      {
        ...now0,
        current: undefined,
        outcomes: { ...(now0.outcomes ?? {}), [currentScene]: 'landed' },
      },
      state.sceneTool.scenes ?? [],
      now()
    );
    if (step.kind !== 'scene' || step.sceneId === currentScene) return;
    const nextId = step.sceneId;
    setRun({ ...now0, ahead: { sceneId: nextId, at: now() } });
    save();
    const before = activeStill(state)?.promptId;
    const gateRedo = state.gateRedo?.[nextId];
    const result = await runServerTake(bundle, state, nextId, deps, {
      ...(gateRedo === 'bare' ? { coverageLine: true } : {}),
      ...(gateRedo === 'age' ? { strongAgeLine: true } : {}),
    }).catch(() => ({ error: 'not queued' }) as Awaited<ReturnType<typeof runServerTake>>);
    const still = activeStill(state);
    const queued =
      still?.promptId && still.promptId !== before && still.status !== 'error'
        ? still.promptId
        : undefined;
    const { ahead: _tried, ...rest } = runOf()!;
    if (!queued || result.error) {
      setRun(rest);
      save();
      return;
    }
    deps.onJob?.('queued', queued, nextId);
    if (result.report) aheadReports.set(queued, result.report);
    setRun(
      withRunLog(
        { ...rest, ahead: { sceneId: nextId, promptId: queued, at: now() } },
        { at: now(), sceneId: nextId, event: 'queued', detail: queued }
      )
    );
    emit({ scene: sceneOf(nextId) });
  };

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
    // A Preview's take queued ahead: next in line once the one before it settled (its job is
    // known — a restart waits for it too; one never queued is dropped and queued in turn).
    const promoted = runOf()!;
    if (!promoted.current && promoted.ahead) {
      const { ahead, ...rest } = promoted;
      setRun(ahead.promptId ? { ...rest, current: ahead } : rest);
    }
    const latest = runOf()!;
    const step = nextRunStep(latest, state.sceneTool.scenes ?? [], now());
    if (step.kind === 'done') {
      const { current: _current, ahead: _ahead, ...rest } = latest;
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
    // A take queued ahead keeps what it was rendered from; one picked up after a restart has none.
    let report: ServerTakeReport | undefined = promptId ? aheadReports.get(promptId) : undefined;
    if (promptId) aheadReports.delete(promptId);
    if (!promptId) {
      setRun({ ...latest, current: { sceneId, at: now() } });
      save();
      const before = activeStill(state)?.promptId;
      // A take the adult check withheld is redone once with the line it needs (as on the page).
      const gateRedo = state.gateRedo?.[sceneId];
      const result = await runServerTake(bundle, state, sceneId, deps, {
        ...(gateRedo === 'bare' ? { coverageLine: true } : {}),
        ...(gateRedo === 'age' ? { strongAgeLine: true } : {}),
      });
      report = result.report;
      const still = activeStill(state);
      const queued =
        still?.promptId && still.promptId !== before && still.status !== 'error'
          ? still.promptId
          : undefined;
      if (!queued) {
        const paused = pausedNotQueued(runOf()!, sceneId, scene.name, result.error, now());
        setRun(paused);
        emit({ scene: sceneOf(sceneId) });
        // ComfyUI restarting, say: on the server nobody presses Resume — it tries again in a
        // while, as many times as pausedNotQueued allows (then the Scene is failed, or it stops).
        if (paused.state !== 'paused' || deps.shouldStop?.()) {
          if (paused.state === 'paused') return runOf()!;
          continue;
        }
        await sleep(deps.notQueuedRetryMs ?? 30_000);
        if (deps.shouldStop?.()) return runOf()!;
        const { stopReason: _why, ...rest } = runOf()!;
        setRun({ ...rest, state: 'running' });
        continue;
      }
      promptId = queued;
      deps.onJob?.('queued', promptId, sceneId);
      setRun(
        withRunLog(
          { ...runOf()!, current: { sceneId, promptId, at: now() } },
          { at: now(), sceneId, event: 'queued', detail: promptId }
        )
      );
      emit({ scene: sceneOf(sceneId) });
    }

    // The next Scene's take queued now, so ComfyUI goes straight on to it (run-tier.ts): a
    // Preview's draft, and a Final's too — its checks then run while the next one renders (s25,
    // 2026-11-19: ComfyUI sat idle 16 s a Scene, 11.8 of 75 min, while each take was checked).
    if (!runOf()!.ahead) await queueAhead(sceneId);

    // Wait for it to land (the watcher follows a job ComfyUI queued again).
    const landed = await waitForJob(promptId, sceneId, deps, sleep, now, requeued => {
      setRun(
        withRunLog(runOf()!, {
          at: now(),
          sceneId,
          event: 'resumed',
          detail: `ComfyUI lost ${promptId} — queued it again as ${requeued}`,
        })
      );
      emit();
    });
    if (landed === 'stopped' || landed === 'unresponsive') {
      // Paused with the take still in flight: picked up again, the run waits for it (a ComfyUI
      // restarted since lost it, so it is queued again from its graph).
      const why =
        landed === 'unresponsive'
          ? comfyUnresponsiveReason(
              Math.round((deps.unresponsiveMs ?? COMFY_UNRESPONSIVE_MS) / 60_000)
            )
          : (deps.shouldStop?.() ?? 'stopped');
      setRun({
        ...runOf()!,
        state: stoppedState(why),
        ...(why === SERVER_RUN_CANCELLED ? {} : { stopReason: why }),
      });
      emit({ scene: sceneOf(sceneId) });
      return runOf()!;
    }
    let imageUrl = landed.status === 'completed' ? comfyOutputViewUrl(landed) : null;
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

    // A two-person take: the partner's face finished against the crop they were sent, before the
    // take is filed (its picture is the finished one). A Preview is a draft: left as it is.
    let partnerFace: number | undefined;
    if (deps.finishPartner && report?.partnerFace && runOf()?.tier !== 'preview') {
      const finished = await deps
        .finishPartner({ imageUrl, report })
        .catch((): PartnerFinishOutcome => null);
      if (finished?.imageUrl) imageUrl = finished.imageUrl;
      if (finished?.similarity !== undefined) partnerFace = finished.similarity;
      if (finished?.note) {
        setRun(
          withRunLog(runOf()!, {
            at: now(),
            sceneId,
            event: 'finished',
            detail: `${scene.name}: ${finished.note}`,
          })
        );
      }
    }

    // Landed: on the card, filed on its Scene, checked.
    deps.onJob?.('landed', promptId, sceneId, landed);
    markStill(state, promptId, { status: 'completed', imageUrl });
    const filed = scenesWithWorking(state.sceneTool, now());
    if (filed) state.sceneTool = { ...state.sceneTool, scenes: filed };
    // Its Scene isn't the open one (a Preview's next take opened another): it lands there, as a
    // take handed off lands on its Scene (resolveRenderingTakes).
    if (state.sceneTool.activeSceneId !== sceneId) {
      state.sceneTool = {
        ...state.sceneTool,
        scenes: state.sceneTool.scenes?.map(entry =>
          entry.id === sceneId
            ? resolveRenderingTakes(
                entry.renderingTakeIds?.includes(promptId)
                  ? entry
                  : { ...entry, renderingTakeIds: [...(entry.renderingTakeIds ?? []), promptId] },
                [{ promptId, status: 'completed', imageUrl }],
                now()
              )
            : entry
        ),
      };
    }
    // The adult-appearance gate, before anything else looks at the take (useDayAdultGate's rule):
    // an adult-mood take that doesn't read clearly adult — or, on a clothed mood, shows bare
    // skin — is withheld for good, taken off its Scene, and the Scene rendered once more.
    // The Scene's own mood: what the page plays it as when it opens it.
    const mood = dayPlayedMood(
      sceneOf(sceneId)?.dayMood ?? report?.toolSettings.dayMood,
      bundle.settings.intimateEnabled === true
    );
    let adultCheck: RunPatchTake['adultCheck'];
    // An establishing shot of the empty place has nobody to judge (s20: one was withheld for an
    // unreadable answer about no one).
    if (dayMoodNeedsAdultSafeguards(mood) && !sceneOf(sceneId)?.slot.placeOnly) {
      const redoneFor = state.gateRedo?.[sceneId];
      const decision: AdultGateDecision = deps.adultGate
        ? await deps
            .adultGate({
              imageUrl,
              clothed: dayMoodMustStayClothed(mood),
              strongTake: redoneFor === 'age',
              coveredTake: redoneFor === 'bare',
            })
            .catch(() => ({
              verdict: redoneFor ? ('withhold' as const) : ('requeue' as const),
              reason: 'the adult check could not run',
              cause: 'age' as const,
            }))
        : { verdict: 'unchecked', reason: 'no vision model configured' };
      const marks = {
        ...(redoneFor === 'age' ? { strong: true } : {}),
        ...(redoneFor === 'bare' ? { covered: true } : {}),
      };
      if (decision.verdict === 'pass' || decision.verdict === 'unchecked') {
        adultCheck = {
          state: decision.verdict === 'pass' ? 'passed' : 'unchecked',
          reason: decision.reason,
          ...marks,
        };
        if (state.gateRedo?.[sceneId]) {
          const { [sceneId]: _done, ...rest } = state.gateRedo;
          state.gateRedo = rest;
        }
      } else {
        const cause = decision.cause ?? 'age';
        state.sceneTool = withoutSceneTake(state.sceneTool, sceneId, promptId);
        const withheld: RunPatchTake = {
          promptId,
          sceneId,
          status: 'completed',
          imageUrl,
          comfyUrl: deps.comfyUrl,
          adultCheck: { state: 'withheld', reason: decision.reason, cause, ...marks },
        };
        if (decision.verdict === 'requeue') {
          state.gateRedo = { ...(state.gateRedo ?? {}), [sceneId]: cause };
          setRun(
            withRunRedo(
              runOf()!,
              sceneId,
              `${scene.name}: withheld by the adult check (${decision.reason}) — rendering it again with ${cause === 'bare' ? 'the coverage line' : 'a stronger age line'}`,
              now()
            )
          );
        } else {
          const { [sceneId]: _done, ...rest } = state.gateRedo ?? {};
          state.gateRedo = rest;
          const failedRun = runOf()!;
          setRun(
            withRunOutcome(
              {
                ...failedRun,
                // Its tries counted, as keep-best counts them (one job per try).
                attempts: {
                  ...(failedRun.attempts ?? {}),
                  [sceneId]: (failedRun.attempts?.[sceneId] ?? 0) + 1,
                },
              },
              sceneId,
              'failed',
              `${scene.name}: ${cause === 'bare' ? CLOTHED_GATE_WITHHELD_MESSAGE : ADULT_GATE_WITHHELD_MESSAGE}`,
              now()
            )
          );
        }
        emit({ scene: sceneOf(sceneId), takes: [withheld] });
        continue;
      }
    }

    const tier = runOf()?.tier;
    // A preview (run-tier.ts): marked on its Scene, and not checked — the animatic's draft.
    if (tier === 'preview') state.sceneTool = markPreviewTake(state.sceneTool, sceneId, promptId);
    const checks =
      tier === 'preview'
        ? undefined
        : await deps
            .checkTake({
              promptId,
              imageUrl,
              sceneId,
              ...(report ? { report } : {}),
              state,
              bundle,
            })
            .catch(() => undefined);
    if (checks) state.checks[promptId] = { ...(state.checks[promptId] ?? {}), ...checks };
    if (partnerFace !== undefined) {
      state.checks[promptId] = { ...(state.checks[promptId] ?? { at: now() }), partnerFace };
    }
    const take: RunPatchTake = {
      promptId,
      sceneId,
      status: 'completed',
      imageUrl,
      comfyUrl: deps.comfyUrl,
      ...(report?.prompt ? { prompt: report.prompt } : {}),
      ...((runTierEngine(tier) ?? bundle.queue?.shared.model)
        ? { model: runTierEngine(tier) ?? bundle.queue?.shared.model }
        : {}),
      ...(state.checks[promptId] ? { playChecks: state.checks[promptId] } : {}),
      ...(adultCheck ? { adultCheck } : {}),
    };

    const now0 = runOf()!;
    if (!now0.auto?.keep) {
      // A Scene the adult check had redone: this landed take is its second try.
      const tried = now0.attempts?.[sceneId]
        ? { ...now0, attempts: { ...now0.attempts, [sceneId]: now0.attempts[sceneId]! + 1 } }
        : now0;
      setRun(withRunOutcome(tried, sceneId, 'landed', `${scene.name}: a take landed`, now()));
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
    if (pick.misses.length || pick.advisories.length || unchecked) {
      const why = [...pick.misses, ...pick.advisories, unchecked].filter(Boolean).join(', ');
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

/**
 * How often a take in flight is asked after (the watcher's status, from ComfyUI's history). Every
 * 3 s waited 1.5 s a take on average — a tenth of a 2.1 Turbo preview (s19, 2026-11-14).
 */
const JOB_POLL_MS = 1_000;

async function waitForJob(
  promptId: string,
  sceneId: string,
  deps: ServerRunDeps,
  sleep: (ms: number) => Promise<void>,
  now: () => number,
  onRequeued: (next: string) => void
): Promise<ComfyPromptStatus | 'stopped' | 'unresponsive'> {
  const deadline = now() + (deps.renderTimeoutMs ?? RENDER_TIMEOUT_MS);
  let last: ComfyPromptStatus = { promptId, status: 'pending', comfyUrl: deps.comfyUrl };
  let requeued = false;
  let tries = 0;
  // Since when ComfyUI hasn't answered (a status call that failed or came back unknown).
  let silentSince: number | null = null;
  for (;;) {
    let answered = true;
    last = await deps.jobStatus(promptId).catch(() => {
      answered = false;
      return last;
    });
    if (!answered || last.status === 'unknown') {
      silentSince ??= now();
      if (now() - silentSince >= (deps.unresponsiveMs ?? COMFY_UNRESPONSIVE_MS)) {
        return 'unresponsive';
      }
    } else {
      silentSince = null;
    }
    if (last.status === 'completed') return last;
    if (last.status === 'error') {
      // Lost, not failed: queued again once, and waited for under the same id. ComfyUI may still
      // be starting: a few tries before the take is called failed.
      if (!requeued && last.statusMessage === COMFY_PROMPT_LOST_MESSAGE && deps.requeueLost) {
        const next = await deps.requeueLost(promptId, sceneId).catch(() => null);
        if (next) {
          requeued = true;
          onRequeued(next);
          await sleep(deps.pollMs ?? JOB_POLL_MS);
          continue;
        }
        tries += 1;
        if (tries < LOST_REQUEUE_TRIES && now() < deadline) {
          await sleep(deps.lostRetryMs ?? 10_000);
          continue;
        }
      }
      return last;
    }
    if (now() >= deadline) return { ...last, status: 'error', statusMessage: 'it timed out' };
    if (deps.shouldStop?.()) return 'stopped';
    await sleep(deps.pollMs ?? JOB_POLL_MS);
  }
}
