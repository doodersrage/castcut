/**
 * Minimal ZIP reader for Comfy pack archives (stored + deflate entries).
 * Uses the Web DecompressionStream API (browser + Node 22+).
 */

export type ZipReadEntry = {
  filename: string;
  text: string;
};

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('Deflate ZIP entries need DecompressionStream (Node 22+ / modern browsers).');
  }
  // Copy into a plain ArrayBuffer-backed view — some runtimes reject SharedArrayBuffer slices.
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

function decodeText(data: Uint8Array): string {
  return new TextDecoder('utf-8').decode(data);
}

/**
 * Extract text files from a ZIP ArrayBuffer. Skips directories and non-utf8 failures.
 * Only local-file headers are walked (no zip64).
 */
export async function readZipTextEntries(buffer: ArrayBuffer): Promise<ZipReadEntry[]> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const entries: ZipReadEntry[] = [];
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    const signature = readU32(view, offset);
    if (signature !== 0x04034b50) {
      break;
    }

    const compression = readU16(view, offset + 8);
    const compressedSize = readU32(view, offset + 18);
    const fileNameLength = readU16(view, offset + 26);
    const extraLength = readU16(view, offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;
    const dataStart = nameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd > bytes.length) {
      break;
    }

    const filename = decodeText(bytes.subarray(nameStart, nameEnd));
    offset = dataEnd;

    if (filename.endsWith('/')) {
      continue;
    }

    const payload = bytes.subarray(dataStart, dataEnd);
    let raw: Uint8Array;
    if (compression === 0) {
      raw = payload;
    } else if (compression === 8) {
      try {
        raw = await inflateRaw(payload);
      } catch {
        continue;
      }
    } else {
      continue;
    }

    try {
      entries.push({ filename, text: decodeText(raw) });
    } catch {
      // binary asset inside pack — ignore
    }
  }

  return entries;
}

export function isZipFileName(name: string): boolean {
  return /\.zip$/i.test(name.trim());
}

export function isWorkflowJsonFileName(name: string): boolean {
  const base = name.split('/').pop() ?? name;
  if (!/\.json$/i.test(base)) {
    return false;
  }
  // Skip common non-workflow JSON often shipped in packs.
  if (/package\.json|tsconfig|composer\.lock|manifest\.json/i.test(base)) {
    return false;
  }
  return true;
}

export type ZipBinaryEntry = {
  filename: string;
  data: Uint8Array;
};

/** Every file in a ZIP as bytes (stored + deflate; no zip64) — for packs that carry images. */
export async function readZipBinaryEntries(buffer: ArrayBuffer): Promise<ZipBinaryEntry[]> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const entries: ZipBinaryEntry[] = [];
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    if (readU32(view, offset) !== 0x04034b50) break;
    const compression = readU16(view, offset + 8);
    const compressedSize = readU32(view, offset + 18);
    const nameStart = offset + 30;
    const nameEnd = nameStart + readU16(view, offset + 26);
    const dataStart = nameEnd + readU16(view, offset + 28);
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) break;
    const filename = decodeText(bytes.subarray(nameStart, nameEnd));
    offset = dataEnd;
    if (filename.endsWith('/')) continue;
    const payload = bytes.subarray(dataStart, dataEnd);
    if (compression === 0) {
      entries.push({ filename, data: payload.slice() });
    } else if (compression === 8) {
      try {
        entries.push({ filename, data: await inflateRaw(payload) });
      } catch {
        // unreadable entry — skipped
      }
    }
  }
  return entries;
}
