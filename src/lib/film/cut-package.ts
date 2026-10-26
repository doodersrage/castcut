/**
 * A portable Cut package (M4 F7, ROADMAP §7.7): the cut — its edit, added shots, options and
 * versions — with a media manifest, and (a full package) the media itself, in one .zip that
 * another Castcut can import. Its media are stored there by their SHA-256 (`pkg-<hash>`), so a
 * file that is already there isn't stored twice; a URL that still answers is kept as it is.
 * The format is versioned: a newer major version is refused, never half-read. Pure.
 */
import type { CutToolCache, CutVersion } from './cut-room';

export const CUT_PACKAGE_FORMAT = 'castcut-cut-package';
export const CUT_PACKAGE_VERSION = 1;
export const CUT_PACKAGE_MANIFEST = 'castcut-cut.json';

export type CutPackageMedia = {
  url: string;
  /** In the .zip (a full package): `media/<sha256>.<ext>`. */
  file?: string;
  sha256?: string;
  bytes?: number;
  contentType?: string;
};

export type CutPackageManifest = {
  format: typeof CUT_PACKAGE_FORMAT;
  version: number;
  createdAt: number;
  name: string;
  /** Who it was cut for, by name (Cast ids don't travel). */
  castName?: string;
  kind: 'light' | 'full';
  cut: Pick<CutToolCache, 'sources' | 'extras' | 'options' | 'versions'>;
  media: CutPackageMedia[];
};

const MEDIA_KEY = /(?:^|[a-z])(?:url|Url|URL)$/;

/** Every media URL a cut points at (pins, earlier takes, added shots, music, ambience, logo…). */
export function cutMediaUrls(cut: unknown): string[] {
  const found = new Set<string>();
  const walk = (value: unknown, key: string) => {
    if (typeof value === 'string') {
      if (MEDIA_KEY.test(key) && value.trim() && !value.startsWith('data:'))
        found.add(value.trim());
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry, key);
      return;
    }
    if (value && typeof value === 'object') {
      for (const [field, entry] of Object.entries(value)) walk(entry, field);
    }
  };
  walk(cut, '');
  return [...found];
}

/** The cut with its media URLs replaced (`map`: old → new); the rest as it is. */
export function rewriteCutMedia<T>(cut: T, map: ReadonlyMap<string, string>): T {
  if (!map.size) return cut;
  const walk = (value: unknown, key: string): unknown => {
    if (typeof value === 'string') {
      return MEDIA_KEY.test(key) ? (map.get(value.trim()) ?? value) : value;
    }
    if (Array.isArray(value)) return value.map(entry => walk(entry, key));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([field, entry]) => [field, walk(entry, field)])
      );
    }
    return value;
  };
  return walk(cut, '') as T;
}

/** The Gallery id a packaged file is stored under: the same file, the same id, on any machine. */
export function packageMediaEntryId(sha256: string): string {
  return `pkg-${sha256.toLowerCase().slice(0, 32)}`;
}

/** Read a manifest from untrusted JSON; an error says why it can't be imported. */
export function parseCutPackageManifest(
  raw: unknown
): { ok: true; manifest: CutPackageManifest } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'This isn’t a Cut package.' };
  const value = raw as Partial<CutPackageManifest>;
  if (value.format !== CUT_PACKAGE_FORMAT) return { ok: false, error: 'This isn’t a Cut package.' };
  if (typeof value.version !== 'number' || Math.floor(value.version) > CUT_PACKAGE_VERSION) {
    return {
      ok: false,
      error: `This package was made by a newer Castcut (format ${value.version}); update to import it.`,
    };
  }
  if (!value.cut || typeof value.cut !== 'object') {
    return { ok: false, error: 'The package has no cut in it.' };
  }
  const media = (Array.isArray(value.media) ? value.media : []).filter(
    (entry): entry is CutPackageMedia =>
      Boolean(entry) &&
      typeof entry === 'object' &&
      typeof (entry as CutPackageMedia).url === 'string'
  );
  return {
    ok: true,
    manifest: {
      format: CUT_PACKAGE_FORMAT,
      version: value.version,
      createdAt: typeof value.createdAt === 'number' ? value.createdAt : 0,
      name:
        typeof value.name === 'string' && value.name.trim()
          ? value.name.trim().slice(0, 60)
          : 'Imported cut',
      ...(typeof value.castName === 'string' && value.castName.trim()
        ? { castName: value.castName.trim().slice(0, 80) }
        : {}),
      kind: value.kind === 'full' ? 'full' : 'light',
      cut: value.cut,
      media,
    },
  };
}

/** The imported cut as one version of this Cut (the live edit is left alone). */
export function packageAsVersion(
  manifest: CutPackageManifest,
  cut: CutPackageManifest['cut'],
  now = Date.now()
): CutVersion {
  return {
    id: `pkg${now.toString(36)}`,
    name: `Imported · ${manifest.name}`.slice(0, 60),
    savedAt: now,
    ...(cut.sources ? { sources: cut.sources } : {}),
    ...(cut.extras ? { extras: cut.extras } : {}),
    ...(cut.options ? { options: cut.options } : {}),
  };
}

/** The package's own versions, kept with it (named so you can tell them apart). */
export function packageVersions(
  manifest: CutPackageManifest,
  versions: readonly CutVersion[] | undefined,
  now = Date.now()
): CutVersion[] {
  return (versions ?? []).map((version, index) => ({
    ...version,
    id: `pkg${now.toString(36)}v${index}`,
    name: `${manifest.name} · ${version.name}`.slice(0, 60),
  }));
}
