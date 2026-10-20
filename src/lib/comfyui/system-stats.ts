export type ComfyUiVramStats = {
  free: number;
  total: number;
};

export type ComfyUiSystemStats = {
  vram?: ComfyUiVramStats;
  ram?: ComfyUiVramStats;
  version?: string;
  pythonVersion?: string;
  pytorchVersion?: string;
  deviceName?: string;
};

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return value;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function vramFromPair(free: unknown, total: unknown): ComfyUiVramStats | undefined {
  const parsedFree = asFiniteNumber(free);
  const parsedTotal = asFiniteNumber(total);
  if (parsedFree == null && parsedTotal == null) {
    return undefined;
  }
  return {
    free: parsedFree ?? 0,
    total: parsedTotal ?? parsedFree ?? 0,
  };
}

/**
 * ComfyUI `/system_stats` puts VRAM on `devices[]`. Older forks used
 * `system.vram`. Accept both so health and pool scoring keep working.
 */
export function parseComfyUiSystemStats(raw: unknown): ComfyUiSystemStats {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const record = raw as Record<string, unknown>;
  const system =
    record.system && typeof record.system === 'object' && !Array.isArray(record.system)
      ? (record.system as Record<string, unknown>)
      : undefined;

  const devices = Array.isArray(record.devices) ? record.devices : [];
  const primary =
    devices.find(device => device && typeof device === 'object' && !Array.isArray(device)) ??
    undefined;
  const device = primary as Record<string, unknown> | undefined;

  const vram =
    vramFromPair(device?.vram_free, device?.vram_total) ??
    vramFromPair(
      system?.vram && typeof system.vram === 'object'
        ? (system.vram as { free?: unknown }).free
        : undefined,
      system?.vram && typeof system.vram === 'object'
        ? (system.vram as { total?: unknown }).total
        : undefined
    );

  const ram = vramFromPair(system?.ram_free, system?.ram_total);
  const version = asNonEmptyString(system?.comfyui_version);
  const pythonVersion = asNonEmptyString(system?.python_version)?.split('\n')[0];
  const pytorchVersion = asNonEmptyString(system?.pytorch_version);
  const deviceName = asNonEmptyString(device?.name);

  return {
    ...(vram ? { vram } : {}),
    ...(ram ? { ram } : {}),
    ...(version ? { version } : {}),
    ...(pythonVersion ? { pythonVersion } : {}),
    ...(pytorchVersion ? { pytorchVersion } : {}),
    ...(deviceName ? { deviceName } : {}),
  };
}
