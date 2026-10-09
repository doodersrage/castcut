/**
 * Castcut's Play features plugging into the shared app (docs/architecture-boundaries.md). Imported
 * once by the Castcut app's composition root (components/PlayFeatures.tsx); the classic Studio
 * app does not, so the shared code never imports Play.
 */

import { scrubPlayToolCachesOnCastChange } from './play-cast-change';
import { registerCastChangeScrubber } from './settings-cache';
import { registerJobCompletedHook } from './comfyui-gallery';
import { registerAppFlag } from './app-flags';
import { registerStudioExtrasSection } from './studio-extras';
import { PLAY_STUDIO_EXTRAS_SECTION } from './play-studio-extras';
import { loadPlayCampaignState } from './play-campaign';
import { hasCompletedFirstFilm, loadPlayMetrics, resolveNextPlayAction } from './play-metrics';
import { clearPlayCampaignState, PLAY_CAMPAIGN_KEY } from './play-campaign';
import { clearLookPack, loadLookPack, LOOK_PACK_KEY } from './look-pack';
import { PLAY_METRICS_KEY, savePlayMetrics } from './play-metrics';
import { registerLocalDataReset } from './local-data-reset';
import { registerResumeCta } from './empty-cta';
import { registerPoseTargetGroup } from './pose-targets';
import { registerQueueJobDescriber } from './queue-job-context';
import { PLAY_QUEUE_JOB_DESCRIBER } from './play-queue-jobs';
import { PLAY_POSE_TARGET_GROUPS } from './play-pose-targets';
import { loadLocalObservability } from './local-observability';
import { loadOnboardingState } from './onboarding-store';

registerCastChangeScrubber(scrubPlayToolCachesOnCastChange);
registerStudioExtrasSection('play', PLAY_STUDIO_EXTRAS_SECTION);

// Lightning Day face-break → auto Edit face-restore (deduped inside; loaded on first use).
registerJobCompletedHook(entry => {
  void import('./day-vacation-face-restore').then(({ maybeScheduleDayVacationFaceRestore }) =>
    maybeScheduleDayVacationFaceRestore(entry)
  );
});

// Home: the goal chooser until a first film is started.
registerAppFlag('home.showGoalChooser', () => {
  const metrics = loadPlayMetrics();
  const campaign = loadPlayCampaignState();
  return !metrics.firstPlayCampaignAt && !campaign?.characterId;
});

registerAppFlag('onboarding.firstFilmDone', () => hasCompletedFirstFilm());

// "Clear all local data": the film campaign, Play metrics and the Look pack.
registerLocalDataReset('play', {
  keys: [PLAY_CAMPAIGN_KEY, PLAY_METRICS_KEY, LOOK_PACK_KEY],
  clear: () => {
    clearPlayCampaignState();
    clearLookPack();
    savePlayMetrics({ version: 1 });
  },
});

// Empty states / welcome landing: resume the film when one is under way.
registerResumeCta(({ countStarterFilm }) => {
  const metrics = loadPlayMetrics();
  const campaign = loadPlayCampaignState();
  const funnel = loadLocalObservability();
  const hasPlayProgress =
    Boolean(metrics.firstPlayCampaignAt) ||
    Boolean(campaign?.characterId) ||
    (funnel.firstPlayCampaign || 0) > 0 ||
    (funnel.firstFilmCut || 0) > 0 ||
    (countStarterFilm && (funnel.starterFilm || 0) > 0);
  if (!hasPlayProgress) return null;
  const watchedFirstFilm = loadOnboardingState().some(
    step => step.id === 'watch-first-film' && step.done
  );
  const next = resolveNextPlayAction({
    metrics,
    funnel,
    campaign,
    watchedFirstFilm,
    lookPack: loadLookPack(),
  });
  return { label: next.label, href: next.href };
});

// Gallery pose dialog: send a read pose to a Day slot or a Story beat.
for (const group of PLAY_POSE_TARGET_GROUPS) registerPoseTargetGroup(group);

// Queue page: Day slot / Story beat labels, and Run next keeps them pointed at the job.
registerQueueJobDescriber('play', PLAY_QUEUE_JOB_DESCRIBER);
