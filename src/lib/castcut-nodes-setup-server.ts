/**
 * Server side of Settings → ComfyUI → Castcut nodes: read what ComfyUI has, install through
 * ComfyUI-Manager. Read-only GETs except the install itself.
 */

import { CASTCUT_NODE_TYPES } from './castcut-nodes';
import {
  CASTCUT_NODES_GIT_URL,
  CASTCUT_NODES_REGISTRY_ID,
  castcutNodesStatusFromObjectInfo,
  inferComfyUiLayout,
  parseComfyUiSystemStats,
  type CastcutNodesStatus,
  type ComfyUiSystemInfo,
  type ObjectInfoNodeEntry,
} from './castcut-nodes-setup';
import {
  detectComfyManager,
  managerRegistryHasPack,
  runManagerInstall,
  type ComfyManagerInfo,
  type ManagerInstallErrorCode,
  type ManagerInstallTarget,
} from './comfyui-manager-api';

type FetchLike = typeof fetch;

export type CastcutNodesReport = {
  /** False when ComfyUI did not answer object_info. */
  reachable: boolean;
  status: CastcutNodesStatus | null;
  manager: Pick<ComfyManagerInfo, 'version' | 'api'> | null;
  /** ComfyUI's own render queue (restart waits for it). */
  queue: { running: number; pending: number } | null;
  system: ComfyUiSystemInfo | null;
};

async function getJson(
  url: string,
  fetchImpl: FetchLike,
  timeoutMs = 8_000
): Promise<{ ok: boolean; data: unknown }> {
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return { ok: false, data: null };
    return { ok: true, data: await response.json().catch(() => null) };
  } catch {
    return { ok: false, data: null };
  }
}

export function countComfyQueue(raw: unknown): { running: number; pending: number } | null {
  const record = raw as { queue_running?: unknown; queue_pending?: unknown } | null;
  if (!record || typeof record !== 'object') return null;
  return {
    running: Array.isArray(record.queue_running) ? record.queue_running.length : 0,
    pending: Array.isArray(record.queue_pending) ? record.queue_pending.length : 0,
  };
}

export async function readCastcutNodesReport(
  baseUrl: string,
  fetchImpl: FetchLike = fetch
): Promise<CastcutNodesReport> {
  const origin = baseUrl.replace(/\/+$/, '');
  const [nodeAnswers, stats, queue, manager] = await Promise.all([
    Promise.all(
      CASTCUT_NODE_TYPES.map(async type => {
        const answer = await getJson(`${origin}/object_info/${type}`, fetchImpl);
        const entry = (answer.data as Record<string, ObjectInfoNodeEntry> | null)?.[type] ?? null;
        return { type, ok: answer.ok, entry };
      })
    ),
    getJson(`${origin}/system_stats`, fetchImpl),
    getJson(`${origin}/queue`, fetchImpl),
    detectComfyManager(origin, fetchImpl).catch(() => null),
  ]);
  const reachable = nodeAnswers.some(answer => answer.ok);
  return {
    reachable,
    status: reachable
      ? castcutNodesStatusFromObjectInfo(
          Object.fromEntries(nodeAnswers.map(answer => [answer.type, answer.entry]))
        )
      : null,
    manager: manager ? { version: manager.version, api: manager.api } : null,
    queue: queue.ok ? countComfyQueue(queue.data) : null,
    system: stats.ok ? parseComfyUiSystemStats(stats.data) : null,
  };
}

export type CastcutNodesInstallResult =
  | { ok: true; via: ManagerInstallTarget['kind']; finished: boolean; message: string }
  | { ok: false; code: ManagerInstallErrorCode | 'no_manager'; message: string };

/**
 * Install the pack with ComfyUI-Manager: by registry id when the Manager lists it, by Git URL
 * until then. ComfyUI must restart afterwards to load it.
 */
export async function installCastcutNodesWithManager(
  baseUrl: string,
  fetchImpl: FetchLike = fetch
): Promise<CastcutNodesInstallResult> {
  const origin = baseUrl.replace(/\/+$/, '');
  const manager = await detectComfyManager(origin, fetchImpl);
  if (!manager) {
    return {
      ok: false,
      code: 'no_manager',
      message: 'ComfyUI-Manager is not installed on this ComfyUI — copy the file instead (below).',
    };
  }
  const stats = await getJson(`${origin}/system_stats`, fetchImpl);
  const layout = inferComfyUiLayout(stats.ok ? parseComfyUiSystemStats(stats.data) : null);
  const published = await managerRegistryHasPack(
    origin,
    manager,
    CASTCUT_NODES_REGISTRY_ID,
    fetchImpl
  );
  const target: ManagerInstallTarget =
    published || (published === null && manager.api === 'v2')
      ? { kind: 'registry', id: CASTCUT_NODES_REGISTRY_ID }
      : { kind: 'git-url', url: CASTCUT_NODES_GIT_URL };
  const result = await runManagerInstall({
    origin,
    info: manager,
    target,
    fetchImpl,
    uiId: CASTCUT_NODES_REGISTRY_ID,
    userDir: layout.userDir,
    waitOptions: { timeoutMs: 150_000 },
  });
  if (!result.ok) {
    return { ok: false, code: result.error.code, message: result.error.message };
  }
  return {
    ok: true,
    via: target.kind,
    finished: result.finished,
    message: result.finished
      ? 'Installed. Restart ComfyUI to load the nodes.'
      : 'ComfyUI-Manager is still installing — give it a minute, then restart ComfyUI.',
  };
}
