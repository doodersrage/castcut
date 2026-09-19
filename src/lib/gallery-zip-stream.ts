import 'server-only';

/**
 * Stream a STORE-only ZIP to disk from on-disk file paths.
 * Peak memory is O(one file), not O(archive).
 * Uses ZIP64 when offsets/sizes/entry counts exceed classic ZIP32 limits
 * (required for archives larger than ~4 GiB).
 *
 * Yields the event loop between batches so status HTTP polls stay responsive.
 */

import fs from 'node:fs';
import path from 'node:path';
import { zipConcat, zipCrc32, zipU16, zipU32, zipU64 } from './gallery-zip-core';

export type ZipDiskEntry = {
  /** Path inside the ZIP (forward slashes). */
  archivePath: string;
  /** Absolute path on disk. */
  diskPath: string;
};

export type ZipStreamProgress = {
  processed: number;
  total: number;
  bytesWritten: number;
};

const ZIP32_MAX = 0xffffffff;
const ZIP16_MAX = 0xffff;
/** Yield after this many files so Next can serve GET status. */
const YIELD_EVERY = 8;

function yieldEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

function crc32File(diskPath: string): { checksum: number; size: number } {
  const fd = fs.openSync(diskPath, 'r');
  try {
    const stat = fs.fstatSync(fd);
    const size = stat.size;
    const buffer = Buffer.alloc(64 * 1024);
    let crc = 0xffffffff;
    let remaining = size;
    while (remaining > 0) {
      const toRead = Math.min(buffer.length, remaining);
      const read = fs.readSync(fd, buffer, 0, toRead, null);
      if (read <= 0) {
        break;
      }
      for (let index = 0; index < read; index += 1) {
        crc ^= buffer[index]!;
        for (let bit = 0; bit < 8; bit += 1) {
          crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
      }
      remaining -= read;
    }
    return { checksum: (crc ^ 0xffffffff) >>> 0, size };
  } finally {
    fs.closeSync(fd);
  }
}

function zip64Extra(fields: number[]): Uint8Array {
  const payload = zipConcat(fields.map(zipU64));
  return zipConcat([zipU16(0x0001), zipU16(payload.length), payload]);
}

/**
 * Write `entries` into `zipPath` as an uncompressed ZIP (ZIP64 when needed).
 * Returns how many files were added.
 */
export async function createZipFileFromDiskPaths(
  zipPath: string,
  entries: ZipDiskEntry[],
  options?: {
    onProgress?: (progress: ZipStreamProgress) => void | Promise<void>;
    yieldEvery?: number;
  }
): Promise<{ fileCount: number; bytesWritten: number }> {
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  const out = fs.openSync(zipPath, 'w');
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  let fileCount = 0;
  let usedZip64Offsets = false;
  const yieldEvery = Math.max(1, options?.yieldEvery ?? YIELD_EVERY);
  const total = entries.length;
  let scanned = 0;

  try {
    for (const entry of entries) {
      scanned += 1;
      if (!fs.existsSync(entry.diskPath)) {
        if (scanned % yieldEvery === 0) {
          options?.onProgress?.({ processed: scanned, total, bytesWritten: offset });
          await yieldEventLoop();
        }
        continue;
      }
      const archivePath = entry.archivePath.replace(/\\/g, '/').replace(/^\/+/, '');
      if (!archivePath || archivePath.includes('..')) {
        continue;
      }
      const { checksum, size } = crc32File(entry.diskPath);
      const nameBytes = new TextEncoder().encode(archivePath);

      const sizeNeedsZip64 = size >= ZIP32_MAX;
      const localExtra = sizeNeedsZip64 ? zip64Extra([size, size]) : new Uint8Array(0);
      const localVersion = sizeNeedsZip64 ? 45 : 20;
      const localHeader = zipConcat([
        zipU32(0x04034b50),
        zipU16(localVersion),
        zipU16(0),
        zipU16(0),
        zipU16(0),
        zipU16(0),
        zipU32(checksum),
        zipU32(sizeNeedsZip64 ? ZIP32_MAX : size),
        zipU32(sizeNeedsZip64 ? ZIP32_MAX : size),
        zipU16(nameBytes.length),
        zipU16(localExtra.length),
        nameBytes,
        localExtra,
      ]);
      fs.writeSync(out, localHeader);

      const fd = fs.openSync(entry.diskPath, 'r');
      try {
        const buffer = Buffer.alloc(64 * 1024);
        let remaining = size;
        while (remaining > 0) {
          const toRead = Math.min(buffer.length, remaining);
          const read = fs.readSync(fd, buffer, 0, toRead, null);
          if (read <= 0) {
            break;
          }
          fs.writeSync(out, buffer, 0, read);
          remaining -= read;
        }
      } finally {
        fs.closeSync(fd);
      }

      const offsetNeedsZip64 = offset >= ZIP32_MAX;
      if (offsetNeedsZip64) {
        usedZip64Offsets = true;
      }
      const zip64Fields: number[] = [];
      if (sizeNeedsZip64) {
        zip64Fields.push(size, size);
      }
      if (offsetNeedsZip64) {
        zip64Fields.push(offset);
      }
      const centralExtra = zip64Fields.length > 0 ? zip64Extra(zip64Fields) : new Uint8Array(0);
      const centralVersion = zip64Fields.length > 0 ? 45 : 20;
      centralParts.push(
        zipConcat([
          zipU32(0x02014b50),
          zipU16(centralVersion),
          zipU16(centralVersion),
          zipU16(0),
          zipU16(0),
          zipU16(0),
          zipU16(0),
          zipU32(checksum),
          zipU32(sizeNeedsZip64 ? ZIP32_MAX : size),
          zipU32(sizeNeedsZip64 ? ZIP32_MAX : size),
          zipU16(nameBytes.length),
          zipU16(centralExtra.length),
          zipU16(0),
          zipU16(0),
          zipU16(0),
          zipU32(0),
          zipU32(offsetNeedsZip64 ? ZIP32_MAX : offset),
          nameBytes,
          centralExtra,
        ])
      );

      offset += localHeader.length + size;
      fileCount += 1;

      if (scanned % yieldEvery === 0 || scanned === total) {
        await options?.onProgress?.({ processed: scanned, total, bytesWritten: offset });
        await yieldEventLoop();
      }
    }

    const centralDirectory = zipConcat(centralParts);
    const cdOffset = offset;
    const cdSize = centralDirectory.length;
    fs.writeSync(out, centralDirectory);

    const needZip64Eocd =
      usedZip64Offsets || fileCount >= ZIP16_MAX || cdSize >= ZIP32_MAX || cdOffset >= ZIP32_MAX;

    if (needZip64Eocd) {
      const zip64EocdOffset = cdOffset + cdSize;
      const zip64Eocd = zipConcat([
        zipU32(0x06064b50),
        zipU64(44),
        zipU16(45),
        zipU16(45),
        zipU32(0),
        zipU32(0),
        zipU64(fileCount),
        zipU64(fileCount),
        zipU64(cdSize),
        zipU64(cdOffset),
      ]);
      const zip64Locator = zipConcat([
        zipU32(0x07064b50),
        zipU32(0),
        zipU64(zip64EocdOffset),
        zipU32(1),
      ]);
      const endRecord = zipConcat([
        zipU32(0x06054b50),
        zipU16(0),
        zipU16(0),
        zipU16(ZIP16_MAX),
        zipU16(ZIP16_MAX),
        zipU32(ZIP32_MAX),
        zipU32(ZIP32_MAX),
        zipU16(0),
      ]);
      fs.writeSync(out, zip64Eocd);
      fs.writeSync(out, zip64Locator);
      fs.writeSync(out, endRecord);
      return {
        fileCount,
        bytesWritten: zip64EocdOffset + zip64Eocd.length + zip64Locator.length + endRecord.length,
      };
    }

    const endRecord = zipConcat([
      zipU32(0x06054b50),
      zipU16(0),
      zipU16(0),
      zipU16(fileCount),
      zipU16(fileCount),
      zipU32(cdSize),
      zipU32(cdOffset),
      zipU16(0),
    ]);
    fs.writeSync(out, endRecord);
    return { fileCount, bytesWritten: cdOffset + cdSize + endRecord.length };
  } finally {
    fs.closeSync(out);
  }
}

/** Convenience for in-memory unit tests that still want crc32 on a buffer. */
export function zipCrc32Buffer(data: Uint8Array): number {
  return zipCrc32(data);
}
