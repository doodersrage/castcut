/**
 * Privileged server plugin hooks invoked inside the Comfy queue path
 * (Node fetch — not browser-only preflight).
 *
 * Allowlisted rewrites: prompt / negative / denoise / cfg / params / workflow JSON
 * based on each server plugin's privileges.
 */

import {
  applyPluginQueueHookMutation,
  normalizeHookCfg,
  normalizeHookDenoise,
  type PluginQueueHookPayload,
  type PluginQueueHookResult,
} from './queue-hooks';
import {
  listServerPluginHooksForEvent,
  type ServerPluginPrivilege,
} from './server-plugin-registry';
import { assertSafeHttpUrl } from '../server/url-safety';

export type ServerQueueHookEvent = 'queue-preflight' | 'queue-post';

export type ServerQueueHookPayload = PluginQueueHookPayload & {
  event: ServerQueueHookEvent;
  /** Injected workflow graph (allowlisted rewrite when privilege grants it). */
  workflow?: Record<string, unknown>;
  /** Sampler / queue params the hook may patch under rewrite-params. */
  params?: Record<string, string | number | boolean | null>;
  promptId?: string;
  comfyUrl?: string;
  ok?: boolean;
  error?: string;
};

export type ServerQueueHookResult = PluginQueueHookResult & {
  workflow?: Record<string, unknown>;
  params?: Record<string, string | number | boolean | null>;
};

export type ServerQueueHookRunResult = {
  payload: ServerQueueHookPayload;
  blocked: boolean;
  messages: string[];
  reason?: string;
};

function resolveHookAbsoluteUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('/')) {
    const base =
      process.env.PROMPT_API_URL?.trim() ||
      process.env.NEXT_PUBLIC_PROMPT_API_URL?.trim() ||
      'http://127.0.0.1:47832';
    try {
      return new URL(trimmed, base.endsWith('/') ? base : `${base}/`).toString();
    } catch {
      return null;
    }
  }
  try {
    return assertSafeHttpUrl(trimmed, { allowPrivate: true }).toString();
  } catch {
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Apply a privileged hook result onto the server payload, respecting privileges.
 */
export function applyServerQueueHookMutation(
  payload: ServerQueueHookPayload,
  result: ServerQueueHookResult,
  privileges: ServerPluginPrivilege[]
): {
  payload: ServerQueueHookPayload;
  blocked: boolean;
  reason?: string;
} {
  const priv = new Set(privileges);
  const canPrompt = priv.has('rewrite-prompt');
  const canParams = priv.has('rewrite-params');
  const canWorkflow = priv.has('rewrite-workflow');

  const filtered: ServerQueueHookResult = {
    ok: result.ok,
    blocked: result.blocked,
    message: result.message,
    reason: result.reason,
  };

  if (canPrompt) {
    if (typeof result.prompt === 'string') {
      filtered.prompt = result.prompt;
    }
    if (typeof result.negativePrompt === 'string') {
      filtered.negativePrompt = result.negativePrompt;
    }
  }
  if (canParams) {
    if (result.denoise !== undefined) {
      filtered.denoise = result.denoise;
    }
    if (result.cfg !== undefined) {
      filtered.cfg = result.cfg;
    }
  }

  const base = applyPluginQueueHookMutation(payload, filtered);
  if (base.blocked) {
    return { payload, blocked: true, reason: base.reason };
  }

  let next: ServerQueueHookPayload = {
    ...payload,
    prompt: base.payload.prompt,
    negativePrompt: base.payload.negativePrompt,
    denoise: base.payload.denoise,
    cfg: base.payload.cfg,
    model: base.payload.model,
    tool: base.payload.tool,
    event: payload.event,
  };

  if (canParams && result.params && isPlainObject(result.params)) {
    const merged = { ...(payload.params ?? {}) };
    for (const [key, value] of Object.entries(result.params)) {
      const token = key.trim();
      if (!token || token.length > 64) {
        continue;
      }
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        merged[token] = value;
      }
    }
    next = { ...next, params: merged };
  }

  if (canWorkflow && result.workflow && isPlainObject(result.workflow)) {
    // Shallow-validate Comfy graph shape: string keys → node-like objects.
    const keys = Object.keys(result.workflow);
    if (keys.length > 0 && keys.length <= 2000) {
      const looksLikeGraph = keys.every(key => {
        const node = result.workflow![key];
        return isPlainObject(node);
      });
      if (looksLikeGraph) {
        next = { ...next, workflow: result.workflow };
      }
    }
  }

  // Re-clamp denoise/cfg after privilege filtering
  if (next.denoise !== undefined) {
    const denoise = normalizeHookDenoise(next.denoise);
    next = { ...next, denoise: denoise ?? next.denoise };
  }
  if (next.cfg !== undefined) {
    const cfg = normalizeHookCfg(next.cfg);
    next = { ...next, cfg: cfg ?? next.cfg };
  }

  return { payload: next, blocked: false, reason: base.reason };
}

async function invokeServerHook(
  url: string,
  payload: ServerQueueHookPayload
): Promise<ServerQueueHookResult | null> {
  const absolute = resolveHookAbsoluteUrl(url);
  if (!absolute) {
    return null;
  }
  const response = await fetch(absolute, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Prompt-Plugin-Hook': 'server',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as ServerQueueHookResult;
}

/**
 * Run privileged server queue-preflight hooks before Comfy /prompt.
 * Can block or rewrite allowlisted fields.
 */
export async function runServerQueuePreflight(
  payload: ServerQueueHookPayload
): Promise<ServerQueueHookRunResult> {
  const hooks = listServerPluginHooksForEvent('queue-preflight');
  let next: ServerQueueHookPayload = { ...payload, event: 'queue-preflight' };
  const messages: string[] = [];

  for (const hook of hooks) {
    try {
      const data = await invokeServerHook(hook.url, next);
      if (!data) {
        messages.push(`${hook.label}: skipped (unsafe URL)`);
        continue;
      }
      const applied = applyServerQueueHookMutation(next, data, hook.privileges);
      if (applied.reason && !applied.blocked) {
        messages.push(`${hook.label}: ${applied.reason}`);
      }
      if (applied.blocked) {
        const reason = applied.reason || `${hook.label} blocked the queue.`;
        messages.push(`${hook.label}: ${reason}`);
        return { payload: next, blocked: true, messages, reason };
      }
      next = applied.payload;
    } catch (error) {
      messages.push(`${hook.label}: ${error instanceof Error ? error.message : 'hook failed'}`);
    }
  }

  return { payload: next, blocked: false, messages };
}

/**
 * Fire-and-forget privileged queue-post hooks after a successful (or failed) queue.
 * Cannot block; workflow rewrite is ignored post-queue.
 */
export async function runServerQueuePost(payload: ServerQueueHookPayload): Promise<void> {
  const hooks = listServerPluginHooksForEvent('queue-post');
  const body: ServerQueueHookPayload = { ...payload, event: 'queue-post' };
  for (const hook of hooks) {
    try {
      await invokeServerHook(hook.url, body);
    } catch {
      // Best-effort observability hooks.
    }
  }
}
