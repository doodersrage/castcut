'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import FittingCharacterSection from '@/components/fitting/FittingCharacterSection';
import FittingCompareSection from '@/components/fitting/FittingCompareSection';
import FittingActionRow from '@/components/fitting/FittingActionRow';
import FittingPlateSection from '@/components/fitting/FittingPlateSection';
import FittingWardrobeKitSection from '@/components/fitting/FittingWardrobeKitSection';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import ScenePromptResultPanel from '@/components/scene-tool/ScenePromptResultPanel';
import { FieldError } from '@/components/ui/Field';
import { CollapsibleSection, ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useFittingRoomQueue } from '@/hooks/useFittingRoomQueue';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { isLeanWorkspaceMode } from '@/lib/workspace-mode';
import { useGalleryHandoff } from '@/hooks/useGalleryHandoff';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { parseCharacterHints } from '@/lib/character-hints';
import {
  activeLook,
  applyCharacterRecord,
  characterFromShared,
  getCharacter,
  upsertCharacter,
} from '@/lib/character-os';
import { subjectGenderToClothingGender } from '@/lib/clothing-gender';
import {
  fetchClothingLabels,
  fetchClothingSelectOptions,
  getCachedClothingLabel,
} from '@/lib/clothing-catalog-client';
import {
  buildFittingSwipeDeck,
  fittingSwipeIndex,
  fittingSwipeNeighbor,
  resolveFittingDeckWardrobeId,
  resolveFittingPlateFromCharacter,
} from '@/lib/fitting-room';
import {
  countInFlightFittingKitPreviews,
  fittingKitPreviewQueueParams,
  fittingKitPreviewQueueResolveOptions,
  getFittingKitPreview,
  normalizeFittingKitPreviews,
  resolveFittingKitPreviewModel,
} from '@/lib/fitting-kit-previews';
import {
  countWardrobeOptionsForFilter,
  filterWardrobeSelectOptions,
  normalizeWardrobeCategoryFilter,
} from '@/lib/wardrobe-catalog-ui';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import {
  cacheBustIdentityMediaUrl,
  isIdentityMediaUrl,
  persistIdentityImage,
} from '@/lib/gallery-media-client';
import {
  collectIsolateSourceUrls,
  isolateSubjectOnWhite,
  ISOLATE_QUEUE_BLOCKED_MESSAGE,
  loadImageBlobFromUrls,
} from '@/lib/isolate-subject';
import {
  applyLookPackToFittingState,
  loadLookPack,
  lookPackDayHref,
  lookPackRoleplayHref,
  saveLookPack,
} from '@/lib/look-pack';
import { bumpPlayCampaignStep } from '@/lib/play-campaign';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  DEFAULT_FITTING_TOOL_CACHE,
  loadSettingsCache,
  saveSharedSettings,
} from '@/lib/settings-cache';
import { EMPTY_WARDROBE_OPTIONS, type FittingClothingOption } from '@/lib/fitting-clothing-options';

const ACCENT = 'rose' as const;
const TOOL_ID = 'fitting' as const;

import type { useFittingRoomToolOrchestration } from '@/hooks/useFittingRoomToolOrchestration';

type ViewModel = ReturnType<typeof useFittingRoomToolOrchestration>;
type Props = ViewModel & { description: string };

export default function FittingRoomToolSections({ description, ...vm }: Props) {
  const {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    output,
    setOutput,
    copied,
    setCopied,
    error,
    setError,
    referenceUploading,
    isolateStatus,
    referencePreviewUrl,
    setReferencePreviewUrl,
    lockedWardrobeLabel,
    saveStatus,
    continueDayHref,
    isolateSubject,
    autoKitPreviews,
    kitPreviews,
    referenceImageFilename,
    referenceImageUrl,
    referenceOriginalFilename,
    referenceOriginalUrl,
    hasReference,
    character,
    selectedModel,
    wardrobeReady,
    wardrobeCategoryFilter,
    wardrobeOptions,
    wardrobeKitCount,
    filteredWardrobeOptions,
    wardrobeGroups,
    swipeDeck,
    activeSwipeKit,
    deckSelectionId,
    deckSelectionIndex,
    activeThumbRef,
    activeLookId,
    previewModel,
    previewModelLabel,
    completedPreviewCount,
    inFlightPreviewCount,
    actions,
    applyReference,
    clearReference,
    selectKit,
    swipeKit,
    busy,
    compareTryOns,
    previewStatus,
    queueTryOn,
    fillKitPreviews,
    keepTryOn,
    queueTryOnAndSwipe,
    skipKit,
    saveKitToCast,
    goRoleplay,
    dayPlannerHref,
    queueBlocked,
    leanChrome,
    setIsolateStatus,
  } = vm;
  return (
    <ToolLayout
      accent={ACCENT}
      badge={
        <ToolBadge accent={ACCENT}>
          Outfit · {selectedModel?.comfyNode ?? selectedModel?.label ?? 'model'}
        </ToolBadge>
      }
      title="Outfit"
      description={description}
      sidebar={
        leanChrome ? (
          <CollapsibleSection
            title="Engine"
            summary="Model and workflow — optional for first outfit."
            defaultOpen={false}
            persistKey="fitting-engine-lean"
          >
            <SharedToolControls
              shared={shared}
              onModelChange={model => updateShared({ model })}
              onDetailChange={detail => updateShared({ detail })}
              onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
              showWardrobeOption={false}
              seedLlmWithIngredients={false}
              lockedWardrobeId={shared.lockedWardrobeId}
              lockedWardrobeLabel={
                shared.lockedWardrobeId
                  ? (lockedWardrobeLabel ?? shared.lockedWardrobeId)
                  : undefined
              }
              onClearLockedWardrobe={() => updateShared({ lockedWardrobeId: undefined })}
              autoFixRules={shared.autoFixRules !== false}
              onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
              recommendFromText={output}
              toolId={TOOL_ID}
              preferEditModels
              onSharedSettingsChange={updateShared}
              variant="roleplay"
            />
          </CollapsibleSection>
        ) : (
          <SharedToolControls
            shared={shared}
            onModelChange={model => updateShared({ model })}
            onDetailChange={detail => updateShared({ detail })}
            onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
            showWardrobeOption={false}
            seedLlmWithIngredients={false}
            lockedWardrobeId={shared.lockedWardrobeId}
            lockedWardrobeLabel={
              shared.lockedWardrobeId ? (lockedWardrobeLabel ?? shared.lockedWardrobeId) : undefined
            }
            onClearLockedWardrobe={() => updateShared({ lockedWardrobeId: undefined })}
            autoFixRules={shared.autoFixRules !== false}
            onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
            recommendFromText={output}
            toolId={TOOL_ID}
            preferEditModels
            onSharedSettingsChange={updateShared}
            variant="roleplay"
          />
        )
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.fitting} />

      <FittingCharacterSection
        shared={shared}
        characterHints={character?.hints}
        onApply={patch => updateShared(patch)}
        onError={message => setError(message)}
      />

      <FittingPlateSection
        busy={busy}
        referenceUploading={referenceUploading}
        isolateSubject={isolateSubject}
        hasReference={hasReference}
        isolateStatus={isolateStatus}
        referencePreviewUrl={referencePreviewUrl}
        referenceImageFilename={referenceImageFilename}
        referenceImageUrl={referenceImageUrl}
        referenceOriginalFilename={referenceOriginalFilename}
        referenceOriginalUrl={referenceOriginalUrl}
        onUpdateToolSettings={patch => updateToolSettings(patch)}
        onSetReferencePreviewUrl={setReferencePreviewUrl}
        onSetIsolateStatus={setIsolateStatus}
        onApplyReference={applyReference}
        onClearReference={clearReference}
        onError={message => setError(message)}
      />

      <FittingWardrobeKitSection
        busy={busy}
        leanChrome={leanChrome}
        wardrobeReady={wardrobeReady}
        wardrobeCategoryFilter={wardrobeCategoryFilter}
        wardrobeOptions={wardrobeOptions}
        wardrobeKitCount={wardrobeKitCount}
        filteredWardrobeOptions={filteredWardrobeOptions}
        wardrobeGroups={wardrobeGroups}
        swipeDeck={swipeDeck}
        activeSwipeKit={activeSwipeKit}
        deckSelectionId={deckSelectionId}
        deckSelectionIndex={deckSelectionIndex}
        activeThumbRef={activeThumbRef}
        activeLookId={activeLookId}
        kitPreviews={kitPreviews}
        autoKitPreviews={autoKitPreviews}
        hasReference={hasReference}
        isolateSubject={isolateSubject}
        referenceIsolated={toolSettings.referenceIsolated === true}
        previewModel={previewModel}
        previewModelLabel={previewModelLabel}
        selectedModelLabel={selectedModel?.label}
        sharedModel={shared.model}
        lockedWardrobeId={shared.lockedWardrobeId}
        notes={toolSettings.notes ?? ''}
        completedPreviewCount={completedPreviewCount}
        inFlightPreviewCount={inFlightPreviewCount}
        previewStatus={previewStatus}
        onCategoryFilterChange={filter => updateToolSettings({ wardrobeCategoryFilter: filter })}
        onSwipeKit={swipeKit}
        onSelectKit={selectKit}
        onToggleAutoKitPreviews={() => updateToolSettings({ autoKitPreviews: !autoKitPreviews })}
        onFillKitPreviews={() => void fillKitPreviews()}
        onNotesChange={value => updateToolSettings({ notes: value })}
      />

      <FittingCompareSection
        compareTryOns={compareTryOns}
        leanChrome={leanChrome}
        busy={busy}
        continueDayHref={continueDayHref}
        onKeepTryOn={keepTryOn}
        onSkipKit={skipKit}
      />

      <FittingActionRow
        continueDayHref={continueDayHref}
        dayPlannerHref={dayPlannerHref}
        queueBlocked={queueBlocked}
        swipeDeckLength={swipeDeck.length}
        busy={busy}
        character={character}
        onSkipKit={skipKit}
        onQueueTryOn={() => void queueTryOn()}
        onQueueTryOnAndSwipe={() => void queueTryOnAndSwipe()}
        onSaveKitToCast={saveKitToCast}
        onGoRoleplay={goRoleplay}
      />
      {saveStatus ? <p className="type-caption text-[var(--text-muted)]">{saveStatus}</p> : null}
      {error ? <FieldError>{error}</FieldError> : null}
      {isolateSubject && hasReference && toolSettings.referenceIsolated !== true && !error ? (
        <p className="type-caption text-[var(--text-muted)]">{ISOLATE_QUEUE_BLOCKED_MESSAGE}</p>
      ) : null}

      <ScenePromptResultPanel
        output={output}
        onOutputChange={setOutput}
        result={null}
        copied={copied}
        onCopy={() => {
          if (!output) {
            return;
          }
          void navigator.clipboard.writeText(output).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          });
        }}
        actions={actions}
        shared={shared}
        selectedComfyNode={selectedModel?.comfyNode ?? 'model'}
        hints={toolSettings.notes}
        queueLabel="Queue try-on"
        onSendComfyUi={() => void queueTryOn()}
      />
    </ToolLayout>
  );
}
