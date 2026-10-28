/**
 * Castcut's Play features plugging into the shared app (docs/architecture-boundaries.md). Imported
 * once by the Castcut app's composition root (components/PlayFeatures.tsx); the classic Studio
 * app does not, so the shared code never imports Play.
 */

import { scrubPlayToolCachesOnCastChange } from './cast-change';
import { registerCastChangeScrubber, loadSettingsCache } from '../settings/cache';
import { registerJobCompletedHook } from '../gallery/comfyui-gallery';
import { registerAppFlag } from '../app/flags';
import { registerStudioExtrasSection } from '../app/studio-extras';
import { registerGlobalSearchSource } from '../search/global-search';
import { searchProduction } from './production-search';
import { PLAY_STUDIO_EXTRAS_SECTION } from './studio-extras';
import { loadPlayCampaignState, resolvePlayLoopNavHref } from './campaign';
import { hasCompletedFirstFilm, loadPlayMetrics, resolveNextPlayAction } from './metrics';
import { clearPlayCampaignState, PLAY_CAMPAIGN_KEY } from './campaign';
import { clearLookPack, loadLookPack, LOOK_PACK_KEY } from '../look/pack';
import { PLAY_METRICS_KEY, savePlayMetrics } from './metrics';
import { registerLocalDataReset } from '../storage/local-data-reset';
import { registerBackupSettingsContributor } from '../storage/studio-backup';
import { SCENE_SCRIPTS_KEY } from '../day/scene-script-store';
import { clearLocalSceneScripts, settingsWithSceneScripts } from '../day/scene-script-store-client';
import { registerResumeCta } from '../app/empty-cta';
import { registerPoseTargetGroup } from '../pose/targets';
import { registerReferenceHealthItems } from '../checks/reference-health';
import { dayPartnerReferenceHealth } from './reference-health';
import { registerFaceCheckReference } from '../face/check-reference';
import { comfyInputViewUrl } from '../face/match-client';
import { registerCharacterLookSwitcher, registerCharacterStorePreparer } from '../character/hooks';
import { migrateCharactersFromLegacy } from './cast';
import { switchCastPlate } from '../cast/plate-switch';
import { roleplaySessionsForCharacterSync } from '../story/roleplay-library';
import { listSavedIdentityBundles } from '../settings/cache';
import { registerNavClickFollower, registerNavHrefResolver } from '../app/nav-links';
import { followCurrentPlayLoopHref } from './loop-nav-click';
import { registerGalleryKeeperHook } from '../gallery/judgment-hooks';
import { registerGalleryReferenceSource } from '../gallery/reference-sources';
import { playGalleryReferences } from './gallery-references';
import { registerQueueJobDescriber } from '../queue/job-context';
import { registerCharacterNormalizer, registerStickyCharacterFields } from '../character/os';
import { normalizeCharacterLookPacks } from './cast';
import { PLAY_QUEUE_JOB_DESCRIBER } from './queue-jobs';
import { PLAY_POSE_TARGET_GROUPS } from './pose-targets';
import { loadLocalObservability } from '../server/local-observability';
import { loadOnboardingState } from '../app/onboarding-store';
import { registerGalleryClipTool } from '../gallery/clip-tools';
import { registerGalleryStillTool } from '../gallery/still-tools';
import { openDirector } from '../director/open-event';
import { registerCommandActions } from '../app/command-actions';
import { PLAY_APP_COMMAND_ACTIONS } from './command-actions';

registerCastChangeScrubber(scrubPlayToolCachesOnCastChange);
// Command palette: New Cast member, Open Story / Outfit / Day, Cut the film (pages add more).
registerCommandActions(PLAY_APP_COMMAND_ACTIONS);
registerStudioExtrasSection('play', PLAY_STUDIO_EXTRAS_SECTION);
// Global search finds the production's records by name (M9 T1).
registerGlobalSearchSource('production', searchProduction);
// Cast records: Look packs are tidied with the rest of the record.
registerCharacterNormalizer(normalizeCharacterLookPacks);
// A save from a screen that doesn't know them keeps the film cut and Look packs.
registerStickyCharacterFields('filmCut', 'lookPacks');

// Lightning Day face-break → auto Edit face-restore (deduped inside; loaded on first use).
registerJobCompletedHook(entry => {
  void import('../day/vacation-face-restore').then(({ maybeScheduleDayVacationFaceRestore }) =>
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
// Screenplays keep their own store (M6 V6): cleared with local data, and carried in backups.
registerLocalDataReset('scene-scripts', {
  keys: [SCENE_SCRIPTS_KEY],
  clear: clearLocalSceneScripts,
});
registerBackupSettingsContributor('scene-scripts', settingsWithSceneScripts);

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

// A kept intimate two-person still teaches the pose library its layout (local only). Loaded on
// demand: it pulls in the pose guide planner.
registerGalleryKeeperHook(entries => {
  void import('../pose/kept-intimate-client')
    .then(({ learnKeptIntimatePoses }) => learnKeptIntimatePoses(entries))
    .catch(() => {});
});

// The renders the film uses (Scene takes, Day stills, Story takes, Cut's added shots) keep their
// stored graph and stay through the Gallery's cap and Archive & purge.
registerGalleryReferenceSource(playGalleryReferences);

// Nav: Film / Day / Outfit / Story links carry the active Cast, and a click follows the Cast
// active now.
registerNavHrefResolver(resolvePlayLoopNavHref);
registerNavClickFollower((event, renderedHref, baseHref, push) =>
  followCurrentPlayLoopHref(event, renderedHref, baseHref, push)
);

// Cast pickers: bring old Story sessions and identity bundles into the Cast, and a look switch
// moves Outfit / Story / Day onto the new look's plate.
registerCharacterStorePreparer(() =>
  migrateCharactersFromLegacy({
    bundles: listSavedIdentityBundles(),
    roleplaySessions: roleplaySessionsForCharacterSync(),
  })
);
registerCharacterLookSwitcher((characterId, lookId) => switchCastPlate(characterId, lookId));

// "Pick the best engine per pose" off: every still stays on the picked engine (no Rapid hand-off).
registerAppFlag(
  'render.keepPickedEngine',
  () => loadSettingsCache().tools.day?.bestEnginePerPose !== true
);

// Workflow health checks Day's partner pictures too.
registerReferenceHealthItems(dayPartnerReferenceHealth);

// LoRA "Check on Cast" compares against Day's session plate (the plate Day stills go out with).
registerFaceCheckReference(() => {
  const day = loadSettingsCache().tools.day;
  const url = day?.plateImageUrl?.trim();
  if (url?.includes('/api/comfyui/view?')) return url;
  return comfyInputViewUrl(day?.plateImageFilename);
});

// Gallery ⋯ → Clip: the same finishing passes Day and Story offer, on any clip in the Gallery.
registerGalleryClipTool({
  id: 'finish',
  label: 'Sharpen & smooth',
  busyText: 'Sharpening the clip…',
  keepKind: 'finish',
  job: 'finish',
});
registerGalleryClipTool({
  id: 'realism',
  label: 'Make more realistic',
  busyText: 'Making the clip more realistic…',
  keepKind: 'realism',
  job: 'realism',
});

// Gallery ⋯ → Make it move → Direct a move…: the Director on any finished still.
registerGalleryStillTool({
  id: 'director',
  label: 'Direct a move…',
  title:
    'Pose a few beats on the 3D body (or pick ready-made moves): the still’s person acts them out.',
  run: ({ entry, stillUrl }) =>
    openDirector({
      entryId: entry.id,
      stillUrl,
      prompt: entry.prompt,
      characterId: entry.characterId,
      tool: entry.tool,
    }),
});
