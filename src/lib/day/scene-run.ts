/**
 * A prepared run of takes on the Scene page (M5 W3 / W4, ROADMAP §8.3): which Scenes it will
 * render, in what order, within what limits — inspected and edited before anything renders, and
 * kept in the Scene settings (`tools.scene.run`) so a reload or restart finds it. W3 prepares
 * it (planned shots become Scenes, the list and its estimate); W4 runs it. A run never keeps a
 * take: choosing stays the player's. Pure.
 */
import { parseScript } from '../script/parse';
import { normalizeEpisodeRunAuto, type EpisodeRunAuto } from './episode-run';
import { SCENE_LIMIT_PER_CAST, scenesForCast, type SavedScene } from './scenes';
import type { SavedScript } from './scene-scripts';
import { shotsForScene, type PlannedShot } from './script-shots';

/** `handed`: every take is in ComfyUI's queue (Queue all, M5 hand-off) and lands on its own. */
export type SceneRunState = 'prepared' | 'running' | 'paused' | 'handed' | 'done' | 'cancelled';

export type SceneRunItem = { sceneId: string; include: boolean };

export type SceneRunOutcome = 'landed' | 'failed' | 'skipped';

export type SceneRunLogEntry = {
  at: number;
  sceneId?: string;
  event:
    | 'prepared'
    | 'queued'
    | 'handed'
    | 'skipped'
    | 'landed'
    | 'failed'
    | 'paused'
    | 'resumed'
    | 'cancelled'
    | 'done'
    | 'redo'
    | 'kept'
    | 'flagged'
    | 'animated';
  detail?: string;
};

export type SceneRun = {
  id: string;
  castId: string;
  /** The script it was prepared from, when it was. */
  scriptId?: string;
  label: string;
  items: SceneRunItem[];
  /** Limits: at most this many takes, and about this many minutes. */
  maxTakes: number;
  maxMinutes: number;
  /** Leave out a Scene that already has a kept take. */
  skipKept: boolean;
  /**
   * Resume by itself after the page reloads (a restart, a crash, a closed tab opened again) — an
   * overnight run goes on without anyone clicking Resume. Autopilot and Make the short set it.
   */
  resumeOnReload?: boolean;
  /**
   * Rendered by the server (FINISHING_PLAN Phase 3, day/run-service-server.ts): the page can be
   * closed; it applies what the server did when it is open. Unset: the page renders it.
   */
  onServer?: boolean;
  state: SceneRunState;
  /** Items done so far (W4). */
  position: number;
  /** What became of each Scene the run has been through (W4). */
  outcomes?: Record<string, SceneRunOutcome>;
  /** The take in flight: its Scene, and its job once queued (a restart waits for it). */
  current?: { sceneId: string; promptId?: string; at: number };
  /** When it was started (the time limit counts from here). */
  startedAt?: number;
  /** Why it stopped, when it stopped short. */
  stopReason?: string;
  /**
   * Queue all (M5 hand-off): the Scenes to queue, fixed at Start by the limits ({@link runQueue}),
   * and the take handed to ComfyUI for each (Scene id → prompt id) — never queued twice; each is
   * settled from the Gallery when it finishes ({@link settleHandedRun}).
   */
  handOff?: { sceneIds: string[]; handed: Record<string, string> };
  /**
   * An episode run (Part 19 G1, episode-run.ts): keep the best take by its checks, try again
   * when it fails them, animate the kept take — one Scene after another, unattended.
   */
  auto?: EpisodeRunAuto;
  /** Takes rendered per Scene so far (an episode run's redos count here). */
  attempts?: Record<string, number>;
  /** Scenes kept with a take that still failed its checks: what it missed (for review). */
  flagged?: Record<string, string>;
  log: SceneRunLogEntry[];
  createdAt: number;
  updatedAt: number;
};

export const RUN_DEFAULT_MAX_TAKES = 8;
export const RUN_DEFAULT_MAX_MINUTES = 30;
/**
 * Scenes in one run: a half-hour episode's shots (Part 19 G1; it was 60, then 400 — the
 * 2026-11-06 episode's 40 scenes drafted 483 shots, and the last 83 would have been left out).
 */
export const RUN_MAX_ITEMS = 600;
/** Takes one run may render: every Scene, and its redos. */
export const RUN_MAX_TAKES = RUN_MAX_ITEMS * 4;
export const RUN_LOG_MAX = 200;

/**
 * A script's planned shots that aren't Scenes yet, in script order, and how many fit under the
 * Cast's Scene limit (new empty Scenes past it would prune others): the rest wait.
 */
export function shotsToPrepare(
  script: SavedScript,
  scenes: readonly SavedScene[],
  /** Only this script scene's shots (a run for one scene). */
  onlySceneId?: string
): { fit: PlannedShot[]; overLimit: number } {
  const parsed = parseScript(script.source);
  const existing = new Set(scenes.map(scene => scene.id));
  const pending = parsed.scenes
    .filter(scene => !onlySceneId || scene.id === onlySceneId)
    .flatMap(scene =>
      shotsForScene(script.shots, scene.id).filter(
        shot => !shot.madeSceneId || !existing.has(shot.madeSceneId)
      )
    );
  // Script Scenes are never pruned and don't count toward the Cast's Scene limit (scenes.ts), so
  // a run's worth fits — an episode's (Part 19 G1).
  void scenesForCast;
  void SCENE_LIMIT_PER_CAST;
  const room = RUN_MAX_ITEMS;
  return { fit: pending.slice(0, room), overLimit: Math.max(0, pending.length - room) };
}

/**
 * How a script's run is going, for a page other than Scene (Short's line under its short): the
 * Scenes it has done of those in it, and its state — or null when the run isn't that script's.
 */
export function scriptRunProgress(
  run: SceneRun | null | undefined,
  scriptId: string
): { state: SceneRunState; done: number; of: number; flagged: number; failed: number } | null {
  if (!run || run.scriptId !== scriptId) return null;
  const included = run.items.filter(item => item.include);
  const outcomes = run.outcomes ?? {};
  return {
    state: run.state,
    done: included.filter(item => outcomes[item.sceneId]).length,
    of: included.length,
    flagged: Object.keys(run.flagged ?? {}).length,
    // "Done" with a shot missing says so (2026-11-12, s11: the run ended "done" without its first).
    failed: included.filter(item => outcomes[item.sceneId] === 'failed').length,
  };
}

/**
 * What to say when a run that was running stops: done (how many, how many to check) or stopped
 * by itself (why). Null for anything else — a pause you clicked, a run that wasn't running.
 */
export function runEndNotice(
  before: SceneRunState | null,
  run: SceneRun | null | undefined
): { text: string; done: boolean } | null {
  if (before !== 'running' || !run || (run.state !== 'done' && run.state !== 'paused')) return null;
  if (run.state === 'paused' && run.log[run.log.length - 1]?.detail === 'by you') return null;
  const outcomes = Object.values(run.outcomes ?? {});
  const done = outcomes.length;
  const failed = outcomes.filter(outcome => outcome === 'failed').length;
  const flagged = Object.keys(run.flagged ?? {}).length;
  return run.state === 'done'
    ? {
        done: true,
        // A failed Scene is not one done: "4 of 5 Scenes, 1 failed" (2026-11-12).
        text: `“${run.label}” is done — ${failed ? `${done - failed} of ${done}` : done} Scene${done === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}${flagged ? `, ${flagged} to check` : ''}.`,
      }
    : { done: false, text: `“${run.label}” stopped: ${run.stopReason ?? 'paused'}` };
}

/** A new run over a script's Scenes (script order); kept Scenes left out when `skipKept`. */
export function runFromScript(input: {
  script: SavedScript;
  scenes: readonly SavedScene[];
  skipKept?: boolean;
  now?: number;
  id?: string;
  /** Only this script scene's Scenes (a run for one scene). */
  onlySceneId?: string;
}): SceneRun {
  const now = input.now ?? Date.now();
  const skipKept = input.skipKept !== false;
  const byId = new Map(input.scenes.map(scene => [scene.id, scene]));
  const parsed = parseScript(input.script.source);
  const seen = new Set<string>();
  const items: SceneRunItem[] = [];
  const picked = parsed.scenes.filter(
    scene => !input.onlySceneId || scene.id === input.onlySceneId
  );
  const one = input.onlySceneId ? picked[0] : undefined;
  const label = one ? `${input.script.name} — ${one.heading || 'one scene'}` : input.script.name;
  for (const scene of picked) {
    for (const shot of shotsForScene(input.script.shots, scene.id)) {
      const made = shot.madeSceneId ? byId.get(shot.madeSceneId) : undefined;
      if (!made || seen.has(made.id)) continue;
      seen.add(made.id);
      items.push({ sceneId: made.id, include: !(skipKept && made.keptTakeId) });
    }
  }
  return {
    id: input.id ?? `run-${now.toString(36)}`,
    castId: input.script.castId,
    scriptId: input.script.id,
    label,
    items: items.slice(0, RUN_MAX_ITEMS),
    maxTakes: RUN_DEFAULT_MAX_TAKES,
    maxMinutes: RUN_DEFAULT_MAX_MINUTES,
    skipKept,
    state: 'prepared',
    position: 0,
    log: [{ at: now, event: 'prepared', detail: `${items.length} Scenes from “${label}”` }],
    createdAt: now,
    updatedAt: now,
  };
}

export type RunQueueEntry = {
  sceneId: string;
  name: string;
  engine: string;
  estimateSec: number;
  /** Seconds from the run's start to this take landing. */
  endsAtSec: number;
};

/**
 * What the run will queue: included Scenes (still there, and not kept when `skipKept`) in order,
 * each with an estimate, up to the limits; `left` is what the limits leave out, `gone` what no
 * longer exists.
 */
export function runQueue(
  run: SceneRun,
  scenes: readonly SavedScene[],
  typicalSec: number
): { queued: RunQueueEntry[]; left: RunQueueEntry[]; gone: string[]; totalSec: number } {
  const byId = new Map(scenes.map(scene => [scene.id, scene]));
  const queued: RunQueueEntry[] = [];
  const left: RunQueueEntry[] = [];
  const gone: string[] = [];
  let at = 0;
  for (const item of run.items) {
    if (!item.include) continue;
    const scene = byId.get(item.sceneId);
    if (!scene) {
      gone.push(item.sceneId);
      continue;
    }
    if (run.skipKept && scene.keptTakeId) continue;
    const estimateSec = Math.max(5, Math.round(typicalSec));
    const entry: RunQueueEntry = {
      sceneId: scene.id,
      name: scene.name,
      engine: scene.slot.engine ?? 'Day’s engine',
      estimateSec,
      endsAtSec: at + estimateSec,
    };
    if (queued.length < run.maxTakes && entry.endsAtSec <= run.maxMinutes * 60) {
      queued.push(entry);
      at = entry.endsAtSec;
    } else {
      left.push(entry);
    }
  }
  return { queued, left, gone, totalSec: at };
}

export function normalizeSceneRun(raw: unknown): SceneRun | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const run = raw as Partial<SceneRun>;
  if (typeof run.id !== 'string' || typeof run.castId !== 'string' || !Array.isArray(run.items)) {
    return undefined;
  }
  const states: SceneRunState[] = ['prepared', 'running', 'paused', 'handed', 'done', 'cancelled'];
  const items = run.items
    .filter(
      (item): item is SceneRunItem =>
        Boolean(item) && typeof (item as SceneRunItem).sceneId === 'string'
    )
    .slice(0, RUN_MAX_ITEMS)
    .map(item => ({ sceneId: item.sceneId, include: item.include !== false }));
  const whole = (value: unknown, min: number, max: number, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.min(max, Math.max(min, Math.round(value)))
      : fallback;
  return {
    id: run.id,
    castId: run.castId,
    ...(typeof run.scriptId === 'string' ? { scriptId: run.scriptId } : {}),
    label: typeof run.label === 'string' ? run.label.slice(0, 80) : 'Run',
    items,
    maxTakes: whole(run.maxTakes, 1, RUN_MAX_TAKES, RUN_DEFAULT_MAX_TAKES),
    maxMinutes: whole(run.maxMinutes, 1, 24 * 60, RUN_DEFAULT_MAX_MINUTES),
    skipKept: run.skipKept !== false,
    ...(run.resumeOnReload === true ? { resumeOnReload: true } : {}),
    ...(run.onServer === true ? { onServer: true } : {}),
    state: states.includes(run.state as SceneRunState) ? (run.state as SceneRunState) : 'prepared',
    position: whole(run.position, 0, RUN_MAX_ITEMS, 0),
    ...(run.outcomes && typeof run.outcomes === 'object'
      ? {
          outcomes: Object.fromEntries(
            Object.entries(run.outcomes).filter(([, value]) =>
              ['landed', 'failed', 'skipped'].includes(value as string)
            )
          ) as Record<string, SceneRunOutcome>,
        }
      : {}),
    ...(run.current && typeof run.current.sceneId === 'string'
      ? {
          current: {
            sceneId: run.current.sceneId,
            ...(typeof run.current.promptId === 'string' ? { promptId: run.current.promptId } : {}),
            at: whole(run.current.at, 0, Number.MAX_SAFE_INTEGER, 0),
          },
        }
      : {}),
    ...(typeof run.startedAt === 'number' ? { startedAt: run.startedAt } : {}),
    ...handOffField(run.handOff),
    ...(typeof run.stopReason === 'string' ? { stopReason: run.stopReason.slice(0, 200) } : {}),
    ...(normalizeEpisodeRunAuto(run.auto) ? { auto: normalizeEpisodeRunAuto(run.auto)! } : {}),
    ...countsField('attempts', run.attempts, value =>
      typeof value === 'number' && value > 0 ? Math.min(99, Math.round(value)) : null
    ),
    ...countsField('flagged', run.flagged, value =>
      typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : null
    ),
    log: (Array.isArray(run.log) ? run.log : []).slice(-RUN_LOG_MAX) as SceneRunLogEntry[],
    createdAt: whole(run.createdAt, 0, Number.MAX_SAFE_INTEGER, 0),
    updatedAt: whole(run.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}

function countsField<K extends 'attempts' | 'flagged'>(
  key: K,
  raw: unknown,
  clean: (value: unknown) => NonNullable<SceneRun[K]>[string] | null
): Partial<Pick<SceneRun, K>> {
  if (!raw || typeof raw !== 'object') return {};
  const entries = Object.entries(raw)
    .slice(0, RUN_MAX_ITEMS)
    .map(([id, value]) => [id, clean(value)] as const)
    .filter(([, value]) => value !== null);
  return entries.length
    ? ({ [key]: Object.fromEntries(entries) } as unknown as Partial<Pick<SceneRun, K>>)
    : {};
}

function handOffField(value: unknown): Pick<SceneRun, 'handOff'> {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Partial<NonNullable<SceneRun['handOff']>>;
  const sceneIds = (Array.isArray(raw.sceneIds) ? raw.sceneIds : [])
    .filter((id): id is string => typeof id === 'string' && Boolean(id))
    .slice(0, RUN_MAX_ITEMS);
  const handed = Object.fromEntries(
    Object.entries(raw.handed && typeof raw.handed === 'object' ? raw.handed : {}).filter(
      ([sceneId, promptId]) =>
        sceneIds.includes(sceneId) && typeof promptId === 'string' && promptId
    )
  ) as Record<string, string>;
  return sceneIds.length ? { handOff: { sceneIds, handed } } : {};
}

/** The run with a log line added (the newest kept, at most RUN_LOG_MAX). */
export function withRunLog(run: SceneRun, entry: SceneRunLogEntry): SceneRun {
  return { ...run, log: [...run.log, entry].slice(-RUN_LOG_MAX), updatedAt: entry.at };
}

/**
 * Takes the run has rendered (landed or failed): what the take limit counts. An episode run's
 * redos count too: a Scene's attempts, where there are more than its one settled take.
 */
export function runTakesTaken(
  run: Pick<SceneRun, 'outcomes' | 'handOff'> & Partial<Pick<SceneRun, 'attempts'>>
): number {
  const outcomes = run.outcomes ?? {};
  const settled = Object.entries(outcomes).filter(([, outcome]) => outcome !== 'skipped');
  const redos = Object.entries(run.attempts ?? {}).reduce(
    (sum, [sceneId, tries]) =>
      sum + Math.max(0, tries - (outcomes[sceneId] && outcomes[sceneId] !== 'skipped' ? 1 : 0)),
    0
  );
  return settled.length + redos + runTakesHanded(run).length;
}

/**
 * An episode run's take that failed its checks, tried again (Part 19 G1): the take in flight
 * cleared and the Scene's attempt counted, no outcome — the run comes back to the same Scene.
 */
export function withRunRedo(
  run: SceneRun,
  sceneId: string,
  detail: string,
  now = Date.now()
): SceneRun {
  const { current: _current, ...rest } = run;
  return withRunLog(
    {
      ...rest,
      attempts: { ...(run.attempts ?? {}), [sceneId]: (run.attempts?.[sceneId] ?? 0) + 1 },
    },
    { at: now, sceneId, event: 'redo', detail }
  );
}

/** Takes handed to ComfyUI and not settled yet: [Scene id, prompt id]. */
export function runTakesHanded(
  run: Pick<SceneRun, 'outcomes' | 'handOff'>
): Array<[sceneId: string, promptId: string]> {
  return Object.entries(run.handOff?.handed ?? {}).filter(([sceneId]) => !run.outcomes?.[sceneId]);
}

export type RunStep =
  | { kind: 'scene'; sceneId: string }
  | { kind: 'done'; reason: 'finished' | 'take-limit' | 'time-limit' };

/**
 * The run's next Scene (W4): the job in flight first (a restart waits for it, never queues it
 * again); else the next one in, not done, still there and (when `skipKept`) without a kept take
 * — within the take limit and the time since it started.
 */
export function nextRunStep(
  run: SceneRun,
  scenes: readonly SavedScene[],
  now = Date.now()
): RunStep {
  if (run.current) return { kind: 'scene', sceneId: run.current.sceneId };
  // Queue all: the Scenes fixed at Start (the limits were applied then), each handed once.
  if (run.handOff) {
    const byId = new Map(scenes.map(scene => [scene.id, scene]));
    for (const sceneId of run.handOff.sceneIds) {
      if (run.handOff.handed[sceneId] || run.outcomes?.[sceneId]) continue;
      const scene = byId.get(sceneId);
      if (!scene || (run.skipKept && scene.keptTakeId)) continue;
      return { kind: 'scene', sceneId };
    }
    return { kind: 'done', reason: 'finished' };
  }
  if (runTakesTaken(run) >= run.maxTakes) return { kind: 'done', reason: 'take-limit' };
  if (run.startedAt && now - run.startedAt > run.maxMinutes * 60_000) {
    return { kind: 'done', reason: 'time-limit' };
  }
  const byId = new Map(scenes.map(scene => [scene.id, scene]));
  for (const item of run.items) {
    if (!item.include || run.outcomes?.[item.sceneId]) continue;
    const scene = byId.get(item.sceneId);
    if (!scene || (run.skipKept && scene.keptTakeId)) continue;
    return { kind: 'scene', sceneId: scene.id };
  }
  return { kind: 'done', reason: 'finished' };
}

/** "3 of 8 done": what the run has been through, of what it has to go through now. */
export function runProgress(
  run: SceneRun,
  scenes: readonly SavedScene[]
): { done: number; total: number } {
  const byId = new Map(scenes.map(scene => [scene.id, scene]));
  const done = Object.keys(run.outcomes ?? {}).length;
  if (run.handOff) {
    const open = run.handOff.sceneIds.filter(id => !run.outcomes?.[id]).length;
    return { done, total: done + open };
  }
  const open = run.items.filter(item => {
    if (!item.include || run.outcomes?.[item.sceneId]) return false;
    const scene = byId.get(item.sceneId);
    return Boolean(scene) && !(run.skipKept && scene!.keptTakeId);
  }).length;
  return { done, total: done + Math.min(open, Math.max(0, run.maxTakes - runTakesTaken(run))) };
}

/** A Scene's outcome recorded (and the take in flight cleared), with its log line. */
export function withRunOutcome(
  run: SceneRun,
  sceneId: string,
  outcome: SceneRunOutcome,
  detail: string,
  now = Date.now()
): SceneRun {
  const { current: _current, ...rest } = run;
  return withRunLog(
    {
      ...rest,
      outcomes: { ...(run.outcomes ?? {}), [sceneId]: outcome },
      position: Object.keys({ ...(run.outcomes ?? {}), [sceneId]: outcome }).length,
    },
    {
      at: now,
      sceneId,
      event: outcome === 'landed' ? 'landed' : outcome === 'failed' ? 'failed' : 'skipped',
      detail,
    }
  );
}

/**
 * A run's take is done with when it is finished on the card and its checks after landing (Face
 * finish, then face match and marks) have run — not merely landed (M6 D8: the run moved on at
 * once and a run's takes got none of them). A take not on the card (waited for through the
 * Gallery after a reload) has nothing here to wait for; a pose redo it set off is waited for in
 * its place.
 */
export function runTakeSettled(input: {
  still: { promptId?: string; status?: string } | undefined;
  promptId: string;
  /** Rendering, or at the adult check (the Scene page's own busy state). */
  inFlight: boolean;
  checksPending: (still: { promptId?: string; status?: string }) => boolean;
  /** The take on the card is the pose redo this take's checks set off (it stands in for it). */
  isRedo?: (still: { promptId?: string }) => boolean;
  /**
   * Auto-review has yet to look at the still on the card, or is looking at it — this take or a
   * reroll the review set off. Without it a run moved on mid-review, the next Scene's take replaced
   * the still, and every other take went unreviewed (M7 T5, D24).
   */
  reviewPending?: (still: { promptId?: string; status?: string }) => boolean;
}): boolean {
  const { still } = input;
  if (input.inFlight) return false;
  if (!still) return true;
  if (input.reviewPending?.(still)) return false;
  // Its redo is waited for like the take itself: landed, and checked (the run said done while
  // the last Scene's redo still rendered, and its checks were lost with the page).
  const own = still.promptId === input.promptId || input.isRedo?.(still) === true;
  if (!own) return true;
  return still.status === 'completed' && !input.checksPending(still);
}

/**
 * A handed-off run settled from the Gallery: each take that finished is landed (or failed, its
 * message as the reason; one you cancelled is skipped); once none is left it is done. Takes still
 * queued or rendering — or not in this browser's Gallery yet — wait.
 */
export function settleHandedRun(
  run: SceneRun,
  gallery: ReadonlyArray<{ promptId?: string; status?: string; statusMessage?: string | null }>,
  sceneName: (sceneId: string) => string,
  now = Date.now()
): SceneRun {
  let next = run;
  for (const [sceneId, promptId] of runTakesHanded(run)) {
    const entry = gallery.find(item => item.promptId?.trim() === promptId);
    if (entry?.status === 'completed') {
      next = withRunOutcome(next, sceneId, 'landed', `${sceneName(sceneId)}: a take landed`, now);
    } else if (entry?.status === 'error') {
      const why = entry.statusMessage?.trim() || 'error';
      const cancelled = why.toLowerCase() === 'cancelled';
      next = withRunOutcome(
        next,
        sceneId,
        cancelled ? 'skipped' : 'failed',
        `${sceneName(sceneId)}: ${why}`,
        now
      );
    }
  }
  // withRunOutcome clears the take in flight: a paused hand-off keeps its own.
  if (next !== run && run.current) next = { ...next, current: run.current };
  if (next.state === 'handed' && runTakesHanded(next).length === 0) {
    next = withRunLog(
      { ...next, state: 'done' },
      { at: now, event: 'done', detail: 'every take handed to ComfyUI has finished' }
    );
  }
  return next;
}

/** A run found "running" with nothing running it (the page was closed or reloaded): paused. */
export function pausedAfterReload(run: SceneRun, now = Date.now()): SceneRun {
  if (run.state !== 'running') return run;
  return withRunLog(
    {
      ...run,
      state: 'paused',
      stopReason: run.resumeOnReload
        ? 'The page was closed or reloaded — going on by itself in a moment.'
        : 'The page was closed or reloaded — resume to go on.',
    },
    { at: now, event: 'paused', detail: 'page closed or reloaded' }
  );
}

/**
 * A run whose loop failed: paused, with what went wrong — never left "running" with nothing
 * running it (2026-11-06: an episode sat at "Running · 0 done" after the loop threw). Resume
 * goes on from the Scene it was on.
 */
export function pausedAfterError(run: SceneRun, message: string, now = Date.now()): SceneRun {
  if (run.state !== 'running') return run;
  const why = message.replace(/\s+/g, ' ').trim().slice(0, 160) || 'an unexpected error';
  return withRunLog(
    { ...run, state: 'paused', stopReason: `Stopped by an error: ${why} — resume to go on.` },
    { at: now, event: 'paused', detail: `error: ${why}` }
  );
}

/** A Scene whose take wasn't queued this many times is failed; before that Resume tries it again. */
export const RUN_NOT_QUEUED_TRIES = 3;

/**
 * A run whose Scene's take wasn't queued: paused, saying why — the page's error (or note) at the
 * time, which is gone after a reload, so it is kept in the run (2026-11-10: "see the note on the
 * card" pointed at a note that a reload had cleared). No reason: no take appeared in time.
 * Nothing rendered, so the Scene stays open and Resume tries it again (2026-11-12, s11: the first
 * shot timed out while ComfyUI was busy, was marked failed, and the run ended "done" without it);
 * the RUN_NOT_QUEUED_TRIES-th time in a row it is failed, so a run resumed by itself never loops.
 */
export function pausedNotQueued(
  run: SceneRun,
  sceneId: string,
  sceneName: string,
  reason: string | null | undefined,
  now = Date.now()
): SceneRun {
  const why =
    (reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 140) ||
    'no take appeared on the card within 5 minutes';
  const name = sceneName.replace(/\s+/g, ' ').trim().slice(0, 50) || 'The Scene';
  const tries = notQueuedTries(run, sceneId) + 1;
  const { current: _current, ...rest } = run;
  const failed = tries >= RUN_NOT_QUEUED_TRIES;
  return withRunLog(
    {
      ...(failed
        ? withRunOutcome(run, sceneId, 'failed', `its take wasn’t queued: ${why}`, now)
        : rest),
      state: 'paused',
      stopReason:
        `${name}’s take wasn’t queued: ${why}${failed ? '' : ' — resume to try it again'}`.slice(
          0,
          200
        ),
    },
    { at: now, sceneId, event: 'paused', detail: `a take was not queued: ${why}` }
  );
}

/** A Scene's takes not queued in a row: its "not queued" pauses since it last landed or was queued. */
function notQueuedTries(run: SceneRun, sceneId: string): number {
  let tries = 0;
  for (let i = run.log.length - 1; i >= 0; i--) {
    const entry = run.log[i];
    if (entry.sceneId !== sceneId) continue;
    if (entry.event === 'paused' && entry.detail?.startsWith('a take was not queued')) tries++;
    else if (entry.event === 'queued' || entry.event === 'landed' || entry.event === 'failed')
      break;
  }
  return tries;
}

export type FlaggedShot = {
  sceneId: string;
  name: string;
  why: string;
  /** The kept take's picture (its framed cut when it has one). */
  thumb?: string;
  /** No take landed: the run failed it (listed so a missing shot is never missed). */
  failed?: boolean;
};

/**
 * A run's takes to check, grouped by script scene ("1B KITCHEN · Dialogue" → "1 KITCHEN"), in the
 * run's order — for the review list (2026-11-11: the names and reasons alone hid what the
 * pictures showed at once). Scenes no longer there are listed under their id.
 */
export function flaggedByScene(
  run: Pick<SceneRun, 'items' | 'flagged'> & Partial<Pick<SceneRun, 'outcomes' | 'log'>>,
  scenes: readonly Pick<SavedScene, 'id' | 'name' | 'takes' | 'keptTakeId'>[]
): Array<{ group: string; shots: FlaggedShot[] }> {
  // A failed shot is listed too, first among its scene's (2026-11-12: s11's first shot failed and
  // the review list, flagged takes only, never said so), with why from the run's log.
  const failedIds = new Set(
    Object.entries(run.outcomes ?? {})
      .filter(([, outcome]) => outcome === 'failed')
      .map(([sceneId]) => sceneId)
  );
  const failedWhy = (sceneId: string) =>
    [...(run.log ?? [])]
      .reverse()
      .find(entry => entry.sceneId === sceneId && entry.event === 'failed')
      ?.detail?.trim() || 'no take landed';
  const flagged: Record<string, string> = {
    ...(run.flagged ?? {}),
    ...Object.fromEntries([...failedIds].map(id => [id, `Failed — ${failedWhy(id)}`])),
  };
  const byId = new Map(scenes.map(scene => [scene.id, scene]));
  const order = [
    ...run.items.map(item => item.sceneId).filter(id => id in flagged),
    ...Object.keys(flagged).filter(id => !run.items.some(item => item.sceneId === id)),
  ];
  const groups: Array<{ group: string; shots: FlaggedShot[] }> = [];
  for (const sceneId of order) {
    const scene = byId.get(sceneId);
    const name = scene?.name ?? sceneId;
    const match = /^(\d+)[A-Z]{0,2}\s+(.+?)\s+·/.exec(name);
    const group = match ? `${match[1]} ${match[2]}` : 'Other shots';
    const kept = scene?.takes.find(take => take.id === scene.keptTakeId);
    const thumb = kept?.framedUrl || kept?.imageUrl;
    const failed = failedIds.has(sceneId);
    const shot: FlaggedShot = {
      sceneId,
      name,
      why: flagged[sceneId]!,
      ...(thumb && !failed ? { thumb } : {}),
      ...(failed ? { failed: true } : {}),
    };
    const last = groups.find(entry => entry.group === group);
    if (last) last.shots.push(shot);
    else groups.push({ group, shots: [shot] });
  }
  return groups;
}
