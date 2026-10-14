/** Server: the painted outfit models (outfit-3d-paint.ts), kept under PROMPT_DATA_DIR/outfit-3d. */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  glbMesh,
  glbTextureViews,
  glbViewBytes,
  matteRoughness,
  paintTextureFromPhoto,
  parseGlb,
  writeGlb,
  type RgbImage,
} from './outfit-3d-paint';
import { resolvePromptDataDir } from './prompt-data-paths';

const NAME_RE = /^[a-f0-9]{24}\.glb$/;

function modelDir(): string {
  return path.join(resolvePromptDataDir(), 'outfit-3d');
}

async function decode(bytes: Uint8Array): Promise<RgbImage> {
  const { data, info } = await sharp(bytes)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

async function encodePng(data: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  const png = await sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
    raw: { width, height, channels: 3 },
  })
    .png({ compressionLevel: 6 })
    .toBuffer();
  return new Uint8Array(png.buffer, png.byteOffset, png.byteLength);
}

/** TRELLIS's GLB with the cut-out picture painted on and matte roughness. */
export async function paintOutfitGlb(input: {
  glb: Uint8Array;
  front: Uint8Array;
  mask: Uint8Array;
}): Promise<Uint8Array> {
  const glb = parseGlb(input.glb);
  const views = glbTextureViews(glb);
  const [texture, photo, mask] = await Promise.all([
    decode(glbViewBytes(glb, views.baseColor)),
    decode(input.front),
    decode(input.mask),
  ]);
  const painted = paintTextureFromPhoto({ mesh: glbMesh(glb), texture, photo, mask });
  const replace = new Map<number, Uint8Array>([
    [views.baseColor, await encodePng(painted.texture, texture.width, texture.height)],
  ]);
  if (views.metallicRoughness !== undefined) {
    const mr = await decode(glbViewBytes(glb, views.metallicRoughness));
    replace.set(views.metallicRoughness, await encodePng(matteRoughness(mr), mr.width, mr.height));
  }
  return writeGlb(glb, replace);
}

/** Keep a model; its app URL. */
export async function storeOutfitModel(bytes: Uint8Array): Promise<string> {
  const name = `${createHash('sha256').update(bytes).digest('hex').slice(0, 24)}.glb`;
  await mkdir(modelDir(), { recursive: true });
  await writeFile(path.join(modelDir(), name), bytes);
  return `/api/outfit-3d/model/${name}`;
}

export async function readOutfitModel(name: string): Promise<Uint8Array | null> {
  if (!NAME_RE.test(name)) return null;
  try {
    return new Uint8Array(await readFile(path.join(modelDir(), name)));
  } catch {
    return null;
  }
}
