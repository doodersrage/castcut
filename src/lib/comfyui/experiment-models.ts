export type ComfyExperimentModelFile = {
  name: string;
  pathIndex: number;
  size?: number;
  modified?: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseComfyExperimentModelFiles(raw: unknown): ComfyExperimentModelFile[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const files: ComfyExperimentModelFile[] = [];
  for (const item of raw) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!name) {
      continue;
    }
    const pathIndex =
      typeof record.pathIndex === 'number' && Number.isFinite(record.pathIndex)
        ? Math.max(0, Math.floor(record.pathIndex))
        : 0;
    files.push({
      name,
      pathIndex,
      ...(typeof record.size === 'number' && Number.isFinite(record.size)
        ? { size: record.size }
        : {}),
      ...(typeof record.modified === 'number' && Number.isFinite(record.modified)
        ? { modified: record.modified }
        : {}),
    });
  }
  return files;
}

export function sanitizeComfyModelPreviewFilename(filename: string): string | null {
  const trimmed = filename.trim().replace(/^\/+/, '');
  if (!trimmed || trimmed.includes('..') || trimmed.includes('\\')) {
    return null;
  }
  return trimmed;
}
