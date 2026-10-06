/**
 * Pixel size from the first bytes of an image file (PNG, JPEG, WebP, GIF) — no decoder. The
 * reference check reads a ComfyUI input file's size this way instead of pulling the whole
 * picture through a decoder; a few hundred bytes are enough for every format but a JPEG with a
 * large EXIF block, which `IMAGE_SIZE_HEADER_BYTES` still covers.
 */

export type ImageSize = { width: number; height: number };

/** Read this much of a file before giving up on its size (JPEG EXIF / ICC blocks sit first). */
export const IMAGE_SIZE_HEADER_BYTES = 256 * 1024;

function u32be(bytes: Uint8Array, at: number): number {
  return (
    ((bytes[at]! << 24) >>> 0) + (bytes[at + 1]! << 16) + (bytes[at + 2]! << 8) + bytes[at + 3]!
  );
}

function u16be(bytes: Uint8Array, at: number): number {
  return (bytes[at]! << 8) + bytes[at + 1]!;
}

function u16le(bytes: Uint8Array, at: number): number {
  return bytes[at]! + (bytes[at + 1]! << 8);
}

function u24le(bytes: Uint8Array, at: number): number {
  return bytes[at]! + (bytes[at + 1]! << 8) + (bytes[at + 2]! << 16);
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  let text = '';
  for (let index = at; index < at + length && index < bytes.length; index += 1) {
    text += String.fromCharCode(bytes[index]!);
  }
  return text;
}

function valid(width: number, height: number): ImageSize | null {
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * The image's pixel size, or null when the bytes are not a known image or hold too little of
 * it (a JPEG's frame header may sit after a long EXIF block — pass more bytes).
 */
export function readImageSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length >= 24 && ascii(bytes, 1, 3) === 'PNG' && bytes[0] === 0x89) {
    if (ascii(bytes, 12, 4) !== 'IHDR') return null;
    return valid(u32be(bytes, 16), u32be(bytes, 20));
  }
  if (bytes.length >= 10 && ascii(bytes, 0, 3) === 'GIF') {
    return valid(u16le(bytes, 6), u16le(bytes, 8));
  }
  if (bytes.length >= 30 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    const chunk = ascii(bytes, 12, 4);
    if (chunk === 'VP8 ') {
      return valid(u16le(bytes, 26) & 0x3fff, u16le(bytes, 28) & 0x3fff);
    }
    if (chunk === 'VP8L') {
      const b0 = bytes[21]!;
      const b1 = bytes[22]!;
      const b2 = bytes[23]!;
      const b3 = bytes[24]!;
      return valid(
        1 + (((b1 & 0x3f) << 8) | b0),
        1 + (((b3 & 0x0f) << 10) | (b2 << 2) | (b1 >> 6))
      );
    }
    if (chunk === 'VP8X') {
      return valid(1 + u24le(bytes, 24), 1 + u24le(bytes, 27));
    }
    return null;
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) {
        at += 1;
        continue;
      }
      const marker = bytes[at + 1]!;
      // Padding / standalone markers carry no length.
      if (marker === 0xff) {
        at += 1;
        continue;
      }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        at += 2;
        continue;
      }
      const length = u16be(bytes, at + 2);
      const isFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) {
        if (at + 9 > bytes.length) return null;
        return valid(u16be(bytes, at + 7), u16be(bytes, at + 5));
      }
      if (marker === 0xd9 || marker === 0xda) return null;
      at += 2 + length;
    }
    return null;
  }
  return null;
}
