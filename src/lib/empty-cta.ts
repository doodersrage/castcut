import { flattenAppNavLinks } from './app-nav-catalog';
import { resolveFirstRunGoalCta } from './first-run-goal';
import { loadLocalObservability } from './local-observability';
import { loadNavFavorites } from './nav-favorites';
import { loadOnboardingState } from './onboarding-store';
import { loadPlayCampaignState } from './play-campaign';
import { loadPlayMetrics, resolveNextPlayAction } from './play-metrics';
import { loadWorkspaceMode } from './workspace-mode';

export type EmptyCta = {
  label: string;
  href: string;
};

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
  '/roleplay',
  '/m/play',
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
  const metrics = loadPlayMetrics();
  const campaign = loadPlayCampaignState();
  const funnel = loadLocalObservability();
  const hasPlayProgress =
    Boolean(metrics.firstPlayCampaignAt) ||
    Boolean(campaign?.characterId) ||
    (funnel.firstPlayCampaign || 0) > 0 ||
    (funnel.firstFilmCut || 0) > 0 ||
    (funnel.starterFilm || 0) > 0;
  if (hasPlayProgress) {
    return resolveWelcomeLandingCta();
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

  const metrics = loadPlayMetrics();
  const campaign = loadPlayCampaignState();
  const funnel = loadLocalObservability();
  const hasPlayProgress =
    Boolean(metrics.firstPlayCampaignAt) ||
    Boolean(campaign?.characterId) ||
    (funnel.firstPlayCampaign || 0) > 0 ||
    (funnel.firstFilmCut || 0) > 0;

  if (hasPlayProgress) {
    const watchedFirstFilm = loadOnboardingState().some(
      step => step.id === 'watch-first-film' && step.done
    );
    const next = resolveNextPlayAction({ metrics, funnel, campaign, watchedFirstFilm });
    return { label: next.label, href: next.href };
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
