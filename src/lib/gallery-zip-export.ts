import { buildGallerySidecar } from './comfyui-gallery-export';
import { galleryEntryDownloadUrls, type ComfyGalleryEntry } from './comfyui-gallery';
import { mapWithConcurrency } from './concurrency';

/** Local ComfyUI host tolerates a handful of concurrent /view fetches (see comfyui-gallery-client.ts). */
const IMAGE_FETCH_CONCURRENCY = 6;

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc ^= data[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

export type ZipFileEntry = {
  filename: string;
  data: Uint8Array;
};

/** Tiny inline STORE-only (uncompressed) ZIP writer — no external dep required. */
export function buildZipBlob(files: ZipFileEntry[]): Blob {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.filename);
    const checksum = crc32(file.data);

    const localHeader = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(checksum),
      u32(file.data.length),
      u32(file.data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);

    localParts.push(localHeader, file.data);

    centralParts.push(
      concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(checksum),
        u32(file.data.length),
        u32(file.data.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ])
    );

    offset += localHeader.length + file.data.length;
  }

  const centralDirectory = concat(centralParts);
  const endRecord = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0),
  ]);

  return new Blob([...localParts, centralDirectory, endRecord] as BlobPart[], {
    type: 'application/zip',
  });
}

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
