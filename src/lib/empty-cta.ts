import { flattenAppNavLinks } from './app-nav-catalog';
import { resolveFirstRunGoalCta } from './first-run-goal';
import { loadNavFavorites } from './nav-favorites';
import { loadWorkspaceMode } from './workspace-mode';

export type EmptyCta = {
  label: string;
  href: string;
};

/**
 * "Pick up where you left off" for empty states and the welcome landing, answered by a feature
 * (Play: the next film step when a film is under way — play-features.ts). Null = no progress.
 * docs/architecture-boundaries.md.
 */
export type ResumeCtaProvider = (options: { countStarterFilm: boolean }) => EmptyCta | null;

let resumeCtaProvider: ResumeCtaProvider | null = null;

export function registerResumeCta(provider: ResumeCtaProvider): void {
  resumeCtaProvider = provider;
}

function resumeCta(options: { countStarterFilm: boolean }): EmptyCta | null {
  try {
    return resumeCtaProvider?.(options) ?? null;
  } catch {
    return null;
  }
}

/** First-run Generate deep link — Random surprise, no keywords required. */
export const FIRST_RUN_GENERATE_HREF = '/?source=random';

/** Post-heal funnel — auto-generate random scene and queue to ComfyUI. */
export const FIRST_RUN_QUEUE_HREF = '/?source=random&autogen=1&autoqueue=1';

const PROMPT_TOOL_PATHS = new Set([
  '/',
  '/format',
  '/prompt',
  '/character',
  '/background',
  '/pet',
  '/fantasy',
  '/story',
  '/m/story',
  '/variations',
  '/image-prompt',
]);

/**
 * Prefer a pinned prompt/scene tool for empty-state CTAs; fall back to Generate or Dashboard.
 */
export function resolveGenerateEmptyCta(
  fallback: EmptyCta = { label: 'Open Generate', href: '/' }
): EmptyCta {
  if (typeof window === 'undefined') {
    return fallback;
  }
  const favorites = loadNavFavorites();
  const links = flattenAppNavLinks();
  for (const favorite of favorites) {
    const path = (favorite.split('?')[0] || favorite).trim() || '/';
    if (!PROMPT_TOOL_PATHS.has(path)) {
      continue;
    }
    const link =
      links.find(entry => entry.href === favorite) ??
      links.find(entry => (entry.href.split('?')[0] || entry.href) === path);
    if (link) {
      return { label: `Open ${link.label}`, href: link.href };
    }
  }
  return fallback;
}

/**
 * Studio empty states (Gallery, Queue, Dashboard): resume Play when the funnel
 * has progress; otherwise fall back to Generate empty CTA.
 */
export function resolveStudioEmptyCta(
  fallback: EmptyCta = { label: 'Start a film', href: '/play' }
): EmptyCta {
  if (typeof window === 'undefined') {
    return resolveGenerateEmptyCta(fallback);
  }
  const resume = resumeCta({ countStarterFilm: true });
  if (resume) {
    return resume;
  }
  if (loadWorkspaceMode() === 'play' || loadWorkspaceMode() === 'simple') {
    return { label: 'Start a film', href: '/play' };
  }
  return resolveGenerateEmptyCta(fallback);
}

/**
 * Post-welcome primary CTA.
 * Return visits with Play progress resume the funnel; Play workspace opens `/play`;
 * otherwise first-run Generate random surprise.
 */
export function resolveWelcomeLandingCta(): EmptyCta {
  if (typeof window === 'undefined') {
    return { label: 'Open Generate', href: FIRST_RUN_GENERATE_HREF };
  }

  const resume = resumeCta({ countStarterFilm: false });
  if (resume) {
    return resume;
  }

  const goalCta = resolveFirstRunGoalCta();
  if (goalCta) {
    return goalCta;
  }

  if (loadWorkspaceMode() === 'play') {
    return { label: 'Start a film', href: '/play' };
  }
  return { label: 'Open Generate', href: FIRST_RUN_GENERATE_HREF };
}
