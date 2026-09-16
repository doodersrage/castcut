import {
  activeLook,
  getCharacter,
  upsertCharacter,
  type CharacterRecord,
} from '@/lib/character-os';
import { resolveFittingPlateFromCharacter } from '@/lib/fitting-room';
import {
  collectIsolateSourceUrls,
  isolateSubjectOnWhite,
  loadImageBlobFromUrls,
} from '@/lib/isolate-subject';
import type { MoodboardTile } from '@/lib/moodboard-scene';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  galleryEntryDownloadUrls,
  galleryEntryPrimaryViewUrl,
  loadComfyGallery,
} from '@/lib/comfyui-gallery';
import { persistIdentityImage } from '@/lib/gallery-media-client';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import {
  DEFAULT_FITTING_TOOL_CACHE,
  loadToolSettings,
  saveToolSettings,
  type FittingToolCache,
} from '@/lib/settings-cache';

export type OutfitPlateEnsureResult = 'ready' | 'queued' | 'skipped' | 'failed';

/** Prefer Capture-seeded subject tiles, then any tile with an image. */
export function pickMoodboardPlateSource(
  tiles: MoodboardTile[] | null | undefined
): { imageUrl?: string; filename?: string; label?: string } | null {
  const withImage = (tiles ?? []).filter(tile =>
    Boolean(tile.imageUrl?.trim() || tile.imageFilename?.trim())
  );
  if (withImage.length === 0) {
    return null;
  }
  const preferred =
    withImage.find(tile => tile.role === 'other') ??
    withImage.find(tile => tile.role === 'style') ??
    withImage[0]!;
  return {
    imageUrl: preferred.imageUrl?.trim() || undefined,
    filename: preferred.imageFilename?.trim() || undefined,
    label: preferred.label?.trim() || preferred.notes?.trim() || undefined,
  };
}

/** Portrait still prompt used as the Outfit try-on plate when Look has no tile photo. */
export function buildLookCastPlatePrompt(input: {
  characterName?: string;
  descriptor?: string;
  vibePrompt?: string;
}): string {
  const name = input.characterName?.trim() || 'the Cast lead';
  const descriptor = input.descriptor?.trim();
  const vibe = input.vibePrompt?.trim();
  return [
    `Cast plate still for outfit try-on — ${name}:`,
    descriptor
      ? `look (mandatory unique face and body — not a stock beauty face): ${descriptor}`
      : 'look: keep a distinct, consistent face and body',
    vibe ? `style vibe from Look: ${vibe.slice(0, 480)}` : null,
    'single person, three-quarter portrait or standing full/three-quarter framing',
    'plain soft seamless backdrop, even studio lighting, clear silhouette for wardrobe try-on',
    'no crowd, no heavy props, no text overlays',
  ]
    .filter(Boolean)
    .join('\n');
}

export function fittingHasSessionPlate(cache: FittingToolCache | null | undefined): boolean {
  return Boolean(cache?.referenceImageFilename?.trim() || cache?.referenceImageUrl?.trim());
}

/** Drop the Cast look plate so Look Extract can queue a fresh Outfit plate. */
export function clearCharacterLookPlate(characterId?: string | null): boolean {
  const id = characterId?.trim();
  if (!id) {
    return false;
  }
  const character = getCharacter(id);
  if (!character) {
    return false;
  }
  const look = activeLook(character);
  const hasPlate = Boolean(
    look.reference ||
    character.reference ||
    look.ipAdapter?.imageUrl ||
    look.ipAdapter?.imageFilename ||
    character.ipAdapter?.imageUrl ||
    character.ipAdapter?.imageFilename
  );
  if (!hasPlate) {
    return false;
  }
  const looks = (character.looks ?? [look]).map(entry =>
    entry.id === look.id ? { ...entry, reference: undefined, ipAdapter: undefined } : entry
  );
  upsertCharacter({
    ...character,
    reference: undefined,
    ipAdapter: undefined,
    looks,
    activeLookId: look.id,
    updatedAt: Date.now(),
  });

  // Keep Outfit in sync and block auto-seed until the user sets a new plate.
  const previous = loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE);
  saveToolSettings('fitting', {
    ...previous,
    referenceImageUrl: undefined,
    referenceImageFilename: undefined,
    referenceOriginalUrl: undefined,
    referenceOriginalFilename: undefined,
    referenceIsolated: false,
    pendingOutfitPlatePromptId: undefined,
    suppressAutoPlateSeed: true,
  });
  return true;
}

function resolveTileImageUrl(source: { imageUrl?: string; filename?: string }): string | undefined {
  const direct = source.imageUrl?.trim();
  if (direct) {
    return direct;
  }
  const filename = source.filename?.trim();
  if (!filename) {
    return undefined;
  }
  const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
  return (
    collectIsolateSourceUrls({
      filename,
      comfyUrl,
    }).find(url => url.includes('/api/comfyui/view?')) ||
    collectIsolateSourceUrls({ filename, comfyUrl })[0]
  );
}

/** Write Outfit session plate + Cast character reference so Fitting auto-picks it up. */
export function assignOutfitPlateToCastAndFitting(input: {
  characterId: string;
  imageUrl: string;
  filename?: string;
  isolated?: boolean;
}): CharacterRecord | null {
  const characterId = input.characterId.trim();
  const imageUrl = input.imageUrl.trim();
  const filename = input.filename?.trim() || undefined;
  if (!characterId || !imageUrl) {
    return null;
  }
  const character = getCharacter(characterId);
  if (!character) {
    return null;
  }
  const reference: NonNullable<CharacterRecord['reference']> = {
    originalUrl: imageUrl,
    originalFilename: filename,
    isolatedUrl: imageUrl,
    isolatedFilename: filename,
    isolated: input.isolated === true,
    isolateSubject: true,
  };
  const ipAdapter = filename
    ? {
        imageFilename: filename,
        imageUrl,
      }
    : {
        imageUrl,
      };
  const look = activeLook(character);
  const looks = (character.looks ?? [look]).map(entry =>
    entry.id === look.id ? { ...entry, reference, ipAdapter } : entry
  );
  upsertCharacter({
    ...character,
    reference,
    ipAdapter,
    looks,
    activeLookId: look.id,
    updatedAt: Date.now(),
  });

  const previous = loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE);
  saveToolSettings('fitting', {
    ...previous,
    isolateSubject: true,
    referenceIsolated: input.isolated === true,
    referenceImageUrl: imageUrl,
    referenceImageFilename: filename,
    referenceOriginalUrl: imageUrl,
    referenceOriginalFilename: filename,
    pendingOutfitPlatePromptId: undefined,
    suppressAutoPlateSeed: false,
  });

  return getCharacter(characterId) ?? null;
}

export function setPendingOutfitPlatePromptId(promptId: string | undefined): void {
  const previous = loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE);
  const id = promptId?.trim() || undefined;
  if (previous.pendingOutfitPlatePromptId === id) {
    return;
  }
  saveToolSettings('fitting', {
    ...previous,
    pendingOutfitPlatePromptId: id,
  });
}

export function findCompletedOutfitPlateStill(promptId: string): {
  imageUrl: string;
  filename?: string;
} | null {
  const id = promptId.trim();
  if (!id) {
    return null;
  }
  const entry = loadComfyGallery().find(item => item.promptId === id);
  if (!entry || entry.status !== 'completed') {
    return null;
  }
  const imageUrl = galleryEntryPrimaryViewUrl(entry)?.trim();
  if (!imageUrl) {
    return null;
  }
  const download = galleryEntryDownloadUrls(entry);
  const index = entry.images.findIndex((_image, i) => download.url[i] === imageUrl);
  const filename =
    (index >= 0 ? download.filename[index] : download.filename[0])?.trim() ||
    entry.images[0]?.filename?.trim() ||
    undefined;
  return { imageUrl, filename };
}

/**
 * After Look extract/handoff: reuse Cast/session plate, promote a Moodboard tile,
 * or queue a Cast plate still so Outfit is not blocked.
 *
 * Pass `forceReplace: true` from Extract look so an existing Outfit plate is cleared
 * and replaced (tile stamp or new Comfy still). Handoffs keep the default ensure path.
 */
export async function ensureOutfitPlateAfterLook(input: {
  characterId?: string;
  tiles: MoodboardTile[];
  vibePrompt?: string;
  /** Extract look — replace any existing Outfit / Cast plate. */
  forceReplace?: boolean;
  sendComfyUi: (
    prompt: string,
    sport?: null,
    historyId?: undefined,
    options?: {
      characterId?: string;
      lookId?: string;
    }
  ) => Promise<string | undefined>;
}): Promise<OutfitPlateEnsureResult> {
  const characterId = input.characterId?.trim();
  if (!characterId) {
    return 'skipped';
  }
  const character = getCharacter(characterId);
  if (!character) {
    return 'skipped';
  }

  let fitting = loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE);
  const forceReplace = input.forceReplace === true;

  if (forceReplace) {
    clearCharacterLookPlate(characterId);
    fitting = {
      ...fitting,
      isolateSubject: true,
      referenceIsolated: false,
      referenceImageUrl: undefined,
      referenceImageFilename: undefined,
      referenceOriginalUrl: undefined,
      referenceOriginalFilename: undefined,
      pendingOutfitPlatePromptId: undefined,
      // Block Fitting auto-seed from a stale Cast plate until tile/queue attaches.
      suppressAutoPlateSeed: true,
    };
    saveToolSettings('fitting', fitting);
  }

  const forceNewPlate = forceReplace || fitting.suppressAutoPlateSeed === true;

  // Session plate already set — skip unless the user cleared it / Extract force-replace.
  if (
    !forceNewPlate &&
    fittingHasSessionPlate(fitting) &&
    !fitting.pendingOutfitPlatePromptId?.trim()
  ) {
    return 'skipped';
  }

  if (!forceNewPlate) {
    let castPlate;
    try {
      castPlate = resolveFittingPlateFromCharacter(character);
    } catch {
      castPlate = null;
    }
    if (castPlate?.imageUrl?.trim() || castPlate?.filename?.trim()) {
      if (!fittingHasSessionPlate(fitting)) {
        const imageUrl =
          castPlate.imageUrl?.trim() || resolveTileImageUrl({ filename: castPlate.filename }) || '';
        if (imageUrl) {
          assignOutfitPlateToCastAndFitting({
            characterId,
            imageUrl,
            filename: castPlate.filename,
            isolated: castPlate.isolated,
          });
          return 'ready';
        }
      }
      return 'skipped';
    }
  }

  const source = pickMoodboardPlateSource(input.tiles);
  if (source) {
    const imageUrl = resolveTileImageUrl(source);
    if (imageUrl) {
      assignOutfitPlateToCastAndFitting({
        characterId,
        imageUrl,
        filename: source.filename,
      });
      return 'ready';
    }
  }

  // Re-read character after clear — queue uses active look id.
  const fresh = getCharacter(characterId) ?? character;
  const prompt = buildLookCastPlatePrompt({
    characterName: fresh.name,
    descriptor: fresh.descriptor || fresh.hints,
    vibePrompt: input.vibePrompt,
  });
  try {
    const promptId = await input.sendComfyUi(prompt, null, undefined, {
      characterId,
      lookId: fresh.activeLookId,
    });
    const id = typeof promptId === 'string' ? promptId.trim() : '';
    if (!id) {
      return 'failed';
    }
    setPendingOutfitPlatePromptId(id);
    // Keep suppressAutoPlateSeed until the queued still attaches (or user uploads).
    return 'queued';
  } catch {
    return 'failed';
  }
}

export type ApplyCastLookPlateInput = {
  characterId: string;
  file?: File | null;
  imageUrl?: string;
  filename?: string;
  /** Default true — isolate on white like Outfit. */
  isolate?: boolean;
  model?: string;
};

/**
 * Upload / gallery still → Cast look plate (+ Outfit session mirror).
 * Used from character home for replace.
 */
export async function applyCastLookPlateFromSource(
  input: ApplyCastLookPlateInput
): Promise<{ character: CharacterRecord; imageUrl: string; filename?: string; isolated: boolean }> {
  const characterId = input.characterId.trim();
  if (!characterId) {
    throw new Error('Pick a Cast character first.');
  }
  if (!getCharacter(characterId)) {
    throw new Error('That Cast character is not on this device.');
  }
  const file = input.file ?? null;
  const imageUrl = input.imageUrl?.trim() || '';
  if (!file && !imageUrl && !input.filename?.trim()) {
    throw new Error('Choose a photo or a gallery still first.');
  }
  const shouldIsolate = input.isolate !== false;
  const originalName = input.filename?.trim() || file?.name || `cast-plate-${Date.now()}.png`;
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

  const originalUploaded = await resolveQueueInputImage({
    file: sourceFile,
    filename: originalName,
    model: input.model,
  });
  const originalFilename = originalUploaded?.filename?.trim();
  if (!originalFilename) {
    throw new Error('Upload did not return a filename.');
  }
  const incomingDurable = imageUrl && !imageUrl.startsWith('blob:') ? imageUrl : '';
  const originalViewUrl =
    collectIsolateSourceUrls({
      filename: originalFilename,
      comfyUrl,
    }).find(url => url.includes('/api/comfyui/view?')) ?? '';
  const originalUrl = incomingDurable || originalViewUrl || imageUrl;

  let queueFilename = originalFilename;
  let queueUrl = originalUrl;
  let isolated = false;

  if (!shouldIsolate) {
    const durable = await persistIdentityImage({
      file: sourceFile,
      filename: originalFilename,
    });
    queueUrl = durable || originalUrl;
  } else {
    try {
      const cutout = await isolateSubjectOnWhite(sourceFile, originalName);
      const cutoutUploaded = await resolveQueueInputImage({
        file: cutout,
        filename: cutout.name,
        model: input.model,
      });
      const cutoutFilename = cutoutUploaded?.filename?.trim();
      if (!cutoutFilename) {
        throw new Error('Cut-out upload did not return a filename.');
      }
      const cutoutDurable = await persistIdentityImage({
        file: cutout,
        filename: cutoutFilename,
      });
      queueFilename = cutoutFilename;
      queueUrl = cutoutDurable || URL.createObjectURL(cutout);
      isolated = true;
    } catch {
      const durable = await persistIdentityImage({
        file: sourceFile,
        filename: originalFilename,
      });
      queueUrl = durable || originalUrl;
      isolated = false;
    }
  }

  if (!queueUrl.trim()) {
    throw new Error('Could not resolve a plate image URL.');
  }

  const character = assignOutfitPlateToCastAndFitting({
    characterId,
    imageUrl: queueUrl,
    filename: queueFilename,
    isolated,
  });
  if (!character) {
    throw new Error('Could not save the look plate to Cast.');
  }
  return { character, imageUrl: queueUrl, filename: queueFilename, isolated };
}

/** Attach a completed Look→Outfit plate still when Fitting mounts or gallery updates. */
export function tryAttachPendingOutfitPlate(characterId?: string): boolean {
  const fitting = loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE);
  const pendingId = fitting.pendingOutfitPlatePromptId?.trim();
  if (!pendingId) {
    return false;
  }
  const still = findCompletedOutfitPlateStill(pendingId);
  if (!still) {
    return false;
  }
  const id = characterId?.trim() || undefined;
  if (id) {
    assignOutfitPlateToCastAndFitting({
      characterId: id,
      imageUrl: still.imageUrl,
      filename: still.filename,
    });
    return true;
  }
  // No Cast id — still clear pending and stamp session plate so try-on can proceed.
  saveToolSettings('fitting', {
    ...fitting,
    isolateSubject: true,
    referenceIsolated: false,
    referenceImageUrl: still.imageUrl,
    referenceImageFilename: still.filename,
    referenceOriginalUrl: still.imageUrl,
    referenceOriginalFilename: still.filename,
    pendingOutfitPlatePromptId: undefined,
    suppressAutoPlateSeed: false,
  });
  return true;
}

export { COMFYUI_GALLERY_UPDATED_EVENT };
