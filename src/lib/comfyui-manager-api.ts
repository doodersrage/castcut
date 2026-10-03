/**
 * ComfyUI-Manager's install API, by Manager generation (server only — it talks to ComfyUI).
 *
 * Read from the Manager source (glob/manager_server.py):
 *
 * - **V3.x** (`custom_nodes/comfyui-manager`, routes under `/manager/*` and `/customnode/*`, also
 *   under `/api/...`). `POST /manager/queue/install` reads `version`, `selected_version`,
 *   `channel` and `mode` straight from the body (a missing one is a KeyError → HTTP 500):
 *   - Comfy Registry pack: `version` ≠ `"unknown"`, `selected_version` `"latest"` (or a version)
 *     → risk "low", allowed at security_level normal.
 *   - Manager-list pack that isn't in the registry: `version: "unknown"`, `files: [git url]` → the
 *     URL must be in the Manager's custom-node list, or it is risk "high" (HTTP 404 "A security
 *     error has occurred") — and the queue worker looks the pack up in that list anyway.
 *   - Any other Git URL: `POST /customnode/install/git_url` (`{"url"}` JSON since about V3.41,
 *     the bare URL as text before). Since V3.41 it needs `allow_git_url_install = true` in
 *     config.ini AND ComfyUI listening on loopback, else 403 `{"error":"allow_git_url_install"}`;
 *     before, security_level `weak` / `normal-`.
 *   - `POST /manager/queue/start`, `GET /manager/queue/status`, `POST /manager/reboot` (no body;
 *     a form Content-Type is refused, JSON is fine), `GET /manager/version` → "V3.41".
 *   - 403 bodies: `{"error":"security_level"}`, `{"error":"comfyui_outdated"}`, or plain text.
 * - **V4.x** (`comfyui_manager` pip package, ComfyUI `--enable-manager`; every route under `/v2`):
 *   `POST /v2/manager/queue/task` `{ui_id, client_id, kind: "install", params: {id, version,
 *   selected_version, mode, channel}}` then `POST /v2/manager/queue/start`; registry ids only.
 *   With `--enable-manager-legacy-ui` the legacy server answers instead: `POST
 *   /v2/manager/queue/batch` `{install: [<V3 body>]}` (starts the queue itself) and
 *   `POST /v2/customnode/install/git_url` with the URL as text. Reboot: `POST /v2/manager/reboot`.
 */

export type ComfyManagerApi = 'v1' | 'v2';

export type ComfyManagerInfo = {
  /** As the Manager reports it, e.g. "V3.41". */
  version: string;
  major: number;
  minor: number;
  patch: number;
  /** v1: `/manager/*` + `/customnode/*` (Manager 2.x / 3.x); v2: `/v2/...` (Manager 4.x). */
  api: ComfyManagerApi;
};

export type ManagerInstallTarget =
  /** A Comfy Registry (CNR) pack id. */
  | { kind: 'registry'; id: string; version?: string }
  /** A pack in the Manager's custom-node list that isn't in the registry (version "unknown"). */
  | { kind: 'listed'; id: string; files: string[] }
  /** Any Git repository. */
  | { kind: 'git-url'; url: string };

export type ManagerRequest = {
  /** Path without the `/api` prefix; the caller tries `/api<path>` then `<path>`. */
  path: string;
  body: string;
  contentType: 'application/json' | 'text/plain';
};

export type ManagerInstallPlan = {
  steps: ManagerRequest[];
  /** True when the steps only queue the install (wait for the Manager's queue to drain). */
  queued: boolean;
};

export type ManagerInstallErrorCode =
  | 'security_level'
  | 'git_url_disabled'
  | 'comfyui_outdated'
  | 'not_supported'
  | 'bad_request'
  | 'unreachable'
  | 'http';

export type ManagerInstallError = { code: ManagerInstallErrorCode; message: string };

const DEFAULT_CHANNEL = 'default';
const DEFAULT_MODE = 'cache';

export function parseComfyManagerVersion(
  text: string,
  api: ComfyManagerApi
): ComfyManagerInfo | null {
  const match = /^\s*V?(\d+)\.(\d+)(?:\.(\d+))?/i.exec(text ?? '');
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3] ?? 0);
  return {
    version: text.trim().split(/\s/)[0] ?? text.trim(),
    major,
    minor,
    patch,
    api,
  };
}

function atLeast(info: ComfyManagerInfo, major: number, minor: number): boolean {
  return info.major > major || (info.major === major && info.minor >= minor);
}

/** V3.41+ reads the Git URL route's body as JSON `{url}`; older V3 read the bare URL. */
export function managerGitUrlBodyIsJson(info: ComfyManagerInfo): boolean {
  return info.api === 'v1' && atLeast(info, 3, 41);
}

function basenameOfUrl(url: string): string {
  const trimmed = url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
  return trimmed.slice(trimmed.lastIndexOf('/') + 1) || trimmed;
}

/** The V3 (and V4 legacy batch) `queue/install` body. */
export function buildManagerQueueInstallBody(
  target: Exclude<ManagerInstallTarget, { kind: 'git-url' }>,
  options: { uiId: string; channel?: string; mode?: string }
): Record<string, unknown> {
  const channel = options.channel || DEFAULT_CHANNEL;
  const mode = options.mode || DEFAULT_MODE;
  if (target.kind === 'registry') {
    return {
      id: target.id,
      version: target.version || 'latest',
      selected_version: target.version || 'latest',
      channel,
      mode,
      ui_id: options.uiId,
      skip_post_install: false,
    };
  }
  return {
    id: target.id,
    version: 'unknown',
    selected_version: 'unknown',
    files: target.files,
    channel,
    mode,
    ui_id: options.uiId,
    skip_post_install: false,
  };
}

/** The V4 `queue/task` body (registry ids and listed packs; V4 has no Git-URL task). */
export function buildManagerQueueTaskBody(
  target: Exclude<ManagerInstallTarget, { kind: 'git-url' }>,
  options: { uiId: string; clientId?: string; channel?: string; mode?: string }
): Record<string, unknown> {
  const version = target.kind === 'registry' ? target.version || 'latest' : ('unknown' as const);
  return {
    ui_id: options.uiId,
    client_id: options.clientId || 'castcut',
    kind: 'install',
    params: {
      id: target.kind === 'listed' ? basenameOfUrl(target.files[0] ?? target.id) : target.id,
      version,
      selected_version: version,
      mode: options.mode || DEFAULT_MODE,
      channel: options.channel || DEFAULT_CHANNEL,
    },
  };
}

function json(path: string, body: unknown): ManagerRequest {
  return { path, body: JSON.stringify(body), contentType: 'application/json' };
}

/**
 * The requests that install `target` on this Manager. V4 gets the `queue/task` plan; call again
 * with `v2Variant: 'batch'` when that route is missing (legacy UI).
 */
export function buildManagerInstallPlan(
  info: ComfyManagerInfo,
  target: ManagerInstallTarget,
  options: {
    uiId: string;
    clientId?: string;
    channel?: string;
    mode?: string;
    v2Variant?: 'task' | 'batch';
  }
): ManagerInstallPlan {
  if (target.kind === 'git-url') {
    if (info.api === 'v2') {
      return {
        steps: [
          { path: '/v2/customnode/install/git_url', body: target.url, contentType: 'text/plain' },
        ],
        queued: false,
      };
    }
    return {
      steps: [
        managerGitUrlBodyIsJson(info)
          ? json('/customnode/install/git_url', { url: target.url })
          : { path: '/customnode/install/git_url', body: target.url, contentType: 'text/plain' },
      ],
      queued: false,
    };
  }
  if (info.api === 'v2') {
    if (options.v2Variant === 'batch') {
      return {
        steps: [
          json('/v2/manager/queue/batch', {
            install: [buildManagerQueueInstallBody(target, options)],
          }),
        ],
        queued: true,
      };
    }
    return {
      steps: [
        json('/v2/manager/queue/task', buildManagerQueueTaskBody(target, options)),
        json('/v2/manager/queue/start', {}),
      ],
      queued: true,
    };
  }
  return {
    steps: [
      json('/manager/queue/install', buildManagerQueueInstallBody(target, options)),
      json('/manager/queue/start', {}),
    ],
    queued: true,
  };
}

export function managerQueueStatusPath(info: ComfyManagerInfo): string {
  return info.api === 'v2' ? '/v2/manager/queue/status' : '/manager/queue/status';
}

export function managerRebootPath(info: ComfyManagerInfo): string {
  return info.api === 'v2' ? '/v2/manager/reboot' : '/manager/reboot';
}

/** Registry versions of a pack (`[]` when it isn't published). */
export function managerRegistryVersionsPath(info: ComfyManagerInfo, id: string): string {
  return `${info.api === 'v2' ? '/v2' : ''}/customnode/versions/${encodeURIComponent(id)}`;
}

/**
 * Where the Manager keeps config.ini: `<user>/__manager/` on a ComfyUI with the system-user API
 * (2025+); `<user>/default/ComfyUI-Manager/` on older ComfyUI.
 */
export function managerConfigPathHint(userDir?: string | null): string {
  const base = userDir?.trim().replace(/[\\/]+$/, '') || 'ComfyUI/user';
  const sep = base.includes('\\') && !base.includes('/') ? '\\' : '/';
  return `${base}${sep}__manager${sep}config.ini`;
}

function parseErrorToken(bodyText: string): string | null {
  try {
    const parsed = JSON.parse(bodyText) as { error?: unknown };
    return typeof parsed?.error === 'string' ? parsed.error : null;
  } catch {
    return null;
  }
}

/** A refused install request, in plain words with the fix. */
export function explainManagerInstallFailure(input: {
  status: number;
  bodyText?: string;
  target: ManagerInstallTarget;
  /** ComfyUI's user folder, to name config.ini's path. */
  userDir?: string | null;
}): ManagerInstallError {
  const bodyText = input.bodyText ?? '';
  const token = parseErrorToken(bodyText);
  const config = managerConfigPathHint(input.userDir);
  const gitUrlFix =
    `ComfyUI-Manager installs from a Git URL only when \`allow_git_url_install = true\` is set ` +
    `under [default] in ${config} and ComfyUI listens on this machine only (127.0.0.1 — not ` +
    `--listen 0.0.0.0). Set it, restart ComfyUI and try again — or copy the one file by hand ` +
    `(below), which needs no Manager settings.`;
  const securityFix =
    `ComfyUI-Manager's security level blocks installs from outside its own window. Set ` +
    `\`security_level = normal\` under [default] in ${config} (older ComfyUI: ` +
    `user/default/ComfyUI-Manager/config.ini), restart ComfyUI and try again — or copy the one ` +
    `file by hand (below).`;

  if (input.status === 403) {
    if (token === 'allow_git_url_install') return { code: 'git_url_disabled', message: gitUrlFix };
    if (token === 'comfyui_outdated') {
      return {
        code: 'comfyui_outdated',
        message:
          'ComfyUI-Manager says this ComfyUI is too old for it. Update ComfyUI, or copy the one file by hand (below).',
      };
    }
    if (token === 'security_level' || input.target.kind !== 'git-url') {
      return { code: 'security_level', message: securityFix };
    }
    // V4 legacy git_url answers a bare 403.
    return { code: 'git_url_disabled', message: gitUrlFix };
  }
  if (input.status === 404) {
    if (/security/i.test(bodyText)) {
      // queue/install: a URL outside the Manager's list is risk "high".
      return input.target.kind === 'registry'
        ? { code: 'security_level', message: securityFix }
        : { code: 'git_url_disabled', message: gitUrlFix };
    }
    return {
      code: 'not_supported',
      message:
        input.target.kind === 'git-url'
          ? 'This ComfyUI-Manager has no Git-URL install (Manager 4 without its legacy UI). Copy the one file by hand (below).'
          : 'This ComfyUI-Manager has no install route the app knows. Update ComfyUI-Manager, or copy the one file by hand (below).',
    };
  }
  if (input.status === 400) {
    const detail = bodyText.trim().slice(0, 300);
    return {
      code: 'bad_request',
      message: `ComfyUI-Manager could not install it${detail ? `: ${detail}` : ''}. Its terminal log has the details; copying the one file by hand (below) always works.`,
    };
  }
  if (input.status === 0) {
    return { code: 'unreachable', message: 'ComfyUI did not answer. Is it running?' };
  }
  return {
    code: 'http',
    message: `ComfyUI-Manager answered HTTP ${input.status}${bodyText.trim() ? `: ${bodyText.trim().slice(0, 200)}` : ''}.`,
  };
}

const API_PREFIXES = ['/api', ''] as const;

type FetchLike = typeof fetch;

/** POST to `/api<path>`, then `<path>` when the first is missing. Status 0 = no answer. */
export async function managerPost(
  origin: string,
  request: ManagerRequest,
  fetchImpl: FetchLike,
  timeoutMs = 120_000
): Promise<{ status: number; bodyText: string; path: string }> {
  let last = { status: 0, bodyText: '', path: request.path };
  for (const prefix of API_PREFIXES) {
    const path = `${prefix}${request.path}`;
    try {
      const response = await fetchImpl(`${origin}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': request.contentType },
        body: request.body,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'manual',
      });
      const bodyText = await response.text().catch(() => '');
      last = { status: response.status, bodyText, path };
      if (response.status !== 404 || /security/i.test(bodyText)) {
        return last;
      }
    } catch {
      // try the next prefix
    }
  }
  return last;
}

async function managerGetText(
  origin: string,
  path: string,
  fetchImpl: FetchLike,
  timeoutMs = 8_000
): Promise<{ ok: boolean; status: number; text: string }> {
  for (const prefix of API_PREFIXES) {
    try {
      const response = await fetchImpl(`${origin}${prefix}${path}`, {
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'manual',
      });
      const text = await response.text().catch(() => '');
      if (response.ok) return { ok: true, status: response.status, text };
      if (response.status !== 404) return { ok: false, status: response.status, text };
    } catch {
      // next prefix
    }
  }
  return { ok: false, status: 404, text: '' };
}

/** Which ComfyUI-Manager answers on this ComfyUI, if any. */
export async function detectComfyManager(
  origin: string,
  fetchImpl: FetchLike = fetch
): Promise<ComfyManagerInfo | null> {
  const v2 = await managerGetText(origin, '/v2/manager/version', fetchImpl);
  if (v2.ok) {
    const info = parseComfyManagerVersion(v2.text, 'v2');
    if (info) return info;
  }
  const v1 = await managerGetText(origin, '/manager/version', fetchImpl);
  if (v1.ok) {
    return parseComfyManagerVersion(v1.text, 'v1');
  }
  return null;
}

/**
 * Is `id` published in the Comfy Registry (as this Manager sees it)? Null when this Manager has no
 * versions route (Manager 4 without its legacy UI).
 */
export async function managerRegistryHasPack(
  origin: string,
  info: ComfyManagerInfo,
  id: string,
  fetchImpl: FetchLike = fetch
): Promise<boolean | null> {
  const response = await managerGetText(
    origin,
    managerRegistryVersionsPath(info, id),
    fetchImpl,
    20_000
  );
  if (response.status === 404) return null;
  if (!response.ok) return false;
  try {
    const parsed = JSON.parse(response.text) as unknown;
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

function managerQueueIdle(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const record = raw as {
    is_processing?: boolean;
    total_count?: number;
    done_count?: number;
    in_progress_count?: number;
    pending_count?: number;
  };
  if (record.is_processing === true) return false;
  if ((record.in_progress_count ?? 0) > 0 || (record.pending_count ?? 0) > 0) return false;
  const total = record.total_count ?? 0;
  const done = record.done_count ?? 0;
  return total === 0 || done >= total;
}

export async function waitForManagerQueueIdle(
  origin: string,
  info: ComfyManagerInfo,
  fetchImpl: FetchLike = fetch,
  options?: { timeoutMs?: number; intervalMs?: number }
): Promise<boolean> {
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const intervalMs = options?.intervalMs ?? 2_000;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await managerGetText(origin, managerQueueStatusPath(info), fetchImpl);
    if (status.ok) {
      try {
        if (managerQueueIdle(JSON.parse(status.text))) return true;
      } catch {
        // keep polling
      }
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return false;
}

export type ManagerInstallRunResult =
  { ok: true; queued: boolean; finished: boolean } | { ok: false; error: ManagerInstallError };

/** Send the plan; V4 falls back from `queue/task` to the legacy `queue/batch`. */
export async function runManagerInstall(input: {
  origin: string;
  info: ComfyManagerInfo;
  target: ManagerInstallTarget;
  fetchImpl?: FetchLike;
  uiId?: string;
  channel?: string;
  mode?: string;
  userDir?: string | null;
  /** Wait for a queued install to finish (default true). */
  wait?: boolean;
  waitOptions?: { timeoutMs?: number; intervalMs?: number };
}): Promise<ManagerInstallRunResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const uiId = input.uiId ?? `castcut-${Date.now().toString(36)}`;
  const variants: Array<'task' | 'batch'> =
    input.info.api === 'v2' && input.target.kind !== 'git-url' ? ['task', 'batch'] : ['task'];

  for (let index = 0; index < variants.length; index += 1) {
    const plan = buildManagerInstallPlan(input.info, input.target, {
      uiId,
      channel: input.channel,
      mode: input.mode,
      v2Variant: variants[index],
    });
    let failure: { status: number; bodyText: string } | null = null;
    for (const step of plan.steps) {
      let result = await managerPost(input.origin, step, fetchImpl);
      // V3 before/after 3.41 disagree on the Git-URL body: retry the other shape once.
      if (result.status === 400 && input.target.kind === 'git-url' && input.info.api === 'v1') {
        const other: ManagerRequest =
          step.contentType === 'application/json'
            ? { ...step, body: input.target.url, contentType: 'text/plain' }
            : {
                ...step,
                body: JSON.stringify({ url: input.target.url }),
                contentType: 'application/json',
              };
        const retry = await managerPost(input.origin, other, fetchImpl);
        if (retry.status >= 200 && retry.status < 300) result = retry;
      }
      if (result.status < 200 || result.status >= 300) {
        failure = result;
        break;
      }
    }
    if (failure) {
      const lastVariant = index === variants.length - 1;
      if (!lastVariant && failure.status === 404 && !/security/i.test(failure.bodyText)) {
        continue;
      }
      return {
        ok: false,
        error: explainManagerInstallFailure({
          status: failure.status,
          bodyText: failure.bodyText,
          target: input.target,
          userDir: input.userDir,
        }),
      };
    }
    if (!plan.queued || input.wait === false) {
      return { ok: true, queued: plan.queued, finished: !plan.queued };
    }
    const finished = await waitForManagerQueueIdle(
      input.origin,
      input.info,
      fetchImpl,
      input.waitOptions
    );
    return { ok: true, queued: true, finished };
  }
  return {
    ok: false,
    error: {
      code: 'not_supported',
      message: 'ComfyUI-Manager has no install route the app knows.',
    },
  };
}
