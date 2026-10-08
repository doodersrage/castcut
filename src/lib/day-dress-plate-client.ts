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
import { footwearIsBarefoot, footwearPromptLine, normalizeFootwear } from '@/lib/footwear';
import {
  buildFeetPassPrompt,
  FOOTWEAR_CHECK_VERSION,
  footwearCheckApplies,
  footwearNeedsFeetPass,
  resolveFeetPassModel,
} from '@/lib/footwear-check';
import {
  cachedInstalledModelCheck,
  checkStillFootwear,
  fetchInstalledModelCheck,
  type FootwearCheckShared,
} from '@/lib/footwear-check-client';
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
  /**
   * LLM settings for the shoe check (footwear-check.ts). With shoes picked, the plate's feet are
   * looked at and, when the shoes are missing or wrong, one feet pass puts them on. Absent: no
   * check, the plate is used as it came.
   */
  visionShared?: FootwearCheckShared;
  /** Called when a feet pass starts on the plate (a second short render). */
  onShoePass?: () => void;
  /** Tests replace the vision check and the installed-engine lookup. */
  checkFootwear?: typeof checkStillFootwear;
  installed?: ((modelId: string) => boolean) | null;
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
/** A stored plate whose shoe check could not run (no vision model): not asked again for a while. */
const shoeCheckSkippedAt = new Map<string, number>();

async function inputFileExists(filename: string): Promise<boolean> {
  const url = comfyInputViewUrl(filename);
  if (!url) return false;
  try {
    // HEAD: the status is all that is needed, not the picture.
    const response = await fetch(url, { method: 'HEAD', credentials: 'same-origin' });
    return response.ok;
  } catch {
    // Offline or blocked: let the queue find out rather than re-render on a guess.
    return true;
  }
}

/** Shoes picked for the plate (words or a picture) — not barefoot, not left to the outfit. */
function plateWantsShoes(request: DayDressPlateRequest): boolean {
  return (
    !footwearIsBarefoot(request.footwear) &&
    footwearCheckApplies({
      footwear: normalizeFootwear(request.footwear),
      hasShoeImage: Boolean(request.footwearImage && hasFootwearImage(request.footwearImage)),
    })
  );
}

const FEET_PASS_WAIT_MS = 6 * 60_000;

/**
 * Look at the plate's feet; when the shoes are missing or wrong (barefoot, flats for heels, the
 * pair set down beside her), one feet pass on Edit 2511 puts them on — Image 1 the plate, Image 2
 * the shoe picture alone. Returns the image to keep (the pass's, or the plate as it was) and
 * whether the check ran. Never throws: a failed check or pass keeps the plate.
 */
async function fixDressPlateFeet(
  request: DayDressPlateRequest,
  deps: DayDressPlateDeps,
  imageUrl: string
): Promise<{ imageUrl: string; checked: boolean; passed: boolean }> {
  const kept = { imageUrl, checked: false, passed: false };
  if (!plateWantsShoes(request)) return kept;
  const shoeWords = normalizeFootwear(request.footwear);
  // No vision model, or the check failed (LM Studio could not load it while ComfyUI held the
  // card): pass anyway — picked shoes land ~1 of 10 without it, the pass puts them on 9 of 9.
  const verdict =
    !deps.visionShared && !deps.checkFootwear
      ? null
      : await (deps.checkFootwear ?? checkStillFootwear)({
          imageUrl,
          shoeWords,
          shared: deps.visionShared,
        });
  if (!footwearNeedsFeetPass(verdict, true)) return { ...kept, checked: true };
  const passModel = resolveFeetPassModel(
    request.model,
    deps.installed !== undefined ? deps.installed : cachedInstalledModelCheck()
  );
  if (!passModel) return { ...kept, checked: true };
  try {
    deps.onShoePass?.();
    const blob = await loadImageBlobFromUrls([imageUrl]);
    const name = `day-dress-plate-feet-${Date.now()}.png`;
    const staged = await resolveQueueInputImage({
      file: new File([blob], name, { type: blob.type || 'image/png', lastModified: Date.now() }),
      filename: name,
      model: passModel,
    });
    const stagedName = staged?.filename?.trim();
    if (!stagedName) throw new Error('the plate could not be staged');
    let shoeImage: string | null = null;
    if (request.footwearImage && hasFootwearImage(request.footwearImage)) {
      try {
        const alone = await buildFootwearReferenceImage({
          garment: null,
          footwear: request.footwearImage,
          model: passModel,
        });
        shoeImage = alone?.filename ?? null;
      } catch (error) {
        console.warn('Dress plate shoe pass: the shoe picture could not be attached:', error);
      }
    }
    const promptId = await deps.sendComfyUi(
      buildFeetPassPrompt({
        shoeWords,
        imagePlacement: shoeImage ? 'alone' : null,
        subject: request.subject,
      }),
      undefined,
      undefined,
      {
        inputImageFilename: stagedName,
        ...(shoeImage ? { inputImageFilenames: ['', shoeImage] } : {}),
        queueTool: 'image-prompt',
        queueModel: passModel,
        castPlateReference: true,
        identityLock: true,
        // "Change nothing else": the strong opener says wardrobe may change.
        turboEditStrength: 'balanced',
        queueHints: '',
        characterId: request.characterId,
        lookId: request.lookId,
      }
    );
    const id = typeof promptId === 'string' ? promptId.trim() : '';
    if (!id) throw new Error('the shoe pass was not queued');
    const wait = deps.waitForPromptIds ?? waitForGalleryPromptIds;
    const [entry] = await wait([id], { timeoutMs: FEET_PASS_WAIT_MS, pollMs: 2_500 });
    const passUrl =
      entry?.status === 'completed' ? galleryEntryPrimaryViewUrl(entry)?.trim() : undefined;
    if (!passUrl) throw new Error('the shoe pass did not finish');
    return { imageUrl: passUrl, checked: true, passed: true };
  } catch (error) {
    console.warn('Dress plate shoe pass skipped:', error);
    return { ...kept, checked: true };
  }
}

/**
 * The engine a dress plate renders on: Klein 9B Distilled when it is installed, else the still's.
 * Live A/B (2026-10-08, Lana in her burgundy dress and woven wedges, six of her Day stills): plate
 * 10–24 s vs Edit 2511's ~80 s, the wedges on 1 of 2 plates vs barefoot 2 of 2 (each a shoe pass),
 * and the Day stills started from it as close to her face (0.51 vs 0.59, lower is closer). Klein
 * renders it portrait, like the Cast plates, with the color anchor at 0.1 (0.45 over-bakes).
 */
export const DRESS_PLATE_ENGINE = 'flux-2-klein-9b-distilled';

export function dressPlateEngine(
  stillModel: string,
  installed: ((modelId: string) => boolean) | null | undefined
): string {
  return installed?.(DRESS_PLATE_ENGINE) ? DRESS_PLATE_ENGINE : stillModel;
}

async function renderDayDressPlate(
  request: DayDressPlateRequest,
  deps: DayDressPlateDeps,
  key: string
): Promise<DayDressPlateEntry> {
  const installed =
    deps.installed !== undefined ? deps.installed : await fetchInstalledModelCheck();
  const plateModel = dressPlateEngine(request.model, installed);
  const onKlein = plateModel === DRESS_PLATE_ENGINE;
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
        model: plateModel,
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
    queueModel: plateModel,
    castPlateReference: true,
    identityLock: true,
    turboEditStrength: 'strong',
    ...(onKlein ? { resolutionOrientation: 'portrait-34' as const, kleinColorAnchorMax: 0.1 } : {}),
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
  const feet = await fixDressPlateFeet(request, deps, resultUrl);
  const blob = await loadImageBlobFromUrls([feet.imageUrl]);
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
  return {
    key,
    filename,
    imageUrl: comfyInputViewUrl(filename) ?? feet.imageUrl,
    at: Date.now(),
    ...(feet.checked ? { shoesChecked: FOOTWEAR_CHECK_VERSION } : {}),
  };
}

/**
 * A stored plate made before the shoe check (or while it could not run): check it once, and
 * when the feet pass fixes it, store the fixed plate under the same key.
 */
async function recheckStoredPlateFeet(
  request: DayDressPlateRequest,
  deps: DayDressPlateDeps,
  cached: DayDressPlateEntry
): Promise<DayDressPlateEntry> {
  const url = cached.imageUrl?.trim() || comfyInputViewUrl(cached.filename);
  if (!url) return cached;
  const feet = await fixDressPlateFeet(request, deps, url);
  if (!feet.checked) {
    shoeCheckSkippedAt.set(cached.key, Date.now());
    return cached;
  }
  if (!feet.passed) return { ...cached, shoesChecked: FOOTWEAR_CHECK_VERSION };
  try {
    const blob = await loadImageBlobFromUrls([feet.imageUrl]);
    const name = `day-dress-plate-${Date.now()}.png`;
    const uploaded = await resolveQueueInputImage({
      file: new File([blob], name, { type: blob.type || 'image/png', lastModified: Date.now() }),
      filename: name,
      model: request.model,
    });
    const filename = uploaded?.filename?.trim();
    if (!filename) return { ...cached, shoesChecked: FOOTWEAR_CHECK_VERSION };
    verified.add(`${cached.key}::${filename}`);
    return {
      key: cached.key,
      filename,
      imageUrl: comfyInputViewUrl(filename) ?? feet.imageUrl,
      at: Date.now(),
      shoesChecked: FOOTWEAR_CHECK_VERSION,
    };
  } catch {
    return { ...cached, shoesChecked: FOOTWEAR_CHECK_VERSION };
  }
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
      if (
        (cached.shoesChecked ?? 0) >= FOOTWEAR_CHECK_VERSION ||
        !plateWantsShoes(request) ||
        Date.now() - (shoeCheckSkippedAt.get(key) ?? 0) < FAILURE_COOLDOWN_MS ||
        (!deps.visionShared && !deps.checkFootwear)
      ) {
        return { entry: cached, fresh: false };
      }
      const checking = inFlight.get(key);
      if (checking) return { entry: await checking, fresh: false };
      const job = recheckStoredPlateFeet(request, deps, cached)
        .then(entry => {
          saveDressPlate(entry);
          return entry;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, job);
      return { entry: await job, fresh: false };
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
