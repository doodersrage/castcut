/**
 * Browser side of the Day dress plate (day-dress-plate.ts): reuse a cached plate, or queue the
 * try-on, wait for it and stage the result as a ComfyUI input image.
 */

import { waitForGalleryPromptIds } from '@/lib/best-of-n-vision-queue';
import { galleryEntryPrimaryViewUrl } from '@/lib/comfyui-gallery';
import {
  buildDayDressPlatePrompt,
  dayDressPlateKey,
  type DayDressPlateEntry,
} from '@/lib/day-dress-plate';
import { findDressPlate, saveDressPlate } from '@/lib/dress-plate-store';
import { comfyInputViewUrl } from '@/lib/face-match-client';
import { footwearIsBarefoot, footwearPromptLine } from '@/lib/footwear';
import { buildFootwearReferenceImage, hasFootwearImage } from '@/lib/footwear-image';
import { loadImageBlobFromUrls } from '@/lib/isolate-subject';
import { resolveQueueInputImage } from '@/lib/queue-input-image';

export type DayDressPlateRequest = {
  model: string;
  /** The undressed Cast plate. */
  plate: { filename?: string; imageUrl?: string };
  /** Clothing image (your photo or a kit packshot), when there is one. */
  clothing?: { imageUrl?: string; imageFilename?: string } | null;
  /**
   * What identifies the clothing across tools: `kit:<id>` for a catalog kit (Day resolves a
   * packshot URL, Story and Outfit an id), else the photo's filename.
   */
  clothingKey?: string;
  /** What the clothing is called: the photo's description or the kit's label. */
  clothingLabel: string;
  /** Vision description of a clothing photo. */
  clothingDescription?: string;
  /** Picked shoes in words ('' = none picked). */
  footwear: string;
  footwearImage?: { imageUrl?: string | null; imageFilename?: string | null };
  subject: 'she' | 'he';
  characterName?: string;
  characterId?: string;
  lookId?: string;
};

export type DayDressPlateDeps = {
  sendComfyUi: (
    prompt: string,
    a?: undefined,
    b?: undefined,
    options?: Record<string, unknown>
  ) => Promise<string | void>;
  /** Called when the plate starts rendering (not on a cache hit). */
  onRender?: () => void;
};

export function dayDressPlateRequestKey(request: DayDressPlateRequest): string {
  return dayDressPlateKey({
    model: request.model,
    // The same Cast plate reaches the tools as a filename or a view URL of that filename.
    plate: plateIdentity(request.plate),
    clothing:
      request.clothingKey?.trim() ||
      request.clothing?.imageFilename?.trim() ||
      request.clothing?.imageUrl?.trim() ||
      request.clothingLabel,
    footwear: [
      request.footwear,
      request.footwearImage?.imageFilename?.trim() || request.footwearImage?.imageUrl?.trim() || '',
    ].join('#'),
  });
}

function plateIdentity(plate: { filename?: string; imageUrl?: string }): string {
  const filename = plate.filename?.trim();
  if (filename) return filename.split('/').pop() ?? filename;
  const url = plate.imageUrl?.trim() ?? '';
  try {
    const fromQuery = new URL(url, 'http://local').searchParams.get('filename')?.trim();
    if (fromQuery) return fromQuery;
  } catch {
    /* not a URL */
  }
  return url;
}

/** Cached plates checked this session — a cleaned-out ComfyUI input folder makes one stale. */
const verified = new Set<string>();
const inFlight = new Map<string, Promise<DayDressPlateEntry>>();

async function inputFileExists(filename: string): Promise<boolean> {
  const url = comfyInputViewUrl(filename);
  if (!url) return false;
  try {
    const response = await fetch(url, { method: 'GET', credentials: 'same-origin' });
    return response.ok;
  } catch {
    // Offline or blocked: let the queue find out rather than re-render on a guess.
    return true;
  }
}

async function renderDayDressPlate(
  request: DayDressPlateRequest,
  deps: DayDressPlateDeps,
  key: string
): Promise<DayDressPlateEntry> {
  deps.onRender?.();
  const barefoot = footwearIsBarefoot(request.footwear);
  const hasClothingImage = Boolean(
    request.clothing?.imageUrl?.trim() || request.clothing?.imageFilename?.trim()
  );
  // Image 2: the clothing with the shoes under it, the clothing alone, or the shoes alone.
  let image2: { filename?: string; url?: string } | null = hasClothingImage
    ? { filename: request.clothing?.imageFilename?.trim(), url: request.clothing?.imageUrl?.trim() }
    : null;
  let footwearImage: 'combined' | 'alone' | null = null;
  if (!barefoot && request.footwearImage && hasFootwearImage(request.footwearImage)) {
    try {
      const reference = await buildFootwearReferenceImage({
        garment: hasClothingImage ? request.clothing : null,
        footwear: request.footwearImage,
        model: request.model,
      });
      if (reference) {
        image2 = { filename: reference.filename };
        footwearImage = reference.combined ? 'combined' : 'alone';
      }
    } catch (error) {
      // The shoes still go out in words.
      console.warn('Dress plate: the shoe picture could not be attached:', error);
    }
  }
  const prompt = buildDayDressPlatePrompt({
    outfitLabel: request.clothingLabel,
    characterName: request.characterName,
    hasGarmentReference: hasClothingImage,
    garmentDescription: request.clothingDescription,
    footwearLine: footwearPromptLine(request.footwear, request.subject, footwearImage),
    footwearImage,
  });
  const promptId = await deps.sendComfyUi(prompt, undefined, undefined, {
    inputImageFilename: request.plate.filename?.trim() || undefined,
    inputImageUrl: request.plate.imageUrl?.trim() || undefined,
    ...(image2?.filename
      ? { inputImageFilenames: ['', image2.filename] }
      : image2?.url
        ? { inputImageUrls: [undefined, image2.url] }
        : {}),
    queueTool: 'image-prompt',
    queueModel: request.model,
    castPlateReference: true,
    identityLock: true,
    turboEditStrength: 'strong',
    queueHints: '',
    characterId: request.characterId,
    lookId: request.lookId,
  });
  const id = typeof promptId === 'string' ? promptId.trim() : '';
  if (!id) {
    throw new Error('The dress plate could not be queued.');
  }
  const [entry] = await waitForGalleryPromptIds([id], { timeoutMs: 8 * 60_000, pollMs: 2_500 });
  const resultUrl = entry?.status === 'completed' ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
  if (!resultUrl) {
    throw new Error('The dress plate did not render.');
  }
  const blob = await loadImageBlobFromUrls([resultUrl]);
  const name = `day-dress-plate-${Date.now()}.png`;
  const uploaded = await resolveQueueInputImage({
    file: new File([blob], name, { type: blob.type || 'image/png', lastModified: Date.now() }),
    filename: name,
    model: request.model,
  });
  const filename = uploaded?.filename?.trim();
  if (!filename) {
    throw new Error('The dress plate upload did not return a filename.');
  }
  verified.add(`${key}::${filename}`);
  return { key, filename, imageUrl: comfyInputViewUrl(filename) ?? resultUrl, at: Date.now() };
}

/**
 * The dress plate for this plate + clothing + shoes: the shared store's (dress-plate-store.ts)
 * when its file is still in ComfyUI, else a fresh render, stored for Day, Story and Outfit alike.
 * Concurrent callers share one render.
 */
export async function ensureDayDressPlate(
  request: DayDressPlateRequest,
  deps: DayDressPlateDeps
): Promise<{ entry: DayDressPlateEntry; fresh: boolean }> {
  const key = dayDressPlateRequestKey(request);
  const cached = findDressPlate(key);
  if (cached) {
    const mark = `${key}::${cached.filename}`;
    if (verified.has(mark) || (await inputFileExists(cached.filename))) {
      verified.add(mark);
      return { entry: cached, fresh: false };
    }
  }
  const running = inFlight.get(key);
  if (running) {
    return { entry: await running, fresh: false };
  }
  const job = renderDayDressPlate(request, deps, key)
    .then(entry => {
      saveDressPlate(entry);
      return entry;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return { entry: await job, fresh: true };
}

/**
 * Outfit → Keep: the kept try-on is a dressed plate. Stage it as an input image and store it
 * under the same key Day and Story look up, so they start from it instead of rendering their own.
 * Best-effort: a failure only means the plate is rendered when a tool first needs it.
 */
export async function registerDressPlateFromImage(
  request: Pick<
    DayDressPlateRequest,
    'model' | 'plate' | 'clothing' | 'clothingKey' | 'clothingLabel' | 'footwear' | 'footwearImage'
  >,
  imageUrl: string
): Promise<DayDressPlateEntry | null> {
  const url = imageUrl.trim();
  if (!url) return null;
  try {
    const key = dayDressPlateRequestKey(request as DayDressPlateRequest);
    const blob = await loadImageBlobFromUrls([url]);
    const name = `day-dress-plate-${Date.now()}.png`;
    const uploaded = await resolveQueueInputImage({
      file: new File([blob], name, { type: blob.type || 'image/png', lastModified: Date.now() }),
      filename: name,
      model: request.model,
    });
    const filename = uploaded?.filename?.trim();
    if (!filename) return null;
    const entry: DayDressPlateEntry = {
      key,
      filename,
      imageUrl: comfyInputViewUrl(filename) ?? url,
      at: Date.now(),
    };
    verified.add(`${key}::${filename}`);
    saveDressPlate(entry);
    return entry;
  } catch (error) {
    console.warn('Kept try-on could not be stored as the dressed plate:', error);
    return null;
  }
}
