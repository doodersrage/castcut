/**
 * Server-only: run a big ComfyUI graph (Copy moves, Lip-sync, Finish clip) and, when it runs out
 * of GPU memory, free what a same-machine LLM holds (LM Studio / Ollama / the built-in LLM — they
 * reload on their next call) and ComfyUI's cached models, then try once more. A 24 GB card fits a
 * 14B video model, not that and a loaded vision LLM (live 2026-10-16: Wan Animate 2 asked for
 * 324 MB more with LM Studio holding 6.7 GB).
 */

import { runComfyUtilityGraph } from './comfyui/comfy-utility-graph-server';
import { freeComfyUiMemoryServer } from './comfyui/free-server';
import { freeLocalLlmVram } from './llm-vram-free-server';
import { isOomOrExecutionErrorMessage } from './oom-retry';

/** ComfyUI's allocation failure ("Allocation on device … Requested … Device limit"). */
export function isGpuMemoryError(message: string): boolean {
  return (
    /allocation on device|device limit|out of memory/i.test(message) ||
    (/\bvram\b|\bcuda\b/i.test(message) && isOomOrExecutionErrorMessage(message))
  );
}

export async function runHeavyComfyGraph<T>(
  input: Parameters<typeof runComfyUtilityGraph<T>>[0] & { comfyUrl?: string }
): ReturnType<typeof runComfyUtilityGraph<T>> {
  try {
    return await runComfyUtilityGraph<T>(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isGpuMemoryError(message)) throw error;
    await freeLocalLlmVram().catch(() => undefined);
    await freeComfyUiMemoryServer(input.comfyUrl).catch(() => false);
    return runComfyUtilityGraph<T>(input);
  }
}

export class MissingModelsError extends Error {}

/**
 * Before queueing: the files a tool needs, by ComfyUI model folder. Throws MissingModelsError
 * naming what is missing (installable from Settings → ComfyUI → Models) — instead of ComfyUI's
 * "value not in list" after the upload. A ComfyUI that can't be asked is let through.
 */
export async function requireComfyModels(
  baseUrl: string,
  tool: string,
  needs: ReadonlyArray<{ folder: string; file: string }>
): Promise<void> {
  const folders = [...new Set(needs.map(need => need.folder))];
  const listed = new Map<string, Set<string> | null>();
  await Promise.all(
    folders.map(async folder => {
      try {
        const response = await fetch(`${baseUrl}/models/${encodeURIComponent(folder)}`, {
          signal: AbortSignal.timeout(8000),
        });
        const names = response.ok ? ((await response.json()) as unknown) : null;
        listed.set(folder, Array.isArray(names) ? new Set(names.map(String)) : null);
      } catch {
        listed.set(folder, null);
      }
    })
  );
  const missing = needs.filter(need => listed.get(need.folder)?.has(need.file) === false);
  if (missing.length) {
    throw new MissingModelsError(
      `${tool} needs ${missing.map(need => need.file).join(', ')} in ComfyUI — install ${missing.length === 1 ? 'it' : 'them'} from Settings → ComfyUI → Models.`
    );
  }
}
