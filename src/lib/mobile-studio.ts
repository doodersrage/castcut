import { newMoodboardTileId } from './moodboard-scene';

export const MOBILE_STUDIO_HOME = '/m' as const;
export const MAX_CHARACTER_PLATES = 24;

export type MobileStudioTabId =
  'capture' | 'queue' | 'gallery' | 'moodboard' | 'fitting' | 'day' | 'play';

export type MobileStudioTab = {
  id: MobileStudioTabId;
  href: string;
  label: string;
  hint: string;
};

export const MOBILE_STUDIO_TABS: MobileStudioTab[] = [
  { id: 'capture', href: '/m', label: 'Cast', hint: 'Look → Outfit → Day → Cut' },
  { id: 'queue', href: '/m/queue', label: 'Queue', hint: 'Watch jobs' },
  { id: 'gallery', href: '/m/gallery', label: 'Gallery', hint: 'Rate stills' },
  { id: 'moodboard', href: '/m/moodboard', label: 'Look', hint: 'Extract look' },
  { id: 'fitting', href: '/m/fitting', label: 'Outfit', hint: 'Keep a kit' },
  { id: 'day', href: '/m/day', label: 'Day', hint: 'Queue · Cut film' },
  { id: 'play', href: '/m/play', label: 'Story', hint: 'Optional beats' },
];

export type CharacterPlate = {
  id: string;
  name: string;
  createdAt: number;
  originalUrl: string;
  originalFilename?: string;
  isolatedUrl: string;
  isolatedFilename?: string;
  isolated: boolean;
};

export function isMobileStudioPath(pathname: string | null | undefined): boolean {
  const path = (pathname ?? '').split('?')[0] || '';
  return path === MOBILE_STUDIO_HOME || path.startsWith(`${MOBILE_STUDIO_HOME}/`);
}

export function mobileStudioTabFromPath(pathname: string | null | undefined): MobileStudioTabId {
  const path = (pathname ?? '').split('?')[0] || '';
  if (path === '/m/queue' || path.startsWith('/m/queue/')) {
    return 'queue';
  }
  if (path === '/m/gallery' || path.startsWith('/m/gallery/')) {
    return 'gallery';
  }
  if (path === '/m/moodboard' || path.startsWith('/m/moodboard/')) {
    return 'moodboard';
  }
  if (path === '/m/fitting' || path.startsWith('/m/fitting/')) {
    return 'fitting';
  }
  if (path === '/m/day' || path.startsWith('/m/day/')) {
    return 'day';
  }
  if (path === '/m/play' || path.startsWith('/m/play/')) {
    return 'play';
  }
  return 'capture';
}

/** Remap desk film-loop paths onto Mobile Studio when handoff stays on phone. */
export function toMobileStudioHref(href: string): string {
  const raw = href.trim();
  if (!raw) {
    return raw;
  }
  const hashIndex = raw.indexOf('#');
  const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : '';
  const qIndex = withoutHash.indexOf('?');
  const path = qIndex >= 0 ? withoutHash.slice(0, qIndex) : withoutHash;
  const query = qIndex >= 0 ? withoutHash.slice(qIndex) : '';

  // Cast character detail → phone Gallery films (Watch on Cast soft-advance).
  const characterMatch = path.match(/^\/characters\/([^/]+)\/?$/);
  if (characterMatch) {
    const characterId = decodeURIComponent(characterMatch[1]);
    const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : '');
    if (params.get('media') === 'films') {
      return `/m/gallery?character=${encodeURIComponent(characterId)}&derivedKind=film${hash}`;
    }
    return `/m${hash}`;
  }

  const map: Record<string, string> = {
    '/play': '/m/day',
    '/fitting': '/m/fitting',
    '/day': '/m/day',
    '/moodboard': '/m/moodboard',
    '/roleplay': '/m/play',
    '/gallery': '/m/gallery',
    '/queue': '/m/queue',
    '/characters': '/m',
  };
  const next = map[path];
  if (!next) {
    return raw;
  }
  return `${next}${query}${hash}`;
}

/** Keep Day autoqueue/remix rewrites on `/m/day` when already in Mobile Studio. */
export function dayToolPathname(pathname?: string | null): '/day' | '/m/day' {
  const path =
    (pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '/day')).split(
      '?'
    )[0] || '/day';
  return path === '/m/day' || path.startsWith('/m/day/') ? '/m/day' : '/day';
}

export function dayToolHref(searchParams: string, pathname?: string | null): string {
  const base = dayToolPathname(pathname);
  const query = searchParams.trim().replace(/^\?/, '');
  return query ? `${base}?${query}` : base;
}

export function normalizeCharacterPlate(value: unknown): CharacterPlate | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const originalUrl = typeof raw.originalUrl === 'string' ? raw.originalUrl.trim() : '';
  const isolatedUrl = typeof raw.isolatedUrl === 'string' ? raw.isolatedUrl.trim() : '';
  if (!id || (!originalUrl && !isolatedUrl)) {
    return null;
  }
  const createdAt =
    typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt)
      ? raw.createdAt
      : Date.now();
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Untitled plate';
  return {
    id,
    name,
    createdAt,
    originalUrl: originalUrl || isolatedUrl,
    originalFilename:
      typeof raw.originalFilename === 'string' ? raw.originalFilename.trim() : undefined,
    isolatedUrl: isolatedUrl || originalUrl,
    isolatedFilename:
      typeof raw.isolatedFilename === 'string' ? raw.isolatedFilename.trim() : undefined,
    isolated: raw.isolated !== false && raw.isolated !== 'false' && raw.isolated !== 0,
  };
}

export function normalizeCharacterPlates(value: unknown): CharacterPlate[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const plates: CharacterPlate[] = [];
  for (const entry of value) {
    const plate = normalizeCharacterPlate(entry);
    if (!plate || seen.has(plate.id)) {
      continue;
    }
    seen.add(plate.id);
    plates.push(plate);
  }
  return plates.sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_CHARACTER_PLATES);
}

export function upsertCharacterPlate(
  list: CharacterPlate[] | undefined,
  plate: CharacterPlate
): CharacterPlate[] {
  const next = (list ?? []).filter(entry => entry.id !== plate.id);
  next.unshift(plate);
  return next.slice(0, MAX_CHARACTER_PLATES);
}

export function removeCharacterPlate(
  list: CharacterPlate[] | undefined,
  id: string
): CharacterPlate[] {
  return (list ?? []).filter(entry => entry.id !== id);
}

export function roleplayPatchFromPlate(plate: CharacterPlate): {
  playAs: 'photo';
  isolateSubject?: boolean;
  referenceIsolated: boolean;
  referenceImageUrl: string;
  referenceImageFilename?: string;
  referenceOriginalUrl: string;
  referenceOriginalFilename?: string;
} {
  const isolated = plate.isolated === true;
  const queueUrl = isolated ? plate.isolatedUrl || plate.originalUrl : plate.originalUrl;
  const queueFilename = isolated
    ? plate.isolatedFilename || plate.originalFilename
    : plate.originalFilename;
  return {
    playAs: 'photo',
    ...(isolated
      ? { isolateSubject: true, referenceIsolated: true }
      : { referenceIsolated: false }),
    referenceImageUrl: queueUrl,
    referenceImageFilename: queueFilename,
    referenceOriginalUrl: plate.originalUrl,
    referenceOriginalFilename: plate.originalFilename,
  };
}

/** Outfit try-on plate fields from a Capture plate. */
export function fittingPatchFromPlate(plate: CharacterPlate): {
  isolateSubject?: boolean;
  referenceIsolated: boolean;
  referenceImageUrl: string;
  referenceImageFilename?: string;
  referenceOriginalUrl: string;
  referenceOriginalFilename?: string;
} {
  const patch = roleplayPatchFromPlate(plate);
  const { playAs: _playAs, ...fitting } = patch;
  return fitting;
}

/** Seed Look with a subject tile from a Capture plate. */
export function moodboardPatchFromPlate(plate: CharacterPlate): {
  tiles: Array<{
    id: string;
    role: 'other';
    label: string;
    notes: string;
    imageUrl: string;
    imageFilename?: string;
  }>;
} {
  const isolated = plate.isolated === true;
  const imageUrl = isolated ? plate.isolatedUrl || plate.originalUrl : plate.originalUrl;
  const imageFilename = isolated
    ? plate.isolatedFilename || plate.originalFilename
    : plate.originalFilename;
  return {
    tiles: [
      {
        id: newMoodboardTileId(),
        role: 'other',
        label: plate.name || 'Plate',
        notes: 'Captured plate',
        imageUrl,
        imageFilename,
      },
    ],
  };
}

export function newCharacterPlateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `plate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
