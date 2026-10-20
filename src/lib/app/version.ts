/**
 * App version + GitHub release check.
 *
 * Compares the version this build shipped with (package.json, baked in at
 * build time) against the newest semver-tagged GitHub Release. Used by
 * /api/version and surfaced in Settings → Overview and the system tray.
 *
 * Self-hosted / air-gapped installs can disable the outbound check entirely
 * with UPDATE_CHECK_ENABLED=false.
 */

import packageJson from '../../../package.json';
import { GITHUB_REPO_SLUG } from './project-links';

export const CURRENT_APP_VERSION: string = packageJson.version;

const UPDATE_CHECK_TIMEOUT_MS = 5000;
const SUCCESS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const ERROR_CACHE_TTL_MS = 15 * 60 * 1000; // 15m — retry sooner after a failure

export type AppVersionCheckResult = {
  enabled: boolean;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  releaseName: string | null;
  publishedAt: string | null;
  checkedAt: number;
  error: string | null;
};

type GithubReleaseApiEntry = {
  tag_name?: unknown;
  name?: unknown;
  html_url?: unknown;
  published_at?: unknown;
  draft?: unknown;
  prerelease?: unknown;
};

/** Parses "vX.Y.Z" / "X.Y.Z" (optional pre-release/build suffix is ignored). */
export function parseSemver(value: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value.trim());
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** -1 when a<b, 0 when equal, 1 when a>b. Returns null if either fails to parse. */
export function compareSemver(a: string, b: string): number | null {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) {
    return null;
  }
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) {
      return left[i] < right[i] ? -1 : 1;
    }
  }
  return 0;
}

export function isNewerVersion(current: string, candidate: string): boolean {
  const cmp = compareSemver(current, candidate);
  return cmp !== null && cmp < 0;
}

export function isUpdateCheckEnabled(): boolean {
  return process.env.UPDATE_CHECK_ENABLED?.trim().toLowerCase() !== 'false';
}

export function getUpdateCheckRepoSlug(): string {
  return process.env.UPDATE_CHECK_REPO?.trim() || GITHUB_REPO_SLUG;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/** First non-draft, non-prerelease entry whose tag parses as semver. */
function pickLatestSemverRelease(entries: GithubReleaseApiEntry[]): GithubReleaseApiEntry | null {
  for (const entry of entries) {
    if (entry.draft || entry.prerelease) {
      continue;
    }
    const tag = asString(entry.tag_name);
    if (tag && parseSemver(tag)) {
      return entry;
    }
  }
  return null;
}

async function fetchLatestGithubRelease(repoSlug: string): Promise<GithubReleaseApiEntry | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.github.com/repos/${repoSlug}/releases?per_page=10`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'prompt-studio-update-check',
      },
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`GitHub releases request failed (${response.status})`);
    }
    const entries = (await response.json()) as GithubReleaseApiEntry[];
    if (!Array.isArray(entries)) {
      throw new Error('Unexpected GitHub releases response');
    }
    return pickLatestSemverRelease(entries);
  } finally {
    clearTimeout(timeout);
  }
}

let cache: { result: AppVersionCheckResult; expiresAt: number } | null = null;

function disabledResult(): AppVersionCheckResult {
  return {
    enabled: false,
    currentVersion: CURRENT_APP_VERSION,
    latestVersion: null,
    updateAvailable: false,
    releaseUrl: null,
    releaseName: null,
    publishedAt: null,
    checkedAt: Date.now(),
    error: null,
  };
}

/** Checks GitHub for a newer release, caching results in-memory for SUCCESS/ERROR TTLs. */
export async function checkForAppUpdate(
  options: { force?: boolean } = {}
): Promise<AppVersionCheckResult> {
  if (!isUpdateCheckEnabled()) {
    return disabledResult();
  }
  if (!options.force && cache && cache.expiresAt > Date.now()) {
    return cache.result;
  }

  const repoSlug = getUpdateCheckRepoSlug();
  try {
    const release = await fetchLatestGithubRelease(repoSlug);
    const latestVersion = release ? parseSemver(asString(release.tag_name) ?? '') : null;
    const latestVersionString = latestVersion ? latestVersion.join('.') : null;
    const result: AppVersionCheckResult = {
      enabled: true,
      currentVersion: CURRENT_APP_VERSION,
      latestVersion: latestVersionString,
      updateAvailable: latestVersionString
        ? isNewerVersion(CURRENT_APP_VERSION, latestVersionString)
        : false,
      releaseUrl: release ? (asString(release.html_url) ?? null) : null,
      releaseName: release ? (asString(release.name) ?? asString(release.tag_name)) : null,
      publishedAt: release ? asString(release.published_at) : null,
      checkedAt: Date.now(),
      error: null,
    };
    cache = { result, expiresAt: Date.now() + SUCCESS_CACHE_TTL_MS };
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not reach GitHub';
    if (cache) {
      // Keep serving the last known-good result; just note the transient error.
      const stale: AppVersionCheckResult = { ...cache.result, error: message };
      cache = { result: cache.result, expiresAt: Date.now() + ERROR_CACHE_TTL_MS };
      return stale;
    }
    const result: AppVersionCheckResult = {
      enabled: true,
      currentVersion: CURRENT_APP_VERSION,
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: null,
      releaseName: null,
      publishedAt: null,
      checkedAt: Date.now(),
      error: message,
    };
    cache = { result, expiresAt: Date.now() + ERROR_CACHE_TTL_MS };
    return result;
  }
}
