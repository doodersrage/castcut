/**
 * Model-aware ordering for the app's own ComfyUI work.
 *
 * A job right after a job on a different main model pays for the switch (measured on the shared
 * ComfyUI, last 145 jobs: Edit 2511 55 s vs 40 s, Rapid v23 54 s vs 36 s, Qwen-Image 2.1 31 s vs
 * 19 s). A Day sends bursts (Queue all, Animate all) and follow-ups (Face finish, second takes)
 * that can mix engines, so the app orders what IT sends: same-model jobs together, and a
 * follow-up on another model waits until the app's own jobs on the current model have run.
 *
 * Pure — no fetch, no ComfyUI. ComfyUI's queue itself is never reordered (other people's jobs
 * share it); this only decides the order and the moment the app submits.
 */

/** One unit of the app's work: an id, the main model it loads, and what must run first. */
export type ModelBatchJob = {
  id: string;
  /** Main weights the job loads (see mainModelKeyFromGraph); empty = utility, no switch cost. */
  modelKey?: string | null;
  /** Ids in the same batch that must be submitted before this one. */
  after?: readonly string[];
};

export type ModelBatchPlanOptions = {
  /** The model ComfyUI ran last, when known — a batch starts on it when it can. */
  currentModelKey?: string | null;
  /**
   * How many times a job may be passed over for a later same-model job before it goes next
   * anyway — the bound on how long a visible result is held back. Default 3.
   */
  maxDeferrals?: number;
};

/** File name without folders and extension, lower case — `Foo/Bar.safetensors` → `bar`. */
export function normalizeModelKey(key: string | null | undefined): string {
  return (key ?? '')
    .split('+')
    .map(part =>
      part
        .trim()
        .split(/[\\/]/)
        .pop()!
        .replace(/\.(safetensors|ckpt|pt|pth|bin|gguf|sft)$/i, '')
        .toLowerCase()
    )
    .filter(Boolean)
    .sort()
    .join('+');
}

/**
 * Same main weights? Exact after normalizing; a registry hint and a real file name also match
 * when one contains the other (`qwen_image_2.1_bf16` vs `models/qwen_image_2.1_bf16.safetensors`).
 */
export function sameModelKey(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeModelKey(a);
  const right = normalizeModelKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  return short.length >= 6 && long.includes(short);
}

const MAIN_MODEL_INPUTS = ['unet_name', 'ckpt_name'] as const;

/**
 * The main model a ComfyUI API graph loads: every UNET / checkpoint loader's file, normalized
 * and joined (WAN's two experts count as one key). Null for utility graphs (cut-outs, pose
 * checks) that load no diffusion model.
 */
export function mainModelKeyFromGraph(graph: unknown): string | null {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) return null;
  const names = new Set<string>();
  for (const node of Object.values(graph as Record<string, unknown>)) {
    if (!node || typeof node !== 'object') continue;
    const { class_type: classType, inputs } = node as {
      class_type?: unknown;
      inputs?: Record<string, unknown>;
    };
    if (typeof classType !== 'string' || !inputs || typeof inputs !== 'object') continue;
    for (const field of MAIN_MODEL_INPUTS) {
      const value = inputs[field];
      if (typeof value === 'string' && value.trim()) names.add(value.trim());
    }
    // WanVideoWrapper / GGUF loaders name the file `model`.
    if (/ModelLoader|UnetLoaderGGUF/i.test(classType) && typeof inputs.model === 'string') {
      names.add(inputs.model.trim());
    }
  }
  const key = normalizeModelKey([...names].join('+'));
  return key || null;
}

/**
 * The order to run a burst in: dependencies first, jobs on the current model before a switch,
 * and the next model chosen by the earliest waiting job (so the visible order mostly holds).
 * No job is passed over more than `maxDeferrals` times. Unknown `after` ids are ignored; a
 * dependency cycle falls back to the original order.
 */
export function planModelBatchOrder(
  jobs: readonly ModelBatchJob[],
  options?: ModelBatchPlanOptions
): string[] {
  const maxDeferrals = Math.max(0, options?.maxDeferrals ?? 3);
  const ids = new Set(jobs.map(job => job.id));
  const remaining = jobs.filter(
    (job, index) => jobs.findIndex(other => other.id === job.id) === index
  );
  const done = new Set<string>();
  const deferrals = new Map<string, number>();
  const order: string[] = [];
  let current = normalizeModelKey(options?.currentModelKey);
  const keyOf = (job: ModelBatchJob) => normalizeModelKey(job.modelKey);

  while (remaining.length > 0) {
    const ready = remaining.filter(job =>
      (job.after ?? []).every(dep => !ids.has(dep) || done.has(dep) || dep === job.id)
    );
    const pool = ready.length > 0 ? ready : [remaining[0]!];
    // Overdue first, then the current model (or a utility job), else switch to the earliest
    // waiting job's model — pool is in the original order.
    const pick =
      pool.find(job => (deferrals.get(job.id) ?? 0) >= maxDeferrals) ??
      (current ? pool.find(job => !keyOf(job) || sameModelKey(keyOf(job), current)) : undefined) ??
      pool[0]!;
    for (const job of pool) {
      if (job.id === pick.id) break;
      deferrals.set(job.id, (deferrals.get(job.id) ?? 0) + 1);
    }
    order.push(pick.id);
    done.add(pick.id);
    remaining.splice(remaining.indexOf(pick), 1);
    if (keyOf(pick)) current = keyOf(pick);
  }
  return order;
}

/** How many model switches a run order costs, starting from `currentModelKey`. */
export function countModelSwitches(
  runOrder: readonly (string | null | undefined)[],
  currentModelKey?: string | null
): number {
  let current = normalizeModelKey(currentModelKey);
  let switches = 0;
  for (const raw of runOrder) {
    const key = normalizeModelKey(raw);
    if (!key) continue;
    if (current && !sameModelKey(key, current)) switches += 1;
    current = key;
  }
  return switches;
}

/**
 * The app queues its singles with ComfyUI `front: true`, and ComfyUI runs the NEWEST front job
 * first. To get `runOrder` out of a burst, submit it backwards — except the first job when the
 * queue is idle, which starts the moment it lands and so goes in first.
 */
export function frontQueueSubmissionOrder<T>(
  runOrder: readonly T[],
  options: { firstStartsNow: boolean }
): T[] {
  if (runOrder.length === 0) return [];
  if (options.firstStartsNow) {
    return [runOrder[0]!, ...runOrder.slice(1).reverse()];
  }
  return [...runOrder].reverse();
}

/** The app's own job still waiting in ComfyUI (not running yet). */
export type AppPendingJob = { promptId: string; modelKey?: string | null };

export type ModelTurnDecision =
  | { wait: false; reason: 'same-model' | 'no-app-jobs' | 'unknown-model' | 'held-long-enough' }
  | { wait: true; blocking: number };

/**
 * Should a follow-up on `modelKey` wait before it is submitted? Front jobs run next, so a
 * follow-up on another model sent while the app still has jobs waiting on the current one costs
 * two switches (there and back). Wait until those have run — but never longer than `maxWaitMs`,
 * so a visible result is not held back for long. Other people's jobs don't count.
 */
export function decideModelTurn(input: {
  modelKey: string | null | undefined;
  appPending: readonly AppPendingJob[];
  waitedMs: number;
  maxWaitMs: number;
}): ModelTurnDecision {
  const key = normalizeModelKey(input.modelKey);
  if (!key) return { wait: false, reason: 'unknown-model' };
  const keyed = input.appPending.filter(job => normalizeModelKey(job.modelKey));
  if (keyed.length === 0) return { wait: false, reason: 'no-app-jobs' };
  const blocking = keyed.filter(job => !sameModelKey(job.modelKey, key)).length;
  if (blocking === 0) return { wait: false, reason: 'same-model' };
  if (input.waitedMs >= input.maxWaitMs) return { wait: false, reason: 'held-long-enough' };
  return { wait: true, blocking };
}
