'use client';

/**
 * Engine health results, per ComfyUI URL, for as long as the object_info cache they were
 * checked against. Light on purpose — the header Engine chip reads it on every tool; the
 * checks themselves (engine-health-client) are loaded on demand.
 */

import type { EngineHealth } from './engine-health-engines';
import { resolveComfyUiRuntime } from './comfyui-runtime';

export const ENGINE_HEALTH_UPDATED_EVENT = 'engine-health-updated';

/** Same lifetime as the object_info cache the check reads. */
export const ENGINE_HEALTH_TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, Map<string, EngineHealth>>();

/** The ComfyUI URL the browser queues to ('' = the server's default). */
export function currentEngineHealthUrl(): string {
  return resolveComfyUiRuntime()?.apiUrl?.trim().replace(/\/+$/, '') || '';
}

function notify(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ENGINE_HEALTH_UPDATED_EVENT));
  }
}

/** Cached health for a model on the current ComfyUI, or null (not checked / expired). */
export function readEngineHealth(
  model: string | undefined,
  comfyUrl?: string
): EngineHealth | null {
  const id = model?.trim();
  if (!id) return null;
  const entry = cache.get(comfyUrl ?? currentEngineHealthUrl())?.get(id);
  if (!entry || Date.now() - entry.checkedAt > ENGINE_HEALTH_TTL_MS) return null;
  return entry;
}

export function storeEngineHealth(health: EngineHealth): EngineHealth {
  const byModel = cache.get(health.comfyUrl) ?? new Map<string, EngineHealth>();
  byModel.set(health.model, health);
  cache.set(health.comfyUrl, byModel);
  notify();
  return health;
}

export function clearEngineHealthCache(): void {
  cache.clear();
  notify();
}
