/**
 * Minimal ustar (+ pax long names) for the Pictures backup: the export streams entries one after
 * another with no central directory, and the restore reads them back in order from disk.
 */

export const TAR_BLOCK = 512;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function writeString(block: Uint8Array, offset: number, length: number, value: string): void {
  block.set(encoder.encode(value).subarray(0, length), offset);
}

function writeOctal(block: Uint8Array, offset: number, length: number, value: number): void {
  writeString(
    block,
    offset,
    length,
    `${Math.floor(value)
      .toString(8)
      .padStart(length - 1, '0')}\0`
  );
}

function headerBlock(name: string, size: number, mtimeSec: number, type: '0' | 'x'): Uint8Array {
  const block = new Uint8Array(TAR_BLOCK);
  writeString(block, 0, 100, name);
  writeOctal(block, 100, 8, 0o644);
  writeOctal(block, 108, 8, 0);
  writeOctal(block, 116, 8, 0);
  writeOctal(block, 124, 12, size);
  writeOctal(block, 136, 12, mtimeSec);
  block.fill(0x20, 148, 156);
  writeString(block, 156, 1, type);
  writeString(block, 257, 6, 'ustar\0');
  writeString(block, 263, 2, '00');
  let sum = 0;
  for (const byte of block) sum += byte;
  writeString(block, 148, 8, `${sum.toString(8).padStart(6, '0')}\0 `);
  return block;
}

function paxRecord(key: string, value: string): string {
  // The length prefix counts bytes (UTF-8), itself included.
  const body = ` ${key}=${value}\n`;
  const bodyBytes = encoder.encode(body).length;
  let length = bodyBytes + 1;
  while (String(length).length + bodyBytes !== length) length += 1;
  return `${length}${body}`;
}

export function tarPadding(size: number): Uint8Array {
  const rest = size % TAR_BLOCK;
  return new Uint8Array(rest === 0 ? 0 : TAR_BLOCK - rest);
}

/**
 * Header bytes for one file. A path that is not plain ASCII under 100 bytes gets a pax record
 * in front of it carrying the full path.
 */
export function tarFileHeader(path: string, size: number, mtimeSec = 0): Uint8Array {
  const fits = /^[\x20-\x7e]*$/.test(path) && path.length <= 100;
  if (fits) return headerBlock(path, size, mtimeSec, '0');
  const pax = encoder.encode(paxRecord('path', path));
  const short = path.replace(/[^\x20-\x7e]/g, '_').slice(-100);
  const parts = [
    headerBlock('PaxHeader', pax.length, mtimeSec, 'x'),
    pax,
    tarPadding(pax.length),
    headerBlock(short, size, mtimeSec, '0'),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Two zero blocks end the archive. */
export function tarEnd(): Uint8Array {
  return new Uint8Array(TAR_BLOCK * 2);
}

export type TarHeader = { name: string; size: number; type: string };

function readString(block: Uint8Array, offset: number, length: number): string {
  const slice = block.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return decoder.decode(end >= 0 ? slice.subarray(0, end) : slice);
}

/** One header block → its entry, or null for the end-of-archive zero block. */
export function readTarHeader(block: Uint8Array): TarHeader | null {
  if (block.every(byte => byte === 0)) return null;
  let sum = 0;
  for (let i = 0; i < TAR_BLOCK; i += 1) sum += i >= 148 && i < 156 ? 0x20 : block[i]!;
  const stored = parseInt(readString(block, 148, 8).trim() || '0', 8);
  if (stored !== sum) throw new Error('Not a Pictures backup (bad tar header).');
  const prefix = readString(block, 345, 155);
  const name = readString(block, 0, 100);
  return {
    name: prefix ? `${prefix}/${name}` : name,
    size: parseInt(readString(block, 124, 12).trim() || '0', 8),
    type: readString(block, 156, 1) || '0',
  };
}

/** The `path` from a pax record body, if it has one. */
export function readPaxPath(body: Uint8Array): string | null {
  let offset = 0;
  while (offset < body.length) {
    const space = body.indexOf(0x20, offset);
    if (space < 0) break;
    const length = Number(decoder.decode(body.subarray(offset, space)));
    if (!Number.isFinite(length) || length <= 0) break;
    const record = decoder.decode(body.subarray(space + 1, offset + length - 1));
    const eq = record.indexOf('=');
    if (eq > 0 && record.slice(0, eq) === 'path') return record.slice(eq + 1);
    offset += length;
  }
  return null;
}
