import {
  activeLook,
  getCharacter,
  upsertCharacter,
  type CharacterRecord,
} from '@/lib/character-os';
import { resolveFittingPlateFromCharacter } from '@/lib/fitting-room';
import { collectIsolateSourceUrls } from '@/lib/isolate-subject';
import type { MoodboardTile } from '@/lib/moodboard-scene';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  galleryEntryDownloadUrls,
  galleryEntryPrimaryViewUrl,
  loadComfyGallery,
} from '@/lib/comfyui-gallery';
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
 */
export async function ensureOutfitPlateAfterLook(input: {
  characterId?: string;
  tiles: MoodboardTile[];
  vibePrompt?: string;
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

  const fitting = loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE);
  if (fittingHasSessionPlate(fitting) && !fitting.pendingOutfitPlatePromptId?.trim()) {
    return 'skipped';
  }

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

  const prompt = buildLookCastPlatePrompt({
    characterName: character.name,
    descriptor: character.descriptor || character.hints,
    vibePrompt: input.vibePrompt,
  });
  try {
    const promptId = await input.sendComfyUi(prompt, null, undefined, {
      characterId,
      lookId: character.activeLookId,
    });
    const id = typeof promptId === 'string' ? promptId.trim() : '';
    if (!id) {
      return 'failed';
    }
    setPendingOutfitPlatePromptId(id);
    return 'queued';
  } catch {
    return 'failed';
  }
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
  });
  return true;
}

export { COMFYUI_GALLERY_UPDATED_EVENT };
