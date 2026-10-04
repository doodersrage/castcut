/**
 * The Engine's identity lock (IP-Adapter / InstantID / PuLID face) and the Cast's looks.
 *
 * Each look has its own plate and the face made from it (look.ipAdapter: the plate's cut-out or
 * face crop). The session lock is either "from the look" — that face, and it follows the active
 * look whenever the look changes (Cast page, Day, Outfit, Story, a replaced plate) — or "your own"
 * (a face the player uploaded or locked from the gallery), which stays on a look switch.
 *
 * Settings saved before the source was recorded carry none: a lock that is any look's face or
 * plate (or the cut-out of one) counts as from the look, anything else as the player's own.
 *
 * Pure: no store access, so character-os can use it without an import cycle.
 */

import type { CharacterLook } from './character-os';
import type { SharedToolSettings } from './settings-cache';

export type IdentityLockSource = 'look' | 'own';

/** The shared settings fields that hold the lock. */
export type IdentityLockFields = Pick<
  SharedToolSettings,
  | 'ipAdapterImageFilename'
  | 'ipAdapterImageFilenames'
  | 'ipAdapterImageUrl'
  | 'ipAdapterComfyUrl'
  | 'ipAdapterSource'
>;

/** A picture a lock can be compared with: a plate or a face file. */
export type LockPicture = {
  filename?: string;
  originalFilename?: string;
  imageUrl?: string;
  originalUrl?: string;
};

/** The face a look locks: its face file (cut-out / crop of its plate), else its plate. */
export type LookFace = {
  filename?: string;
  imageUrl?: string;
  comfyUrl?: string;
};

type LookPictures = Pick<CharacterLook, 'ipAdapter' | 'reference'>;

const IDENTITY_MEDIA_PATH = '/api/gallery/media/identity';

function text(value: string | undefined | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** A URL worth comparing: not a session blob, not the one shared identity file. */
function comparableUrl(value: string | undefined): string {
  const url = text(value);
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) {
    return '';
  }
  const path = url.split('?')[0] ?? '';
  if (path === IDENTITY_MEDIA_PATH || path.endsWith(IDENTITY_MEDIA_PATH)) {
    return '';
  }
  // An owned plate's URL carries a cache-bust query and its path is the plate's own; any other
  // URL (a ComfyUI view URL names its file in the query) is compared whole.
  return path.includes('/api/gallery/media/owned/') ? path : url;
}

/**
 * A filename without what uploads add: the folder, ComfyUI's " (1)" on a clash, the upload
 * stamp ("-u<base36>"), a hash and the "-cutout" of an isolated plate. "nora-u1ab2c3d.png" and
 * "nora-cutout-u1ab2c3e.png" (or the older "nora-u1ab2c3d-cutout.png") share the stem "nora".
 */
export function lockPictureStem(filename: string | undefined): string {
  let base = text(filename).split('/').pop() ?? '';
  base = base.replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/\s*\(\d+\)$/, '');
  let previous = '';
  while (previous !== base) {
    previous = base;
    base = base.replace(/-(?:cutout|u[0-9a-z]{6,}|[0-9a-f]{16})$/i, '');
  }
  return base.toLowerCase();
}

function lookPictureSets(look: LookPictures): { names: Set<string>; urls: Set<string> } {
  const names = new Set<string>();
  const urls = new Set<string>();
  const ip = look.ipAdapter;
  for (const name of [
    ip?.imageFilename,
    ...(ip?.imageFilenames ?? []),
    look.reference?.isolatedFilename,
    look.reference?.originalFilename,
  ]) {
    const value = text(name);
    if (value) names.add(value);
  }
  for (const url of [ip?.imageUrl, look.reference?.isolatedUrl, look.reference?.originalUrl]) {
    const value = comparableUrl(url);
    if (value) urls.add(value);
  }
  return { names, urls };
}

function pictureSets(picture: LockPicture): LookPictures {
  return {
    reference: {
      isolatedFilename: picture.filename,
      originalFilename: picture.originalFilename,
      isolatedUrl: picture.imageUrl,
      originalUrl: picture.originalUrl,
    },
  };
}

type LockMatch = 'name' | 'url' | 'stem';

function lockMatchesLook(
  lock: Pick<IdentityLockFields, 'ipAdapterImageFilename' | 'ipAdapterImageUrl'>,
  look: LookPictures,
  match: LockMatch
): boolean {
  const filename = text(lock.ipAdapterImageFilename);
  const { names, urls } = lookPictureSets(look);
  if (match === 'name') {
    return Boolean(filename) && names.has(filename);
  }
  if (match === 'url') {
    const url = comparableUrl(lock.ipAdapterImageUrl);
    return Boolean(url) && urls.has(url);
  }
  const stem = lockPictureStem(filename);
  return Boolean(stem) && [...names].some(name => lockPictureStem(name) === stem);
}

/**
 * Whether the lock shows this look's picture: its face file or plate by name or URL, or (loose)
 * a file with the same stem — the plate's cut-out, or the same picture uploaded again.
 */
export function lockShowsLook(
  lock: Pick<IdentityLockFields, 'ipAdapterImageFilename' | 'ipAdapterImageUrl'>,
  look: LookPictures,
  options?: { loose?: boolean }
): boolean {
  return (
    lockMatchesLook(lock, look, 'name') ||
    lockMatchesLook(lock, look, 'url') ||
    (options?.loose === true && lockMatchesLook(lock, look, 'stem'))
  );
}

/**
 * The look whose picture the lock shows: by file name first (across every look), then by URL,
 * then a cut-out / the same stem.
 */
export function lookForLock<T extends LookPictures>(
  lock: Pick<IdentityLockFields, 'ipAdapterImageFilename' | 'ipAdapterImageUrl'>,
  looks: readonly T[]
): T | undefined {
  for (const match of ['name', 'url', 'stem'] as const) {
    const found = looks.find(look => lockMatchesLook(lock, look, match));
    if (found) return found;
  }
  return undefined;
}

export function hasIdentityLock(
  lock: Pick<IdentityLockFields, 'ipAdapterImageFilename'> | null | undefined
): boolean {
  return Boolean(text(lock?.ipAdapterImageFilename));
}

/**
 * Where the lock picture comes from. Null without a lock. A lock marked as the player's own is
 * own; otherwise it is from the look when it shows one of the Cast's looks (or `alsoLook`: a
 * plate the Cast just let go of, e.g. the one a replaced plate had), else own — which covers
 * settings saved before the source was recorded, and a face restored from a recipe.
 */
export function identityLockSource(
  lock: IdentityLockFields | null | undefined,
  looks: readonly LookPictures[],
  alsoLook?: ReadonlyArray<LockPicture | null | undefined>
): IdentityLockSource | null {
  if (!lock || !hasIdentityLock(lock)) {
    return null;
  }
  if (lock.ipAdapterSource === 'own') {
    return 'own';
  }
  const candidates: LookPictures[] = [
    ...looks,
    ...(alsoLook ?? []).flatMap(picture => (picture ? [pictureSets(picture)] : [])),
  ];
  return lookForLock(lock, candidates) ? 'look' : 'own';
}

/** The face a look locks: its face file (the plate's cut-out / crop), else its plate. */
export function lookFace(look: LookPictures | null | undefined): LookFace | null {
  if (!look) {
    return null;
  }
  const ip = look.ipAdapter;
  const ipFile = text(ip?.imageFilename);
  const ipUrl = text(ip?.imageUrl);
  if (ipFile || ipUrl) {
    return {
      ...(ipFile ? { filename: ipFile } : {}),
      ...(ipUrl ? { imageUrl: ipUrl } : {}),
      ...(text(ip?.comfyUrl) ? { comfyUrl: text(ip?.comfyUrl) } : {}),
    };
  }
  const ref = look.reference;
  const filename = text(ref?.isolatedFilename) || text(ref?.originalFilename);
  const imageUrl = text(ref?.isolatedUrl) || text(ref?.originalUrl);
  if (!filename && !imageUrl) {
    return null;
  }
  return {
    ...(filename ? { filename } : {}),
    ...(imageUrl ? { imageUrl } : {}),
  };
}

/** Shared settings for a lock on this look's face (marked as from the look). */
export function lockOnLookFace(look: LookPictures | null | undefined): Partial<SharedToolSettings> {
  const face = lookFace(look);
  if (!face?.filename) {
    return {
      ipAdapterImageFilename: undefined,
      ipAdapterImageFilenames: undefined,
      ipAdapterImageUrl: undefined,
      ipAdapterComfyUrl: undefined,
      ipAdapterSource: undefined,
    };
  }
  return {
    ipAdapterImageFilename: face.filename,
    ipAdapterImageFilenames: [face.filename],
    ipAdapterImageUrl: face.imageUrl,
    ipAdapterComfyUrl: face.comfyUrl,
    ipAdapterSource: 'look',
  };
}

/**
 * The lock after the Cast's look is `look` (switched, or its plate replaced). The player's own
 * face stays (its source is recorded, so a later match cannot flip it); a lock from the look — or
 * none, when the look has a face — moves to the new look's face; a lock from the look goes when
 * the new look has no picture. Returns the lock fields to write ({} when nothing changes).
 */
export function identityLockForLook(input: {
  lock: IdentityLockFields | null | undefined;
  looks: readonly LookPictures[];
  look: LookPictures | null | undefined;
  /** Plates the lock may still show that are no longer on the Cast (a replaced plate). */
  alsoLook?: ReadonlyArray<LockPicture | null | undefined>;
}): Partial<SharedToolSettings> {
  const source = identityLockSource(input.lock, input.looks, input.alsoLook);
  if (source === 'own') {
    return input.lock?.ipAdapterSource === 'own' ? {} : { ipAdapterSource: 'own' };
  }
  const next = lockOnLookFace(input.look);
  if (!next.ipAdapterImageFilename && source === null) {
    // No lock and nothing to lock: leave the settings alone.
    return {};
  }
  return next;
}

/** Whether writing `patch` changes the lock in `lock`. */
export function identityLockPatchChanges(
  lock: IdentityLockFields | null | undefined,
  patch: Partial<SharedToolSettings>
): boolean {
  return (Object.keys(patch) as Array<keyof IdentityLockFields>).some(key => {
    const before = lock?.[key];
    const after = (patch as IdentityLockFields)[key];
    return JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);
  });
}

/**
 * The player's own lock picture, when the lock is theirs (it then goes on every still of the
 * Cast, a Day slot in another look included). Undefined for a lock from the look: each still
 * takes its own look's face.
 */
export function ownIdentityLockFilename(
  lock: IdentityLockFields | null | undefined,
  looks: readonly LookPictures[]
): string | undefined {
  return identityLockSource(lock, looks) === 'own'
    ? text(lock?.ipAdapterImageFilename) || undefined
    : undefined;
}

/** What the Engine panel says about the lock. */
export type IdentityLockLookStatus =
  | { kind: 'none' }
  | { kind: 'look'; lookName: string }
  | { kind: 'own'; lookName?: string; canUseLook: boolean };

export function identityLockLookStatus(input: {
  lock: IdentityLockFields | null | undefined;
  looks: ReadonlyArray<LookPictures & Pick<CharacterLook, 'name'>>;
  activeLook: (LookPictures & Pick<CharacterLook, 'name'>) | null | undefined;
}): IdentityLockLookStatus {
  const source = identityLockSource(input.lock, input.looks);
  const activeName = text(input.activeLook?.name);
  if (source === null) {
    return { kind: 'none' };
  }
  if (source === 'look') {
    const shown = input.lock ? lookForLock(input.lock, input.looks) : undefined;
    return { kind: 'look', lookName: text(shown?.name) || activeName || 'Default' };
  }
  return {
    kind: 'own',
    ...(activeName ? { lookName: activeName } : {}),
    canUseLook: Boolean(lookFace(input.activeLook)?.filename),
  };
}

/** "Studio" → "Studio look"; a name that already says look is left alone. */
export function lookLockLabel(name: string): string {
  const trimmed = name.trim() || 'Default';
  return /\blook$/i.test(trimmed) ? trimmed : `${trimmed} look`;
}
