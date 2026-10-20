/**
 * Bounded-concurrency map: runs `fn` over `items` with at most `limit` calls in flight at once,
 * preserving result order. Use this instead of a flat `Promise.all(items.map(fn))` when `fn`
 * hits something with a real concurrency ceiling (a local LLM server, a rate-limited API) — a
 * flat Promise.all would fire all N calls simultaneously, which either overwhelms the backend or
 * (for the LLM client in this app — see llm-backpressure.ts, which throws `LlmBusyError`
 * immediately once `LLM_MAX_INFLIGHT` slots are taken, rather than queuing) causes most calls
 * beyond the cap to fail outright.
 *
 * Falls back to plain sequential execution when `limit <= 1`.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  if (items.length === 0) {
    return results;
  }
  const effectiveLimit = Math.max(1, Math.min(limit, items.length));
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) {
        return;
      }
      results[current] = await fn(items[current] as T, current);
    }
  }

  await Promise.all(Array.from({ length: effectiveLimit }, () => worker()));
  return results;
}
