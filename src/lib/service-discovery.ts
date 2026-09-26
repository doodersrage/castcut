/**
 * "Find my services": when the saved ComfyUI / LLM address doesn't answer, try the usual local
 * spots — ComfyUI's default port, the ComfyUI Desktop app's port, Docker's host alias; Ollama
 * and LM Studio for the LLM. Only addresses the server may already reach are tried (the same
 * COMFYUI_ALLOWED_HOSTS rules as a queue). Nothing is saved here.
 */

import { normalizeComfyPoolUrlList } from './comfyui-pool';
import { checkComfyUiHealth } from './service-health';
import { normalizeSafeHttpUrl } from './url-safety';

export { sameServiceAddress } from './service-address';

export type FoundComfyUi = { url: string; label: string; deviceName?: string };
export type FoundLlm = { baseUrl: string; label: string; models: number };

export const COMFY_CANDIDATES: ReadonlyArray<{ url: string; label: string }> = [
  { url: 'http://127.0.0.1:8188', label: 'ComfyUI (default port 8188)' },
  { url: 'http://127.0.0.1:8000', label: 'ComfyUI Desktop app (port 8000)' },
  { url: 'http://host.docker.internal:8188', label: 'ComfyUI on the Docker host (8188)' },
  { url: 'http://host.docker.internal:8000', label: 'ComfyUI Desktop on the Docker host (8000)' },
];

export const LLM_CANDIDATES: ReadonlyArray<{ baseUrl: string; label: string }> = [
  { baseUrl: 'http://127.0.0.1:11434/v1', label: 'Ollama' },
  { baseUrl: 'http://127.0.0.1:1234/v1', label: 'LM Studio' },
  { baseUrl: 'http://host.docker.internal:11434/v1', label: 'Ollama on the Docker host' },
  { baseUrl: 'http://host.docker.internal:1234/v1', label: 'LM Studio on the Docker host' },
];

const PROBE_TIMEOUT_MS = 1_500;

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), PROBE_TIMEOUT_MS)),
  ]);
}

/** ComfyUI candidates the allowlist permits (a blocked host is never contacted). */
export function allowedComfyCandidates(): Array<{ url: string; label: string }> {
  return COMFY_CANDIDATES.flatMap(candidate => {
    const [url] = normalizeComfyPoolUrlList([candidate.url]);
    return url ? [{ url, label: candidate.label }] : [];
  });
}

export async function discoverComfyUi(): Promise<FoundComfyUi[]> {
  const results = await Promise.all(
    allowedComfyCandidates().map(async candidate => {
      const health = await withTimeout(checkComfyUiHealth({ apiUrl: candidate.url }), {
        ok: false,
        url: candidate.url,
      });
      return health.ok
        ? {
            url: candidate.url,
            label: candidate.label,
            ...('deviceName' in health && health.deviceName
              ? { deviceName: health.deviceName }
              : {}),
          }
        : null;
    })
  );
  return results.filter((found): found is FoundComfyUi => Boolean(found));
}

export async function discoverLlm(): Promise<FoundLlm[]> {
  const results = await Promise.all(
    LLM_CANDIDATES.map(async candidate => {
      let base: string;
      try {
        base = normalizeSafeHttpUrl(candidate.baseUrl, { allowPrivate: true });
      } catch {
        return null;
      }
      const models = await withTimeout(
        fetch(`${base.replace(/\/$/, '')}/models`, {
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
          redirect: 'manual',
        }).then(async response => {
          if (!response.ok) return null;
          const data = (await response.json().catch(() => null)) as { data?: unknown[] } | null;
          return Array.isArray(data?.data) ? data!.data!.length : 0;
        }),
        null as number | null
      );
      return models == null ? null : { baseUrl: candidate.baseUrl, label: candidate.label, models };
    })
  );
  return results.filter((found): found is FoundLlm => Boolean(found));
}
