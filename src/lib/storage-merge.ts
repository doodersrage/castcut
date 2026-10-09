export type LoaderMapDiffSample = {
  mapKey: string;
  entryKey: string;
  localValue: string;
  serverValue: string;
};

export type StorageNamespaceConflict = {
  namespace: string;
  localUpdatedAt?: number;
  serverUpdatedAt?: number;
  localCount?: number;
  serverCount?: number;
  /** Loader-map keys that differ between local and server (settings-cache). */
  mapDiffKeys?: string[];
  /** Short before/after samples for diverging map entries. */
  mapDiffSamples?: LoaderMapDiffSample[];
  detail?: string;
};

export const SETTINGS_LOADER_MAP_KEYS = [
  'modelCheckpointMap',
  'modelVaeMap',
  'modelRefinerMap',
  'modelUpscaleMap',
  'modelLoraMap',
  'modelControlNetMap',
  'modelWorkflowMap',
  'modelSamplerMemory',
  'sessionActiveLoraIdsByModel',
] as const;

export type SettingsLoaderMapKey = (typeof SETTINGS_LOADER_MAP_KEYS)[number];

/** Compare shared loader / LoRA maps and return keys where membership or values diverge. */
export function detectLoaderMapDivergence(
  localShared: Record<string, unknown> | undefined,
  serverShared: Record<string, unknown> | undefined
): string[] {
  const diffs: string[] = [];
  for (const key of SETTINGS_LOADER_MAP_KEYS) {
    const localMap = (localShared?.[key] ?? {}) as Record<string, unknown>;
    const serverMap = (serverShared?.[key] ?? {}) as Record<string, unknown>;
    const localKeys = Object.keys(localMap).sort();
    const serverKeys = Object.keys(serverMap).sort();
    if (localKeys.length === 0 && serverKeys.length === 0) {
      continue;
    }
    if (localKeys.join('\0') !== serverKeys.join('\0')) {
      diffs.push(key);
      continue;
    }
    const diverges = localKeys.some(mapKey => {
      try {
        return JSON.stringify(localMap[mapKey]) !== JSON.stringify(serverMap[mapKey]);
      } catch {
        return localMap[mapKey] !== serverMap[mapKey];
      }
    });
    if (diverges) {
      diffs.push(key);
    }
  }
  return diffs;
}

function formatMapSampleValue(value: unknown): string {
  if (value == null) {
    return '—';
  }
  if (typeof value === 'string') {
    return value.length > 48 ? `${value.slice(0, 45)}…` : value;
  }
  try {
    const json = JSON.stringify(value);
    return json.length > 48 ? `${json.slice(0, 45)}…` : json;
  } catch {
    return String(value);
  }
}

/** Collect up to `limit` concrete entry diffs across diverging loader maps. */
export function buildLoaderMapDiffSamples(
  localShared: Record<string, unknown> | undefined,
  serverShared: Record<string, unknown> | undefined,
  mapKeys: string[],
  limit = 4
): LoaderMapDiffSample[] {
  const samples: LoaderMapDiffSample[] = [];
  for (const mapKey of mapKeys) {
    if (samples.length >= limit) {
      break;
    }
    const localMap = (localShared?.[mapKey] ?? {}) as Record<string, unknown>;
    const serverMap = (serverShared?.[mapKey] ?? {}) as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(localMap), ...Object.keys(serverMap)])].sort();
    for (const entryKey of keys) {
      if (samples.length >= limit) {
        break;
      }
      const localValue = formatMapSampleValue(localMap[entryKey]);
      const serverValue = formatMapSampleValue(serverMap[entryKey]);
      if (localValue === serverValue) {
        continue;
      }
      samples.push({ mapKey, entryKey, localValue, serverValue });
    }
  }
  return samples;
}

export type MergeChoice = 'local' | 'server' | 'merge';

/** Ignore routine skew from in-flight auto-push / clock jitter. */
const CONFLICT_SKEW_MS = 60_000;

export function suggestMergeChoice(
  conflict: Pick<StorageNamespaceConflict, 'localCount' | 'serverCount'>
): MergeChoice {
  const localCount = conflict.localCount ?? 0;
  const serverCount = conflict.serverCount ?? 0;
  if (localCount <= 0 && serverCount > 0) {
    return 'server';
  }
  if (serverCount <= 0 && localCount > 0) {
    return 'local';
  }
  return 'merge';
}

export function detectStorageConflicts(input: {
  namespaces: Array<{
    namespace: string;
    local?: { updatedAt?: number; count?: number } | null;
    server?: { updatedAt?: number; count?: number } | null;
  }>;
}): StorageNamespaceConflict[] {
  const conflicts: StorageNamespaceConflict[] = [];
  for (const entry of input.namespaces) {
    const local = entry.local;
    const server = entry.server;
    const localCount = local?.count ?? 0;
    const serverCount = server?.count ?? 0;
    const localTime = local?.updatedAt ?? 0;
    const serverTime = server?.updatedAt ?? 0;

    // Nothing on either side.
    if (localCount <= 0 && serverCount <= 0 && localTime <= 0 && serverTime <= 0) {
      continue;
    }

    // One side empty / missing — real sync needed, but auto-reconcile can handle it.
    if (localCount <= 0 || serverCount <= 0) {
      if (localCount !== serverCount || Math.abs(localTime - serverTime) > CONFLICT_SKEW_MS) {
        conflicts.push({
          namespace: entry.namespace,
          localUpdatedAt: local?.updatedAt,
          serverUpdatedAt: server?.updatedAt,
          localCount: local?.count,
          serverCount: server?.count,
        });
      }
      continue;
    }

    // Both sides have data (counts > 0); still guard nulls for the typechecker.
    if (local && server && Math.abs(localTime - serverTime) > CONFLICT_SKEW_MS) {
      conflicts.push({
        namespace: entry.namespace,
        localUpdatedAt: localTime,
        serverUpdatedAt: serverTime,
        localCount: local.count,
        serverCount: server.count,
      });
    }
  }
  return conflicts;
}

export function mergeArraysById<T extends { id: string }>(
  local: T[],
  server: T[],
  pick: (localItem: T, serverItem: T) => T
): T[] {
  const map = new Map<string, T>();
  for (const item of server) {
    map.set(item.id, item);
  }
  for (const item of local) {
    const existing = map.get(item.id);
    map.set(item.id, existing ? pick(item, existing) : item);
  }
  // Prompt history stamps `timestamp`; other records `updatedAt`.
  const timeOf = (item: T) =>
    (item as { updatedAt?: number }).updatedAt ?? (item as { timestamp?: number }).timestamp ?? 0;
  return [...map.values()].sort((a, b) => timeOf(b) - timeOf(a));
}

export const SERVER_SESSION_STACK_KEYS = [
  'model',
  'sessionActiveLoraIds',
  'sessionActiveLoraIdsByModel',
  'sessionLoraStrengthOverrides',
  'sessionLoraStrengthOverridesByModel',
  'sessionEmbeddingTokens',
  'queueQualityProfile',
  'ipAdapterImageFilename',
  'ipAdapterImageFilenames',
  'ipAdapterImageUrl',
  'ipAdapterStrength',
  'ipAdapterModelFilename',
  'identityKind',
  'ipAdapterComfyUrl',
] as const;

export function localSessionStackLooksEmpty(shared?: Record<string, unknown>): boolean {
  const byModel = shared?.sessionActiveLoraIdsByModel as Record<string, unknown> | undefined;
  const hasLoras = Boolean(
    byModel && Object.values(byModel).some(value => Array.isArray(value) && value.length > 0)
  );
  const current = shared?.sessionActiveLoraIds;
  const hasCurrentLoras = Array.isArray(current) && current.length > 0;
  const hasEmbeds =
    Array.isArray(shared?.sessionEmbeddingTokens) && shared.sessionEmbeddingTokens.length > 0;
  const hasIdentity =
    typeof shared?.ipAdapterImageFilename === 'string' &&
    Boolean(shared.ipAdapterImageFilename.trim());
  return !hasLoras && !hasCurrentLoras && !hasEmbeds && !hasIdentity;
}

/** Copy server Generate-session stack fields onto local shared settings. */
export function applyServerSessionStack<T extends { shared?: Record<string, unknown> }>(
  local: T,
  server: { shared?: Record<string, unknown> }
): T {
  const serverShared = server.shared ?? {};
  const localShared = local.shared ?? {};
  const nextShared = { ...localShared };
  for (const key of SERVER_SESSION_STACK_KEYS) {
    if (serverShared[key] !== undefined) {
      nextShared[key] = serverShared[key];
    }
  }
  return { ...local, shared: nextShared };
}

export function mergeSettingsCache<
  T extends {
    updatedAt?: number;
    shared?: Record<string, unknown>;
    tools?: object;
    installedPlugins?: Array<{ id: string; updatedAt?: number } & Record<string, unknown>>;
  },
>(local: T, server: T): T {
  const localTime = local.updatedAt ?? 0;
  const serverTime = server.updatedAt ?? 0;
  const preferLocal = localTime >= serverTime;
  const winner = preferLocal ? local : server;
  const loser = preferLocal ? server : local;
  const localPlugins = Array.isArray(local.installedPlugins) ? local.installedPlugins : [];
  const serverPlugins = Array.isArray(server.installedPlugins) ? server.installedPlugins : [];
  const installedPlugins =
    localPlugins.length > 0 || serverPlugins.length > 0
      ? mergeArraysById(localPlugins, serverPlugins, (a, b) =>
          (a.updatedAt ?? 0) >= (b.updatedAt ?? 0) ? a : b
        )
      : winner.installedPlugins;

  // Union both sides' loader-map keys (a slimmed-down side isn't a real deletion — it may just
  // be a locally-trimmed IDB copy), but for a key present on BOTH sides, defer to whichever side
  // `winner`/`loser` (the timestamp comparison above) already picked as newer — previously this
  // unconditionally took the local value for any overlapping key regardless of which side was
  // actually more recent, so a stale local edit could silently clobber a newer server change and
  // then get written back as if it were correct.
  const mergeMapField = (key: string): Record<string, unknown> | undefined => {
    const localMap = (local.shared?.[key] ?? {}) as Record<string, unknown>;
    const serverMap = (server.shared?.[key] ?? {}) as Record<string, unknown>;
    if (Object.keys(localMap).length === 0 && Object.keys(serverMap).length === 0) {
      return undefined;
    }
    const winnerMap = (preferLocal ? localMap : serverMap) ?? {};
    const loserMap = (preferLocal ? serverMap : localMap) ?? {};
    return { ...loserMap, ...winnerMap };
  };

  const sharedMaps: Record<string, unknown> = {};
  for (const key of SETTINGS_LOADER_MAP_KEYS) {
    const merged = mergeMapField(key);
    if (merged) {
      sharedMaps[key] = merged;
    }
  }

  return {
    ...loser,
    ...winner,
    updatedAt: Math.max(localTime, serverTime) || undefined,
    shared: {
      ...(loser.shared ?? {}),
      ...(winner.shared ?? {}),
      ...sharedMaps,
    },
    tools: {
      ...(loser.tools ?? {}),
      ...(winner.tools ?? {}),
    },
    ...(installedPlugins ? { installedPlugins } : {}),
  } as T;
}
