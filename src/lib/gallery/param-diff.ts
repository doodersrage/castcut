import type { ComfyGalleryEntry } from './comfyui-gallery';

export type GalleryParamDiffKey = 'model' | 'tool' | 'seed' | 'cfg' | 'steps' | 'width' | 'height';

export type GalleryParamDiffRow = {
  key: GalleryParamDiffKey;
  label: string;
  values: string[];
  differs: boolean;
};

const PARAM_KEYS: { key: GalleryParamDiffKey; label: string }[] = [
  { key: 'model', label: 'Model' },
  { key: 'tool', label: 'Tool' },
  { key: 'seed', label: 'Seed' },
  { key: 'cfg', label: 'CFG' },
  { key: 'steps', label: 'Steps' },
  { key: 'width', label: 'Width' },
  { key: 'height', label: 'Height' },
];

function readParam(entry: ComfyGalleryEntry, key: GalleryParamDiffKey): string {
  switch (key) {
    case 'model':
      return entry.model?.trim() || '—';
    case 'tool':
      return entry.tool?.trim() || '—';
    case 'seed':
      return entry.queueParams?.seed != null ? String(entry.queueParams.seed) : '—';
    case 'cfg':
      return entry.queueParams?.cfg != null ? String(entry.queueParams.cfg) : '—';
    case 'steps':
      return entry.queueParams?.steps != null ? String(entry.queueParams.steps) : '—';
    case 'width':
      return entry.queueParams?.width != null ? String(entry.queueParams.width) : '—';
    case 'height':
      return entry.queueParams?.height != null ? String(entry.queueParams.height) : '—';
  }
}

/** Structured param rows across entries; `differs` highlights axes that are not uniform. */
export function buildGalleryParamDiff(entries: ComfyGalleryEntry[]): GalleryParamDiffRow[] {
  if (entries.length === 0) {
    return [];
  }
  return PARAM_KEYS.map(({ key, label }) => {
    const values = entries.map(entry => readParam(entry, key));
    const unique = new Set(values);
    return {
      key,
      label,
      values,
      differs: unique.size > 1,
    };
  });
}

/** Compact chip labels for experiment cluster headers (only differing axes). */
export function formatExperimentParamDiffChips(entries: ComfyGalleryEntry[]): string[] {
  return buildGalleryParamDiff(entries)
    .filter(row => row.differs && row.key !== 'tool')
    .map(row => {
      const unique = [...new Set(row.values)].filter(value => value !== '—');
      if (unique.length === 0) {
        return `${row.label}: mixed`;
      }
      return `${row.label}: ${unique.slice(0, 4).join(' / ')}${unique.length > 4 ? '…' : ''}`;
    });
}
