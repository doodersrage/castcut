/**
 * Shared STORE-only ZIP primitives (browser + Node).
 * Disk streaming lives in gallery-zip-stream.ts (server-only).
 */

export type ZipFileEntry = {
  filename: string;
  data: Uint8Array;
};

export function zipCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc ^= data[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function zipU16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

export function zipU32(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

/** Little-endian uint64 for ZIP64 extra / EOCD fields. */
export function zipU64(value: number): Uint8Array {
  const safe = Number.isFinite(value) && value > 0 ? value : 0;
  // Split into low/high 32-bit halves — JS bit ops are 32-bit.
  const low = safe % 0x100000000;
  const high = Math.floor(safe / 0x100000000);
  return zipConcat([zipU32(low >>> 0), zipU32(high >>> 0)]);
}

export function zipConcat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

/** Tiny inline STORE-only (uncompressed) ZIP writer — no external dep required. */
export function buildZipBlob(files: ZipFileEntry[]): Blob {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.filename);
    const checksum = zipCrc32(file.data);

    const localHeader = zipConcat([
      zipU32(0x04034b50),
      zipU16(20),
      zipU16(0),
      zipU16(0),
      zipU16(0),
      zipU16(0),
      zipU32(checksum),
      zipU32(file.data.length),
      zipU32(file.data.length),
      zipU16(nameBytes.length),
      zipU16(0),
      nameBytes,
    ]);

    localParts.push(localHeader, file.data);

    centralParts.push(
      zipConcat([
        zipU32(0x02014b50),
        zipU16(20),
        zipU16(20),
        zipU16(0),
        zipU16(0),
        zipU16(0),
        zipU16(0),
        zipU32(checksum),
        zipU32(file.data.length),
        zipU32(file.data.length),
        zipU16(nameBytes.length),
        zipU16(0),
        zipU16(0),
        zipU16(0),
        zipU16(0),
        zipU32(0),
        zipU32(offset),
        nameBytes,
      ])
    );

    offset += localHeader.length + file.data.length;
  }

  const centralDirectory = zipConcat(centralParts);
  const endRecord = zipConcat([
    zipU32(0x06054b50),
    zipU16(0),
    zipU16(0),
    zipU16(files.length),
    zipU16(files.length),
    zipU32(centralDirectory.length),
    zipU32(offset),
    zipU16(0),
  ]);

  return new Blob([...localParts, centralDirectory, endRecord] as BlobPart[], {
    type: 'application/zip',
  });
}
