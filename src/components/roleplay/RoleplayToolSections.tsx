'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';

import SharedToolControls from '@/components/SharedToolControls';
import RoleplayBeatOutputSection from '@/components/roleplay/RoleplayBeatOutputSection';
import RoleplayCastSection from '@/components/roleplay/RoleplayCastSection';
import RoleplayStorySection from '@/components/roleplay/RoleplayStorySection';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import PlayFilmFunnelChrome from '@/components/PlayFilmFunnelChrome';
import PlayFilmEngineBanner from '@/components/PlayFilmEngineBanner';
import PlaySoftAdvanceBanner from '@/components/PlaySoftAdvanceBanner';
import { usePlaySoftAdvance } from '@/hooks/usePlaySoftAdvance';
import type { useRoleplayToolOrchestration } from '@/hooks/useRoleplayToolOrchestration';
import { Button } from '@/components/ui/Button';
import { ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { getCharacter } from '@/lib/character-os';
import { playCampaignHref } from '@/lib/play-campaign';
import { isLeanWorkspaceMode } from '@/lib/workspace-mode';
import { useMemo } from 'react';

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

      <RoleplayCastSection
        busy={busy}
        bio={bio}
        story={story}
        storyPhase={storyProgress.phase}
        personaId={personaId}
        playAs={playAsResolved}
        tone={tone}
        content={content}
        adultEnabled={adultEnabled}
        autoQueue={autoQueue}
        beatOutput={beatOutput}
        photoReady={reference.photoReady}
        toolSettings={toolSettings}
        activeCharacterId={activeCharacterId}
        castCharacterName={castCharacterName}
        castHomeHref={castHomeHref}
        filmHref={filmHref}
        isolateSubject={reference.isolateSubject}
        hasReferenceImage={reference.hasReferenceImage}
        scanning={reference.scanning}
        referenceUploading={reference.referenceUploading}
        isolateStatus={reference.isolateStatus}
        displayReferenceUrl={reference.displayReferenceUrl}
        referenceOriginalFilename={reference.referenceOriginalFilename}
        referenceOriginalUrl={reference.referenceOriginalUrl}
        referenceImageFilename={reference.referenceImageFilename}
        referenceImageUrl={reference.referenceImageUrl}
        lastStill={reference.lastStill}
        onUpdateToolSettings={updateToolSettings}
        onClearReference={reference.clearReference}
        onApplyReference={reference.applyReference}
        onReferencePreviewUrlChange={reference.setReferencePreviewUrl}
        onIsolateStatusChange={reference.setIsolateStatus}
        onError={setError}
        onScanWithVision={() => void reference.scanWithVision()}
        onRestartStory={session.restartStory}
      />

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
        onRestartStory={session.restartStory}
        onBeatOutputChange={next => updateToolSettings({ beatOutput: next })}
        onAutoQueueChange={next => updateToolSettings({ autoQueue: next })}
        onRollScenes={() => void sceneFlow.rollScenes()}
        onPlayScene={scene => void sceneFlow.playScene(scene)}
      />
    </ToolLayout>
  );
}
