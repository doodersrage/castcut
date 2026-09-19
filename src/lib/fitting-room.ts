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

/** Outfit micro-funnel chips: Look plate → try-on → Keep → Day. */
export type FittingOutfitPhaseId = 'plate' | 'tryon' | 'keep' | 'day';

export const FITTING_OUTFIT_PHASES: Array<{
  id: FittingOutfitPhaseId;
  label: string;
  description: string;
}> = [
  { id: 'plate', label: 'Plate', description: 'Lock a Cast look plate' },
  { id: 'tryon', label: 'Try-on', description: 'Queue a kit or BYO clothing' },
  { id: 'keep', label: 'Keep', description: 'Pick a winner for Day' },
  { id: 'day', label: 'Day', description: 'Continue to the day film' },
];

/** Active Outfit phase for the phase strip. */
export function resolveFittingOutfitPhase(input: {
  hasPlate: boolean;
  compareCount: number;
  continueDayReady?: boolean;
}): FittingOutfitPhaseId {
  if (input.continueDayReady) {
    return 'day';
  }
  if (input.compareCount > 0) {
    return 'keep';
  }
  if (input.hasPlate) {
    return 'tryon';
  }
  return 'plate';
}

/** Short user-facing reason Outfit queue is blocked, or null when ready. */
export function fittingQueueBlockReason(input: {
  hasCharacter: boolean;
  hasPlate: boolean;
  hasGarmentSource: boolean;
  referenceUploading?: boolean;
  garmentUploading?: boolean;
  isolateSubject?: boolean;
  isolatePending?: boolean;
  busy?: boolean;
}): string | null {
  if (!input.hasCharacter) {
    return 'Pick a Cast character first.';
  }
  if (!input.hasPlate) {
    return 'Add a look plate (upload, Gallery, or Extract look) before Queue try-on.';
  }
  if (input.referenceUploading) {
    return 'Wait for the plate upload to finish.';
  }
  if (input.isolateSubject && input.isolatePending) {
    return 'Wait for plate isolate on white to finish.';
  }
  if (input.garmentUploading) {
    return 'Wait for the clothing upload to finish.';
  }
  if (!input.hasGarmentSource) {
    return 'Pick a wardrobe kit or upload a clothing photo.';
  }
  if (input.busy) {
    return 'Already queueing a try-on…';
  }
  return null;
}

/** Remove one try-on from the compare strip (Pass / dismiss). */
export function dismissFittingCompareTryOn(
  current: FittingCompareTryOn[] | undefined,
  promptId: string
): FittingCompareTryOn[] {
  const id = promptId.trim();
  if (!id) {
    return current ?? [];
  }
  return (current ?? []).filter(item => item.promptId !== id);
}

/** Short status line for plate · kit/BYO chrome. */
export function fittingSessionStatusLine(input: {
  hasPlate: boolean;
  kitLabel?: string | null;
  hasByo?: boolean;
  byoLabel?: string | null;
}): string {
  const plate = input.hasPlate ? 'Plate ready' : 'No plate';
  if (input.hasByo) {
    const byo = input.byoLabel?.trim() || 'Your clothing photo';
    return `${plate} · ${byo}`;
  }
  const kit = input.kitLabel?.trim();
  if (kit) {
    return `${plate} · ${kit}`;
  }
  return `${plate} · No kit selected`;
}

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
 * Pass `force: true` after a Cast switch so a prior character's photo cannot stick.
 */
export function withRoleplayLookPlateFromCast(
  cache: RoleplayToolCache,
  character: CharacterRecord | null | undefined,
  options?: { force?: boolean }
): RoleplayToolCache {
  const fields = roleplayLookPlateFieldsFromCharacter(character);
  if (!fields) {
    return cache;
  }
  const hasRef = Boolean(cache.referenceImageUrl?.trim() || cache.referenceImageFilename?.trim());
  if (hasRef && options?.force !== true) {
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

/**
 * Edit instruction: turn a worn still or messy clothing photo into a clean
 * ghost-mannequin / flat-lay packshot (no person) for Outfit Image 2.
 * Keep this short — distilled edit stacks (4-step CFG 1) collapse long essays
 * into repeating patterns / glyph walls.
 */
export function buildFittingGarmentPackshotExtractPrompt(input?: {
  garmentDescription?: string;
}): string {
  const description = input?.garmentDescription?.trim();
  return [
    'Replace Image 1 with a photoreal ecommerce clothing product photograph of the same garments only.',
    description
      ? `Keep these garments exactly: ${description}.`
      : 'Keep the exact garments, colors, fabrics, and accessories from Image 1.',
    'Ghost mannequin or neat flat lay on a seamless pure white studio background.',
    'No person, no face, no skin, no hands, no head.',
    'One centered outfit, soft even studio light, sharp fabric detail.',
    'Real clothing photo — not a pattern, texture, grid, wallpaper, or text.',
  ].join(' ');
}

/** Negatives for the packshot extract edit — fights the tiled/glyph collapse mode. */
export const FITTING_GARMENT_PACKSHOT_EXTRACT_NEGATIVE =
  'repeating pattern, tiled texture, seamless wallpaper, abstract geometry, glyph wall, illegible text, hieroglyphs, noise field, grid of icons, procedural texture, kaleidoscope, no clothing, empty frame';

const FITTING_GARMENT_NOUN_RE =
  /\b(shirt|dress|jacket|coat|pants|jeans|skirt|blouse|sweater|hoodie|suit|gown|boot|shoes?|sneakers?|blazer|trousers?|top|bottom|outfit|garment|fabric|sleeve|collar|hem|knit|denim|leather|silk|cotton|wool|vest|shorts|romper|jumpsuit|lingerie|bra|underwear|socks?|hat|scarf|bag|belt|tee|t-shirt|cardigan|parka|raincoat|kimono|robe|uniform|armor|corset|bodysuit|leggings|chino|loafer|heel|sandal|mitten|glove|tie|bow|clothing|apparel|wardrobe|fashion|ecommerce|product\s*photo|packshot|flat\s*lay|ghost\s*mannequin)\b/i;

const FITTING_GARMENT_COLLAPSE_RE =
  /\b(abstract|repeating pattern|tiled|glyph|wallpaper|texture map|geometric pattern|noise field|hieroglyph|illegible text|no clothing|empty frame)\b/i;

/**
 * True when vision (or a probe) clearly describes a collapsed packshot edit
 * (pattern wall / empty / glyph dump) — the only hard reject for Image 2.
 */
export function isCollapsedFittingGarmentDescription(text: string | null | undefined): boolean {
  const trimmed = text?.replace(/\s+/g, ' ').trim() ?? '';
  if (!trimmed) {
    return false;
  }
  return FITTING_GARMENT_COLLAPSE_RE.test(trimmed);
}

/** True when a vision scan reads as real garments (not a collapsed pattern dump). */
export function isPlausibleFittingGarmentDescription(text: string | null | undefined): boolean {
  const trimmed = text?.replace(/\s+/g, ' ').trim() ?? '';
  if (trimmed.length < 8) {
    return false;
  }
  if (isCollapsedFittingGarmentDescription(trimmed)) {
    return false;
  }
  return FITTING_GARMENT_NOUN_RE.test(trimmed);
}

/** Img2img instruction: keep identity, swap wardrobe to the locked kit. */
export function buildFittingOutfitPrompt(input: {
  outfitLabel: string;
  characterName?: string;
  /**
   * @deprecated Ignored — Cast look / bible clothing fights the try-on kit.
   * Identity comes from the plate image only.
   */
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
  const notes = input.notes?.trim();
  const garmentDescription = input.garmentDescription?.trim();
  const garmentLine = input.hasGarmentReference
    ? garmentDescription
      ? `Apply the exact outfit from Image 2 (ghost-mannequin / flat-lay clothing packshot). Match silhouette, color, fabric, and accessories. Visible garments: ${garmentDescription}. Keep face, hair, body, and pose from Image 1.`
      : 'Apply the exact outfit from Image 2 (ghost-mannequin / flat-lay clothing packshot). Match silhouette, color, fabric, and accessories. Keep face, hair, body, and pose from Image 1.'
    : `replace: all clothing and footwear with this outfit — ${outfit}`;
  return [
    'Edit instruction for an outfit try-on:',
    input.hasGarmentReference
      ? 'Image 1 is the person plate; Image 2 is the clothing-only packshot (no person)'
      : null,
    'keep: face, hair, body identity, skin tone, and likeness from the reference plate only',
    name ? `subject: ${name}` : null,
    // Never inject Cast look / bible notes — they often name the plate's clothes and
    // the edit model will "keep" them. Wardrobe authority is outfit / Image 2 only.
    'ignore Cast look notes, character bible clothing, and any wardrobe described on the character record',
    garmentLine,
    input.hasGarmentReference ? `outfit name (confirm match): ${outfit}` : null,
    'discard every garment, uniform, shoe, bag, hat, and accessory from Image 1 unless the new outfit explicitly includes them',
    'do not restore the reference photo street clothes even if they match older look notes',
    input.isolated
      ? 'background: clean plain studio / white seamless; no scene from the original photo'
      : 'background: keep a simple neutral setting; do not invent a busy location',
    notes
      ? `styling tweaks for the new outfit only (never restore Image 1 clothes): ${notes}`
      : null,
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
