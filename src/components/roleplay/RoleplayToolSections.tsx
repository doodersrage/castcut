'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';

import SharedToolControls from '@/components/SharedToolControls';
import RoleplayLibraryPanel from '@/components/RoleplayLibraryPanel';
import RoleplayBeatOutputSection from '@/components/roleplay/RoleplayBeatOutputSection';
import RoleplayBioSection from '@/components/roleplay/RoleplayBioSection';
import RoleplayCastSection from '@/components/roleplay/RoleplayCastSection';
import RoleplayStorySection from '@/components/roleplay/RoleplayStorySection';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import type { useRoleplayToolOrchestration } from '@/hooks/useRoleplayToolOrchestration';
import { Button } from '@/components/ui/Button';
import { CollapsibleSection, ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { isLeanWorkspaceMode } from '@/lib/workspace-mode';

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
  ownBibleOpen,
  setOwnBibleOpen,
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
  bioFlow,
  session,
  extendBeat,
}: RoleplayToolSectionsProps) {
  const workspaceMode = useWorkspaceMode();
  const leanChrome = isLeanWorkspaceMode(workspaceMode);
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

      <RoleplayCastSection
        busy={busy}
        bioLoading={bioFlow.bioLoading}
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
        ownBibleOpen={ownBibleOpen}
        toolSettings={toolSettings}
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
        onOwnBibleOpenChange={setOwnBibleOpen}
        onUpdateToolSettings={updateToolSettings}
        onShelfAndStartNew={session.shelfAndStartNew}
        onApplyOwnBible={nextBio => void bioFlow.applyOwnBible(nextBio)}
        onClearReference={reference.clearReference}
        onApplyReference={reference.applyReference}
        onReferencePreviewUrlChange={reference.setReferencePreviewUrl}
        onIsolateStatusChange={reference.setIsolateStatus}
        onError={setError}
        onScanWithVision={() => void reference.scanWithVision()}
        onWriteBio={() => void bioFlow.writeBio()}
        onSurpriseCast={session.surpriseCast}
        onRestartStory={session.restartStory}
      />

      <CollapsibleSection
        title="Sessions"
        summary="Saved roleplay runs — continue or start new"
        defaultOpen={false}
        persistKey="roleplay-library"
      >
        <RoleplayLibraryPanel
          activeSessionId={toolSettings.activeSessionId}
          busy={busy}
          onContinue={session.continueLibrarySession}
          onNew={session.startLibrarySession}
          onDeleted={id => {
            if (id === toolSettings.activeSessionId) {
              updateToolSettings({ activeSessionId: undefined });
            }
          }}
        />
      </CollapsibleSection>

      {bio ? (
        <RoleplayBioSection
          bio={bio}
          ownBibleOpen={ownBibleOpen}
          characterName={toolSettings.characterName}
          busy={busy}
          onOpenEditor={() => setOwnBibleOpen(true)}
          onApplyBible={nextBio => void bioFlow.applyOwnBible(nextBio)}
        />
      ) : null}

      <RoleplayStorySection
        beatOutput={beatOutput}
        autoQueue={autoQueue}
        assemblingFilm={film.assemblingFilm}
        busy={busy}
        story={story}
        bioPresent={Boolean(bio)}
        scenesLoading={sceneFlow.scenesLoading}
        filmNeedsCast={film.filmNeedsCast}
        filmCharacterId={film.filmCharacterId}
        filmStatus={film.filmStatus}
        filmError={film.filmError}
        filmGuideHref={film.filmGuideHref}
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
        onWriteBio={() => void bioFlow.writeBio()}
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
