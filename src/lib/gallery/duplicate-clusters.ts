import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import { findDuplicatePrompts } from '../prompt/duplicate-detection';

export type GalleryDuplicateCluster = {
  ids: string[];
  similarity: number;
  prompt: string;
  keeperId: string;
  dropIds: string[];
};

function keeperScore(entry: ComfyGalleryEntry): number {
  return (
    (entry.favorite ? 100 : 0) + (entry.reviewRating ?? 0) * 10 + (entry.aestheticScore ?? 0) / 100
  );
}

export function clusterGalleryDuplicates(
  entries: ComfyGalleryEntry[],
  threshold = 0.85
): GalleryDuplicateCluster[] {
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  return findDuplicatePrompts(entries, threshold).map(group => {
    const members = group.ids
      .map(id => byId.get(id))
      .filter((entry): entry is ComfyGalleryEntry => Boolean(entry));
    const keeper =
      [...members].sort((a, b) => keeperScore(b) - keeperScore(a) || b.queuedAt - a.queuedAt)[0] ??
      members[0];
    const keeperId = keeper?.id ?? group.ids[0]!;
    return {
      ...group,
      keeperId,
      dropIds: group.ids.filter(id => id !== keeperId),
    };
  });
}

export function duplicateEntryIds(clusters: GalleryDuplicateCluster[]): Set<string> {
  const ids = new Set<string>();
  for (const cluster of clusters) {
    for (const id of cluster.ids) {
      ids.add(id);
    }
  }
  return ids;
}

export function duplicateDropIds(clusters: GalleryDuplicateCluster[]): string[] {
  return clusters.flatMap(cluster => cluster.dropIds);
}
