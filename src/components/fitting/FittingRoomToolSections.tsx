'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import FittingCharacterSection from '@/components/fitting/FittingCharacterSection';
import FittingCompareSection from '@/components/fitting/FittingCompareSection';
import FittingActionRow from '@/components/fitting/FittingActionRow';
import FittingPlateSection from '@/components/fitting/FittingPlateSection';
import FittingWardrobeKitSection from '@/components/fitting/FittingWardrobeKitSection';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import ScenePromptResultPanel from '@/components/scene-tool/ScenePromptResultPanel';
import { FieldError } from '@/components/ui/Field';
import { ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';
import PlaySoftAdvanceBanner from '@/components/PlaySoftAdvanceBanner';
import PlayFilmFunnelChrome from '@/components/PlayFilmFunnelChrome';
import PlayFilmEngineBanner from '@/components/PlayFilmEngineBanner';
import { usePlaySoftAdvance } from '@/hooks/usePlaySoftAdvance';
import { ISOLATE_QUEUE_BLOCKED_MESSAGE } from '@/lib/isolate-subject';
import { fittingNotesCachePatch } from '@/lib/look-pack';
import type { useFittingRoomToolOrchestration } from '@/hooks/useFittingRoomToolOrchestration';

const ACCENT = 'rose' as const;
const TOOL_ID = 'fitting' as const;

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
    garmentUploading,
    garmentScanStatus,
    applyCustomGarment,
    clearCustomGarment,
    rescanCustomGarment,
    saveCurrentCustomGarment,
    applySavedCustomGarment,
    removeSavedCustomGarment,
    clearKit,
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
  const { softAdvance, cancelSoftAdvance, softAdvanceHref } = usePlaySoftAdvance();
  const engineControls = (
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
  );
  return (
    <ToolLayout
      accent={ACCENT}
      badge={
        <ToolBadge accent={ACCENT}>
          Outfit · {selectedModel?.label ?? selectedModel?.comfyNode ?? 'model'}
        </ToolBadge>
      }
      title="Outfit"
      description={description}
      sidebarPersistKey="fitting"
      sidebar={engineControls}
      sidebarTitle={leanChrome ? false : undefined}
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.fitting} />
      <PlayFilmEngineBanner />
      <PlayFilmFunnelChrome />
      <PlaySoftAdvanceBanner
        key={softAdvance?.nonce ?? 'idle'}
        target={softAdvance}
        onCancel={cancelSoftAdvance}
      />

      {compareTryOns.length > 0 && !softAdvance && !continueDayHref ? (
        <div
          className="rounded-[var(--radius-md)] border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-2"
          data-testid="fitting-keep-coach"
          role="status"
        >
          <p className="type-overline text-[var(--accent-text)]">Ready to keep</p>
          <p className="type-caption text-[var(--text-muted)]">
            Keep a winner to seed Day — continuing starts after Keep.
          </p>
        </div>
      ) : null}

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
        customGarmentImageUrl={toolSettings.customGarmentImageUrl}
        customGarmentImageFilename={toolSettings.customGarmentImageFilename}
        customGarmentDescription={toolSettings.customGarmentDescription}
        garmentUploading={garmentUploading}
        garmentScanStatus={garmentScanStatus}
        onCategoryFilterChange={filter => updateToolSettings({ wardrobeCategoryFilter: filter })}
        onSwipeKit={swipeKit}
        onSelectKit={selectKit}
        onClearKit={clearKit}
        onToggleAutoKitPreviews={() => updateToolSettings({ autoKitPreviews: !autoKitPreviews })}
        onFillKitPreviews={() => void fillKitPreviews()}
        onNotesChange={value =>
          updateToolSettings(fittingNotesCachePatch(value, shared.activeCharacterId))
        }
        onApplyCustomGarment={applyCustomGarment}
        onClearCustomGarment={clearCustomGarment}
        onRescanCustomGarment={rescanCustomGarment}
        onSaveCustomGarment={saveCurrentCustomGarment}
        onApplySavedCustomGarment={applySavedCustomGarment}
        onRemoveSavedCustomGarment={removeSavedCustomGarment}
        onCustomGarmentDescriptionChange={value =>
          updateToolSettings({ customGarmentDescription: value })
        }
        onError={message => setError(message)}
      />

      <FittingCompareSection
        compareTryOns={compareTryOns}
        busy={busy}
        onKeepTryOn={keepTryOn}
        onSoftAdvance={href => softAdvanceHref(href, 'Day')}
        onSkipKit={skipKit}
      />

      <FittingActionRow
        continueDayHref={softAdvance ? null : continueDayHref}
        dayPlannerHref={dayPlannerHref}
        queueBlocked={queueBlocked}
        swipeDeckLength={swipeDeck.length}
        busy={busy}
        character={character}
        compareActive={compareTryOns.length > 0 && !continueDayHref}
        softAdvanceActive={Boolean(softAdvance)}
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
