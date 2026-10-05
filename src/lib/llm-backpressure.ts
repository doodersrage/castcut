/**
 * Lightweight in-flight counter guarding concurrent LLM calls. Keeps a single
 * slow/overloaded Ollama instance from queuing up unbounded concurrent
 * requests — once `LLM_MAX_INFLIGHT` slots are taken, new callers get a
 * `LlmBusyError` immediately instead of piling up behind the model.
 */

const DEFAULT_MAX_INFLIGHT = 2;

let inFlight = 0;

export class LlmBusyError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds = 2) {
    super('The LLM is busy handling other requests. Please retry shortly.');
    this.name = 'LlmBusyError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function getLlmMaxInflight(): number {
  const raw = Number(process.env.LLM_MAX_INFLIGHT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_INFLIGHT;
}

export function getLlmInflightCount(): number {
  return inFlight;
}

export function isLlmBusy(): boolean {
  return inFlight >= getLlmMaxInflight();
}

/** Test-only helper to reset module state between test files. */
export function resetLlmInflightForTests(): void {
  inFlight = 0;
}

/**
 * Reserves a concurrency slot, throwing `LlmBusyError` when saturated.
 * Returns a release function that must be called exactly once (idempotent).
 */
export function acquireLlmSlot(): () => void {
  if (isLlmBusy()) {
    throw new LlmBusyError();
  }

  inFlight += 1;
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    inFlight = Math.max(0, inFlight - 1);
  };
}

/** How often a waiting caller looks for a free slot. */
const SLOT_POLL_MS = 250;

/**
 * Reserves a slot, waiting up to `maxWaitMs` for one to free up before throwing
 * `LlmBusyError`. For work that has no useful answer without the model — Story's scene and still
 * writers fell back to their built-in cards whenever a still's checks held both slots
 * (2026-10-05: several rolls in a row on a two-slot server).
 */
export async function acquireLlmSlotWaiting(maxWaitMs: number): Promise<() => void> {
  const deadline = Date.now() + Math.max(0, maxWaitMs);
  for (;;) {
    if (!isLlmBusy() || Date.now() >= deadline) {
      return acquireLlmSlot();
    }
    await new Promise(resolve => setTimeout(resolve, SLOT_POLL_MS));
  }
}

export async function withLlmSlot<T>(
  fn: () => Promise<T>,
  options?: { waitMs?: number }
): Promise<T> {
  const release = options?.waitMs ? await acquireLlmSlotWaiting(options.waitMs) : acquireLlmSlot();
  try {
    return await fn();
  } finally {
    release();
  }
}
