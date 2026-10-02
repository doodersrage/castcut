/**
 * Browser side of the Day dress plate (day-dress-plate.ts): reuse a cached plate, or queue the
 * try-on, wait for it and stage the result as a ComfyUI input image.
 */

import { waitForGalleryPromptIds } from '@/lib/best-of-n-vision-queue';
import { galleryEntryPrimaryViewUrl } from '@/lib/comfyui-gallery';
import {
  buildDayDressPlatePrompt,
  dayDressPlateChange,
  dayDressPlateRequestKey as dressPlateKeyFor,
  type DayDressPlateChange,
  type DayDressPlateEntry,
  type DayDressPlateKeyInput,
} from '@/lib/day-dress-plate';
import { findDressPlate, loadDressPlates, saveDressPlate } from '@/lib/dress-plate-store';
import { comfyInputViewUrl } from '@/lib/face-match-client';
import { footwearIsBarefoot, footwearPromptLine } from '@/lib/footwear';
import { buildFootwearReferenceImage, hasFootwearImage } from '@/lib/footwear-image';
import { loadImageBlobFromUrls } from '@/lib/isolate-subject';
import { resolveQueueInputImage } from '@/lib/queue-input-image';

export type DayDressPlateRequest = DayDressPlateKeyInput & {
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
  /**
   * Called when the plate starts rendering (not on a cache hit), with what changed since this
   * Cast plate's last dressed plate (null: its first).
   */
  onRender?: (info: { change: DayDressPlateChange | null }) => void;
  /** Waits for the queued job (tests replace it; defaults to the gallery poller). */
  waitForPromptIds?: typeof waitForGalleryPromptIds;
};

/** The store key of a plate request (day-dress-plate.ts); the who-is-it fields do not count. */
export function dayDressPlateRequestKey(
  request: DayDressPlateKeyInput & { subject?: string }
): string {
  return dressPlateKeyFor(request);
}

/** Cached plates checked this session — a cleaned-out ComfyUI input folder makes one stale. */
const verified = new Set<string>();
const inFlight = new Map<string, Promise<DayDressPlateEntry>>();
/**
 * A plate job that was queued but had not finished when its wait ran out (a busy ComfyUI queue).
 * The next still re-attaches to it instead of queueing another, and only looks briefly: without
 * this each still of a Queue day queued its own plate and waited the full time again.
 */
const pendingJobs = new Map<string, { promptId: string; gaveUpAt: number | null }>();
const FIRST_WAIT_MS = 8 * 60_000;
const RECHECK_WAIT_MS = 6_000;
/** After a failed render, later stills skip the plate for this long. */
const FAILURE_COOLDOWN_MS = 5 * 60_000;
const failedAt = new Map<string, number>();

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
  const pending = pendingJobs.get(key);
  if (pending) {
    return finishDressPlateJob(request, deps, key, pending.promptId, RECHECK_WAIT_MS);
  }
  const failed = failedAt.get(key);
  if (failed && Date.now() - failed < FAILURE_COOLDOWN_MS) {
    throw new Error('the last attempt failed a moment ago');
  }
  deps.onRender?.({ change: dayDressPlateChange(loadDressPlates(), key) });
  const barefoot = footwearIsBarefoot(request.footwear);
  const hasClothingImage = Boolean(
    request.clothing?.imageUrl?.trim() || request.clothing?.imageFilename?.trim()
  );
  // Image 2: the clothing with the shoes under it, the clothing alone, or the shoes alone.
  let image2: { filename?: string; url?: string } | null = hasClothingImage
    ? { filename: request.clothing?.imageFilename?.trim(), url: request.clothing?.imageUrl?.trim() }
    : null;
  let footwearImage: 'combined' | 'alone' | null = null;
  // The shoe picture rides along on every engine here, unlike in a Day still (where on Rapid the
  // smaller clothing image let the dress drift): the try-on on white is a plainer job — the
  // plates rendered on Rapid AIO and Qwen-Image 2.1 came out with the exact dress and shoes.
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
  pendingJobs.set(key, { promptId: id, gaveUpAt: null });
  return finishDressPlateJob(request, deps, key, id, FIRST_WAIT_MS);
}

/** Wait for a queued plate job, then stage its image as a ComfyUI input. */
async function finishDressPlateJob(
  request: DayDressPlateRequest,
  deps: DayDressPlateDeps,
  key: string,
  promptId: string,
  timeoutMs: number
): Promise<DayDressPlateEntry> {
  const wait = deps.waitForPromptIds ?? waitForGalleryPromptIds;
  const [entry] = await wait([promptId], { timeoutMs, pollMs: 2_500 });
  if (!entry || (entry.status !== 'completed' && entry.status !== 'error')) {
    // Still queued or rendering: keep the job so the next still picks it up.
    pendingJobs.set(key, { promptId, gaveUpAt: Date.now() });
    throw new Error('it is still waiting in the ComfyUI queue');
  }
  pendingJobs.delete(key);
  const resultUrl = entry.status === 'completed' ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
  if (!resultUrl) {
    failedAt.set(key, Date.now());
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
    failedAt.set(key, Date.now());
    throw new Error('The dress plate upload did not return a filename.');
  }
  failedAt.delete(key);
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
  request: { key: string; model: string },
  imageUrl: string
): Promise<DayDressPlateEntry | null> {
  const url = imageUrl.trim();
  if (!url) return null;
  try {
    const key = request.key;
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
