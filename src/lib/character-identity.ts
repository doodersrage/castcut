/**
 * A Cast's identity on a queued job: its face lock (the player's own lock when the Cast is active,
 * else its look's), pinned as IP-Adapter params, plus its LoRAs. Shared — Video, Day, Outfit, Look
 * and Story queues use it (look-outfit-plate re-exports these); docs/architecture-boundaries.md.
 */

import {
  activeLook,
  applyCharacterRecord,
  castLoraSessionIds,
  looksOf,
  type CharacterRecord,
} from '@/lib/character-os';
import { ownIdentityLockFilename } from '@/lib/identity-lock-look';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings-cache';

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
 * The player's own face lock (Engine → Identity lock), when this Cast is the active one and the
 * lock is not from a look (identity-lock-look.ts). It goes on the Cast's stills in every look.
 */
function ownIdentityLockForCast(character: CharacterRecord | null | undefined): string | undefined {
  if (!character || typeof window === 'undefined') {
    return undefined;
  }
  const shared = loadSettingsCache().shared;
  if (shared.activeCharacterId?.trim() !== character.id) {
    return undefined;
  }
  return ownIdentityLockFilename(shared, looksOf(character));
}

/**
 * Job-pinned IP-Adapter params from the Cast look/face lock (the player's own face when the lock
 * is theirs; else the look's — a Day slot in another look gets that look's face).
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
  const filename =
    ownIdentityLockForCast(character) || resolveCastFaceForPlate(character)?.filename?.trim();
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
