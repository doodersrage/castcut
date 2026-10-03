import type { ComfyManagerPackSpec } from './comfyui-custom-node-registry';
import {
  detectComfyManager,
  runManagerInstall,
  waitForManagerQueueIdle,
  type ComfyManagerInfo,
  type ManagerInstallTarget,
} from './comfyui-manager-api';
import {
  parseComfyManagerMappings,
  parseComfyManagerNodeList,
  resolvePacksForMissingNodeTypes,
} from './comfyui-manager-mappings';

const API_PREFIXES = ['/api', ''] as const;

export type ComfyUiManagerInstallResult = {
  ok: boolean;
  installed: string[];
  unresolved: string[];
  restartNeeded: boolean;
  missingManager?: boolean;
  error?: string;
};

async function firstOkJson(
  origin: string,
  path: string,
  fetchImpl: typeof fetch
): Promise<unknown | null> {
  for (const prefix of API_PREFIXES) {
    try {
      const response = await fetchImpl(`${origin}${prefix}${path}`, {
        method: 'GET',
        signal: AbortSignal.timeout(20_000),
        redirect: 'manual',
      });
      if (response?.ok) {
        return await response.json().catch(() => null);
      }
    } catch {
      // next prefix
    }
  }
  return null;
}

/**
 * How the Manager should install `pack`: a registry pack by id (latest), a Manager-list Git pack
 * as version "unknown" with its URL, a pack nobody lists by Git URL.
 */
export function managerInstallTargetForPack(pack: ComfyManagerPackSpec): ManagerInstallTarget {
  if (pack.gitUrlOnly && pack.files[0]) {
    return { kind: 'git-url', url: pack.files[0] };
  }
  const id = pack.id || pack.name;
  if (pack.version === 'unknown' || pack.version === 'nightly') {
    return { kind: 'listed', id, files: pack.files };
  }
  return { kind: 'registry', id };
}

/**
 * Resolve missing node class types to Manager packs, queue install, and wait.
 * Caller should reboot ComfyUI after a successful install.
 */
export async function installComfyUiMissingNodePacks(input: {
  baseUrl: string;
  classTypes: string[];
  fetchImpl?: typeof fetch;
  /** Manager queue wait (tests shorten it). */
  waitOptions?: { timeoutMs?: number; intervalMs?: number };
}): Promise<ComfyUiManagerInstallResult> {
  const origin = input.baseUrl.replace(/\/+$/, '');
  const fetchImpl = input.fetchImpl ?? fetch;
  const classTypes = [...new Set(input.classTypes.map(type => type.trim()).filter(Boolean))];
  if (classTypes.length === 0) {
    return { ok: true, installed: [], unresolved: [], restartNeeded: false };
  }

  const manager: ComfyManagerInfo | null = await detectComfyManager(origin, fetchImpl);
  if (!manager) {
    return {
      ok: false,
      installed: [],
      unresolved: classTypes,
      restartNeeded: false,
      missingManager: true,
      error: 'ComfyUI-Manager is not available on this host.',
    };
  }

  const v = manager.api === 'v2' ? '/v2' : '';
  const mappingsRaw = await firstOkJson(
    origin,
    `${v}/customnode/getmappings?mode=local`,
    fetchImpl
  );
  const listRaw = await firstOkJson(
    origin,
    `${v}/customnode/getlist?mode=local&skip_update=true`,
    fetchImpl
  );

  const resolved = resolvePacksForMissingNodeTypes({
    classTypes,
    mappings: parseComfyManagerMappings(mappingsRaw),
    catalog: parseComfyManagerNodeList(listRaw),
  });

  if (resolved.packs.length === 0) {
    return {
      ok: resolved.unresolved.length === 0,
      installed: [],
      unresolved: resolved.unresolved,
      restartNeeded: false,
      error:
        resolved.unresolved.length > 0
          ? `No Manager pack found for: ${resolved.unresolved.join(', ')}`
          : undefined,
    };
  }

  const installed: string[] = [];
  const errors: string[] = [];
  let queuedAny = false;
  for (const pack of resolved.packs) {
    const result = await runManagerInstall({
      origin,
      info: manager,
      target: managerInstallTargetForPack(pack),
      fetchImpl,
      uiId: pack.id || pack.name,
      wait: false,
    });
    if (result.ok) {
      installed.push(pack.title || pack.name);
      queuedAny ||= result.queued;
    } else if (!errors.includes(result.error.message)) {
      errors.push(result.error.message);
    }
  }

  if (installed.length === 0) {
    return {
      ok: false,
      installed: [],
      unresolved: resolved.unresolved,
      restartNeeded: false,
      error: errors[0] ?? 'ComfyUI-Manager refused the install.',
    };
  }

  if (queuedAny) {
    await waitForManagerQueueIdle(origin, manager, fetchImpl, input.waitOptions);
  }

  return {
    ok: true,
    installed,
    unresolved: resolved.unresolved,
    restartNeeded: true,
    ...(errors.length > 0 ? { error: errors.join(' ') } : {}),
  };
}
