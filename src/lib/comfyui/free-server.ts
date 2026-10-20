/**
 * Server-side ComfyUI `/free` — unload models so Diffusers can own the GPU.
 * Best-effort; never throws to the caller.
 */

import { getComfyUiBaseUrl } from './client';
import { stripEmptyComfyUiRuntime } from './config';

export async function freeComfyUiMemoryServer(comfyUrl?: string): Promise<boolean> {
  try {
    const runtime = stripEmptyComfyUiRuntime({ apiUrl: comfyUrl });
    const baseUrl = getComfyUiBaseUrl(runtime);
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/free`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
      signal: AbortSignal.timeout(2500),
    });
    return response.ok;
  } catch {
    return false;
  }
}
