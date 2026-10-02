/**
 * Shared Outfit/Day BYO clothing upload: ready packshot or isolate + ghost-mannequin extract.
 */

import { waitForGalleryPromptIds } from '@/lib/best-of-n-vision-queue';
import { galleryEntryPrimaryViewUrl } from '@/lib/comfyui-gallery';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import {
  fittingGarmentPackshotQueueParams,
  resolveFittingGarmentPackshotModel,
} from '@/lib/fitting-kit-previews';
import {
  buildFittingGarmentPackshotExtractPrompt,
  buildFootwearPackshotExtractPrompt,
  FITTING_GARMENT_PACKSHOT_EXTRACT_NEGATIVE,
  FOOTWEAR_PACKSHOT_EXTRACT_NEGATIVE,
  isCollapsedFittingGarmentDescription,
} from '@/lib/fitting-room';
import {
  collectIsolateSourceUrls,
  isolateSubjectOnWhite,
  loadImageBlobFromUrls,
} from '@/lib/isolate-subject';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import { stampedUploadName } from '@/lib/upload-name';

export type ApplyCustomGarmentInput = {
  file?: File | null;
  imageUrl?: string;
  filename?: string;
  /** Skip isolate + extract — use the file as Image 2 as-is. */
  asPackshot?: boolean;
  /** What the photo shows (default clothing). Footwear extracts the shoes instead. */
  kind?: 'clothing' | 'footwear';
};

export type ApplyCustomGarmentResult = {
  filename: string;
  previewUrl: string;
  description?: string;
};

export type ApplyCustomGarmentDeps = {
  model: string;
  characterId?: string | null;
  lookId?: string | null;
  sendComfyUi: (
    prompt: string,
    a?: undefined,
    b?: undefined,
    options?: Record<string, unknown>
  ) => Promise<string | void>;
  scanDescription: (file: File) => Promise<string | null | undefined>;
  onStatus: (message: string | null) => void;
  onSoftError: (message: string) => void;
};

function previewUrlForFilename(
  filename: string,
  comfyUrl: string | undefined,
  fallbackUrl: string,
  file: File
): string {
  return (
    collectIsolateSourceUrls({
      filename,
      comfyUrl,
    }).find(url => url.includes('/api/comfyui/view?')) ||
    (fallbackUrl && !fallbackUrl.startsWith('blob:') ? fallbackUrl : '') ||
    URL.createObjectURL(file)
  );
}

/** Upload + optional packshot extract; returns Image 2 fields for Fitting/Day tool caches. */
export async function applyCustomGarmentUpload(
  input: ApplyCustomGarmentInput,
  deps: ApplyCustomGarmentDeps
): Promise<ApplyCustomGarmentResult> {
  const file = input.file ?? null;
  const imageUrl = input.imageUrl?.trim() || '';
  const asPackshot = input.asPackshot === true;
  const shoes = input.kind === 'footwear';
  // Same steps for clothing and shoes; only the words and the extract prompt differ.
  const noun = shoes ? 'footwear' : 'clothing';
  const stem = shoes ? 'fitting-footwear' : 'fitting-garment';
  if (!file && !imageUrl) {
    throw new Error(`Choose a ${noun} photo first.`);
  }

  const originalName = input.filename || file?.name || `${stem}-${Date.now()}.png`;
  const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
  const sourceFile =
    file ??
    (await (async () => {
      const blob = await loadImageBlobFromUrls(
        collectIsolateSourceUrls({
          imageUrl,
          filename: originalName,
          comfyUrl,
        })
      );
      return new File([blob], originalName, {
        type: blob.type || 'image/png',
        lastModified: Date.now(),
      });
    })());

  // Its own name in ComfyUI: another photo called the same would overwrite it (upload-name.ts).
  const uploadName = stampedUploadName(originalName);
  const uploadFile = new File([sourceFile], uploadName, {
    type: sourceFile.type || 'image/png',
    lastModified: Date.now(),
  });

  if (asPackshot) {
    deps.onStatus('Uploading packshot…');
    const uploaded = await resolveQueueInputImage({
      file: uploadFile,
      filename: uploadName,
      model: deps.model,
    });
    const filename = uploaded?.filename?.trim();
    if (!filename) {
      throw new Error('Upload did not return a filename.');
    }
    const previewUrl = previewUrlForFilename(filename, comfyUrl, imageUrl, uploadFile);
    let description: string | undefined;
    try {
      deps.onStatus('Scanning packshot with vision…');
      const scanned = await deps.scanDescription(sourceFile);
      if (scanned?.trim()) {
        description = scanned.trim();
      }
    } catch (err) {
      deps.onSoftError(
        err instanceof Error
          ? `${err.message} Packshot kept — try-on will rely on Image 2 until you rescan.`
          : 'Vision scan failed. Packshot kept — try-on will rely on Image 2 until you rescan.'
      );
    }
    return { filename, previewUrl, description };
  }

  let garmentFile = uploadFile;
  deps.onStatus(`Extracting ${noun} onto white…`);
  try {
    garmentFile = await isolateSubjectOnWhite(sourceFile, uploadName);
  } catch {
    garmentFile = uploadFile;
  }

  const cutoutUploadName = garmentFile.name || uploadName.replace(/\.[^.]+$/, '') + '-cutout.png';
  let uploaded = await resolveQueueInputImage({
    file: garmentFile,
    filename: cutoutUploadName,
    model: deps.model,
  });
  let filename = uploaded?.filename?.trim();
  if (!filename) {
    throw new Error('Upload did not return a filename.');
  }
  let previewUrl = previewUrlForFilename(filename, comfyUrl, imageUrl, garmentFile);

  const cutoutFile = garmentFile;
  const cutoutFilename = filename;
  const cutoutPreviewUrl = previewUrl;

  // Shoes are read first: the extract needs their name to keep the right pair (see
  // buildFootwearPackshotExtractPrompt), and a guessed pair is worse than no picture.
  let shoeWords = '';
  if (shoes) {
    deps.onStatus('Reading the shoes…');
    try {
      shoeWords = (await deps.scanDescription(sourceFile))?.trim() ?? '';
    } catch {
      shoeWords = '';
    }
    if (!shoeWords) {
      throw new Error(
        'Could not read the shoes in that photo — a worn photo needs a vision model (Settings → LLM). Upload a packshot of the shoes, or type them under In words.'
      );
    }
  }

  const packshotModel = resolveFittingGarmentPackshotModel(deps.model);
  if (packshotModel) {
    deps.onStatus(shoes ? 'Building shoes-only packshot…' : 'Building clothing-only packshot…');
    try {
      const promptId = await deps.sendComfyUi(
        shoes
          ? buildFootwearPackshotExtractPrompt({ description: shoeWords })
          : buildFittingGarmentPackshotExtractPrompt(),
        undefined,
        undefined,
        {
          inputImageFilename: filename,
          inputImageUrl: previewUrl,
          identityLock: false,
          queueModel: packshotModel,
          qualityProfile: 'draft',
          turboEditStrength: 'strong',
          explicitNegative: shoes
            ? FOOTWEAR_PACKSHOT_EXTRACT_NEGATIVE
            : FITTING_GARMENT_PACKSHOT_EXTRACT_NEGATIVE,
          queueParamsBase: fittingGarmentPackshotQueueParams(),
          queueHints: '',
          characterId: deps.characterId,
          lookId: deps.lookId,
        }
      );
      const id = typeof promptId === 'string' ? promptId.trim() : '';
      if (id) {
        const completed = await waitForGalleryPromptIds([id], {
          timeoutMs: 3 * 60_000,
          pollMs: 2_500,
        });
        const entry = completed[0];
        const packshotUrl = entry ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
        if (packshotUrl) {
          const packshotBlob = await loadImageBlobFromUrls([packshotUrl]);
          const packshotFile = new File([packshotBlob], `${stem}-packshot-${Date.now()}.png`, {
            type: packshotBlob.type || 'image/png',
            lastModified: Date.now(),
          });
          uploaded = await resolveQueueInputImage({
            file: packshotFile,
            filename: packshotFile.name,
            model: deps.model,
          });
          const packshotFilename = uploaded?.filename?.trim();
          if (!packshotFilename) {
            throw new Error('Packshot upload did not return a filename.');
          }

          filename = packshotFilename;
          garmentFile = packshotFile;
          previewUrl =
            collectIsolateSourceUrls({
              filename: packshotFilename,
              comfyUrl,
            }).find(url => url.includes('/api/comfyui/view?')) ?? packshotUrl;

          let description: string | undefined;
          deps.onStatus(`Checking ${noun} packshot…`);
          try {
            // Shoes keep the words read from the worn photo — they named the extract.
            const probeDescription = shoes ? shoeWords : await deps.scanDescription(packshotFile);
            // Shoes: an empty read means the edit lost them — keep the cutout, as for clothing.
            if (
              shoes
                ? !probeDescription?.trim()
                : isCollapsedFittingGarmentDescription(probeDescription)
            ) {
              garmentFile = cutoutFile;
              filename = cutoutFilename;
              previewUrl = cutoutPreviewUrl;
              deps.onSoftError(
                'Packshot edit looked collapsed (pattern / empty). Kept the white clothing cutout — try Rescan or re-upload.'
              );
              return { filename, previewUrl };
            }
            if (probeDescription?.trim()) {
              description = probeDescription.trim();
            }
          } catch {
            /* soft-accept without description */
          }
          return { filename, previewUrl, description };
        }
      }
    } catch (err) {
      garmentFile = cutoutFile;
      filename = cutoutFilename;
      previewUrl = cutoutPreviewUrl;
      deps.onSoftError(
        err instanceof Error
          ? `${err.message} Kept the white clothing cutout.`
          : 'Packshot extract failed. Kept the white clothing cutout.'
      );
    }
  }

  let description: string | undefined;
  try {
    deps.onStatus(`Scanning ${noun} packshot with vision…`);
    const scanned = shoeWords || (await deps.scanDescription(garmentFile));
    if (scanned?.trim()) {
      description = scanned.trim();
    }
  } catch (err) {
    deps.onSoftError(
      err instanceof Error
        ? `${err.message} Clothing photo kept — try-on will rely on Image 2 until you rescan.`
        : 'Vision scan failed. Clothing photo kept — try-on will rely on Image 2 until you rescan.'
    );
  }
  return { filename, previewUrl, description };
}
