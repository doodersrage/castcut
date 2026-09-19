import { buildGallerySidecar } from './comfyui-gallery-export';
import { galleryEntryDownloadUrls, type ComfyGalleryEntry } from './comfyui-gallery';
import { mapWithConcurrency } from './concurrency';
import { buildZipBlob, type ZipFileEntry } from './gallery-zip-core';

export type { ZipFileEntry } from './gallery-zip-core';
export { buildZipBlob } from './gallery-zip-core';

/** Local ComfyUI host tolerates a handful of concurrent /view fetches (see comfyui-gallery-client.ts). */
const IMAGE_FETCH_CONCURRENCY = 6;

export async function downloadGalleryZipBundle(
  entries: ComfyGalleryEntry[],
  options?: { filename?: string }
): Promise<{ entryCount: number; imageCount: number }> {
  // Per-entry sidecar.json is synchronous; only the /view image fetch is
  // async, so mapWithConcurrency parallelizes just that instead of
  // serializing every entry's fetch behind the last one (was a plain
  // sequential for-loop — noticeable on a multi-entry bulk export).
  const perEntryFiles = await mapWithConcurrency(
    entries,
    IMAGE_FETCH_CONCURRENCY,
    async (entry, index) => {
      const prefix = `entry-${index + 1}-${entry.promptId.slice(0, 8)}`;
      const entryFiles: ZipFileEntry[] = [
        {
          filename: `${prefix}/sidecar.json`,
          data: new TextEncoder().encode(JSON.stringify(buildGallerySidecar(entry), null, 2)),
        },
      ];

      const downloads = galleryEntryDownloadUrls(entry);
      for (let imageIndex = 0; imageIndex < entry.images.length; imageIndex += 1) {
        const image = entry.images[imageIndex];
        const viewUrl = downloads.url[imageIndex];
        if (entry.status !== 'completed' || !image || !viewUrl) {
          continue;
        }
        try {
          const response = await fetch(viewUrl);
          if (response.ok) {
            entryFiles.push({
              filename: `${prefix}/${image.filename || `output-${imageIndex + 1}`}`,
              data: new Uint8Array(await response.arrayBuffer()),
            });
          }
        } catch {
          // sidecar still exported
        }
      }

      return entryFiles;
    }
  );
  const files: ZipFileEntry[] = perEntryFiles.flat();

  if (files.length === 0) {
    return { entryCount: 0, imageCount: 0 };
  }

  const imageCount = files.filter(file => !file.filename.endsWith('/sidecar.json')).length;

  const blob = buildZipBlob(files);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = options?.filename?.trim() || `gallery-export-${Date.now()}.zip`;
  // Keep the object URL alive long enough for the browser to start the download.
  // Revoking immediately after click() cancels many large ZIP saves.
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { entryCount: entries.length, imageCount };
}
