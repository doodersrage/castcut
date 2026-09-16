import type { CharacterRecord } from '@/lib/character-os';
import { activeLook } from '@/lib/character-os';
import { buildSinglePersonUserDirective } from '@/lib/single-person';
import type { RoleplayToolCache } from '@/lib/settings-cache';

export type FittingCompareTryOn = {
  promptId: string;
  wardrobeId: string;
  wardrobeLabel?: string;
  imageUrl?: string;
  galleryEntryId?: string;
};

export const FITTING_COMPARE_LIMIT = 4;

/** Short outfit label for queue chrome / confirm-match line. */
export function clipFittingGarmentLabel(description: string, max = 96): string {
  const trimmed = description.replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    return 'uploaded clothing reference';
  }
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Build ImageLightbox state for the compare strip (newest-first order preserved). */
export function buildFittingCompareLightboxState(
  tryOns: FittingCompareTryOn[],
  openPromptId: string
): {
  images: string[];
  titles: string[];
  index: number;
  title: string;
} | null {
  const slides = tryOns
    .map(tryOn => {
      const url = tryOn.imageUrl?.trim();
      if (!url) {
        return null;
      }
      const title = tryOn.wardrobeLabel?.trim() || tryOn.wardrobeId?.trim() || 'Try-on';
      return { promptId: tryOn.promptId, url, title };
    })
    .filter((slide): slide is { promptId: string; url: string; title: string } => slide != null);
  if (slides.length === 0) {
    return null;
  }
  const index = Math.max(
    0,
    slides.findIndex(slide => slide.promptId === openPromptId)
  );
  return {
    images: slides.map(slide => slide.url),
    titles: slides.map(slide => slide.title),
    index,
    title: slides[index]?.title ?? 'Try-on',
  };
}

/** Append a try-on to the compare strip (newest first, capped). */
export function pushFittingCompareTryOn(
  current: FittingCompareTryOn[] | undefined,
  entry: FittingCompareTryOn
): FittingCompareTryOn[] {
  const id = entry.promptId.trim();
  if (!id) {
    return current ?? [];
  }
  const without = (current ?? []).filter(item => item.promptId !== id);
  return [{ ...entry, promptId: id }, ...without].slice(0, FITTING_COMPARE_LIMIT);
}

export type FittingPlate = {
  filename?: string;
  imageUrl?: string;
  originalFilename?: string;
  originalUrl?: string;
  isolated?: boolean;
  isolateSubject?: boolean;
};

/** Resolve a try-on plate from Cast character / active look. */
export function resolveFittingPlateFromCharacter(
  character: CharacterRecord | null | undefined
): FittingPlate | null {
  if (!character) {
    return null;
  }
  let look;
  try {
    look = activeLook(character);
  } catch {
    look = undefined;
  }
  const reference = look?.reference ?? character.reference;
  if (reference) {
    const isolated = reference.isolated === true;
    const filename =
      (isolated ? reference.isolatedFilename : reference.originalFilename)?.trim() ||
      reference.isolatedFilename?.trim() ||
      reference.originalFilename?.trim() ||
      '';
    const imageUrl =
      (isolated ? reference.isolatedUrl : reference.originalUrl)?.trim() ||
      reference.isolatedUrl?.trim() ||
      reference.originalUrl?.trim() ||
      '';
    if (filename || imageUrl) {
      return {
        filename: filename || undefined,
        imageUrl: imageUrl || undefined,
        originalFilename: reference.originalFilename?.trim() || undefined,
        originalUrl: reference.originalUrl?.trim() || undefined,
        isolated,
        isolateSubject: reference.isolateSubject !== false,
      };
    }
  }

  const ip = look?.ipAdapter ?? character.ipAdapter;
  const filename = ip?.imageFilename?.trim() || '';
  const imageUrl = ip?.imageUrl?.trim() || ip?.comfyUrl?.trim() || '';
  if (!filename && !imageUrl) {
    return null;
  }
  return {
    filename: filename || undefined,
    imageUrl: imageUrl || undefined,
    isolated: false,
    isolateSubject: true,
  };
}

/** Cast look/outfit plate → Story From-photo fields (no Day keepers / Look tiles). */
export function roleplayLookPlateFieldsFromCharacter(
  character: CharacterRecord | null | undefined
): Partial<RoleplayToolCache> | null {
  const plate = resolveFittingPlateFromCharacter(character);
  if (!plate) {
    return null;
  }
  const imageUrl = plate.imageUrl?.trim() || undefined;
  const filename = plate.filename?.trim() || undefined;
  if (!imageUrl && !filename) {
    return null;
  }
  return {
    playAs: 'photo',
    referenceImageUrl: imageUrl,
    referenceImageFilename: filename,
    referenceOriginalUrl: plate.originalUrl?.trim() || imageUrl,
    referenceOriginalFilename: plate.originalFilename?.trim() || filename,
    isolateSubject: plate.isolateSubject !== false,
    referenceIsolated: plate.isolated === true,
  };
}

/**
 * Seed Story with the Cast look plate when the session has no reference yet.
 * Keeps an existing Story photo; turns on From photo so identity locks.
 */
export function withRoleplayLookPlateFromCast(
  cache: RoleplayToolCache,
  character: CharacterRecord | null | undefined
): RoleplayToolCache {
  const fields = roleplayLookPlateFieldsFromCharacter(character);
  if (!fields) {
    return cache;
  }
  const hasRef = Boolean(cache.referenceImageUrl?.trim() || cache.referenceImageFilename?.trim());
  if (hasRef) {
    return { ...cache, playAs: 'photo' };
  }
  return { ...cache, ...fields };
}

export type FittingSwipeKit = {
  id: string;
  label: string;
  group?: string;
};

/**
 * Curated kit deck for Fitting swipe — non-empty catalog options in stable order
 * (outfit-group kits first, then label) so Prev/Next do not jump when selection changes.
 */
export function buildFittingSwipeDeck(
  options: Array<{ value: string; label: string; group?: string }>,
  limit?: number
): FittingSwipeKit[] {
  const kits: FittingSwipeKit[] = [];
  const seen = new Set<string>();
  for (const option of options) {
    const id = option.value?.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    kits.push({
      id,
      label: option.label?.trim() || id,
      group: option.group?.trim() || undefined,
    });
  }
  if (kits.length === 0) {
    return [];
  }

  const outfitFirst = [...kits].sort((left, right) => {
    const leftOutfit = /outfit/i.test(left.group ?? '') ? 0 : 1;
    const rightOutfit = /outfit/i.test(right.group ?? '') ? 0 : 1;
    if (leftOutfit !== rightOutfit) {
      return leftOutfit - rightOutfit;
    }
    return left.label.localeCompare(right.label);
  });

  return limit && limit > 0 ? outfitFirst.slice(0, limit) : outfitFirst;
}

export function fittingSwipeIndex(deck: FittingSwipeKit[], wardrobeId?: string): number {
  const id = wardrobeId?.trim();
  if (!id || deck.length === 0) {
    return -1;
  }
  const index = deck.findIndex(kit => kit.id === id);
  return index;
}

/** Wardrobe id used for swipe navigation — falls back to first deck kit when lock is outside the deck. */
export function resolveFittingDeckWardrobeId(
  deck: FittingSwipeKit[],
  wardrobeId?: string
): string | undefined {
  if (deck.length === 0) {
    return undefined;
  }
  const id = wardrobeId?.trim();
  if (id && deck.some(kit => kit.id === id)) {
    return id;
  }
  return deck[0]?.id;
}

export function fittingSwipeNeighbor(
  deck: FittingSwipeKit[],
  wardrobeId: string | undefined,
  delta: number
): FittingSwipeKit | null {
  if (deck.length === 0) {
    return null;
  }
  const currentId = resolveFittingDeckWardrobeId(deck, wardrobeId);
  const current = fittingSwipeIndex(deck, currentId);
  const base = current >= 0 ? current : 0;
  const next = (base + delta + deck.length) % deck.length;
  return deck[next] ?? null;
}

export type FittingPreviewPlate = {
  filename: string;
  imageUrl: string;
};

/** Stable key for preview-plate cache invalidation when the fitting reference changes. */
export function fittingPreviewPlateSourceKey(input: {
  referenceImageFilename?: string;
  referenceOriginalFilename?: string;
  referenceImageUrl?: string;
}): string {
  return [
    input.referenceImageFilename?.trim(),
    input.referenceOriginalFilename?.trim(),
    input.referenceImageUrl?.trim(),
  ]
    .filter(Boolean)
    .join('|');
}

/** Resolve a white-background plate for draft previews (sidecar cache only). */
export function resolveFittingKitPreviewPlate(input: {
  previewPlateFilename?: string;
  previewPlateUrl?: string;
  previewPlateSourceKey?: string;
  sourceKey: string;
}): FittingPreviewPlate | null {
  const cachedFilename = input.previewPlateFilename?.trim();
  if (cachedFilename && input.previewPlateSourceKey?.trim() === input.sourceKey.trim()) {
    return {
      filename: cachedFilename,
      imageUrl: input.previewPlateUrl?.trim() || '',
    };
  }
  return null;
}

/** Img2img instruction: keep identity, swap wardrobe to the locked kit. */
export function buildFittingOutfitPrompt(input: {
  outfitLabel: string;
  characterName?: string;
  characterDescriptor?: string;
  notes?: string;
  isolated?: boolean;
  /** When a garment packshot is queued as Image 2. */
  hasGarmentReference?: boolean;
  /** Vision (or manual) description of the BYO clothing photo. */
  garmentDescription?: string;
}): string {
  const outfit = input.outfitLabel.trim();
  const name = input.characterName?.trim();
  const descriptor = input.characterDescriptor?.trim();
  const notes = input.notes?.trim();
  const garmentDescription = input.garmentDescription?.trim();
  const garmentLine = input.hasGarmentReference
    ? garmentDescription
      ? `Apply the exact outfit from Image 2 (clothing reference). Match silhouette, color, fabric, and accessories. Visible garments: ${garmentDescription}. Keep face, hair, body, and pose from Image 1.`
      : 'Apply the exact outfit from Image 2 (garment packshot). Match silhouette, color, fabric, and accessories. Keep face, hair, body, and pose from Image 1.'
    : `replace: all clothing and footwear with this outfit — ${outfit}`;
  return [
    'Edit instruction for an outfit try-on:',
    input.hasGarmentReference
      ? 'Image 1 is the person plate; Image 2 is the clothing example'
      : null,
    'keep: face, hair, body identity, skin tone, and likeness from the reference plate',
    name ? `subject: ${name}` : null,
    descriptor ? `look notes: ${descriptor}` : null,
    garmentLine,
    input.hasGarmentReference ? `outfit name (confirm match): ${outfit}` : null,
    'do not keep the reference photo street clothes, uniform, or shoes unless the outfit explicitly includes them',
    input.isolated
      ? 'background: clean plain studio / white seamless; no scene from the original photo'
      : 'background: keep a simple neutral setting; do not invent a busy location',
    notes ? `extra: ${notes}` : null,
    'output: single full-body or three-quarter fashion still of the same person in the new kit',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Tighter instruction for draft swipe thumbs — identity comes from the plate only;
 * no character hints, notes, or scene flavor that can spawn weapons/props/backgrounds.
 */
export function buildFittingKitPreviewPrompt(input: {
  outfitLabel: string;
  hasGarmentReference?: boolean;
}): string {
  const outfit = input.outfitLabel.trim();
  const garmentLine = input.hasGarmentReference
    ? 'Apply the exact outfit from Image 2 (garment packshot). Match silhouette, color, and fabric. Keep face, hair, body, and pose from Image 1.'
    : `Replace all clothing, armor, footwear, and accessories with: ${outfit}.`;
  return [
    buildSinglePersonUserDirective(),
    garmentLine,
    input.hasGarmentReference ? `Outfit name (confirm match): ${outfit}.` : null,
    'Remove every garment, weapon, prop, mask, and handheld item from the reference photo unless the new outfit explicitly includes them.',
    'Same person, face, hair, skin tone, body shape, and pose as the reference photo.',
    'Plain white studio background. One person only — no duplicates, panels, or extra figures.',
    'Empty hands unless the new outfit explicitly includes handheld items.',
  ]
    .filter(Boolean)
    .join(' ');
}
