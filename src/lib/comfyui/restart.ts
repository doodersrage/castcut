/**
 * Manager V3 (`/manager/reboot`, POST with a non-form Content-Type since its CSRF fix; GET on old
 * builds) and Manager V4 (`/v2/manager/reboot`). See comfyui-manager-api.ts.
 */
export const COMFYUI_MANAGER_RESTART_ATTEMPTS = [
  { path: '/api/manager/reboot', method: 'POST' as const },
  { path: '/api/v2/manager/reboot', method: 'POST' as const },
  { path: '/api/manager/reboot', method: 'GET' as const },
  { path: '/manager/reboot', method: 'POST' as const },
  { path: '/v2/manager/reboot', method: 'POST' as const },
  { path: '/manager/reboot', method: 'GET' as const },
];

export const COMFYUI_RESTART_UNAVAILABLE =
  'ComfyUI has no restart API on this host. Install ComfyUI-Manager (reboot) or restart the ComfyUI process, then refresh LoRA inventory.';

export const COMFYUI_RESTART_FORBIDDEN =
  "ComfyUI-Manager's security level does not allow a restart from the app (it needs security_level normal or lower in the Manager's config.ini). Restart ComfyUI by hand.";

export type ComfyUiRestartResult =
  { ok: true; via: string } | { ok: false; error: string; missingManager?: boolean };

/** The Manager re-execs ComfyUI, so the reboot request itself often dies mid-answer. */
function isRestartInProgressError(error: unknown): boolean {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 3; depth += 1) {
    if (current instanceof Error) {
      parts.push(current.message, (current as { code?: string }).code ?? '');
      current = (current as { cause?: unknown }).cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return /econnreset|socket hang up|other side closed|UND_ERR_SOCKET/i.test(parts.join(' '));
}

/**
 * Ask ComfyUI-Manager to reboot. Vanilla ComfyUI has no restart endpoint.
 */
export async function requestComfyUiRestart(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<ComfyUiRestartResult> {
  const origin = baseUrl.replace(/\/+$/, '');
  let any404 = false;
  let lastNetworkError: string | undefined;

  for (const attempt of COMFYUI_MANAGER_RESTART_ATTEMPTS) {
    const url = `${origin}${attempt.path}`;
    try {
      const response = await fetchImpl(url, {
        method: attempt.method,
        headers: attempt.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        signal: AbortSignal.timeout(8_000),
      });
      try {
        await response.arrayBuffer();
      } catch {
        // ignore body drain
      }
      if (response.ok || response.status === 202) {
        return { ok: true, via: attempt.path };
      }
      if (response.status === 404 || response.status === 405) {
        if (response.status === 404) {
          any404 = true;
        }
        continue;
      }
      if (response.status === 403) {
        return { ok: false, error: COMFYUI_RESTART_FORBIDDEN };
      }
      if (response.status === 401) {
        return {
          ok: false,
          error: `ComfyUI-Manager restart requires auth (HTTP ${response.status}).`,
        };
      }
      return { ok: false, error: `ComfyUI restart failed: HTTP ${response.status}` };
    } catch (error) {
      if (isRestartInProgressError(error)) {
        return { ok: true, via: attempt.path };
      }
      lastNetworkError = error instanceof Error ? error.message : 'ComfyUI restart failed.';
    }
  }

  if (lastNetworkError && !any404) {
    return { ok: false, error: lastNetworkError };
  }
  return { ok: false, missingManager: true, error: COMFYUI_RESTART_UNAVAILABLE };
}
