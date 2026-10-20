export type ComfySafetensorsMetadata = Record<string, string>;

const TRIGGER_KEYS = [
  'modelspec.trigger_phrase',
  'modelspec.tags',
  'ss_output_name',
  'modelspec.title',
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function addTagCount(counts: Map<string, number>, tag: string, count: unknown): void {
  const name = tag.trim();
  if (!name) {
    return;
  }
  const n = typeof count === 'number' && Number.isFinite(count) ? count : 0;
  counts.set(name, (counts.get(name) ?? 0) + n);
}

function flattenTagFrequency(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const record = asRecord(parsed);
    if (!record) {
      return [];
    }
    const counts = new Map<string, number>();
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === 'number') {
        addTagCount(counts, key, value);
        continue;
      }
      const nested = asRecord(value);
      if (!nested) {
        continue;
      }
      for (const [tag, count] of Object.entries(nested)) {
        addTagCount(counts, tag, count);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag]) => tag);
  } catch {
    return [];
  }
}

/** Pull a short trigger / tag line from a safetensors `__metadata__` header. */
export function extractSafetensorsTriggerPhrase(metadata: unknown): string {
  const record = asRecord(metadata);
  if (!record) {
    return '';
  }
  const strings: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string' && value.trim()) {
      strings[key] = value.trim();
    }
  }

  const direct =
    strings['modelspec.trigger_phrase'] ??
    strings['modelspec.tags'] ??
    strings['ss_output_name'] ??
    strings['modelspec.title'];
  if (direct && !direct.startsWith('{')) {
    return direct.replace(/,/g, ', ').replace(/\s+/g, ' ').trim();
  }

  const frequency = strings.ss_tag_frequency;
  if (frequency) {
    const tags = flattenTagFrequency(frequency);
    if (tags.length > 0) {
      return tags.join(', ');
    }
  }

  for (const key of TRIGGER_KEYS) {
    const value = strings[key];
    if (value && !value.startsWith('{')) {
      return value;
    }
  }
  return '';
}

export type { ComfySafetensorsMetadata as ComfyViewMetadata };
