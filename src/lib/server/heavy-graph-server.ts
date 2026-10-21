/**
 * Server-only: run a big ComfyUI graph (Copy moves, Lip-sync, Finish clip) and, when it runs out
 * of GPU memory, free what a same-machine LLM holds (LM Studio / Ollama / the built-in LLM — they
 * reload on their next call) and ComfyUI's cached models, then try once more. A 24 GB card fits a
 * 14B video model, not that and a loaded vision LLM (live 2026-10-16: Wan Animate 2 asked for
 * 324 MB more with LM Studio holding 6.7 GB).
 */

import { runComfyUtilityGraph } from '../comfyui/comfy-utility-graph-server';
import { freeComfyUiMemoryServer } from '../comfyui/free-server';
import { freeLocalLlmVram } from '../llm/vram-free-server';
import { isOomOrExecutionErrorMessage } from '../queue/oom-retry';
import { comfyUnreachableMessage, isUnreachableError } from './friendly-error';

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

/** Where the model downloader lives: Settings → ComfyUI → Models. */
export const COMFY_MODELS_SETTINGS_HREF = '/settings?tab=comfyui&section=model-assets';
/** Settings → ComfyUI → Connection (the address). */
export const COMFY_CONNECTION_SETTINGS_HREF = '/settings?tab=comfyui&section=connection';

/**
 * A ComfyUI file the tool needs is not installed. Answered as 424 with the file names and a
 * link to install them (apiErrorFrom reads httpStatus and responseExtra; a route that sends
 * `error.message` keeps the same text).
 */
export class MissingModelsError extends Error {
  readonly httpStatus = 424;
  readonly missing: string[];
  readonly fix = {
    href: COMFY_MODELS_SETTINGS_HREF,
    label: 'Install in Settings → ComfyUI → Models',
  };

  constructor(message: string, missing: string[] = []) {
    super(message);
    this.name = 'MissingModelsError';
    this.missing = missing;
  }

  get responseExtra(): Record<string, unknown> {
    return { missing: this.missing, fix: this.fix };
  }
}

/** ComfyUI didn't answer at all before queueing (not running, or the address is wrong). */
export class ComfyUnreachableError extends Error {
  readonly httpStatus = 503;
  readonly url: string;

  constructor(url: string, cause?: unknown) {
    super(comfyUnreachableMessage(url), { cause });
    this.name = 'ComfyUnreachableError';
    this.url = url;
  }

  get responseExtra(): Record<string, unknown> {
    return {
      unreachable: 'comfyui',
      fix: { href: COMFY_CONNECTION_SETTINGS_HREF, label: 'Check Settings → ComfyUI → Connection' },
    };
  }
}

/**
 * Before queueing: the files a tool needs, by ComfyUI model folder. Throws MissingModelsError
 * naming what is missing (installable from Settings → ComfyUI → Models) — instead of ComfyUI's
 * "value not in list" after the upload. A ComfyUI that can't be reached throws
 * ComfyUnreachableError now, not "fetch failed" after the upload; one that answers but can't
 * list a folder (older ComfyUI, an HTTP error) is let through.
 */
export async function requireComfyModels(
  baseUrl: string,
  tool: string,
  needs: ReadonlyArray<{ folder: string; file: string }>,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const folders = [...new Set(needs.map(need => need.folder))];
  const listed = new Map<string, Set<string> | null>();
  let unreachable: unknown = null;
  await Promise.all(
    folders.map(async folder => {
      try {
        const response = await fetchImpl(`${baseUrl}/models/${encodeURIComponent(folder)}`, {
          signal: AbortSignal.timeout(8000),
        });
        const names = response.ok ? ((await response.json().catch(() => null)) as unknown) : null;
        listed.set(folder, Array.isArray(names) ? new Set(names.map(String)) : null);
      } catch (error) {
        // A slow answer (busy ComfyUI) is let through as before; no connection at all is not.
        if (isUnreachableError(error)) unreachable ??= error;
        listed.set(folder, null);
      }
    })
  );
  if (unreachable) throw new ComfyUnreachableError(baseUrl, unreachable);
  const missing = needs.filter(need => listed.get(need.folder)?.has(need.file) === false);
  if (missing.length) {
    const files = missing.map(need => need.file);
    throw new MissingModelsError(
      `${tool} needs ${files.join(', ')} in ComfyUI — install ${missing.length === 1 ? 'it' : 'them'} from Settings → ComfyUI → Models.`,
      files
    );
  }
}
