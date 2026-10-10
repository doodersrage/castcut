/**
 * Character OS — one character record for Generate, Roleplay, Compose, Video, and LoRA export.
 * Absorbs identity bundles, session IP-Adapter lock, and Roleplay cast fields.
 */

import {
  BROWSER_STORAGE_HEALTH_EVENT,
  readBrowserValue,
  writeBrowserValue,
} from './browser-storage';
import { normalizeCastBiblePicture, type CastBiblePicture } from './character-bible-picture';
import type { CharacterIdentityBundle } from './character-identity-bundle';
import { normalizePlateStance, type PlateStance } from './plate-stance';
import {
  applyCharacterIdentityBundle,
  buildCharacterIdentityBundle,
} from './character-identity-bundle';
import { normalizeComposeIdentityKind } from './compose-identity-lock';
import {
  identityLockForLook,
  identityLockSource,
  lockOnLookFace,
  lookFace,
} from './identity-lock-look';
import { loadSettingsCache, saveSharedSettings, type SharedToolSettings } from './settings-cache';
import {
  type CharacterAppearanceDraft,
  type CharacterAppearanceFormDraft,
  characterAppearanceHints,
  composeCharacterAppearanceDescriptor,
  describeChosenAppearance,
  normalizeCharacterTraits,
  physicalDescriptionFromTraits,
  type CharacterTraits,
  resolveCharacterAppearance,
  sanitizeCharacterAppearanceDescriptor,
} from './character-appearance';
import { setSessionLoraIdsForModel } from './model-lora-map';

export const CHARACTERS_KEY = 'comfy-prompt-characters-v1';
export const CHARACTERS_UPDATED_EVENT = 'prompt-studio-characters-updated';
export const MAX_CHARACTERS = 48;
export const MAX_LOOKS = 24;
export const MAX_LOOK_PACKS = 16;

/**
 * Cast-record fields features add (Play: Story bio/tone/content/playAs, film cut, Look packs —
 * play-cast.ts) by declaration merging. The record normaliser keeps any field it does not name,
 * so a feature's data survives even where the feature is not loaded.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- extended by features
export interface CharacterFeatureFields {}

export type CharacterRecord = CharacterFeatureFields & {
  id: string;
  name: string;
  version: 1;
  updatedAt: number;
  /** Active look id — switching looks must not destroy prior ones. */
  activeLookId?: string;
  looks?: CharacterLook[];
  /** LoRA library ids pinned to this character (session stack on apply). */
  loraLibraryIds?: string[];
  descriptor?: string;
  hints?: string;
  /**
   * Sex, ethnicity, age, height and build as picked (character-appearance: CharacterTraits).
   * The physical description comes from these; the bible's look is Story's.
   */
  traits?: CharacterTraits;
  /**
   * Home and workplace looks (cast-places.ts): a design, their own words, or off. Unset = a
   * design picked from the Cast's id, so every Cast has a home without setting one up.
   */
  places?: CastPlaces;
  /** Last "Picture this bible" still (Cast → Bible), shown again on a revisit. */
  biblePicture?: CastBiblePicture;
  /**
   * The Cast's voice for talking clips (cast-voice.ts): a ~5 s ComfyUI input audio clip, cut
   * from one of their talking clips, that LTX-2.5 conditions the voice on (with the ID-LoRA).
   */
  voice?: CastVoice;
  ipAdapter?: {
    imageFilename?: string;
    imageFilenames?: string[];
    imageUrl?: string;
    comfyUrl?: string;
    strength?: number;
    modelFilename?: string;
    kind?: SharedToolSettings['identityKind'];
  };
  reference?: {
    originalUrl?: string;
    originalFilename?: string;
    isolatedUrl?: string;
    isolatedFilename?: string;
    isolated?: boolean;
    isolateSubject?: boolean;
  };
  lockedWardrobeId?: string;
  lockedLocation?: string;
  lockedVariationSeed?: string;
  alwaysIncludeClothing?: boolean;
  model?: string;
  detail?: SharedToolSettings['detail'];
  negativeProfileId?: string;
  loraTriggerPhrases?: string[];
  personaId?: string;
  customPersona?: string;
  characterName?: string;
  setting?: string;
  notes?: string;
};

export type CastVoice = {
  /** ComfyUI input audio filename. */
  sample: string;
  /** The talking clip it was cut from (gallery view URL), to play it back. */
  fromClipUrl?: string;
  /**
   * Steer talking clips toward it (ID-LoRA). Off unless switched on: on LTX-2.5 the LoRA warped
   * faces around the mouth at full strength (live 2026-10-10); kept voices are never lost.
   */
  steer?: boolean;
  at: number;
};

/** What a Cast keeps for one kind of place (cast-places.ts): a design, their own words, or off. */
export type CastPlaceChoice = { design: string } | { custom: string } | { off: true };

export type CastPlaces = Partial<Record<'home' | 'work', CastPlaceChoice>>;

export type CharacterLook = {
  id: string;
  name: string;
  createdAt: number;
  descriptor?: string;
  hints?: string;
  ipAdapter?: CharacterRecord['ipAdapter'];
  reference?: CharacterRecord['reference'];
  lockedWardrobeId?: string;
  lockedLocation?: string;
  lockedVariationSeed?: string;
  alwaysIncludeClothing?: boolean;
  model?: string;
  detail?: SharedToolSettings['detail'];
  negativeProfileId?: string;
  /** Gallery still ids marked as LoRA keepers for this era. Undefined = fall back to favorites. */
  keeperEntryIds?: string[];
  /** Whether this look's plate stands full body (DWPose read; see plate-stance.ts). */
  plateStance?: PlateStance;
  /**
   * The outfit kept for this look in Outfit (Keep). A catalog kit is also the look's
   * {@link lockedWardrobeId}; a clothing photo and the shoes live only here. Switching to the look
   * puts them back in Outfit, Day and Story; a Day slot wearing the look queues with them.
   */
  keptOutfit?: CharacterLookOutfit;
};

/** What a look wears, from the try-on kept on it (Outfit → Keep). */
export type CharacterLookOutfit = {
  /** Gallery entry of the kept try-on. */
  entryId?: string;
  /** The dressed-plate store key the kept try-on was registered under. */
  dressPlateKey?: string;
  /** The catalog kit kept (absent for a clothing photo). */
  wardrobeId?: string;
  customGarmentImageUrl?: string;
  customGarmentImageFilename?: string;
  customGarmentDescription?: string;
  footwear?: string;
  footwearImageUrl?: string;
  footwearImageFilename?: string;
};

type CharacterStore = {
  version: 1;
  migratedFromBundles: boolean;
  characters: CharacterRecord[];
  /** Ids dropped from Cast — migrate must not resurrect them from Roleplay archives. */
  removedIds?: string[];
};

const EMPTY_CHARACTERS: CharacterRecord[] = [];
let charactersSnapshot: CharacterRecord[] = EMPTY_CHARACTERS;
let charactersSnapshotKey = '';

function charactersSnapshotKeyFor(characters: CharacterRecord[]): string {
  return characters.map(character => `${character.id}:${character.updatedAt}`).join('|');
}

function cacheCharactersSnapshot(characters: CharacterRecord[]): CharacterRecord[] {
  const key = charactersSnapshotKeyFor(characters);
  if (key === charactersSnapshotKey) {
    return charactersSnapshot;
  }
  charactersSnapshotKey = key;
  charactersSnapshot = characters;
  return charactersSnapshot;
}

function notifyCharactersUpdated(): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }
  window.dispatchEvent(new Event(CHARACTERS_UPDATED_EVENT));
}

/** Stable list for React `useSyncExternalStore` — same reference until the store changes. */
export function getCharactersSnapshot(): CharacterRecord[] {
  return cacheCharactersSnapshot(readStore().characters);
}

export function getServerCharactersSnapshot(): CharacterRecord[] {
  return EMPTY_CHARACTERS;
}

export function subscribeCharacters(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }
  window.addEventListener(CHARACTERS_UPDATED_EVENT, onStoreChange);
  window.addEventListener(BROWSER_STORAGE_HEALTH_EVENT, onStoreChange);
  return () => {
    window.removeEventListener(CHARACTERS_UPDATED_EVENT, onStoreChange);
    window.removeEventListener(BROWSER_STORAGE_HEALTH_EVENT, onStoreChange);
  };
}

function newCharacterId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `char-${crypto.randomUUID()}`;
  }
  return `char-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function newLookId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `look-${crypto.randomUUID()}`;
  }
  return `look-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A look id made before the look is (an added plate's file is named after it). */
export function createLookId(): string {
  return newLookId();
}

/** @internal shared with feature modules (play-cast.ts). */
export function newLookPackId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `lp-${crypto.randomUUID()}`;
  }
  return `lp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function characterHomeHref(id: string): string {
  return `/characters/${encodeURIComponent(id.trim())}`;
}

/** The Cast page's Looks section (Overview tab), where Prepare plate stands a plate up. */
export function characterLooksHref(id: string): string {
  return `${characterHomeHref(id)}?tab=overview#looks`;
}

function uniqueIds(ids: string[] | undefined): string[] | undefined {
  const next = [...new Set((ids ?? []).map(id => id.trim()).filter(Boolean))];
  return next.length > 0 ? next : undefined;
}

export function lookFromAppearance(
  source: Pick<
    CharacterRecord,
    | 'descriptor'
    | 'hints'
    | 'ipAdapter'
    | 'reference'
    | 'lockedWardrobeId'
    | 'lockedLocation'
    | 'lockedVariationSeed'
    | 'alwaysIncludeClothing'
    | 'model'
    | 'detail'
    | 'negativeProfileId'
  > & {
    keeperEntryIds?: string[];
  },
  name: string,
  id?: string,
  createdAt?: number
): CharacterLook {
  return {
    id: id?.trim() || newLookId(),
    name: readName(name) || 'Default',
    createdAt: createdAt ?? Date.now(),
    descriptor: source.descriptor,
    hints: source.hints,
    ipAdapter: source.ipAdapter,
    reference: source.reference,
    lockedWardrobeId: source.lockedWardrobeId,
    lockedLocation: source.lockedLocation,
    lockedVariationSeed: source.lockedVariationSeed,
    alwaysIncludeClothing: source.alwaysIncludeClothing,
    model: source.model,
    detail: source.detail,
    negativeProfileId: source.negativeProfileId,
    keeperEntryIds: uniqueIds(source.keeperEntryIds),
  };
}

/** @internal shared with feature modules (play-cast.ts). */
export function applyLookFields(character: CharacterRecord, look: CharacterLook): CharacterRecord {
  return {
    ...character,
    activeLookId: look.id,
    descriptor: look.descriptor,
    hints: look.hints,
    ipAdapter: look.ipAdapter,
    reference: look.reference,
    lockedWardrobeId: look.lockedWardrobeId,
    lockedLocation: look.lockedLocation,
    lockedVariationSeed: look.lockedVariationSeed,
    alwaysIncludeClothing: look.alwaysIncludeClothing,
    model: look.model,
    detail: look.detail,
    negativeProfileId: look.negativeProfileId,
  };
}

export function looksOf(character: CharacterRecord): CharacterLook[] {
  if (character.looks?.length) {
    const filtered = character.looks
      .filter(look => look && look.id && readName(look.name))
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, MAX_LOOKS);
    // Corrupt/legacy rows can leave a non-empty looks array that filters to
    // nothing — never return [] or activeLook / normalize will throw.
    if (filtered.length > 0) {
      return filtered;
    }
  }
  return [lookFromAppearance(character, 'Default')];
}

export function activeLook(character: CharacterRecord): CharacterLook {
  const looks = looksOf(character);
  return looks.find(look => look.id === character.activeLookId) ?? looks[0]!;
}

export function normalizeCharacterRecord(character: CharacterRecord): CharacterRecord {
  const looks = looksOf(character).map(look => {
    const descriptor = look.descriptor?.trim()
      ? sanitizeCharacterAppearanceDescriptor(look.descriptor)
      : look.descriptor;
    let next = descriptor === look.descriptor ? look : { ...look, descriptor };
    if ('plateStance' in next) {
      const plateStance = normalizePlateStance(next.plateStance);
      if (!plateStance) {
        const { plateStance: _dropped, ...rest } = next;
        void _dropped;
        next = rest;
      } else if (JSON.stringify(plateStance) !== JSON.stringify(next.plateStance)) {
        next = { ...next, plateStance };
      }
    }
    return next;
  });
  const current = looks.find(look => look.id === character.activeLookId) ?? looks[0]!;
  const rootDescriptor = character.descriptor?.trim()
    ? sanitizeCharacterAppearanceDescriptor(character.descriptor)
    : character.descriptor;
  const normalized = applyLookFields(
    {
      ...character,
      descriptor: rootDescriptor,
      loraLibraryIds: uniqueIds(character.loraLibraryIds),
      looks,
      // Only when set — an extra undefined key would differ in strict deep-equal checks.
      ...('biblePicture' in character
        ? { biblePicture: normalizeCastBiblePicture(character.biblePicture) }
        : {}),
      activeLookId: current.id,
    },
    current
  );
  return characterNormalizers.reduce((record, normalize) => normalize(record), normalized);
}

/** Features tidy their own Cast-record fields (Play: Look packs). Registered at app start. */
export type CharacterNormalizer = (character: CharacterRecord) => CharacterRecord;

const characterNormalizers: CharacterNormalizer[] = [];

export function registerCharacterNormalizer(normalize: CharacterNormalizer): void {
  if (!characterNormalizers.includes(normalize)) characterNormalizers.push(normalize);
}

/** @internal shared with feature modules (play-cast.ts). */
export function readName(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 80) : '';
}

export function slugCharacterName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function characterFromBundle(bundle: CharacterIdentityBundle, id?: string): CharacterRecord {
  return {
    id: id?.trim() || newCharacterId(),
    name: bundle.name.trim(),
    version: 1,
    updatedAt: Date.parse(bundle.exportedAt) || Date.now(),
    descriptor: bundle.descriptor?.trim() || undefined,
    hints: bundle.hints?.trim() || undefined,
    ipAdapter: {
      imageFilename: bundle.ipAdapterImageFilename?.trim() || undefined,
      strength: bundle.ipAdapterStrength,
      modelFilename: bundle.ipAdapterModelFilename?.trim() || undefined,
    },
    lockedWardrobeId: bundle.lockedWardrobeId,
    lockedLocation: bundle.lockedLocation,
    lockedVariationSeed: bundle.lockedVariationSeed,
    alwaysIncludeClothing: bundle.alwaysIncludeClothing,
    model: bundle.model,
    detail: bundle.detail,
    negativeProfileId: bundle.negativeProfileId,
    loraTriggerPhrases: bundle.loraTriggerPhrases?.filter(Boolean),
    notes: bundle.notes?.trim() || undefined,
  };
}

export function bundleFromCharacter(character: CharacterRecord): CharacterIdentityBundle {
  const updatedAt = Number(character.updatedAt);
  const exportedAt = Number.isFinite(updatedAt)
    ? new Date(updatedAt).toISOString()
    : new Date().toISOString();
  return {
    version: 1,
    exportedAt,
    name: character.name,
    hints: character.hints,
    model: character.model,
    detail: character.detail,
    lockedWardrobeId: character.lockedWardrobeId,
    lockedLocation: character.lockedLocation,
    lockedVariationSeed: character.lockedVariationSeed,
    alwaysIncludeClothing: character.alwaysIncludeClothing,
    negativeProfileId: character.negativeProfileId,
    loraTriggerPhrases: character.loraTriggerPhrases,
    notes: character.notes,
    descriptor: character.descriptor,
    ipAdapterImageFilename: character.ipAdapter?.imageFilename,
    ipAdapterStrength: character.ipAdapter?.strength,
    ipAdapterModelFilename: character.ipAdapter?.modelFilename,
  };
}

export function characterFromShared(
  shared: SharedToolSettings,
  input: { name: string; hints?: string; notes?: string } & Partial<CharacterFeatureFields>
): CharacterRecord {
  const { name: rawName, hints, notes, ...feature } = input;
  const name = rawName.trim();
  return {
    id: newCharacterId(),
    name,
    version: 1,
    updatedAt: Date.now(),
    descriptor: shared.activeCharacterDescriptor?.trim() || undefined,
    hints: hints?.trim() || undefined,
    ...feature,
    ipAdapter: {
      imageFilename: shared.ipAdapterImageFilename?.trim() || undefined,
      imageFilenames: shared.ipAdapterImageFilenames,
      imageUrl: shared.ipAdapterImageUrl?.trim() || undefined,
      comfyUrl: shared.ipAdapterComfyUrl?.trim() || undefined,
      strength: shared.ipAdapterStrength,
      modelFilename: shared.ipAdapterModelFilename?.trim() || undefined,
      kind: shared.identityKind,
    },
    lockedWardrobeId: shared.lockedWardrobeId,
    lockedLocation: shared.lockedLocation,
    lockedVariationSeed: shared.lockedVariationSeed,
    alwaysIncludeClothing: shared.alwaysIncludeClothing,
    model: shared.model,
    detail: shared.detail,
    characterName: name,
    notes: notes?.trim() || undefined,
  };
}

/**
 * Day's invented partner, kept: the stranger's face (the stand-in portrait, a head crop) and look
 * become a Cast, so the same partner can come back on later Days — or lead their own. Their face
 * is the plate; Day's "Make a plate from the description" gives them a body plate if they lead.
 */
export function characterFromPartnerStandIn(input: {
  look: string;
  filename: string;
  imageUrl?: string;
  name?: string;
  now?: number;
}): CharacterRecord {
  const now = input.now ?? Date.now();
  const name = input.name?.trim() || 'Day partner';
  const filename = input.filename.trim();
  const imageUrl = input.imageUrl?.trim() || undefined;
  return {
    id: newCharacterId(),
    name,
    version: 1,
    updatedAt: now,
    descriptor: input.look.trim().slice(0, 400) || undefined,
    characterName: name,
    reference: { originalFilename: filename, originalUrl: imageUrl },
    ipAdapter: { imageFilename: filename, imageUrl },
  };
}

export type CreateBlankCharacterOptions = Partial<CharacterFeatureFields> & {
  personaId?: string;
  customPersona?: string;
  /** Made from a photo: describe only the traits picked (describeChosenAppearance). */
  fromPhoto?: boolean;
};

/** Fresh Cast record — name plus a rolled (or chosen) face descriptor so Day/Generate are not blank. */
export function createBlankCharacter(
  name: string,
  appearance?: CharacterAppearanceDraft | CharacterAppearanceFormDraft,
  options?: CreateBlankCharacterOptions
): CharacterRecord {
  const trimmed = name.trim() || 'Untitled character';
  const fromPhoto = options?.fromPhoto ? describeChosenAppearance(appearance ?? {}) : null;
  const draft = fromPhoto ? null : resolveCharacterAppearance(appearance ?? {});
  // What was picked (from a photo) or rolled (no photo), so the Cast page can show and edit it.
  const traits = normalizeCharacterTraits(draft ?? appearance);
  const personaId = options?.personaId?.trim() || undefined;
  const customPersona = options?.customPersona?.trim() || undefined;
  return {
    id: newCharacterId(),
    name: trimmed,
    version: 1,
    updatedAt: Date.now(),
    characterName: trimmed,
    ...(traits ? { traits } : {}),
    ...(draft
      ? {
          descriptor: composeCharacterAppearanceDescriptor(draft),
          hints: characterAppearanceHints(draft),
        }
      : {
          ...(fromPhoto?.descriptor ? { descriptor: fromPhoto.descriptor } : {}),
          ...(fromPhoto?.hints ? { hints: fromPhoto.hints } : {}),
        }),
    ...(personaId ? { personaId } : {}),
    ...(customPersona ? { customPersona } : {}),
    ...featureFieldsOf(options),
  };
}

/** The feature fields in a create call's options (personaId / fromPhoto are this file's). */
function featureFieldsOf(
  options: CreateBlankCharacterOptions | undefined
): Partial<CharacterFeatureFields> {
  if (!options) return {};
  const { personaId: _p, customPersona: _c, fromPhoto: _f, ...feature } = options;
  void _p;
  void _c;
  void _f;
  return Object.fromEntries(
    Object.entries(feature).filter(([, value]) => Boolean(value))
  ) as Partial<CharacterFeatureFields>;
}

function omitUndefinedSettings(
  patch: Partial<SharedToolSettings> & Record<string, unknown>
): Partial<SharedToolSettings> {
  const next: Partial<SharedToolSettings> & Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      next[key] = value;
    }
  }
  return next as Partial<SharedToolSettings>;
}

export function applyCharacterRecord(character: CharacterRecord): Partial<SharedToolSettings> {
  const normalized = normalizeCharacterRecord(character);
  const bundlePatch = applyCharacterIdentityBundle(bundleFromCharacter(normalized));
  const shared = loadSettingsCache().shared;
  const loraIds = normalized.loraLibraryIds?.length ? [...normalized.loraLibraryIds] : undefined;
  // Per-model session picks win at queue time — write byModel or Cast pins are ignored.
  const modelForLoras = (normalized.model ?? shared.model)?.trim();
  const byModelPatch =
    loraIds !== undefined && modelForLoras
      ? {
          sessionActiveLoraIdsByModel: setSessionLoraIdsForModel(
            shared.sessionActiveLoraIdsByModel,
            modelForLoras,
            loraIds
          ),
        }
      : {};
  // Switching to another Cast: the previous one's face lock and identity go, whatever this
  // record defines. Left in place (undefined fields are omitted below), a Cast with no face
  // lock of her own was rendered with the previous lead's locked face.
  const previous = shared.activeCharacterId?.trim();
  const switching = Boolean(previous) && previous !== normalized.id;
  const clearPrevious: Partial<SharedToolSettings> = switching
    ? {
        activeCharacterDescriptor: undefined,
        ipAdapterImageFilename: undefined,
        ipAdapterImageFilenames: undefined,
        ipAdapterImageUrl: undefined,
        ipAdapterComfyUrl: undefined,
        ipAdapterStrength: undefined,
        ipAdapterModelFilename: undefined,
        ipAdapterSource: undefined,
        identityKind: undefined,
        activeLookId: undefined,
        lockedWardrobeId: undefined,
        lockedLocation: undefined,
        lockedVariationSeed: undefined,
        alwaysIncludeClothing: undefined,
      }
    : {};
  const { ipAdapterImageFilename: _bundleFace, ...bundleRest } = bundlePatch;
  void _bundleFace;
  const applied = omitUndefinedSettings({
    ...bundleRest,
    activeCharacterId: normalized.id,
    activeLookId: normalized.activeLookId,
    identityKind: normalized.ipAdapter?.kind
      ? normalizeComposeIdentityKind(normalized.ipAdapter.kind)
      : undefined,
    ...(loraIds ? { sessionActiveLoraIds: loraIds } : {}),
    ...byModelPatch,
  });
  // The face lock follows the active look (identity-lock-look.ts): a lock from the look moves to
  // this look's face; the player's own face stays. Another Cast starts on her look's face.
  const look = activeLook(normalized);
  const lockPatch =
    previous === normalized.id
      ? identityLockForLook({ lock: shared, looks: looksOf(normalized), look })
      : switching || lookFace(look)?.filename
        ? lockOnLookFace(look)
        : {};
  return { ...clearPrevious, ...applied, ...lockPatch };
}

/** Whether the session's face lock is the player's own face for this (already active) Cast. */
function keepsOwnIdentityLock(character: CharacterRecord): boolean {
  const shared = loadSettingsCache().shared;
  return (
    shared.activeCharacterId?.trim() === character.id &&
    identityLockSource(shared, looksOf(character)) === 'own'
  );
}

/**
 * Activate a character and drop prior Cast identity that the record does not define
 * (face lock, wardrobe, look). Session LoRAs are left alone unless the Cast has
 * pinned `loraLibraryIds` (those still replace the stack via applyCharacterRecord).
 * Use when creating a blank Cast so the previous character's look does not stick.
 */
export function applyCharacterRecordFresh(character: CharacterRecord): Partial<SharedToolSettings> {
  // The same Cast with the player's own face locked (a look switch): that face stays.
  const ownLock = keepsOwnIdentityLock(normalizeCharacterRecord(character));
  const applied = applyCharacterRecord(character);
  return {
    activeLookId: undefined,
    activeCharacterDescriptor: undefined,
    ...(ownLock
      ? {}
      : {
          ipAdapterImageFilename: undefined,
          ipAdapterImageFilenames: undefined,
          ipAdapterImageUrl: undefined,
          ipAdapterComfyUrl: undefined,
          ipAdapterSource: undefined,
          ipAdapterStrength: undefined,
          ipAdapterModelFilename: undefined,
          identityKind: undefined,
        }),
    lockedWardrobeId: undefined,
    lockedLocation: undefined,
    lockedVariationSeed: undefined,
    alwaysIncludeClothing: undefined,
    ...applied,
  };
}

/** Job-pinned Cast LoRA ids for Day/Story queues (mirrors face queueParamsBase). */
export function castLoraSessionIds(
  character: CharacterRecord | null | undefined
): string[] | undefined {
  return uniqueIds(character?.loraLibraryIds);
}

function emptyStore(): CharacterStore {
  return { version: 1, migratedFromBundles: false, characters: [], removedIds: [] };
}

export function roleplayLibraryIdFromCharacter(id: string): string | undefined {
  const key = id.trim();
  if (!key.startsWith('char-rp-')) {
    return undefined;
  }
  const sessionId = key.slice('char-rp-'.length).trim();
  return sessionId || undefined;
}

export function applyRemovedCharacterIds(
  characters: CharacterRecord[],
  removedIds: string[] | undefined
): CharacterRecord[] {
  const removed = new Set((removedIds ?? []).map(entry => entry.trim()).filter(Boolean));
  if (removed.size === 0) {
    return characters;
  }
  return characters.filter(entry => !removed.has(entry.id));
}

/** @internal shared with feature modules (play-cast.ts). */
export function readStore(): CharacterStore {
  const raw = readBrowserValue<CharacterStore>(CHARACTERS_KEY);
  if (!raw || raw.version !== 1 || !Array.isArray(raw.characters)) {
    return emptyStore();
  }
  return {
    version: 1,
    migratedFromBundles: raw.migratedFromBundles === true,
    characters: raw.characters
      .filter(entry => entry && readName(entry.name) && entry.id)
      .map(normalizeCharacterRecord),
    removedIds: uniqueIds(
      Array.isArray(raw.removedIds)
        ? raw.removedIds.filter((id): id is string => typeof id === 'string')
        : []
    ),
  };
}

/** @internal shared with feature modules (play-cast.ts). */
export function writeStore(store: CharacterStore): void {
  writeBrowserValue(CHARACTERS_KEY, {
    version: 1,
    migratedFromBundles: store.migratedFromBundles,
    characters: store.characters.slice(0, MAX_CHARACTERS),
    removedIds: uniqueIds(store.removedIds) ?? [],
  });
  notifyCharactersUpdated();
}

export function loadCharacters(): CharacterRecord[] {
  const store = readStore();
  if (store.migratedFromBundles || store.characters.length > 0) {
    return store.characters;
  }
  return store.characters;
}

/** Create or refresh a Cast record from a Roleplay library session without clobbering looks. */
/**
 * The Story session id for a Cast id (as roleplay-library's roleplayLibraryIdForCharacter): a
 * Story-made Cast "char-rp-<session>" owns "<session>", any other Cast "<id>" owns "cast-<id>".
 */
/** @internal shared with feature modules (play-cast.ts). */
export function roleplaySessionIdForCast(characterId: string): string {
  return characterId.startsWith('char-rp-')
    ? characterId.slice('char-rp-'.length)
    : `cast-${characterId}`;
}

/**
 * The Cast id for a Story session — the inverse of roleplaySessionIdForCast. Session
 * "cast-<id>" belongs to Cast "<id>": mapping it to "char-rp-cast-<id>" made a second Cast
 * with the same name, and the name clean-up in upsertCharacter then dropped the real one (its
 * looks and plates with it).
 */
export function castIdForRoleplaySession(sessionId: string): string {
  if (sessionId.startsWith('char-')) return sessionId;
  if (sessionId.startsWith('cast-') && sessionId.length > 'cast-'.length) {
    return sessionId.slice('cast-'.length);
  }
  return `char-rp-${sessionId}`;
}

export function saveCharacters(characters: CharacterRecord[]): CharacterRecord[] {
  const store = readStore();
  const next = characters
    .filter(entry => readName(entry.name) && entry.id)
    .map(normalizeCharacterRecord)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_CHARACTERS);
  const kept = new Set(next.map(entry => entry.id));
  writeStore({
    ...store,
    characters: next,
    removedIds: (store.removedIds ?? []).filter(id => !kept.has(id)),
  });
  return next;
}

/**
 * Feature fields an update without them keeps (Play: film cut, Look packs) — a save from a screen
 * that doesn't know them must not drop them. Registered at app start.
 */
const stickyFeatureFields = new Set<string>();

export function registerStickyCharacterFields(
  ...fields: (keyof CharacterFeatureFields & string)[]
): void {
  for (const field of fields) stickyFeatureFields.add(field);
}

function keptFeatureFields(
  prev: CharacterRecord,
  incoming: CharacterRecord
): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  const before = prev as unknown as Record<string, unknown>;
  const after = incoming as unknown as Record<string, unknown>;
  for (const field of stickyFeatureFields) kept[field] = after[field] ?? before[field];
  return kept;
}

function mergeCharacterUpdate(prev: CharacterRecord, incoming: CharacterRecord): CharacterRecord {
  if (Array.isArray(incoming.looks)) {
    return normalizeCharacterRecord({
      ...prev,
      ...incoming,
      looks: incoming.looks,
      loraLibraryIds: incoming.loraLibraryIds ?? prev.loraLibraryIds,
      loraTriggerPhrases: incoming.loraTriggerPhrases ?? prev.loraTriggerPhrases,
      ...keptFeatureFields(prev, incoming),
    });
  }

  const looks = looksOf(prev);
  const current = looks.find(look => look.id === prev.activeLookId) ?? looks[0]!;
  const nextLook = {
    ...lookFromAppearance(incoming, current.name, current.id, current.createdAt),
    keeperEntryIds: current.keeperEntryIds,
    // Keyed to the plate it was read from: a replaced plate makes it stale, not wrong.
    ...(current.plateStance ? { plateStance: current.plateStance } : {}),
    // Only when set — an extra undefined key would differ in strict deep-equal checks.
    ...(current.keptOutfit ? { keptOutfit: current.keptOutfit } : {}),
  };
  const nextLooks = looks.some(look => look.id === nextLook.id)
    ? looks.map(look => (look.id === nextLook.id ? nextLook : look))
    : [nextLook, ...looks].slice(0, MAX_LOOKS);
  return normalizeCharacterRecord({
    ...prev,
    ...incoming,
    looks: nextLooks,
    activeLookId: nextLook.id,
    loraLibraryIds: incoming.loraLibraryIds ?? prev.loraLibraryIds,
    loraTriggerPhrases: incoming.loraTriggerPhrases ?? prev.loraTriggerPhrases,
    ...keptFeatureFields(prev, incoming),
  });
}

function sameCharacterIgnoringTime(a: CharacterRecord, b: CharacterRecord): boolean {
  const strip = (record: CharacterRecord) =>
    JSON.stringify({ ...normalizeCharacterRecord(record), updatedAt: 0 });
  return strip(a) === strip(b);
}

export function upsertCharacter(record: CharacterRecord): CharacterRecord[] {
  const name = readName(record.name);
  if (!name) {
    return loadCharacters();
  }
  const id = record.id?.trim() || newCharacterId();
  const existing = loadCharacters();
  const prev = existing.find(entry => entry.id === id);
  const drafted: CharacterRecord = {
    ...record,
    name,
    version: 1,
    id,
    updatedAt: Date.now(),
  };
  const nextRecord = prev ? mergeCharacterUpdate(prev, drafted) : normalizeCharacterRecord(drafted);
  // Nothing but the time changed: keep the stored record. Story re-saved its lead on every
  // visit, and a fresh timestamp on unchanged data can win a sync over a real edit made on
  // another device.
  if (prev && sameCharacterIgnoringTime(prev, nextRecord)) {
    return existing;
  }
  const incomingIsRoleplay = nextRecord.id.startsWith('char-rp-');
  const without = existing.filter(entry => {
    if (entry.id === nextRecord.id) {
      return false;
    }
    if (slugCharacterName(entry.name) !== slugCharacterName(name)) {
      return true;
    }
    // Distinct Roleplay sessions can share a display name without eating each other.
    if (incomingIsRoleplay && entry.id.startsWith('char-rp-')) {
      return true;
    }
    return false;
  });
  return saveCharacters([nextRecord, ...without]);
}

/** Remember the last "Picture this bible" still on the Cast. */
export function saveCharacterBiblePicture(
  characterId: string,
  picture: CastBiblePicture
): CharacterRecord | undefined {
  const character = getCharacter(characterId.trim());
  const normalized = normalizeCastBiblePicture(picture);
  if (!character || !normalized) {
    return undefined;
  }
  upsertCharacter({ ...character, biblePicture: normalized, looks: looksOf(character) });
  return getCharacter(character.id);
}

export function addLookFromShared(
  characterId: string,
  shared: SharedToolSettings,
  lookName: string
): CharacterRecord | undefined {
  const character = getCharacter(characterId);
  if (!character) {
    return undefined;
  }
  const look = lookFromAppearance(
    characterFromShared(shared, { name: character.name, hints: shared.activeCharacterDescriptor }),
    lookName || `Look ${looksOf(character).length + 1}`
  );
  const looks = [look, ...looksOf(character).filter(entry => entry.id !== look.id)].slice(
    0,
    MAX_LOOKS
  );
  upsertCharacter(
    applyLookFields(
      {
        ...character,
        looks,
        updatedAt: Date.now(),
      },
      look
    )
  );
  return getCharacter(characterId);
}

/**
 * Several look plates per Cast: an added plate is a new look carrying the picture, made from the
 * active look (description, wardrobe lock, model) and made active. The description comes from
 * the Cast's traits on every look, so it stays the Cast's, not the plate's; keepers start empty.
 */
export function withNewPlateLook(
  character: CharacterRecord,
  input: {
    id?: string;
    name?: string;
    reference: CharacterRecord['reference'];
    ipAdapter: CharacterRecord['ipAdapter'];
  }
): CharacterRecord {
  const looks = looksOf(character);
  const current = looks.find(look => look.id === character.activeLookId) ?? looks[0]!;
  const look: CharacterLook = {
    ...lookFromAppearance(
      { ...current, keeperEntryIds: undefined },
      readName(input.name) || `Plate ${looks.length + 1}`,
      input.id
    ),
    reference: input.reference,
    ipAdapter: input.ipAdapter,
    // A copy wears the same outfit; the kept try-on and its dressed plate were the old plate's.
    ...(current.keptOutfit
      ? {
          keptOutfit: {
            ...current.keptOutfit,
            entryId: undefined,
            dressPlateKey: undefined,
          },
        }
      : {}),
  };
  // The new plate leads, so the look cap never cuts it.
  const nextLooks = [look, ...looks.filter(entry => entry.id !== look.id)].slice(0, MAX_LOOKS);
  return applyLookFields({ ...character, looks: nextLooks, updatedAt: Date.now() }, look);
}

/**
 * The Cast as if `lookId` were its active look (its plate, face, description and outfit lock),
 * without storing anything — a Day slot that wears another look. The same record when the look
 * is already active or is not one of the Cast's.
 */
export function characterWithLook(
  character: CharacterRecord,
  lookId: string | null | undefined
): CharacterRecord {
  const id = lookId?.trim();
  if (!id || id === activeLook(character).id) {
    return character;
  }
  const looks = looksOf(character);
  const look = looks.find(entry => entry.id === id);
  return look ? applyLookFields({ ...character, looks }, look) : character;
}

/**
 * A look after a try-on was kept on it: the try-on is its outfit. A kit becomes its outfit lock;
 * a clothing photo replaces the lock (the look wears the photo now).
 */
export function withLookKeptOutfit(
  look: CharacterLook,
  outfit: CharacterLookOutfit
): CharacterLook {
  const kept: CharacterLookOutfit = {};
  for (const [key, value] of Object.entries(outfit) as Array<
    [keyof CharacterLookOutfit, unknown]
  >) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text) kept[key] = text;
  }
  return {
    ...look,
    keptOutfit: kept,
    lockedWardrobeId: kept.wardrobeId,
  };
}

/**
 * A look after a try-on was un-kept: its outfit goes when it was that try-on (with the kit lock
 * it set). Another try-on's outfit, or one set before, stays.
 */
export function withoutLookKeptOutfit(look: CharacterLook, entryId: string): CharacterLook {
  const id = entryId.trim();
  if (!id || look.keptOutfit?.entryId !== id) {
    return look;
  }
  const { keptOutfit, ...rest } = look;
  const kit = keptOutfit.wardrobeId?.trim();
  return kit && rest.lockedWardrobeId?.trim() === kit
    ? { ...rest, lockedWardrobeId: undefined }
    : rest;
}

/** Record (or with `outfit` null, drop when it was `entryId`) the kept outfit of one look. */
export function setLookKeptOutfit(
  characterId: string,
  lookId: string,
  change: { outfit: CharacterLookOutfit } | { removeEntryId: string }
): CharacterRecord | undefined {
  const character = getCharacter(characterId);
  if (!character) {
    return undefined;
  }
  const looks = looksOf(character);
  const target = looks.find(look => look.id === lookId) ?? looks[0];
  if (!target) {
    return character;
  }
  const nextLook =
    'outfit' in change
      ? withLookKeptOutfit(target, change.outfit)
      : withoutLookKeptOutfit(target, change.removeEntryId);
  if (nextLook === target) {
    return character;
  }
  upsertCharacter({
    ...character,
    looks: looks.map(look => (look.id === target.id ? nextLook : look)),
    updatedAt: Date.now(),
  });
  return getCharacter(characterId);
}

export function activateLook(characterId: string, lookId: string): CharacterRecord | undefined {
  const character = getCharacter(characterId);
  if (!character) {
    return undefined;
  }
  const look = looksOf(character).find(entry => entry.id === lookId);
  if (!look) {
    return character;
  }
  upsertCharacter(
    applyLookFields(
      {
        ...character,
        looks: looksOf(character),
        updatedAt: Date.now(),
      },
      look
    )
  );
  return getCharacter(characterId);
}

export function removeLook(characterId: string, lookId: string): CharacterRecord | undefined {
  const character = getCharacter(characterId);
  if (!character) {
    return undefined;
  }
  const remaining = looksOf(character).filter(look => look.id !== lookId);
  if (remaining.length === 0) {
    return character;
  }
  const nextActive = remaining.find(look => look.id === character.activeLookId) ?? remaining[0]!;
  upsertCharacter(
    applyLookFields(
      {
        ...character,
        looks: remaining,
        updatedAt: Date.now(),
      },
      nextActive
    )
  );
  return getCharacter(characterId);
}

/** Rename one of the Cast's looks / plates (the Cast keeps its own name). */
export function renameLook(
  characterId: string,
  lookId: string,
  name: string
): CharacterRecord | undefined {
  const character = getCharacter(characterId);
  const nextName = readName(name);
  if (!character || !nextName) {
    return character;
  }
  const looks = looksOf(character);
  if (!looks.some(look => look.id === lookId)) {
    return character;
  }
  upsertCharacter({
    ...character,
    looks: looks.map(look => (look.id === lookId ? { ...look, name: nextName } : look)),
    updatedAt: Date.now(),
  });
  return getCharacter(characterId);
}

/** Rename the Cast's active look (the Cast keeps its own name). */
export function renameActiveLook(characterId: string, name: string): CharacterRecord | undefined {
  const character = getCharacter(characterId);
  if (!character) {
    return character;
  }
  return renameLook(characterId, activeLook(character).id, name);
}

export function setLookKeepers(
  characterId: string,
  lookId: string,
  keeperEntryIds: string[]
): CharacterRecord | undefined {
  const character = getCharacter(characterId);
  if (!character) {
    return undefined;
  }
  const looks = looksOf(character);
  const target = looks.find(look => look.id === lookId) ?? looks[0];
  if (!target) {
    return character;
  }
  const nextLook = {
    ...target,
    keeperEntryIds: uniqueIds(keeperEntryIds),
  };
  upsertCharacter({
    ...character,
    looks: looks.map(look => (look.id === nextLook.id ? nextLook : look)),
    updatedAt: Date.now(),
  });
  return getCharacter(characterId);
}

/** Remember how a look's plate stands (read from its pose, or set by Prepare plate). */
export function setLookPlateStance(
  characterId: string,
  lookId: string,
  stance: PlateStance
): CharacterRecord | undefined {
  const character = getCharacter(characterId);
  const normalized = normalizePlateStance(stance);
  if (!character || !normalized) {
    return character;
  }
  const looks = looksOf(character);
  // A Cast with no saved looks has one made up on each read — its id is never stable.
  const target =
    looks.find(look => look.id === lookId) ?? (character.looks?.length ? undefined : looks[0]);
  if (!target) {
    return character;
  }
  upsertCharacter({
    ...character,
    looks: looks.map(look => (look.id === target.id ? { ...look, plateStance: normalized } : look)),
    updatedAt: Date.now(),
  });
  return getCharacter(characterId);
}

export function toggleLookKeeper(
  characterId: string,
  lookId: string,
  entryId: string,
  options?: { fallbackIds?: string[] }
): CharacterRecord | undefined {
  const character = getCharacter(characterId);
  const id = entryId.trim();
  if (!character || !id) {
    return character;
  }
  const looks = looksOf(character);
  const target = looks.find(look => look.id === lookId) ?? looks[0];
  if (!target) {
    return character;
  }
  const current = target.keeperEntryIds
    ? [...target.keeperEntryIds]
    : [...(options?.fallbackIds ?? [])];
  const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id];
  return setLookKeepers(characterId, target.id, next);
}

export function pinLoraOnCharacter(
  characterId: string,
  loraLibraryId: string
): CharacterRecord | undefined {
  const character = getCharacter(characterId);
  const id = loraLibraryId.trim();
  if (!character || !id) {
    return character;
  }
  upsertCharacter({
    ...character,
    looks: looksOf(character),
    loraLibraryIds: uniqueIds([...(character.loraLibraryIds ?? []), id]),
    updatedAt: Date.now(),
  });
  return getCharacter(characterId);
}

export function setCharacterTrigger(
  characterId: string,
  trigger: string
): CharacterRecord | undefined {
  const character = getCharacter(characterId);
  if (!character) {
    return undefined;
  }
  const phrase = trigger.trim();
  upsertCharacter({
    ...character,
    looks: looksOf(character),
    loraTriggerPhrases: phrase ? [phrase] : undefined,
    updatedAt: Date.now(),
  });
  return getCharacter(characterId);
}

export function removeCharacter(id: string): CharacterRecord[] {
  const key = id.trim();
  if (!key) {
    return loadCharacters();
  }
  const store = readStore();
  writeStore({
    ...store,
    characters: store.characters.filter(entry => entry.id !== key),
    removedIds: uniqueIds([...(store.removedIds ?? []), key]) ?? [key],
  });
  return loadCharacters();
}

/** Drop a Cast record, remember the id so Roleplay migrate does not bring it back, and clear the session lock. */
export function forgetCharacterRecord(id: string): {
  roleplaySessionId?: string;
  wasActive: boolean;
} {
  const key = id.trim();
  const wasActive = loadSettingsCache().shared.activeCharacterId?.trim() === key;
  removeCharacter(key);
  if (wasActive) {
    const shared = loadSettingsCache().shared;
    saveSharedSettings({
      ...shared,
      activeCharacterId: undefined,
      activeLookId: undefined,
    });
  }
  return {
    roleplaySessionId: roleplayLibraryIdFromCharacter(key),
    wasActive,
  };
}

export function getCharacter(id: string | undefined): CharacterRecord | undefined {
  const key = id?.trim();
  if (!key) {
    return undefined;
  }
  const characters = loadCharacters();
  return (
    characters.find(entry => entry.id === key) ??
    // An older version replaced a Film-made Cast "<id>" with a copy "char-rp-cast-<id>" when its
    // Story was saved; a reference to the old id finds that copy.
    // and the other way round once the copy has been folded back into the real Cast.
    (key.startsWith('char-rp-cast-')
      ? characters.find(entry => entry.id === key.slice('char-rp-cast-'.length))
      : key.startsWith('char-rp-')
        ? undefined
        : characters.find(entry => entry.id === `char-rp-cast-${key}`))
  );
}

export function loraTriggerFromCharacter(
  character: CharacterRecord | undefined
): string | undefined {
  const trigger = character?.loraTriggerPhrases?.map(entry => entry.trim()).find(Boolean);
  return trigger || undefined;
}

/** @deprecated Use Character OS records; kept so bundle export stays lossless. */
export function sharedPatchFromLegacyBundle(
  bundle: CharacterIdentityBundle
): Partial<SharedToolSettings> {
  return applyCharacterIdentityBundle(bundle);
}

export function buildBundleFromShared(
  name: string,
  shared: SharedToolSettings,
  hints?: string
): CharacterIdentityBundle {
  return buildCharacterIdentityBundle({ name, shared, hints });
}

/** The Cast has a picture of its own (face lock or reference photo) on any look. */
export function castHasPicture(character: CharacterRecord): boolean {
  const has = (entry: Pick<CharacterRecord, 'ipAdapter' | 'reference'>) =>
    Boolean(
      entry.ipAdapter?.imageFilename?.trim() ||
      entry.ipAdapter?.imageUrl?.trim() ||
      entry.reference?.isolatedFilename?.trim() ||
      entry.reference?.originalFilename?.trim() ||
      entry.reference?.isolatedUrl?.trim() ||
      entry.reference?.originalUrl?.trim()
    );
  return has(character) || looksOf(character).some(has);
}

/**
 * Set a Cast's traits: they become its physical description (every look), which Day, Look and
 * Outfit use. The Story bible is left alone.
 */
export function saveCharacterTraits(
  characterId: string,
  traits: CharacterTraits | undefined
): CharacterRecord | undefined {
  const character = getCharacter(characterId.trim());
  if (!character) return undefined;
  const physical = physicalDescriptionFromTraits(traits, { hasPicture: castHasPicture(character) });
  const looks = looksOf(character).map(look => ({
    ...look,
    descriptor: physical.descriptor,
    hints: physical.hints,
  }));
  upsertCharacter({
    ...character,
    traits: physical.traits,
    descriptor: physical.descriptor,
    hints: physical.hints,
    looks,
  });
  return getCharacter(character.id);
}
