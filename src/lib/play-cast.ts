/**
 * Play's parts of a Cast record: the Story bible fields (bio, tone, content, playAs), the film cut,
 * Look packs, and making / updating a Cast from a saved Story. Added to CharacterRecord by
 * declaration merging (CharacterFeatureFields, character-os.ts); docs/architecture-boundaries.md.
 */

import type { CharacterFilmCut } from './character-film';
import type { LookPack } from './look-pack';
import type { RoleplayLibrarySession } from './roleplay-library';
import type { RoleplayBio, RoleplayContentId, RoleplayPlayAs, RoleplayTone } from './roleplay';
import {
  getCharacter,
  upsertCharacter,
  readName,
  looksOf,
  slugCharacterName,
  roleplaySessionIdForCast,
  MAX_LOOK_PACKS,
  writeStore,
  readStore,
  newLookPackId,
  MAX_CHARACTERS,
  loadCharacters,
  characterFromBundle,
  castIdForRoleplaySession,
  applyRemovedCharacterIds,
  type CharacterRecord,
} from './character-os';
import { isRolledAppearanceDescriptor } from './character-appearance';
import { withSuppressedDurableSyncPush } from './browser-storage';
import type { CharacterIdentityBundle } from './character-identity-bundle';

declare module './character-os' {
  interface CharacterFeatureFields {
    bio?: RoleplayBio;
    tone?: RoleplayTone;
    content?: RoleplayContentId;
    playAs?: RoleplayPlayAs;
    /** Watch/cut list for assembling a film from this character's clips and stills. */
    filmCut?: CharacterFilmCut;
    /** Named Moodboard look packs saved on this character. */
    lookPacks?: CharacterLookPack[];
  }
}

export type CharacterLookPack = {
  id: string;
  name: string;
  savedAt: number;
  pack: LookPack;
};

function normalizeLookPacks(input: CharacterLookPack[] | undefined): CharacterLookPack[] {
  const next: CharacterLookPack[] = [];
  for (const entry of input ?? []) {
    if (!entry?.id || !entry.pack || entry.pack.version !== 1) {
      continue;
    }
    const name = readName(entry.name) || 'Look pack';
    next.push({
      id: entry.id.trim(),
      name,
      savedAt: typeof entry.savedAt === 'number' ? entry.savedAt : Date.now(),
      pack: {
        ...entry.pack,
        source: entry.pack.source === 'saved' ? 'saved' : 'moodboard',
        characterId: entry.pack.characterId?.trim() || undefined,
      },
    });
  }
  return next.sort((left, right) => right.savedAt - left.savedAt).slice(0, MAX_LOOK_PACKS);
}

export function lookPacksOf(character: CharacterRecord): CharacterLookPack[] {
  return normalizeLookPacks(character.lookPacks);
}

export function getCharacterLookPack(
  characterId: string,
  lookPackId: string
): CharacterLookPack | undefined {
  const character = getCharacter(characterId);
  if (!character) {
    return undefined;
  }
  const id = lookPackId.trim();
  return lookPacksOf(character).find(entry => entry.id === id);
}

export function addCharacterLookPack(
  characterId: string,
  name: string,
  pack: LookPack
): CharacterRecord | undefined {
  const character = getCharacter(characterId);
  if (!character || pack.version !== 1) {
    return character;
  }
  const label = readName(name) || 'Look pack';
  const saved: LookPack = {
    ...pack,
    source: 'saved',
    characterId: character.id,
    savedAt: Date.now(),
  };
  const entry: CharacterLookPack = {
    id: newLookPackId(),
    name: label,
    savedAt: saved.savedAt,
    pack: saved,
  };
  const existing = lookPacksOf(character);
  upsertCharacter({
    ...character,
    looks: looksOf(character),
    lookPacks: [entry, ...existing.filter(item => item.name !== label)].slice(0, MAX_LOOK_PACKS),
    updatedAt: Date.now(),
  });
  return getCharacter(characterId);
}

export function removeCharacterLookPack(
  characterId: string,
  lookPackId: string
): CharacterRecord | undefined {
  const character = getCharacter(characterId);
  const id = lookPackId.trim();
  if (!character || !id) {
    return character;
  }
  upsertCharacter({
    ...character,
    looks: looksOf(character),
    lookPacks: lookPacksOf(character).filter(entry => entry.id !== id),
    updatedAt: Date.now(),
  });
  return getCharacter(characterId);
}

export function characterFromRoleplaySession(
  session: RoleplayLibrarySession
): CharacterRecord | null {
  const snapshot = session.snapshot;
  const name =
    readName(session.title) || readName(snapshot.characterName) || readName(snapshot.bio?.name);
  if (!name) {
    return null;
  }
  return {
    id: castIdForRoleplaySession(session.id),
    name,
    version: 1,
    updatedAt: session.updatedAt || Date.now(),
    descriptor: snapshot.bio?.look?.trim() || undefined,
    bio: snapshot.bio,
    reference: {
      originalUrl: snapshot.referenceOriginalUrl,
      originalFilename: snapshot.referenceOriginalFilename,
      isolatedUrl: snapshot.referenceImageUrl,
      isolatedFilename: snapshot.referenceImageFilename,
      isolated: snapshot.referenceIsolated,
      isolateSubject: snapshot.isolateSubject,
    },
    ipAdapter: snapshot.referenceImageFilename
      ? {
          imageFilename: snapshot.referenceImageFilename,
          imageUrl: snapshot.referenceImageUrl,
        }
      : undefined,
    personaId: snapshot.personaId,
    customPersona: snapshot.customPersona,
    characterName: snapshot.characterName,
    setting: snapshot.setting,
    tone: snapshot.tone,
    content: snapshot.content,
    playAs: snapshot.playAs,
  };
}

export function mergeMigratedCharacters(input: {
  existing: CharacterRecord[];
  bundles?: CharacterIdentityBundle[];
  roleplaySessions?: RoleplayLibrarySession[];
}): CharacterRecord[] {
  const merged = new Map<string, CharacterRecord>();
  for (const character of input.existing) {
    if (character.id) {
      merged.set(character.id, character);
    }
  }

  const nameOwner = (name: string) =>
    [...merged.values()].find(entry => slugCharacterName(entry.name) === slugCharacterName(name));

  for (const bundle of input.bundles ?? []) {
    const key = slugCharacterName(bundle.name);
    if (!key || nameOwner(bundle.name)) {
      continue;
    }
    const record = characterFromBundle(bundle);
    merged.set(record.id, record);
  }

  for (const session of input.roleplaySessions ?? []) {
    const converted = characterFromRoleplaySession(session);
    if (!converted || merged.has(converted.id)) {
      continue;
    }
    // A Cast already owns this session: session "cast-<id>" is owned by Cast "<id>" or by the
    // "char-rp-cast-<id>" copy an older version made. Importing it again as "<id>" beside that
    // copy put a second Cast with the same name in the roster on every fresh browser.
    if ([...merged.keys()].some(id => roleplaySessionIdForCast(id) === session.id)) {
      continue;
    }
    const clash = nameOwner(converted.name);
    if (clash && !clash.id.startsWith('char-rp-')) {
      continue;
    }
    merged.set(converted.id, converted);
  }

  return [...merged.values()]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_CHARACTERS);
}

export function migrateCharactersFromLegacy(input: {
  bundles?: CharacterIdentityBundle[];
  roleplaySessions?: RoleplayLibrarySession[];
}): CharacterRecord[] {
  const store = readStore();
  const firstImport = !store.migratedFromBundles;
  const characters = applyRemovedCharacterIds(
    mergeMigratedCharacters({
      existing: store.characters,
      bundles: firstImport ? input.bundles : [],
      roleplaySessions: input.roleplaySessions,
    }),
    store.removedIds
  );
  const existingIds = new Set(store.characters.map(entry => entry.id));
  const importedNew = characters.some(entry => !existingIds.has(entry.id));
  if (!firstImport && !importedNew) {
    return store.characters;
  }
  // A migration is not an edit: on a fresh browser it runs while the startup pull is in flight,
  // and counting its empty list as a local write kept it over the server's characters.
  withSuppressedDurableSyncPush(() =>
    writeStore({
      version: 1,
      migratedFromBundles: true,
      characters,
      removedIds: store.removedIds,
    })
  );
  return characters;
}

export function upsertCharacterFromRoleplaySession(
  session: RoleplayLibrarySession
): CharacterRecord | undefined {
  const converted = characterFromRoleplaySession(session);
  if (!converted) {
    return undefined;
  }
  const existing = loadCharacters();
  // The Cast this session belongs to: the one it was opened from (session "cast-<id>" for Cast
  // "<id>"), or a copy an older version made under "char-rp-cast-<id>". The Cast's own record
  // wins over that copy.
  const owners = existing.filter(entry => roleplaySessionIdForCast(entry.id) === session.id);
  const prev =
    owners.find(entry => !entry.id.startsWith('char-rp-')) ??
    owners[0] ??
    existing.find(entry => entry.id === converted.id);
  if (prev) {
    upsertCharacter({
      ...converted,
      id: prev.id,
      looks: looksOf(prev),
      loraLibraryIds: prev.loraLibraryIds,
      loraTriggerPhrases: prev.loraTriggerPhrases,
      filmCut: prev.filmCut,
    });
    return getCharacter(prev.id);
  }
  upsertCharacter(converted);
  return getCharacter(converted.id);
}

/**
 * Persist a Story bible onto a Cast lead — updates bio, display name, and active look
 * descriptor so normalize/applyLookFields cannot clobber the bible look.
 */
export function saveCharacterBio(
  characterId: string,
  bio: RoleplayBio
): CharacterRecord | undefined {
  const id = characterId.trim();
  if (!id) {
    return undefined;
  }
  const character = getCharacter(id);
  if (!character) {
    return undefined;
  }
  const name = bio.name.trim() || character.name;
  const look = bio.look.trim();
  const looks = looksOf(character);
  const current = looks.find(entry => entry.id === character.activeLookId) ?? looks[0]!;
  // The bible is Story's. Its look became the Cast's physical description too, and story
  // wording (clothes, mood, a raccoon's tricorn) went into Day and Look prompts. It still seeds
  // the description of a Cast that has none (one made from a Story).
  const seedsDescription =
    Boolean(look) && !current.descriptor?.trim() && !character.descriptor?.trim();
  const nextLooks = seedsDescription
    ? looks.map(entry => (entry.id === current.id ? { ...entry, descriptor: look } : entry))
    : looks;
  upsertCharacter({
    ...character,
    name,
    characterName: name,
    bio: {
      name,
      look: look || character.bio?.look || character.descriptor || name,
      personality: bio.personality.trim(),
      ...(bio.catchphrase?.trim() ? { catchphrase: bio.catchphrase.trim() } : {}),
    },
    descriptor: seedsDescription ? look : character.descriptor,
    looks: nextLooks,
    activeLookId: current.id,
  });
  return getCharacter(id);
}

export function saveCharacterFilmCut(
  characterId: string,
  filmCut: CharacterFilmCut
): CharacterRecord | undefined {
  const character = getCharacter(characterId);
  if (!character) {
    return undefined;
  }
  upsertCharacter({
    ...character,
    looks: looksOf(character),
    filmCut: {
      ...filmCut,
      updatedAt: Date.now(),
    },
    updatedAt: Date.now(),
  });
  return getCharacter(characterId);
}

/** Look packs tidied whenever a Cast record is normalised (registered by play-features.ts). */
export function normalizeCharacterLookPacks(character: CharacterRecord): CharacterRecord {
  return 'lookPacks' in character
    ? { ...character, lookPacks: normalizeLookPacks(character.lookPacks) }
    : character;
}

/** Drop the Cast bible (and linked Story session bio) so rewrite starts clean. */
export function clearCharacterBio(characterId: string): CharacterRecord | undefined {
  const id = characterId.trim();
  if (!id) {
    return undefined;
  }
  const character = getCharacter(id);
  if (!character) {
    return undefined;
  }
  upsertCharacter({
    ...character,
    bio: undefined,
    // The picture showed that bible.
    biblePicture: undefined,
    looks: looksOf(character),
    updatedAt: Date.now(),
  });
  return getCharacter(id);
}

/**
 * The look a Story bible should use for a Cast. A bible still holding a rolled description
 * ("a White man in his forties with … and a body that is …") from before the Cast's own
 * description changed — older Casts made from a photo — gives way to the Cast's description.
 */
export function castBibleLook(
  character: Pick<CharacterRecord, 'bio' | 'descriptor'>
): string | undefined {
  const look = character.bio?.look?.trim();
  const descriptor = character.descriptor?.trim();
  if (
    look &&
    descriptor &&
    look !== descriptor &&
    isRolledAppearanceDescriptor(look) &&
    !isRolledAppearanceDescriptor(descriptor)
  ) {
    return descriptor;
  }
  return look || undefined;
}
