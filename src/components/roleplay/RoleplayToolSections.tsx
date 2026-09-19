'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';

import SharedToolControls from '@/components/SharedToolControls';
import RoleplayBeatOutputSection from '@/components/roleplay/RoleplayBeatOutputSection';
import RoleplayCastSection from '@/components/roleplay/RoleplayCastSection';
import { RoleplayCastToneSettingSection } from '@/components/roleplay/sections/RoleplayCastToneSettingSection';
import RoleplayStorySection from '@/components/roleplay/RoleplayStorySection';
import RoleplayWardrobeSection from '@/components/roleplay/RoleplayWardrobeSection';
import StoryPlayPhaseStrip from '@/components/roleplay/StoryPlayPhaseStrip';
import StoryStatusStrip from '@/components/roleplay/StoryStatusStrip';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import PlayFilmFunnelChrome from '@/components/PlayFilmFunnelChrome';
import PlayFilmEngineBanner from '@/components/PlayFilmEngineBanner';
import PlaySoftAdvanceBanner from '@/components/PlaySoftAdvanceBanner';
import { usePlaySoftAdvance } from '@/hooks/usePlaySoftAdvance';
import type { useRoleplayToolOrchestration } from '@/hooks/useRoleplayToolOrchestration';
import { Button } from '@/components/ui/Button';
import {
  CollapsibleSection,
  ToolActionRow,
  ToolBadge,
  ToolLayout,
  ToolSection,
} from '@/components/ui/ToolPageShell';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { getCharacter } from '@/lib/character-os';
import { normalizeDayIntimateMix } from '@/lib/day-planner';
import { playCampaignHref } from '@/lib/play-campaign';
import { deriveStoryPhase } from '@/lib/play-step-machine';
import {
  countRoleplayCompletedClips,
  countRoleplayCompletedStills,
  roleplayQueueBlockReason,
  storySessionStatusLine,
} from '@/lib/roleplay';
import { isLeanWorkspaceMode } from '@/lib/workspace-mode';
import { useCallback, useMemo } from 'react';

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
  tone,
  content,
  bio,
  story,
  storyProgress,
  autoQueue,
  beatOutput,
  playAsResolved,
  selectedModel,
  lastPrompt,
  busy,
  reference,
  film,
  beatQueue,
  sceneFlow,
  session,
  extendBeat,
  wardrobe,
}: RoleplayToolSectionsProps) {
  const workspaceMode = useWorkspaceMode();
  const leanChrome = isLeanWorkspaceMode(workspaceMode);
  const { softAdvance, cancelSoftAdvance } = usePlaySoftAdvance();
  const activeCharacterId = shared.activeCharacterId?.trim() || '';
  const castCharacter = useMemo(
    () => (activeCharacterId ? getCharacter(activeCharacterId) : undefined),
    [activeCharacterId]
  );
  const castCharacterName = castCharacter?.name?.trim() || '';
  const castHomeHref = activeCharacterId
    ? `/characters/${encodeURIComponent(activeCharacterId)}`
    : '/characters';
  const filmHref = activeCharacterId ? playCampaignHref(activeCharacterId) : '/play';

  const completedShotCount = useMemo(() => countRoleplayCompletedStills(story), [story]);
  const completedClipCount = useMemo(() => countRoleplayCompletedClips(story), [story]);
  const storyPhase = useMemo(
    () =>
      deriveStoryPhase({
        completedStills: completedShotCount,
        completedClips: completedClipCount,
        beatCount: story.length,
      }),
    [completedClipCount, completedShotCount, story.length]
  );
  const collapseEditors =
    leanChrome && (busy || film.assemblingFilm || story.length > 0 || completedShotCount > 0);
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
    onRestartStory: session.restartStory,
    hideMoodSection: true as const,
  };

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
  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Story · {selectedModel.comfyNode}</ToolBadge>}
      title="Story"
      description={description}
      sidebarPersistKey="roleplay"
      sidebar={engineControls}
      sidebarTitle={leanChrome ? false : undefined}
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.roleplay} />
      <PlayFilmEngineBanner />
      <PlayFilmFunnelChrome />
      <PlaySoftAdvanceBanner
        key={softAdvance?.nonce ?? 'idle'}
        target={softAdvance}
        onCancel={cancelSoftAdvance}
      />

      {!film.firstCutCelebrate ? (
        <div className="mb-3 space-y-2">
          <StoryPlayPhaseStrip
            activePhase={storyPhase}
            completedStills={completedShotCount}
            completedClips={completedClipCount}
            beatTotal={story.length}
          />
          <StoryStatusStrip statusLine={storyStatusLine} queueBlockReason={queueBlockReason} />
        </div>
      ) : null}

      {collapseEditors ? (
        <CollapsibleSection
          title={`Cast · ${castCharacterName || 'lead'}`}
          summary={bio ? 'Bible set' : 'Needs bible'}
          defaultOpen={false}
          persistKey="story-cast-lean"
        >
          <RoleplayCastSection {...castProps} embedded />
        </CollapsibleSection>
      ) : (
        <RoleplayCastSection {...castProps} />
      )}

      {activeCharacterId ? (
        <RoleplayWardrobeSection
          busy={busy}
          toolSettings={toolSettings}
          onUpdateToolSettings={updateToolSettings}
          onError={message => setError(message)}
          wardrobe={wardrobe}
        />
      ) : null}

      <RoleplayBeatOutputSection
        storyProgress={storyProgress}
        beatOutput={beatOutput}
        autoQueue={autoQueue}
        busy={busy}
        bioPresent={Boolean(bio)}
        scenesLoading={sceneFlow.scenesLoading}
        scenes={sceneFlow.scenes}
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
        onRestartStory={session.restartStory}
        onBeatOutputChange={next => updateToolSettings({ beatOutput: next })}
        onAutoQueueChange={next => updateToolSettings({ autoQueue: next })}
        onRollScenes={() => void sceneFlow.rollScenes()}
        onPlayScene={scene => void sceneFlow.playScene(scene)}
        moodControls={
          <RoleplayCastToneSettingSection
            busy={busy}
            playAs={playAsResolved}
            tone={tone}
            content={content}
            adultEnabled={adultEnabled}
            toolSettings={toolSettings}
            onUpdateToolSettings={updateToolSettings}
          />
        }
      />

      {showAnimateCoach ? (
        <ToolSection
          title="Next · Animate → Cut"
          description="Stills are ready — animate into clips, then Cut film for a motion reel."
          data-testid="story-animate"
        >
          <ToolActionRow>
            <Button
              variant="primary"
              disabled={busy || film.assemblingFilm}
              data-testid="story-animate-all"
              onClick={() => void animateAllReady()}
            >
              Animate all ready stills
            </Button>
            <Button
              variant="secondary"
              disabled={busy || film.assemblingFilm || story.length === 0}
              data-testid="story-animate-cut"
              onClick={() => void film.cutRoleplayFilm()}
            >
              Skip to Cut film
            </Button>
          </ToolActionRow>
        </ToolSection>
      ) : null}

      <RoleplayStorySection
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
        downloadAction={
          <Button
            variant="secondary"
            loading={session.exporting}
            loadingLabel="Packing story"
            disabled={(!bio && story.length === 0) || (busy && !session.exporting)}
            onClick={() => void session.downloadStory()}
          >
            Download story + stills + clips
          </Button>
        }
        onCutFilm={() => void film.cutRoleplayFilm()}
        onSaveToCast={film.saveFilmToCast}
        onShareCut={() => void film.shareLastCut()}
        canShareCut={Boolean(film.filmStatus && !film.assemblingFilm)}
        filmCutOptions={film.filmCutOptions}
        onFilmCutOptionsChange={film.setFilmCutOptions}
        onQueue={beat => void beatQueue.queueBeat(beat)}
        onRetry={beat => void beatQueue.queueBeat(beat, { retry: true })}
        onRetryClip={beat => void beatQueue.queueBeatMotion(beat, { retry: true })}
        onAnimate={beat => void beatQueue.queueBeatMotion(beat)}
        onExtend={extendBeat}
        onSelectTake={session.selectStillTake}
        onSelectClipTake={session.selectClipTake}
        onCopy={beat => void session.copyBeatPrompt(beat)}
        onRollScenes={() => void sceneFlow.rollScenes()}
      />
    </ToolLayout>
  );
}
