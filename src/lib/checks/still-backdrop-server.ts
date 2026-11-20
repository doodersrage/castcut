/**
 * A landed still's white shares, measured on the server with sharp (still-backdrop.ts). Null
 * when it could not be read — the check fails open.
 */
import sharp from 'sharp';
import {
  STILL_BACKDROP_SAMPLE,
  stillBackdropShares,
  type StillBackdropShares,
} from './still-backdrop';

export async function measureStillBackdropBytes(
  bytes: Buffer | Uint8Array
): Promise<StillBackdropShares | null> {
  try {
    const { width, height } = STILL_BACKDROP_SAMPLE;
    const { data, info } = await sharp(bytes)
      .removeAlpha()
      .resize(width, height, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return stillBackdropShares(data, info.width, info.height, 3);
  } catch {
    return null;
  }
}
