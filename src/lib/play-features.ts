/**
 * Castcut's Play features plugging into the shared app (docs/architecture-boundaries.md). Imported
 * once by the Castcut app's composition root (components/PlayFeatures.tsx); the classic Studio
 * app does not, so the shared code never imports Play.
 */

import { scrubPlayToolCachesOnCastChange } from './play-cast-change';
import { registerCastChangeScrubber } from './settings-cache';
import { registerJobCompletedHook } from './comfyui-gallery';
import { registerAppFlag } from './app-flags';
import { loadPlayCampaignState } from './play-campaign';
import { loadPlayMetrics } from './play-metrics';

registerCastChangeScrubber(scrubPlayToolCachesOnCastChange);

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
