export type ComfyUiFeatureFlags = {
  previewMetadata: boolean;
  labels: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const INTERESTING_TRUE_FLAGS = [
  'supports_preview_metadata',
  'supports_manager',
  'supports_manager_v3',
  'supports_manager_v4',
  'supports_asset_api',
  'supports_progress_text_metadata',
];

/** Parse ComfyUI `GET /features` into a short health summary. */
export function parseComfyUiFeatures(raw: unknown): ComfyUiFeatureFlags {
  const record = asRecord(raw) ?? {};
  const labels: string[] = [];
  let previewMetadata = false;

  for (const [key, value] of Object.entries(record)) {
    if (value !== true) {
      continue;
    }
    if (key === 'supports_preview_metadata') {
      previewMetadata = true;
    }
    if (INTERESTING_TRUE_FLAGS.includes(key)) {
      labels.push(key.replace(/^supports_/, '').replace(/_/g, ' '));
    }
  }

  return { previewMetadata, labels };
}

export function countComfyExtensionPacks(paths: unknown): number {
  if (!Array.isArray(paths)) {
    return 0;
  }
  const packs = new Set<string>();
  for (const path of paths) {
    if (typeof path !== 'string') {
      continue;
    }
    const match = path.match(/\/extensions\/([^/]+)\//);
    if (match?.[1]) {
      packs.add(decodeURIComponent(match[1]));
    }
  }
  return packs.size;
}

export function readStringNameList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map(item => item.trim())
        .filter(Boolean)
    ),
  ];
}
