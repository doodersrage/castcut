export const MOBILE_STUDIO_HOME = '/m' as const;
export const MAX_CHARACTER_PLATES = 24;

export type MobileStudioTabId =
  'capture' | 'film' | 'queue' | 'gallery' | 'fitting' | 'day' | 'scene' | 'story' | 'cut';

export type MobileStudioTab = {
  id: MobileStudioTabId;
  href: string;
  label: string;
  hint: string;
};

export const MOBILE_STUDIO_TABS: MobileStudioTab[] = [
  { id: 'film', href: '/m/film', label: 'Film', hint: 'Your film' },
  { id: 'day', href: '/m/day', label: 'Day', hint: 'Plan the Day' },
  { id: 'fitting', href: '/m/fitting', label: 'Outfit', hint: 'Try clothes on' },
  { id: 'story', href: '/m/story', label: 'Story', hint: 'What happens next' },
  { id: 'cut', href: '/m/cut', label: 'Cut', hint: 'Put the film together' },
  { id: 'scene', href: '/m/scene', label: 'Scene', hint: 'One shot, exactly as you want it' },
  { id: 'capture', href: '/m', label: 'Cast', hint: 'Cast → Day → Cut' },
  { id: 'gallery', href: '/m/gallery', label: 'Gallery', hint: 'Everything you’ve made' },
  { id: 'queue', href: '/m/queue', label: 'Queue', hint: 'What’s rendering' },
];

/**
 * Primary dock tabs — the same four as the desktop Film dock (Film, Day, Outfit, Story); Cast,
 * Gallery and Queue live under More on both. The phone had seven tabs to the desk's four
 * (UI audit 2026-10-11).
 */
export const MOBILE_STUDIO_PRIMARY_TAB_IDS: MobileStudioTabId[] = [
  'film',
  'day',
  'fitting',
  'story',
  'cut',
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
  if (path === '/m/film' || path.startsWith('/m/film/')) {
    return 'film';
  }
  if (path === '/m/queue' || path.startsWith('/m/queue/')) {
    return 'queue';
  }
  if (path === '/m/gallery' || path.startsWith('/m/gallery/')) {
    return 'gallery';
  }
  if (path === '/m/fitting' || path.startsWith('/m/fitting/')) {
    return 'fitting';
  }
  if (path === '/m/day' || path.startsWith('/m/day/')) {
    return 'day';
  }
  if (path === '/m/cut' || path.startsWith('/m/cut/')) {
    return 'cut';
  }
  if (path === '/m/scene' || path.startsWith('/m/scene/')) {
    return 'scene';
  }
  if (
    path === '/m/story' ||
    path.startsWith('/m/story/') ||
    path === '/m/play' ||
    path.startsWith('/m/play/')
  ) {
    return 'story';
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

  // Cast character detail → phone Watch (Gallery films) or Capture with character context.
  const characterMatch = path.match(/^\/characters\/([^/]+)\/?$/);
  if (characterMatch) {
    const characterId = decodeURIComponent(characterMatch[1]);
    const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : '');
    if (params.get('media') === 'films') {
      return `/m/gallery?character=${encodeURIComponent(characterId)}&derivedKind=film${hash}`;
    }
    return `/m?character=${encodeURIComponent(characterId)}${hash}`;
  }

  const map: Record<string, string> = {
    '/play': '/m/film',
    '/fitting': '/m/fitting',
    '/day': '/m/day',
    '/story': '/m/story',
    '/cut': '/m/cut',
    '/scene': '/m/scene',
    '/roleplay': '/m/story',
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

/** Append `character=` when missing so mobile handoffs keep Cast context. */
export function withCharacterQuery(href: string, characterId?: string | null): string {
  const id = characterId?.trim();
  if (!id) {
    return href;
  }
  const hashIndex = href.indexOf('#');
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : '';
  const [path, query = ''] = withoutHash.split('?');
  const params = new URLSearchParams(query);
  if (!params.get('character')?.trim()) {
    params.set('character', id);
  }
  const next = params.toString();
  return `${path}${next ? `?${next}` : ''}${hash}`;
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

export function newCharacterPlateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `plate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
