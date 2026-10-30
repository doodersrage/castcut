/**
 * A prepared run of takes on the Scene page (M5 W3 / W4, ROADMAP §8.3): which Scenes it will
 * render, in what order, within what limits — inspected and edited before anything renders, and
 * kept in the Scene settings (`tools.scene.run`) so a reload or restart finds it. W3 prepares
 * it (planned shots become Scenes, the list and its estimate); W4 runs it. A run never keeps a
 * take: choosing stays the player's. Pure.
 */
import { parseScript } from '../script/parse';
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
    | 'done';
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
  log: SceneRunLogEntry[];
  createdAt: number;
  updatedAt: number;
};

export const RUN_DEFAULT_MAX_TAKES = 8;
export const RUN_DEFAULT_MAX_MINUTES = 30;
export const RUN_MAX_ITEMS = 60;
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
  const room = Math.max(0, SCENE_LIMIT_PER_CAST - scenesForCast(scenes, script.castId).length);
  return { fit: pending.slice(0, room), overLimit: Math.max(0, pending.length - room) };
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
    maxTakes: whole(run.maxTakes, 1, RUN_MAX_ITEMS, RUN_DEFAULT_MAX_TAKES),
    maxMinutes: whole(run.maxMinutes, 1, 24 * 60, RUN_DEFAULT_MAX_MINUTES),
    skipKept: run.skipKept !== false,
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
    log: (Array.isArray(run.log) ? run.log : []).slice(-RUN_LOG_MAX) as SceneRunLogEntry[],
    createdAt: whole(run.createdAt, 0, Number.MAX_SAFE_INTEGER, 0),
    updatedAt: whole(run.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
  };
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

/** Takes the run has rendered (landed or failed): what the take limit counts. */
export function runTakesTaken(run: Pick<SceneRun, 'outcomes' | 'handOff'>): number {
  const settled = Object.values(run.outcomes ?? {}).filter(outcome => outcome !== 'skipped');
  return settled.length + runTakesHanded(run).length;
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
    { ...run, state: 'paused', stopReason: 'The page was closed or reloaded — resume to go on.' },
    { at: now, event: 'paused', detail: 'page closed or reloaded' }
  );
}
