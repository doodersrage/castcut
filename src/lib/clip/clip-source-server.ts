/**
 * Server: a fetched clip written where ffmpeg can read it. WAN's clips are animated WebP, which
 * ffmpeg before 8.0 can't decode (Docker's Alpine ffmpeg among them: "Could not read that
 * clip"); those — and GIFs — are turned into an H.264 MP4 through sharp first, the way the Cut
 * already reads them. Anything else is written as it came.
 */

import { promises as fs } from 'node:fs';

/** An animated WebP or a GIF, from its first bytes. */
export function isAnimatedImageClip(bytes: Uint8Array): boolean {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length >= 6 && ascii(0, 4) === 'GIF8') return true;
  if (bytes.length < 21 || ascii(0, 4) !== 'RIFF' || ascii(8, 12) !== 'WEBP') return false;
  // An extended WebP (VP8X) with its animation flag set.
  return ascii(12, 16) === 'VP8X' && (bytes[20]! & 0x02) !== 0;
}

/** Write `bytes` to `file` for ffmpeg; an animated WebP / GIF becomes an MP4 there instead. */
export async function writeClipSource(ffmpeg: string, bytes: Buffer, file: string): Promise<void> {
  if (!isAnimatedImageClip(bytes)) {
    await fs.writeFile(/* turbopackIgnore: true */ file, bytes);
    return;
  }
  const { animatedToMp4 } = await import('../video/cut-project-export-server');
  // ffmpeg picks the muxer from the extension; the MP4 goes to a sibling and takes its place.
  const mp4 = `${file}.mp4`;
  await animatedToMp4(ffmpeg, bytes, mp4);
  await fs.rename(/* turbopackIgnore: true */ mp4, /* turbopackIgnore: true */ file);
}
