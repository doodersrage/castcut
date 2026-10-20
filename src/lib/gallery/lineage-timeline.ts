import { buildGalleryParamDiff, type GalleryParamDiffRow } from './param-diff';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

export type GalleryLineageTimelineStep = {
  entry: ComfyGalleryEntry;
  diffs: GalleryParamDiffRow[];
};

/** Parent → each derivative param/prompt deltas for lineage blocks. */
export function buildGalleryLineageTimeline(
  root: ComfyGalleryEntry,
  derivatives: ComfyGalleryEntry[]
): GalleryLineageTimelineStep[] {
  const chronological = [...derivatives].sort(
    (a, b) => (a.completedAt ?? a.queuedAt) - (b.completedAt ?? b.queuedAt)
  );
  return chronological.map(entry => ({
    entry,
    diffs: buildGalleryParamDiff([root, entry]).filter(row => row.differs),
  }));
}
