/**
 * Archive purgeable gallery entries to a ZIP, then remove them.
 * Protected entries (favorites, ≥4★, Cast look plates, look keepers) stay.
 */

import { loadCharacters } from './character-os';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import { downloadGalleryZipBundle } from './gallery-zip-export';
import { partitionGalleryForArchivePurge } from './gallery-protected-ids';

export type ArchiveThenPurgeResult = {
  archived: number;
  purged: number;
  kept: number;
  skipped: boolean;
  message: string;
};

export type GalleryZipDownload = (
  entries: ComfyGalleryEntry[],
  options?: { filename?: string }
) => Promise<{ entryCount: number; imageCount: number }>;

export async function archiveThenPurgeGalleryEntries(
  entries: ComfyGalleryEntry[],
  options: {
    removeEntries: (ids: string[]) => void;
    characters?: ReturnType<typeof loadCharacters>;
    filename?: string;
    downloadZip?: GalleryZipDownload;
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
      message:
        kept.length > 0
          ? `Nothing to purge — ${kept.length} keeper(s) / Cast look plate(s) stay.`
          : 'Gallery is empty.',
    };
  }

  const downloadZip = options.downloadZip ?? downloadGalleryZipBundle;
  const zip = await downloadZip(purgeable, {
    filename: options.filename?.trim() || `gallery-archive-purge-${Date.now()}.zip`,
  });

  const expectsImages = purgeable.some(
    entry => entry.status === 'completed' && (entry.images?.length ?? 0) > 0
  );
  if (zip.entryCount === 0 || (expectsImages && zip.imageCount === 0)) {
    return {
      archived: 0,
      purged: 0,
      kept: kept.length,
      skipped: true,
      message: expectsImages
        ? 'Archive failed (no images in ZIP) — nothing was deleted.'
        : 'Archive failed — nothing was deleted.',
    };
  }

  options.removeEntries(purgeable.map(entry => entry.id));

  return {
    archived: zip.entryCount,
    purged: purgeable.length,
    kept: kept.length,
    skipped: false,
    message: `Archived ${zip.entryCount} (${zip.imageCount} image${zip.imageCount === 1 ? '' : 's'}) then purged ${purgeable.length}; ${kept.length} kept (favorites, ratings, Cast look plates).`,
  };
}
