import {
  activeLook,
  applyCharacterRecord,
  castLoraSessionIds,
  getCharacter,
  upsertCharacter,
  type CharacterRecord,
} from '@/lib/character-os';
import { sanitizeCharacterAppearanceDescriptor } from '@/lib/character-appearance';
import { resolveFittingPlateFromCharacter } from '@/lib/fitting-room';
import {
  collectIsolateSourceUrls,
  isolateSubjectOnWhite,
  loadImageBlobFromUrls,
} from '@/lib/isolate-subject';
import type { MoodboardTile } from '@/lib/moodboard-scene';
import type { LookPack } from '@/lib/look-pack';
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
  loadSettingsCache,
  loadToolSettings,
  saveSharedSettings,
  saveToolSettings,
  type FittingToolCache,
} from '@/lib/settings-cache';
import type { SendComfyUiOptions } from '@/hooks/prompt-result/comfy-ui-types';

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

/** Resolve Cast appearance text for a body plate — active look wins over session vibe. */
export function resolveCharacterAppearanceForPlate(character: CharacterRecord | null | undefined): {
  name: string;
  appearance: string;
  loraTriggers: string[];
} {
  const shared = typeof window !== 'undefined' ? loadSettingsCache().shared : undefined;
  let look;
  try {
    look = character ? activeLook(character) : undefined;
  } catch {
    look = undefined;
  }
  const lookDescriptorRaw = look?.descriptor?.trim() || character?.descriptor?.trim() || '';
  const sharedDescriptor = shared?.activeCharacterDescriptor?.trim() || '';
  const hints = look?.hints?.trim() || character?.hints?.trim() || '';
  const bioLook = character?.bio?.look?.trim() || '';
  const lookDescriptor = lookDescriptorRaw
    ? sanitizeCharacterAppearanceDescriptor(lookDescriptorRaw)
    : '';
  const sharedSanitized = sharedDescriptor
    ? sanitizeCharacterAppearanceDescriptor(sharedDescriptor)
    : '';
  // Look/character descriptor is authoritative. Shared is fallback only — never let a
  // stale session descriptor fight the active look (e.g. vibe-adjacent leftovers).
  const parts = [lookDescriptor || sharedSanitized || null, hints || null, bioLook || null]
    .filter((part): part is string => Boolean(part && part.trim()))
    .map(part => part.trim());
  // Dedupe while preserving order.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(part);
  }
  const triggers = [
    ...(character?.loraTriggerPhrases ?? []),
    ...((shared as { loraTriggerPhrases?: string[] } | undefined)?.loraTriggerPhrases ?? []),
  ]
    .map(entry => entry?.trim())
    .filter((entry): entry is string => Boolean(entry));
  const triggerUnique = [...new Set(triggers)];
  return {
    name: character?.name?.trim() || 'the Cast lead',
    appearance: unique.join(', '),
    loraTriggers: triggerUnique,
  };
}

type PlateEthnicityKey =
  | 'black'
  | 'white'
  | 'east-asian'
  | 'south-asian'
  | 'southeast-asian'
  | 'latina'
  | 'middle-eastern'
  | 'nordic'
  | 'mediterranean'
  | 'indigenous'
  | 'polynesian'
  | 'caribbean'
  | 'mixed';

const PLATE_ETHNICITY_PATTERNS: Array<{ key: PlateEthnicityKey; re: RegExp }> = [
  { key: 'east-asian', re: /\b(east[\s-]?asian|chinese|japanese|korean|monolid)\b/i },
  { key: 'south-asian', re: /\b(south[\s-]?asian|indian|pakistani|bangladeshi)\b/i },
  {
    key: 'southeast-asian',
    re: /\b(southeast[\s-]?asian|filipina|filipino|vietnamese|thai|indonesian)\b/i,
  },
  { key: 'middle-eastern', re: /\b(middle[\s-]?eastern|arab|persian|iranian|turkish)\b/i },
  { key: 'latina', re: /\b(latina|latino|latine|hispanic|mexican|brazilian)\b/i },
  { key: 'nordic', re: /\b(nordic|scandinavian)\b/i },
  { key: 'mediterranean', re: /\b(mediterranean|greek|italian|spanish)\b/i },
  { key: 'indigenous', re: /\b(indigenous|native[\s-]?american|first[\s-]?nations)\b/i },
  { key: 'polynesian', re: /\b(polynesian|samoan|hawaiian|maori|pasifika)\b/i },
  { key: 'caribbean', re: /\b(caribbean|afro[\s-]?caribbean|jamaican|haitian)\b/i },
  { key: 'mixed', re: /\b(mixed[\s-]?race|biracial|multiracial)\b/i },
  { key: 'black', re: /\b(black|african[\s-]?american|dark[\s-]?skinned)\b/i },
  { key: 'white', re: /\b(white|caucasian|fair[\s-]?skinned|pale[\s-]?skinned)\b/i },
];

/** Infer ethnicity family from Cast appearance / hints text. */
export function inferPlateEthnicityKey(appearance: string): PlateEthnicityKey | null {
  const text = appearance.trim();
  if (!text) {
    return null;
  }
  // Prefer explicit Cast hints labels ("White", "East Asian") before weaker adjectives.
  for (const entry of PLATE_ETHNICITY_PATTERNS) {
    if (entry.re.test(text)) {
      return entry.key;
    }
  }
  return null;
}

const PLATE_SKIN_LOCK: Record<PlateEthnicityKey, string> = {
  black: 'Black presentation with deep rich brown to dark brown skin',
  white: 'White Caucasian presentation with fair to light skin (not brown, not deep dark)',
  'east-asian': 'East Asian presentation with light-to-medium East Asian skin tone',
  'south-asian': 'South Asian presentation with warm medium-to-deep South Asian skin tone',
  'southeast-asian': 'Southeast Asian presentation with warm light-to-medium skin tone',
  latina: 'Latina/Latino presentation with warm olive to medium-brown skin',
  'middle-eastern': 'Middle Eastern presentation with olive to warm medium skin',
  nordic: 'Nordic presentation with very fair light skin and cool undertones',
  mediterranean: 'Mediterranean presentation with olive to light-tan skin',
  indigenous: 'Indigenous presentation with warm medium-to-deep skin',
  polynesian: 'Polynesian presentation with warm medium-to-deep brown skin',
  caribbean: 'Caribbean presentation with warm medium-to-deep brown skin',
  mixed: 'mixed-race presentation matching the Cast look skin tone exactly',
};

const PLATE_ETHNICITY_NEGATIVES: Record<PlateEthnicityKey, string> = {
  black:
    'pale white skin, fair Caucasian skin, East Asian features, monolid eyes, blonde Nordic look',
  white:
    'dark brown skin, deep Black skin, African features, East Asian monolid, South Asian features',
  'east-asian':
    'dark Black skin, fair Nordic blonde Caucasian, heavy African features, South Asian features',
  'south-asian': 'fair Nordic white skin, deep Black skin, East Asian monolid, pale Caucasian',
  'southeast-asian': 'fair Nordic white skin, deep Black skin, African features',
  latina: 'fair Nordic pale skin, deep Black skin, East Asian monolid',
  'middle-eastern': 'fair Nordic pale skin, deep Black skin, East Asian monolid',
  nordic: 'dark brown skin, deep Black skin, East Asian monolid, South Asian features',
  mediterranean: 'fair Nordic pale skin, deep Black skin, East Asian monolid',
  indigenous: 'fair Nordic pale skin, East Asian monolid',
  polynesian: 'fair Nordic pale skin, East Asian monolid',
  caribbean: 'fair Nordic pale skin, East Asian monolid',
  mixed: 'wrong race for the Cast look, swapped ethnicity, incorrect skin tone',
};

/** Amplify ethnicity / skin tone so models cannot “nearly” match body type while swapping race. */
export function reinforceAppearanceForPlate(appearance: string): string {
  const trimmed = appearance.trim();
  if (!trimmed) {
    return '';
  }
  const key = inferPlateEthnicityKey(trimmed);
  if (!key) {
    return trimmed;
  }
  const lock = PLATE_SKIN_LOCK[key];
  if (trimmed.toLowerCase().includes(lock.slice(0, 24).toLowerCase())) {
    return trimmed;
  }
  return `${lock}. ${trimmed}`;
}

/** Negative prompt terms that fight the Cast ethnicity when generating a body plate. */
export function buildLookCastPlateNegative(appearance: string): string {
  const key = inferPlateEthnicityKey(appearance);
  const ethnicityNeg = key ? PLATE_ETHNICITY_NEGATIVES[key] : 'wrong race, incorrect skin tone';
  return [
    ethnicityNeg,
    'different person, race swap, ethnicity swap, skin tone change',
    '3D render, CGI, clay sculpt, grey clay, monochrome sculpture, base mesh, ZBrush, Blender viewport, untextured, albedo only, plastic mannequin, statue, doll, blank eyes, no pupils, featureless face, video-game character',
    'cartoon, anime, illustration, painting',
    'crowd, multiple people, busy wardrobe, outerwear, text overlay',
  ].join(', ');
}

/** Drop people / race / body cues from Look vibe so style notes cannot redefine the subject. */
export function stripDemographicCuesFromStyle(text: string): string {
  let next = text.trim();
  if (!next) {
    return '';
  }
  // Remove common person-description phrases (keep lighting/palette words around them).
  next = next
    .replace(
      /\b(a|an|the)?\s*(young|old|tall|short|slim|skinny|slender|petite|curvy|large|plus[\s-]?size|heavyset|athletic)?\s*(black|white|asian|east[\s-]?asian|south[\s-]?asian|latina|latino|african|caucasian|mixed[\s-]?race)?\s*(woman|man|girl|boy|person|model|figure|subject)s?\b/gi,
      ' '
    )
    .replace(/\b(dark|deep|fair|light|pale|brown|olive)\s+skin(ned| tone)?\b/gi, ' ')
    .replace(/\b(african[\s-]?american|caucasian|monolid|afro|box braids|locs)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s([,.;:])/g, '$1')
    .replace(/^[,.;:\s]+|[,.;:\s]+$/g, '')
    .trim();
  return next.slice(0, 280);
}

/** Style-only cues for the plate — never let Look vibe redefine the person. */
export function styleNotesForLookPlate(input: {
  lookPack?: LookPack | null;
  vibePrompt?: string;
}): string {
  const pack = input.lookPack;
  const structured = [
    pack?.lightingNotes?.trim() ? `lighting: ${pack.lightingNotes.trim()}` : null,
    pack?.paletteNotes?.trim() ? `palette: ${pack.paletteNotes.trim()}` : null,
    pack?.moodNotes?.trim() ? `mood: ${pack.moodNotes.trim()}` : null,
    pack?.styleNotes?.trim() ? `style: ${pack.styleNotes.trim()}` : null,
  ].filter(Boolean);
  if (structured.length > 0) {
    return stripDemographicCuesFromStyle(structured.join(' · ')).slice(0, 360);
  }
  const vibe = input.vibePrompt?.trim();
  if (!vibe) {
    return '';
  }
  return stripDemographicCuesFromStyle(vibe);
}

/** Full-body try-on reference photo queued after Look extract for Outfit / Day. */
export function buildLookCastPlatePrompt(input: {
  characterName?: string;
  descriptor?: string;
  /** LoRA / identity trigger phrases that must appear in the positive prompt. */
  loraTriggers?: string[];
  /** Lighting / palette / mood only — must not redefine the person. */
  styleNotes?: string;
  /** @deprecated Prefer styleNotes — vibe often describes tile people and fights Cast. */
  vibePrompt?: string;
}): string {
  const name = input.characterName?.trim() || 'the Cast lead';
  const appearance = reinforceAppearanceForPlate(
    input.descriptor?.trim() ? sanitizeCharacterAppearanceDescriptor(input.descriptor.trim()) : ''
  );
  const triggers = (input.loraTriggers ?? []).map(entry => entry.trim()).filter(Boolean);
  const styleRaw =
    input.styleNotes?.trim() ||
    (input.vibePrompt?.trim() ? styleNotesForLookPlate({ vibePrompt: input.vibePrompt }) : '');
  const style = stripDemographicCuesFromStyle(styleRaw);
  // Lead with photo language — "body plate" / grey seamless alone steers some models into clay CGI.
  return [
    `Color photograph of ${name}, a real living person, full-body standing pose for wardrobe try-on:`,
    appearance
      ? `SUBJECT (mandatory — exact Cast person; race, ethnicity, and skin tone locked; do not swap race): ${appearance}`
      : 'SUBJECT: distinct consistent face and body matching the Cast lead — do not invent a different race or body type',
    triggers.length > 0 ? `identity triggers: ${triggers.join(', ')}` : null,
    'shot on a DSLR, natural skin with visible pores and subsurface color, real eyes with irises and pupils, real hair strands, lifelike soft shadows',
    style
      ? `STYLE ONLY (lighting / palette / mood — ignore any people or race if still present): ${style}`
      : 'even soft studio beauty light, clean seamless backdrop',
    'single person, head-to-toe in frame, feet visible, arms slightly away from torso',
    'wearing plain light underwear or a form-fitting neutral base layer only — no outerwear, no accessories, no busy patterns',
    'not a 3D model, not clay, not grey sculpt, not a mannequin, not CGI, not a statue, not blank-eyed',
  ]
    .filter(Boolean)
    .join('\n');
}

export function fittingHasSessionPlate(cache: FittingToolCache | null | undefined): boolean {
  return Boolean(cache?.referenceImageFilename?.trim() || cache?.referenceImageUrl?.trim());
}

/** Cast face ref for IP-Adapter — look/character only (never session shared; that can be stale). */
export function resolveCastFaceForPlate(character: CharacterRecord | null | undefined): {
  filename?: string;
  imageUrl?: string;
} | null {
  if (!character) {
    return null;
  }
  let look;
  try {
    look = activeLook(character);
  } catch {
    look = undefined;
  }
  const ip = look?.ipAdapter ?? character.ipAdapter;
  const filename = ip?.imageFilename?.trim() || undefined;
  const imageUrl = ip?.imageUrl?.trim() || ip?.comfyUrl?.trim() || undefined;
  if (!filename && !imageUrl) {
    return null;
  }
  return { filename, imageUrl };
}

/**
 * Job-pinned IP-Adapter params from the Cast look/face lock.
 * Use as `queueParamsBase` so Day/Outfit queues keep identity even when session shared is stale.
 */
export function castFaceQueueParamsBase(
  character: CharacterRecord | null | undefined,
  strength?: number
):
  | {
      ipAdapterImageFilename: string;
      ipAdapterImageFilenames: string[];
      ipAdapterStrength?: number;
    }
  | undefined {
  const filename = resolveCastFaceForPlate(character)?.filename?.trim();
  if (!filename) {
    return undefined;
  }
  return {
    ipAdapterImageFilename: filename,
    ipAdapterImageFilenames: [filename],
    ...(typeof strength === 'number' && Number.isFinite(strength)
      ? { ipAdapterStrength: strength }
      : {}),
  };
}

/** Merge Cast face IP-Adapter into an existing queueParamsBase (e.g. videoFrames for Animate). */
export function withCastFaceQueueParams<T extends Record<string, unknown>>(
  base: T | undefined,
  character: CharacterRecord | null | undefined,
  strength?: number
): (T & ReturnType<typeof castFaceQueueParamsBase>) | T | undefined {
  const face = castFaceQueueParamsBase(character, strength);
  if (!base && !face) {
    return undefined;
  }
  return { ...(base ?? ({} as T)), ...face };
}

/**
 * 2.0 full-loop identity — sync Cast session, pin face via queueParamsBase, pin LoRAs.
 * Use on Outfit / Look / Day / Story / Video queues.
 */
export function withCastIdentityQueueFields(
  character: CharacterRecord | null | undefined,
  strength?: number,
  queueParamsBase?: Record<string, unknown>
): {
  queueParamsBase?: Record<string, unknown>;
  sessionActiveLoraIds?: string[];
} {
  if (character) {
    syncSharedIdentityToCast(character);
  }
  const merged = withCastFaceQueueParams(queueParamsBase, character, strength);
  const castLoras = castLoraSessionIds(character);
  return {
    ...(merged ? { queueParamsBase: merged } : {}),
    ...(castLoras ? { sessionActiveLoraIds: castLoras } : {}),
  };
}

/** Pin session identity to this Cast without wiping wardrobe or custom session LoRAs. */
export function syncSharedIdentityToCast(character: CharacterRecord): void {
  if (typeof window === 'undefined') {
    return;
  }
  saveSharedSettings(
    {
      ...loadSettingsCache().shared,
      ...applyCharacterRecord(character),
    },
    { notify: false }
  );
}

/** Drop the Cast body plate so Look Extract can queue a fresh Outfit plate (keep face lock). */
export function clearCharacterBodyPlate(characterId?: string | null): boolean {
  const id = characterId?.trim();
  if (!id) {
    return false;
  }
  const character = getCharacter(id);
  if (!character) {
    return false;
  }
  const look = activeLook(character);
  const hasBodyPlate = Boolean(look.reference || character.reference);
  if (!hasBodyPlate) {
    const previous = loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE);
    if (!fittingHasSessionPlate(previous) && !previous.pendingOutfitPlatePromptId?.trim()) {
      return false;
    }
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
  const looks = (character.looks ?? [look]).map(entry =>
    entry.id === look.id ? { ...entry, reference: undefined } : entry
  );
  upsertCharacter({
    ...character,
    reference: undefined,
    looks,
    activeLookId: look.id,
    updatedAt: Date.now(),
  });

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

/**
 * User-facing Cast home clear — remove whatever shows as the look plate
 * (body reference and/or face IP on the active look).
 */
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
  const hasReference = Boolean(look.reference || character.reference);
  const hasFace = Boolean(
    look.ipAdapter?.imageFilename?.trim() ||
    look.ipAdapter?.imageUrl?.trim() ||
    look.ipAdapter?.comfyUrl?.trim() ||
    character.ipAdapter?.imageFilename?.trim() ||
    character.ipAdapter?.imageUrl?.trim() ||
    character.ipAdapter?.comfyUrl?.trim()
  );
  const previous = loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE);
  const hasFitting =
    fittingHasSessionPlate(previous) || Boolean(previous.pendingOutfitPlatePromptId?.trim());

  if (!hasReference && !hasFace && !hasFitting) {
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
  const look = activeLook(character);
  // Keep an existing Cast face lock — Outfit body plate goes on reference only.
  // Only seed ipAdapter from the plate when this look has no face yet.
  const existingFace = look.ipAdapter ?? character.ipAdapter;
  const hasFace = Boolean(
    existingFace?.imageFilename?.trim() ||
    existingFace?.imageUrl?.trim() ||
    existingFace?.comfyUrl?.trim()
  );
  const plateAsFace = filename
    ? {
        imageFilename: filename,
        imageUrl,
      }
    : {
        imageUrl,
      };
  const ipAdapter = hasFace ? existingFace : plateAsFace;
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
 * or queue a full-body Cast plate still so Outfit / Day are not blocked.
 *
 * Pass `forceReplace: true` from Extract look so an existing Outfit plate is cleared
 * and a new full-body minimal-clothing still is queued (moodboard tiles stay vibe refs).
 * Handoffs keep the default ensure path (reuse plate or stamp a subject tile).
 */
export async function ensureOutfitPlateAfterLook(input: {
  characterId?: string;
  tiles: MoodboardTile[];
  vibePrompt?: string;
  /** Prefer structured Look pack notes over raw vision vibe for style. */
  lookPack?: LookPack | null;
  /** Extract look — replace any existing Outfit / Cast plate. */
  forceReplace?: boolean;
  sendComfyUi: (
    prompt: string,
    sport?: null,
    historyId?: undefined,
    options?: Pick<
      SendComfyUiOptions,
      | 'characterId'
      | 'lookId'
      | 'identityLock'
      | 'identityLockStrength'
      | 'identityKind'
      | 'inputImageFilename'
      | 'inputImageUrl'
      | 'queueHints'
      | 'explicitNegative'
      | 'queueParamsBase'
    >
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

  // Snapshot Cast appearance BEFORE clear (face is re-read from fresh after sync).
  const appearance = resolveCharacterAppearanceForPlate(character);

  let fitting = loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE);
  const forceReplace = input.forceReplace === true;

  if (forceReplace) {
    clearCharacterBodyPlate(characterId);
    fitting = {
      ...fitting,
      isolateSubject: true,
      referenceIsolated: false,
      referenceImageUrl: undefined,
      referenceImageFilename: undefined,
      referenceOriginalUrl: undefined,
      referenceOriginalFilename: undefined,
      pendingOutfitPlatePromptId: undefined,
      // Block Fitting auto-seed from a stale Cast plate until the queued still attaches.
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

  // Handoff / ensure: a Capture subject tile can seed Outfit immediately.
  // Extract (forceReplace) skips this — mood tiles are often clothed style refs;
  // queue a dedicated full-body minimal-clothing plate instead.
  if (!forceReplace) {
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
  }

  // Re-read character after clear — face should still be on the look when present.
  const fresh = getCharacter(characterId) ?? character;
  // Fresh sync clears any prior Cast's session face before this plate job.
  syncSharedIdentityToCast(fresh);
  const shared = loadSettingsCache().shared;

  // Subject + clothing only — Look vibe must not redefine the person.
  const prompt = buildLookCastPlatePrompt({
    characterName: appearance.name || fresh.name,
    descriptor: appearance.appearance || undefined,
    loraTriggers: appearance.loraTriggers,
  });
  const explicitNegative = buildLookCastPlateNegative(appearance.appearance);
  const strength = shared.ipAdapterStrength ?? 0.75;
  try {
    const faceQueueParams = castFaceQueueParamsBase(fresh, strength);
    const promptId = await input.sendComfyUi(prompt, null, undefined, {
      characterId,
      lookId: fresh.activeLookId ?? shared.activeLookId,
      identityLock: false,
      queueHints: '',
      explicitNegative,
      // Pin this Cast's face when it has one; otherwise Fresh sync already cleared
      // shared IP so a previous character cannot race-swap the plate.
      ...(faceQueueParams ? { queueParamsBase: faceQueueParams } : {}),
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
