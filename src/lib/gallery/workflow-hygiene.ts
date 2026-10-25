import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

/** Default: keep stored exact-replay graphs for 30 days. 0 = keep forever. */
export const DEFAULT_GALLERY_WORKFLOW_RETENTION_DAYS = 30;

/** Default total budget for stored workflow JSON across the gallery (~8 MiB). 0 = no budget. */
export const DEFAULT_GALLERY_WORKFLOW_MAX_BYTES = 8 * 1024 * 1024;

export function normalizeGalleryWorkflowRetentionDays(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_GALLERY_WORKFLOW_RETENTION_DAYS;
  }
  return Math.min(365, Math.max(0, Math.round(value)));
}

export function normalizeGalleryWorkflowMaxBytes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_GALLERY_WORKFLOW_MAX_BYTES;
  }
  // Allow 0 (unlimited) up to 64 MiB.
  return Math.min(64 * 1024 * 1024, Math.max(0, Math.round(value)));
}

function stripWorkflowJson(entry: ComfyGalleryEntry): ComfyGalleryEntry {
  if (!entry.workflowJson) {
    return entry;
  }
  const rest = { ...entry };
  delete rest.workflowJson;
  return {
    ...rest,
    hasStoredWorkflow: false,
    workflowJsonOmitted: true,
  };
}

export function galleryWorkflowJsonBytes(entry: Pick<ComfyGalleryEntry, 'workflowJson'>): number {
  const json = entry.workflowJson;
  if (!json) {
    return 0;
  }
  // UTF-16 code units ≈ storage weight for IDB string payloads.
  return json.length * 2;
}

/**
 * Strip stored workflow JSON from entries older than retentionDays (0 = no-op). Entries in
 * `keepIds` — the ones the production uses (reference-sources.ts) — keep theirs.
 */
export function pruneStaleGalleryWorkflowJson(
  entries: ComfyGalleryEntry[],
  retentionDays: number,
  now = Date.now(),
  keepIds?: ReadonlySet<string>
): { entries: ComfyGalleryEntry[]; pruned: number } {
  const days = normalizeGalleryWorkflowRetentionDays(retentionDays);
  if (days <= 0) {
    return { entries, pruned: 0 };
  }
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  let pruned = 0;
  const next = entries.map(entry => {
    if (!entry.workflowJson?.trim()) {
      return entry;
    }
    const stamp = entry.completedAt ?? entry.queuedAt;
    if (stamp >= cutoff || keepIds?.has(entry.id)) {
      return entry;
    }
    pruned += 1;
    return stripWorkflowJson(entry);
  });
  return { entries: next, pruned };
}

/**
 * Drop oldest stored graphs until total workflow JSON bytes fit under maxBytes.
 * 0 = unlimited. Favorites are pruned last. Entries in `keepIds` (the production uses them)
 * neither count against the budget nor lose their graph; `totalBytes` is what the budget counts.
 */
export function enforceGalleryWorkflowByteBudget(
  entries: ComfyGalleryEntry[],
  maxBytes: number,
  keepIds?: ReadonlySet<string>
): { entries: ComfyGalleryEntry[]; pruned: number; totalBytes: number } {
  const budget = normalizeGalleryWorkflowMaxBytes(maxBytes);
  const counted = (entry: ComfyGalleryEntry) =>
    keepIds?.has(entry.id) ? 0 : galleryWorkflowJsonBytes(entry);
  if (budget <= 0) {
    const totalBytes = entries.reduce((sum, entry) => sum + counted(entry), 0);
    return { entries, pruned: 0, totalBytes };
  }

  let totalBytes = entries.reduce((sum, entry) => sum + counted(entry), 0);
  if (totalBytes <= budget) {
    return { entries, pruned: 0, totalBytes };
  }

  const next = entries.map(entry => ({ ...entry }));
  const candidates = next
    .map((entry, index) => ({ entry, index, bytes: counted(entry) }))
    .filter(item => item.bytes > 0)
    .sort((a, b) => {
      const aFav = a.entry.favorite ? 1 : 0;
      const bFav = b.entry.favorite ? 1 : 0;
      if (aFav !== bFav) {
        return aFav - bFav;
      }
      const aStamp = a.entry.completedAt ?? a.entry.queuedAt;
      const bStamp = b.entry.completedAt ?? b.entry.queuedAt;
      return aStamp - bStamp;
    });

  let pruned = 0;
  for (const candidate of candidates) {
    if (totalBytes <= budget) {
      break;
    }
    next[candidate.index] = stripWorkflowJson(candidate.entry);
    totalBytes -= candidate.bytes;
    pruned += 1;
  }

  return { entries: next, pruned, totalBytes };
}

/** Export copy without heavy workflow graphs (ZIP/sidecar bundles stay lean). */
export function stripGalleryWorkflowJsonForExport(entry: ComfyGalleryEntry): ComfyGalleryEntry {
  if (!entry.workflowJson) {
    return entry;
  }
  const rest = { ...entry };
  delete rest.workflowJson;
  return {
    ...rest,
    hasStoredWorkflow: Boolean(entry.hasStoredWorkflow || entry.workflowJson),
  };
}
