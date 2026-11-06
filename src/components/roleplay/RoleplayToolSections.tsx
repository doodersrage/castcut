'use client';

import { CastMoodBoardMenu } from '@/components/character/CastMoodBoard';
import StorySheetsMenu from '@/components/roleplay/StorySheetsMenu';
import { useRenderBackend } from '@/lib/engine/render-backend-status';
import ClipEngineNote from '@/components/ClipEngineNote';
import TaskRequirementsCard from '@/components/TaskRequirementsCardLazy';
import CutProblemsDialog from '@/components/CutProblemsDialog';
import { TOOL_SETUP_LABELS } from '@/lib/app/tool-page-chrome';

import SharedToolControls from '@/components/SharedToolControls';
import RoleplayBeatOutputSection from '@/components/roleplay/RoleplayBeatOutputSection';
import RoleplayCastSection from '@/components/roleplay/RoleplayCastSection';
import { RoleplayCastToneSettingSection } from '@/components/roleplay/sections/RoleplayCastToneSettingSection';
import RoleplayStorySection, { StoryCutActions } from '@/components/roleplay/RoleplayStorySection';
import SideSheet from '@/components/ui/SideSheet';
import { PlayCastChip } from '@/components/play/PlayFilmHome';
import { useDayStoryOpening } from '@/hooks/useDayStoryOpening';
import RoleplayWardrobeSection from '@/components/roleplay/RoleplayWardrobeSection';
import StoryStatusStrip from '@/components/roleplay/StoryStatusStrip';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import PlayFilmFunnelChrome from '@/components/PlayFilmFunnelChrome';
import StoryRetryFlagged from '@/components/roleplay/StoryRetryFlagged';
import StoryStartOverDialog from '@/components/roleplay/StoryStartOverDialog';
import { storyBeatAwaitsRewrite } from '@/hooks/roleplay/story-beat-edit';
import { useStoryScenePoses } from '@/hooks/roleplay/useStoryScenePoses';
import { useStoryStartOver } from '@/hooks/roleplay/useStoryStartOver';
import PlaySoftAdvanceBanner from '@/components/PlaySoftAdvanceBanner';
import { usePlaySoftAdvance } from '@/hooks/usePlaySoftAdvance';
import type { useRoleplayToolOrchestration } from '@/hooks/useRoleplayToolOrchestration';
import { Button } from '@/components/ui/Button';
import { ToolActionRow, ToolLayout, ToolSection } from '@/components/ui/ToolPageShell';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { getCharacter } from '@/lib/character/os';
import {
  fetchClothingLabels,
  getCachedClothingLabel,
  humanizeClothingId,
} from '@/lib/wardrobe/clothing-catalog-client';
import { normalizeDayIntimateMix } from '@/lib/day/planner';
import { playCampaignHref } from '@/lib/play/campaign';
import {
  countRoleplayCompletedClips,
  countRoleplayCompletedStills,
  isRoleplayAdultContent,
  roleplayQueueBlockReason,
  storySessionStatusLine,
  roleplayMoodSummary,
  type RoleplayStoryBeat,
} from '@/lib/story/roleplay';
import { isLeanWorkspaceMode } from '@/lib/app/workspace-mode';
import { useCallback, useEffect, useMemo, useState } from 'react';

const ACCENT = 'amber' as const;
const TOOL_ID = 'roleplay';

type RoleplayToolViewModel = ReturnType<typeof useRoleplayToolOrchestration>;

type RoleplayToolSectionsProps = RoleplayToolViewModel & {
  description: string;
};

export default function RoleplayToolSections({
  description,
  shared,
  toolSettings,
  updateShared,
  updateToolSettings,
  error,
  setError,
  personaId,
  adultEnabled,
  adultGateReady,
  tone,
  content,
  bio,
  story,
  storyProgress,
  autoQueue,
  beatOutput,
  playAsResolved,
  lastPrompt,
  busy,
  reference,
  film,
  beatQueue,
  sceneFlow,
  bioFlow,
  session,
  beatEdit,
  extendBeat,
  wardrobe,
}: RoleplayToolSectionsProps) {
  const workspaceMode = useWorkspaceMode();
  const leanChrome = isLeanWorkspaceMode(workspaceMode);
  const { softAdvance, cancelSoftAdvance } = usePlaySoftAdvance();
  const activeCharacterId = shared.activeCharacterId?.trim() || '';
  const dayOpening = useDayStoryOpening({
    story,
    castId: activeCharacterId,
    updateToolSettings,
  });
  const castCharacter = useMemo(
    () => (activeCharacterId ? getCharacter(activeCharacterId) : undefined),
    [activeCharacterId]
  );
  const castCharacterName = castCharacter?.name?.trim() || '';
  const startOver = useStoryStartOver({
    clearStory: session.restartStory,
    clearScenes: () => sceneFlow.setScenes([]),
    writeBio: bioFlow.writeBio,
    leadName: toolSettings.characterName?.trim() || castCharacterName,
  });
  // The figure on each scene card: the pose its still would be drawn in. Only From photo
  // stories queue a pose guide, so only they show one.
  const scenePoses = useStoryScenePoses({
    scenes: sceneFlow.scenes,
    story,
    model: shared.model,
    poseGuideStyle: shared.poseGuideStyle,
    adult: isRoleplayAdultContent(content),
    solo: toolSettings.intimateMix === 'solo',
    enabled: playAsResolved === 'photo',
  });
  const castHomeHref = activeCharacterId
    ? `/characters/${encodeURIComponent(activeCharacterId)}`
    : '/characters';
  const filmHref = activeCharacterId ? playCampaignHref(activeCharacterId) : '/play';

  const renderOffline = useRenderBackend().state === 'offline';
  const completedShotCount = useMemo(() => countRoleplayCompletedStills(story), [story]);
  const completedClipCount = useMemo(() => countRoleplayCompletedClips(story), [story]);
  const showAnimateCoach =
    completedShotCount > 0 &&
    completedClipCount < completedShotCount &&
    !film.firstCutCelebrate &&
    !film.assemblingFilm;

  const queueBlockReason = useMemo(
    () =>
      roleplayQueueBlockReason({
        hasCharacter: Boolean(activeCharacterId),
        hasBio: Boolean(bio),
        playAsPhoto: playAsResolved === 'photo',
        hasPlate: reference.hasReferenceImage,
        isolateSubject: reference.isolateSubject,
        isolatePending:
          reference.isolateSubject &&
          reference.hasReferenceImage &&
          toolSettings.referenceIsolated !== true &&
          (Boolean(reference.isolateStatus) || reference.referenceUploading),
      }),
    [
      activeCharacterId,
      bio,
      playAsResolved,
      reference.hasReferenceImage,
      reference.isolateStatus,
      reference.isolateSubject,
      reference.referenceUploading,
      toolSettings.referenceIsolated,
    ]
  );

  const storyStatusLine = storySessionStatusLine({
    hasCharacter: Boolean(activeCharacterId),
    characterName: castCharacterName,
    hasPlate: reference.hasReferenceImage,
    hasWardrobe: Boolean(
      toolSettings.wardrobeId?.trim() || toolSettings.customGarmentImageUrl?.trim()
    ),
    completedStills: completedShotCount,
    completedClips: completedClipCount,
    beatTotal: story.length,
  });

  const animateAllReady = useCallback(async () => {
    for (const beat of story) {
      if (
        beat.stillStatus === 'completed' &&
        beat.imageUrl?.trim() &&
        beat.clipStatus !== 'completed'
      ) {
        await beatQueue.queueBeatMotion(beat);
      }
    }
  }, [beatQueue, story]);

  // "Retry flagged" / "Retry them first": a scene whose text was edited has no still prompt to
  // retry with — its fresh take is the scene written again.
  const retryStill = useCallback(
    (beat: RoleplayStoryBeat) =>
      storyBeatAwaitsRewrite(beat)
        ? beatEdit.rewriteBeat(beat)
        : beatQueue.queueBeat(beat, { retry: true }),
    [beatEdit, beatQueue]
  );

  const castProps = {
    busy,
    bio,
    story,
    storyPhase: storyProgress.phase,
    personaId,
    playAs: playAsResolved,
    tone,
    content,
    adultEnabled,
    autoQueue,
    beatOutput,
    photoReady: reference.photoReady,
    toolSettings,
    activeCharacterId,
    castCharacterName,
    castHomeHref,
    filmHref,
    isolateSubject: reference.isolateSubject,
    hasReferenceImage: reference.hasReferenceImage,
    scanning: reference.scanning,
    referenceUploading: reference.referenceUploading,
    isolateStatus: reference.isolateStatus,
    displayReferenceUrl: reference.displayReferenceUrl,
    referenceOriginalFilename: reference.referenceOriginalFilename,
    referenceOriginalUrl: reference.referenceOriginalUrl,
    referenceImageFilename: reference.referenceImageFilename,
    referenceImageUrl: reference.referenceImageUrl,
    lastStill: reference.lastStill,
    onUpdateToolSettings: updateToolSettings,
    onClearReference: reference.clearReference,
    onApplyReference: reference.applyReference,
    onReferencePreviewUrlChange: reference.setReferencePreviewUrl,
    onIsolateStatusChange: reference.setIsolateStatus,
    onError: setError,
    onScanWithVision: () => void reference.scanWithVision(),
    onRestartStory: startOver.ask,
    hideMoodSection: true as const,
  };

  // Who, the photo and the outfit fold into one chip (they filled a side column, said twice).
  const [castSheetOpen, setCastSheetOpen] = useState(false);
  const outfitLabel = wardrobe.hasCustomGarment
    ? 'Your clothing photo'
    : wardrobe.selectedWardrobeId
      ? (wardrobe.filteredWardrobeOptions.find(
          option => option.value === wardrobe.selectedWardrobeId
        )?.label ??
        getCachedClothingLabel(wardrobe.selectedWardrobeId) ??
        humanizeClothingId(wardrobe.selectedWardrobeId))
      : undefined;

  // The kit's real name, once the catalog says (the cache re-renders nothing by itself).
  const [, setLabelsLoaded] = useState(0);
  const kitId = wardrobe.selectedWardrobeId || '';
  useEffect(() => {
    if (!kitId || getCachedClothingLabel(kitId)) return;
    let cancelled = false;
    void fetchClothingLabels([kitId]).then(() => {
      if (!cancelled) setLabelsLoaded(count => count + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [kitId]);

  // Keys (not while typing, nor over a dialog): 1–4 pick a beat, R rolls new beats, U undoes the
  // last scene, ← → step through the scenes on the stage.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (target &&
          (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) ||
        document.querySelector('[role="dialog"]')
      ) {
        return;
      }
      const usable = (button: HTMLButtonElement | null | undefined) =>
        button && !button.disabled ? button : null;
      const byId = (testId: string) =>
        usable(document.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`));
      let button: HTMLButtonElement | null = null;
      const key = event.key.toLowerCase();
      if (/^[1-4]$/.test(event.key)) {
        button = usable(
          document.querySelectorAll<HTMLButtonElement>('[data-testid="story-scene-card"]')[
            Number(event.key) - 1
          ]
        );
      } else if (key === 'r') {
        button = byId('story-roll-scenes') ?? byId('story-start-roll');
      } else if (key === 'u') {
        button = byId('story-undo-scene');
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const thumbs = [
          ...document.querySelectorAll<HTMLButtonElement>('[data-testid="story-stage-thumb"]'),
        ];
        const at = thumbs.findIndex(thumb => thumb.getAttribute('aria-pressed') === 'true');
        button = usable(thumbs[at + (event.key === 'ArrowLeft' ? -1 : 1)]);
      }
      if (button) {
        event.preventDefault();
        button.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const downloadAction = (
    <Button
      variant="secondary"
      loading={session.exporting}
      loadingLabel="Packing story"
      disabled={(!bio && story.length === 0) || (busy && !session.exporting)}
      onClick={() => void session.downloadStory()}
    >
      Download story + stills + clips
    </Button>
  );

  const engineControls = (
    <SharedToolControls
      shared={shared}
      onModelChange={model => updateShared({ model })}
      onDetailChange={detail => updateShared({ detail })}
      onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
      showWardrobeOption={false}
      seedLlmWithIngredients={false}
      autoFixRules={shared.autoFixRules !== false}
      onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
      recommendFromText={lastPrompt || bio?.look}
      toolId={TOOL_ID}
      preferEditModels={playAsResolved === 'photo'}
      onSharedSettingsChange={updateShared}
      variant="roleplay"
    />
  );
  // No Cast and nothing written yet: the "Story needs a Cast" card is the whole page — beat
  // controls would only lead to a queue blocker.
  const needsCastGate = !activeCharacterId?.trim() && story.length === 0;

  return (
    <ToolLayout
      accent={ACCENT}
      title="Story"
      description={description}
      width="full"
      sidebarPersistKey="roleplay"
      sidebar={engineControls}
      sidebarTitle={leanChrome ? false : undefined}
      // Reel first needs the width: the Engine opens from the header chip as a sheet.
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.roleplay} />
      <PlayFilmFunnelChrome />
      <PlaySoftAdvanceBanner
        key={softAdvance?.nonce ?? 'idle'}
        target={softAdvance}
        onCancel={cancelSoftAdvance}
      />
      <StoryStartOverDialog
        open={startOver.open}
        sceneCount={story.length}
        leadName={bio?.name || castCharacterName}
        onResolve={startOver.resolve}
      />

      {needsCastGate ? (
        <RoleplayCastSection {...castProps} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {activeCharacterId ? (
              <PlayCastChip
                name={castCharacterName || 'Cast'}
                look={outfitLabel}
                plate={reference.displayReferenceUrl || null}
                testId="story-cast-chip"
                onOpen={() => setCastSheetOpen(true)}
              />
            ) : null}
            <CastMoodBoardMenu character={castCharacter} testId="story-mood-board" />
            {story.length > 0 ? (
              <StorySheetsMenu
                story={story}
                lead={bio?.name || castCharacterName}
                title={
                  bio?.name || castCharacterName ? `${bio?.name || castCharacterName}'s story` : ''
                }
              />
            ) : null}
            {!film.firstCutCelebrate ? (
              <StoryStatusStrip
                className="min-w-0 flex-1"
                statusLine={storyStatusLine}
                queueBlockReason={queueBlockReason}
              />
            ) : null}
          </div>

          {/* Reel first: the story so far (newest scene large), what happens next; who, photo
              and outfit in the side column. */}
          <div className="ui-section-stack min-w-0" data-testid="story-layout">
            <div className="ui-section-stack min-w-0">
              <StoryRetryFlagged story={story} busy={busy} onRetry={retryStill} />
              <CutProblemsDialog
                problems={film.cutProblems}
                onResolve={action => void film.resolveCutProblems(action, retryStill)}
              />
              {story.length > 0 || dayOpening || film.firstCutCelebrate ? (
                <RoleplayStorySection
                  stage
                  cutInComposer
                  cutChecking={film.cutChecking}
                  beatOutput={beatOutput}
                  autoQueue={autoQueue}
                  assemblingFilm={film.assemblingFilm}
                  busy={busy}
                  story={story}
                  bioPresent={Boolean(bio)}
                  castBibleHref={castHomeHref}
                  scenesLoading={sceneFlow.scenesLoading}
                  filmNeedsCast={film.filmNeedsCast}
                  filmCharacterId={film.filmCharacterId}
                  filmStatus={film.filmStatus}
                  filmError={film.filmError}
                  filmGuideHref={film.filmGuideHref}
                  firstCutCelebrate={film.firstCutCelebrate}
                  onClearFirstCutCelebrate={() => {
                    film.clearFirstCutCelebrate();
                  }}
                  downloadAction={downloadAction}
                  onCutFilm={() => void film.cutRoleplayFilm()}
                  onSaveToCast={film.saveFilmToCast}
                  onShareCut={() => void film.shareLastCut()}
                  onSavePoster={() => void film.saveFilmPoster()}
                  posterBusy={film.posterBusy}
                  canShareCut={Boolean(film.filmStatus && !film.assemblingFilm)}
                  filmCutOptions={film.filmCutOptions}
                  onFilmCutOptionsChange={film.setFilmCutOptions}
                  previouslyAvailable={film.storyPreviouslyAvailable}
                  onQueue={beat => void beatQueue.queueBeat(beat)}
                  onRetry={beat => void beatQueue.queueBeat(beat, { retry: true })}
                  onRetryClip={beat => void beatQueue.queueBeatMotion(beat, { retry: true })}
                  onAnimate={beat => void beatQueue.queueBeatMotion(beat)}
                  onCloseUps={beat => void beatQueue.addStoryCloseUps(beat)}
                  closeUpsBeatId={beatQueue.closeUpsBeatId}
                  onExtend={extendBeat}
                  onSelectTake={session.selectStillTake}
                  fixAreaFor={session.fixAreaTargetForBeat}
                  onPoseChange={session.setBeatPose}
                  onSelectClipTake={session.selectClipTake}
                  onCopy={beat => void session.copyBeatPrompt(beat)}
                  beatEdit={beatEdit}
                  onRollScenes={() => void sceneFlow.rollScenes()}
                  dayOpening={dayOpening}
                />
              ) : null}
              {showAnimateCoach ? (
                <ToolSection
                  title="Animate the stills"
                  description="They're ready — turn them into clips, then cut the film."
                  data-testid="story-animate"
                >
                  <ToolActionRow>
                    <Button
                      variant="primary"
                      disabled={busy || film.assemblingFilm || renderOffline}
                      data-testid="story-animate-all"
                      onClick={() => void animateAllReady()}
                    >
                      Animate all ready stills
                    </Button>
                  </ToolActionRow>
                  <ClipEngineNote twoPersonAdultPossible story />
                </ToolSection>
              ) : null}
              <RoleplayBeatOutputSection
                composer
                hideRoll={
                  story.length === 0 && Boolean(dayOpening) && sceneFlow.scenes.length === 0
                }
                footer={
                  story.length > 0 ? (
                    <StoryCutActions
                      story={story}
                      filmCutOptions={film.filmCutOptions}
                      onFilmCutOptionsChange={film.setFilmCutOptions}
                      assemblingFilm={film.assemblingFilm}
                      cutChecking={film.cutChecking}
                      busy={busy}
                      filmNeedsCast={film.filmNeedsCast}
                      filmCharacterId={film.filmCharacterId}
                      filmStatus={film.filmStatus}
                      filmError={film.filmError}
                      filmGuideHref={film.filmGuideHref}
                      firstCutCelebrate={film.firstCutCelebrate}
                      previouslyAvailable={film.storyPreviouslyAvailable}
                      onCutFilm={() => void film.cutRoleplayFilm()}
                      onSaveToCast={film.saveFilmToCast}
                      onShareCut={() => void film.shareLastCut()}
                      onSavePoster={() => void film.saveFilmPoster()}
                      posterBusy={film.posterBusy}
                      canShareCut={Boolean(film.filmStatus && !film.assemblingFilm)}
                      downloadAction={downloadAction}
                    />
                  ) : null
                }
                storyProgress={storyProgress}
                beatOutput={beatOutput}
                autoQueue={autoQueue}
                busy={busy}
                bioPresent={Boolean(bio)}
                scenesLoading={sceneFlow.scenesLoading}
                scenes={sceneFlow.scenes}
                scenePoses={scenePoses}
                playingId={sceneFlow.playingId}
                error={error}
                filmError={film.filmError}
                filmGuideHref={film.filmGuideHref}
                queueBlockReason={queueBlockReason}
                content={content}
                intimateMix={normalizeDayIntimateMix(toolSettings.intimateMix)}
                onIntimateMixChange={next =>
                  updateToolSettings({ intimateMix: normalizeDayIntimateMix(next) })
                }
                onRestartStory={startOver.ask}
                storyBeatCount={story.length}
                onUndoLastScene={session.undoLastScene}
                onBeatOutputChange={next => updateToolSettings({ beatOutput: next })}
                onAutoQueueChange={next => updateToolSettings({ autoQueue: next })}
                onRollScenes={() => void sceneFlow.rollScenes()}
                onPlayScene={scene => void sceneFlow.playScene(scene)}
                moodSummary={roleplayMoodSummary(
                  tone,
                  content,
                  toolSettings.setting,
                  toolSettings.allowGore
                )}
                moodControls={
                  <RoleplayCastToneSettingSection
                    busy={busy}
                    playAs={playAsResolved}
                    tone={tone}
                    content={content}
                    adultEnabled={adultEnabled}
                    adultGateReady={adultGateReady}
                    toolSettings={toolSettings}
                    onUpdateToolSettings={updateToolSettings}
                  />
                }
              />
            </div>
          </div>
          {activeCharacterId ? (
            <SideSheet
              open={castSheetOpen}
              onClose={() => setCastSheetOpen(false)}
              title={`Cast · ${castCharacterName || 'lead'}`}
              description="Who the story follows, their photo and bible, and what they wear in stills."
              testId="story-cast-sheet"
              size="lg"
            >
              <div className="space-y-4">
                <RoleplayCastSection {...castProps} embedded />
                <RoleplayWardrobeSection
                  busy={busy}
                  toolSettings={toolSettings}
                  onUpdateToolSettings={updateToolSettings}
                  onError={message => setError(message)}
                  wardrobe={wardrobe}
                />
                <TaskRequirementsCard
                  task="This Story"
                  testId="story-task-requirements"
                  input={{ model: shared.model, adult: content === 'explicit' }}
                />
              </div>
            </SideSheet>
          ) : null}
        </>
      )}
    </ToolLayout>
  );
}
