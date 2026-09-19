/**
 * Archive purgeable gallery entries to ZIP(s), then remove them.
 * Protected entries (favorites, ≥4★, Cast look plates, look keepers) stay.
 *
 * Large galleries are split into batches so we never hold thousands of
 * full-resolution images in one in-memory ZIP (that OOMs / reloads the tab).
 */

import { loadCharacters } from './character-os';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import { downloadGalleryZipBundle } from './gallery-zip-export';
import { partitionGalleryForArchivePurge } from './gallery-protected-ids';

/** Entries per ZIP — keeps peak memory roughly proportional to a few dozen stills. */
export const ARCHIVE_PURGE_BATCH_SIZE = 40;

export type ArchiveThenPurgeResult = {
  archived: number;
  purged: number;
  kept: number;
  skipped: boolean;
  zipCount: number;
  message: string;
};

export type GalleryZipDownload = (
  entries: ComfyGalleryEntry[],
  options?: { filename?: string }
) => Promise<{ entryCount: number; imageCount: number }>;

export type ArchiveThenPurgeProgress = {
  phase: 'zip' | 'purge';
  batchIndex: number;
  batchCount: number;
  archivedSoFar: number;
  purgeableTotal: number;
};

function chunkEntries<T>(entries: T[], size: number): T[][] {
  if (size <= 0 || entries.length === 0) {
    return entries.length ? [entries] : [];
  }
  const batches: T[][] = [];
  for (let index = 0; index < entries.length; index += size) {
    batches.push(entries.slice(index, index + size));
  }
  return batches;
}

export async function archiveThenPurgeGalleryEntries(
  entries: ComfyGalleryEntry[],
  options: {
    removeEntries: (ids: string[]) => void;
    characters?: ReturnType<typeof loadCharacters>;
    filename?: string;
    downloadZip?: GalleryZipDownload;
    batchSize?: number;
    onProgress?: (progress: ArchiveThenPurgeProgress) => void;
  }
): Promise<ArchiveThenPurgeResult> {
  const characters = options.characters ?? loadCharacters();
  const { protected: kept, purgeable } = partitionGalleryForArchivePurge(entries, characters);

  if (purgeable.length === 0) {
    return {
      archived: 0,
      purged: 0,
      kept: kept.length,
      skipped: true,
      zipCount: 0,
      message:
        kept.length > 0
          ? `Nothing to purge — ${kept.length} keeper(s) / Cast look plate(s) stay.`
          : 'Gallery is empty.',
    };
  }

  const downloadZip = options.downloadZip ?? downloadGalleryZipBundle;
  const batchSize = options.batchSize ?? ARCHIVE_PURGE_BATCH_SIZE;
  const batches = chunkEntries(purgeable, batchSize);
  const stamp = Date.now();
  const baseName =
    options.filename?.trim().replace(/\.zip$/i, '') || `gallery-archive-purge-${stamp}`;

  let archived = 0;
  let imageCount = 0;
  let zipCount = 0;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    options.onProgress?.({
      phase: 'zip',
      batchIndex: batchIndex + 1,
      batchCount: batches.length,
      archivedSoFar: archived,
      purgeableTotal: purgeable.length,
    });

    const filename =
      batches.length === 1
        ? `${baseName}.zip`
        : `${baseName}-part${batchIndex + 1}-of-${batches.length}.zip`;

    const zip = await downloadZip(batch, { filename });
    const expectsImages = batch.some(
      entry => entry.status === 'completed' && (entry.images?.length ?? 0) > 0
    );
    if (zip.entryCount === 0 || (expectsImages && zip.imageCount === 0)) {
      return {
        archived,
        purged: 0,
        kept: kept.length,
        skipped: true,
        zipCount,
        message:
          archived > 0
            ? `Archive stopped after ${zipCount} ZIP(s) (${archived} entries) — batch ${batchIndex + 1} had no images, so nothing was deleted.`
            : expectsImages
              ? 'Archive failed (no images in ZIP) — nothing was deleted.'
              : 'Archive failed — nothing was deleted.',
      };
    }

    archived += zip.entryCount;
    imageCount += zip.imageCount;
    zipCount += 1;
  }

  options.onProgress?.({
    phase: 'purge',
    batchIndex: batches.length,
    batchCount: batches.length,
    archivedSoFar: archived,
    purgeableTotal: purgeable.length,
  });

  options.removeEntries(purgeable.map(entry => entry.id));

  const zipLabel = zipCount === 1 ? '1 ZIP' : `${zipCount} ZIPs`;
  return {
    archived,
    purged: purgeable.length,
    kept: kept.length,
    skipped: false,
    zipCount,
    message: `Archived ${archived} (${imageCount} image${imageCount === 1 ? '' : 's'} in ${zipLabel}) then purged ${purgeable.length}; ${kept.length} kept (favorites, ratings, Cast look plates).`,
  };
}
