/** Coerce ComfyUI message timestamps (seconds or ms since epoch) to ms. */
export function coerceComfyTimestampMs(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  // ms since epoch (~1e12+), seconds since epoch (~1e9+), otherwise ignore.
  if (value > 1e12) {
    return Math.round(value);
  }
  if (value > 1e9) {
    return Math.round(value * 1000);
  }
  return undefined;
}

export type ComfyExecutionTiming = {
  executionStartedAt?: number;
  executionEndedAt?: number;
  /** GPU/workflow execution time from ComfyUI messages when available. */
  renderDurationMs?: number;
};

/**
 * Derive render duration from ComfyUI history `status.messages`
 * (`execution_start` → `execution_success` / error / interrupted).
 */
export function extractComfyExecutionTiming(input: {
  messages?: Array<[string, Record<string, unknown>]> | null;
}): ComfyExecutionTiming {
  const messages = input.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return {};
  }

  let executionStartedAt: number | undefined;
  let executionEndedAt: number | undefined;

  for (const message of messages) {
    if (!Array.isArray(message) || message.length < 2) {
      continue;
    }
    const type = message[0];
    const payload = message[1];
    if (!payload || typeof payload !== 'object') {
      continue;
    }
    const ts = coerceComfyTimestampMs((payload as { timestamp?: unknown }).timestamp);
    if (ts == null) {
      continue;
    }
    if (type === 'execution_start') {
      executionStartedAt = ts;
      continue;
    }
    if (
      type === 'execution_success' ||
      type === 'execution_error' ||
      type === 'execution_interrupted'
    ) {
      executionEndedAt = ts;
    }
  }

  if (
    executionStartedAt != null &&
    executionEndedAt != null &&
    executionEndedAt >= executionStartedAt
  ) {
    return {
      executionStartedAt,
      executionEndedAt,
      renderDurationMs: executionEndedAt - executionStartedAt,
    };
  }

  return { executionStartedAt, executionEndedAt };
}

/** Wall-clock fallback when ComfyUI message timestamps are missing. */
export function wallClockRenderDurationMs(input: {
  queuedAt?: number;
  completedAt?: number;
}): number | undefined {
  const queuedAt = input.queuedAt;
  const completedAt = input.completedAt;
  if (
    typeof queuedAt !== 'number' ||
    typeof completedAt !== 'number' ||
    !Number.isFinite(queuedAt) ||
    !Number.isFinite(completedAt) ||
    completedAt < queuedAt
  ) {
    return undefined;
  }
  return completedAt - queuedAt;
}

export function resolveGalleryRenderDurationMs(input: {
  renderDurationMs?: number;
  queuedAt?: number;
  completedAt?: number;
}): number | undefined {
  if (
    typeof input.renderDurationMs === 'number' &&
    Number.isFinite(input.renderDurationMs) &&
    input.renderDurationMs >= 0
  ) {
    return Math.round(input.renderDurationMs);
  }
  return wallClockRenderDurationMs(input);
}

/** Compact human label for gallery / workflow chrome. */
export function formatRenderDuration(ms: number | undefined): string | undefined {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
    return undefined;
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
  }
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) {
    return secs > 0 ? `${hours}h ${minutes}m ${secs}s` : `${hours}h ${minutes}m`;
  }
  return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
}
