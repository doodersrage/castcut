/**
 * Footwear as an image. The edit models take three images (plate, clothing, pose map), so the
 * shoes share Image 2 with the clothing: the clothing packshot on top, the shoes underneath, on
 * one white canvas. Live on Edit 2511 (2026-10-01, running stills, two seeds): the right shoes
 * 3/4 from the image alone and 4/4 with the image and the words; the dress was unaffected.
 *
 * Browser only (canvas + upload).
 */

import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { collectIsolateSourceUrls, loadImageBlobFromUrls } from '@/lib/isolate-subject';
import { IDENTITY_MEDIA_URL } from '@/lib/gallery-media-client';
import { poseProfileForModel } from '@/lib/pose/pose-model-profile';
import { resolveQueueInputImage } from '@/lib/queue-input-image';

export type FootwearImageRef = { imageUrl?: string | null; imageFilename?: string | null };

export type GarmentImageRef = { imageUrl?: string; imageFilename?: string };

/** Canvas the combined reference is drawn on (3:4, like the clothing packshots). */
export const FOOTWEAR_COMBO_CANVAS = { width: 864, height: 1152 } as const;

/** Share of the canvas height the clothing gets; the shoes take the rest. */
export const FOOTWEAR_COMBO_GARMENT_SHARE = 0.7;

/**
 * Engines that take the shoes as a picture. Live A/B (2026-10-01, 16 stills per arm): the right
 * shoes came from words alone 16/16 on both engines; adding the picture kept 16/16, but on Rapid
 * AIO the smaller clothing image let the dress drift in about 5 of 16 (a cardigan added, leggings
 * instead of the dress). Edit 2511 kept the dress every time, so only it gets the picture; every
 * other engine wears the shoes from their words until it is tested.
 */
export function footwearImageSuitsModel(model: string | null | undefined): boolean {
  return poseProfileForModel(model).family === 'qwen-edit-2511';
}

export function hasFootwearImage(footwear: FootwearImageRef | null | undefined): boolean {
  return Boolean(footwear?.imageUrl?.trim() || footwear?.imageFilename?.trim());
}

/** Where each image sits on the combined canvas (contain-fit, centred). Pure, for tests. */
export function footwearComboLayout(
  garment: { width: number; height: number },
  shoes: { width: number; height: number }
): {
  garment: { x: number; y: number; width: number; height: number };
  shoes: { x: number; y: number; width: number; height: number };
} {
  const { width: W, height: H } = FOOTWEAR_COMBO_CANVAS;
  const fit = (
    size: { width: number; height: number },
    boxWidth: number,
    boxHeight: number
  ): { width: number; height: number } => {
    const scale = Math.min(
      boxWidth / Math.max(1, size.width),
      boxHeight / Math.max(1, size.height)
    );
    return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
  };
  const garmentBox = fit(garment, W, Math.round(H * FOOTWEAR_COMBO_GARMENT_SHARE));
  const shoesTop = Math.round(H * FOOTWEAR_COMBO_GARMENT_SHARE) + 8;
  // Shoes stay clearly smaller than the clothes: at full width they read as the subject.
  const shoesBox = fit(shoes, Math.round(W * 0.5), H - shoesTop - 4);
  return {
    garment: { x: Math.round((W - garmentBox.width) / 2), y: 0, ...garmentBox },
    shoes: {
      x: Math.round((W - shoesBox.width) / 2),
      y: H - shoesBox.height - 4,
      ...shoesBox,
    },
  };
}

function sourceUrls(ref: FootwearImageRef | GarmentImageRef): string[] {
  const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
  return collectIsolateSourceUrls({
    imageUrl: ref.imageUrl?.trim() || undefined,
    filename: ref.imageFilename?.trim() || undefined,
    comfyUrl,
  }).filter(url => url !== IDENTITY_MEDIA_URL);
}

async function loadBitmap(ref: FootwearImageRef | GarmentImageRef): Promise<ImageBitmap> {
  return createImageBitmap(await loadImageBlobFromUrls(sourceUrls(ref)));
}

/** Uploaded combined images by "clothing|shoes" — one upload per pairing per session. */
const comboCache = new Map<string, string>();

const refKey = (ref: FootwearImageRef | GarmentImageRef | null | undefined) =>
  `${ref?.imageFilename?.trim() ?? ''}#${ref?.imageUrl?.trim() ?? ''}`;

/**
 * Image 2 with the shoes in it: the clothing and the shoes on one canvas when there is a clothing
 * image, else the shoes alone. Returns the uploaded ComfyUI input filename, or null when there is
 * no footwear image (callers keep their own clothing reference).
 */
export async function buildFootwearReferenceImage(input: {
  garment?: GarmentImageRef | null;
  footwear: FootwearImageRef;
  model: string;
}): Promise<{ filename: string; combined: boolean } | null> {
  if (!hasFootwearImage(input.footwear)) return null;
  const garment =
    input.garment?.imageUrl?.trim() || input.garment?.imageFilename?.trim() ? input.garment : null;
  const key = `${refKey(garment)}|${refKey(input.footwear)}`;
  const cached = comboCache.get(key);
  if (cached) return { filename: cached, combined: Boolean(garment) };

  const shoes = await loadBitmap(input.footwear);
  const clothes = garment ? await loadBitmap(garment) : null;
  const { width, height } = clothes
    ? FOOTWEAR_COMBO_CANVAS
    : { width: Math.max(64, shoes.width), height: Math.max(64, shoes.height) };
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not draw the footwear reference.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  if (clothes) {
    const layout = footwearComboLayout(clothes, shoes);
    context.drawImage(
      clothes,
      layout.garment.x,
      layout.garment.y,
      layout.garment.width,
      layout.garment.height
    );
    context.drawImage(
      shoes,
      layout.shoes.x,
      layout.shoes.y,
      layout.shoes.width,
      layout.shoes.height
    );
  } else {
    context.drawImage(shoes, 0, 0, width, height);
  }
  clothes?.close();
  shoes.close();
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not draw the footwear reference.');
  const name = `${clothes ? 'outfit-footwear' : 'footwear'}-${Date.now()}.png`;
  const uploaded = await resolveQueueInputImage({
    file: new File([blob], name, { type: 'image/png', lastModified: Date.now() }),
    filename: name,
    model: input.model,
  });
  const filename = uploaded?.filename?.trim();
  if (!filename) throw new Error('Footwear reference upload did not return a filename.');
  comboCache.set(key, filename);
  return { filename, combined: Boolean(clothes) };
}
