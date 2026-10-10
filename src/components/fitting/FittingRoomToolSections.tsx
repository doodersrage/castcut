'use client';

import { useState } from 'react';
import SideSheet from '@/components/ui/SideSheet';
import { Button } from '@/components/ui/Button';

import OutfitPoseShoesNote from '@/components/fitting/OutfitPoseShoesNote';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import FittingCharacterSection from '@/components/fitting/FittingCharacterSection';
import FittingCompareSection from '@/components/fitting/FittingCompareSection';
import FittingActionRow from '@/components/fitting/FittingActionRow';
import OutfitQualityControls from '@/components/fitting/OutfitQualityControls';
import { useFittingTryOnReview } from '@/hooks/fitting-room/useFittingTryOnReview';
import { useOutfitQualityPreset } from '@/hooks/fitting-room/useOutfitQualityPreset';
import { outfitQualityPresetLabel } from '@/lib/outfit-quality-preset';
import FittingPlateSection from '@/components/fitting/FittingPlateSection';
import FittingWardrobeKitSection from '@/components/fitting/FittingWardrobeKitSection';
import TaskRequirementsCard from '@/components/TaskRequirementsCardLazy';
import OutfitPoseSection from '@/components/fitting/OutfitPoseSection';
import FittingStatusStrip from '@/components/fitting/FittingStatusStrip';
import PlayGetStartedCard from '@/components/play/PlayGetStartedCard';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import ScenePromptResultPanel from '@/components/scene-tool/ScenePromptResultPanel';
import { FieldError } from '@/components/ui/Field';
import {
  CollapsibleSection,
  ToolBadge,
  ToolLayout,
  ToolSection,
} from '@/components/ui/ToolPageShell';
import PlaySoftAdvanceBanner from '@/components/PlaySoftAdvanceBanner';
import PlayFilmFunnelChrome from '@/components/PlayFilmFunnelChrome';
import PlayFilmEngineBanner from '@/components/PlayFilmEngineBanner';
import { usePlaySoftAdvance } from '@/hooks/usePlaySoftAdvance';
import { fittingSessionStatusLine } from '@/lib/fitting-room';
import { fittingNotesCachePatch } from '@/lib/look-pack';
import { dayPartnerNoun } from '@/lib/day-partner';
import { withCharacterQuery } from '@/lib/mobile-studio';
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
    swipeDeck,
    deckSelectionId,
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
    applyFootwearPhoto,
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
    queueBlockReason,
    dismissTryOn,
    applyFixedTryOn,
    requeueTryOn,
    leanChrome,
    setIsolateStatus,
  } = vm;
  const { softAdvance, cancelSoftAdvance, softAdvanceHref } = usePlaySoftAdvance();
  const [castSheetOpen, setCastSheetOpen] = useState(false);
  const quality = useOutfitQualityPreset({
    shared,
    updateShared,
    toolSettings,
    updateToolSettings,
  });
  const autoReviewTryOns = quality.settings.autoReview;
  const tryOnReview = useFittingTryOnReview({
    enabled: true,
    fullChecks: autoReviewTryOns,
    compareTryOns,
    plateUrl: referenceImageUrl,
    plateFilename: referenceImageFilename,
    customGarmentDescription: toolSettings.customGarmentDescription,
    customPose: toolSettings.tryOnPose,
    shared,
  });
  const statusLine = fittingSessionStatusLine({
    hasPlate: hasReference,
    kitLabel: lockedWardrobeLabel || shared.lockedWardrobeId,
    hasByo: Boolean(
      toolSettings.customGarmentImageUrl?.trim() || toolSettings.customGarmentImageFilename?.trim()
    ),
    byoLabel: toolSettings.customGarmentDescription,
  });
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
      qualitySetBy={{
        label: outfitQualityPresetLabel(quality.preset),
        hint: 'Change it in the Quality row under Clothing; Good / Best by hand under Advanced.',
      }}
      preferEditModels
      onSharedSettingsChange={updateShared}
      variant="roleplay"
    />
  );
  const platePicture = referencePreviewUrl || referenceImageUrl;
  const pending = toolSettings.pendingTryOn;
  const plateSection = (
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
      lookHref={withCharacterQuery('/moodboard', shared.activeCharacterId)}
      characterId={shared.activeCharacterId}
    />
  );
  return (
    <ToolLayout
      accent={ACCENT}
      width="full"
      badge={<ToolBadge accent={ACCENT}>Film</ToolBadge>}
      title="Outfit"
      description={description}
      sidebarPersistKey="fitting"
      sidebar={engineControls}
      sidebarTitle={leanChrome ? false : undefined}
      // The fitting room needs the full width: Engine, quality by hand, LoRA and identity lock
      // open from the header chip as a sheet.
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.fitting} />
      <PlayFilmEngineBanner />
      <PlayFilmFunnelChrome />
      <PlaySoftAdvanceBanner
        key={softAdvance?.nonce ?? 'idle'}
        target={softAdvance}
        onCancel={cancelSoftAdvance}
      />

      <PlayGetStartedCard
        tool="outfit"
        hasCharacter={Boolean(character)}
        hasPlate={hasReference}
        characterId={shared.activeCharacterId}
      />

      {/* The fitting room: who tries on (and her plate) · the try-on · the clothes. */}
      <div
        className="grid items-start gap-[var(--block-gap)] lg:grid-cols-[14rem_minmax(0,1fr)_27rem]"
        data-testid="fitting-room"
      >
        <div className="ui-section-stack min-w-0" data-testid="fitting-who">
          <div className="ui-card space-y-2 p-3">
            <p className="type-overline text-[var(--text-muted)]">Trying on</p>
            <p className="type-heading truncate" data-testid="fitting-who-name">
              {character?.name ?? 'No Cast lead yet'}
            </p>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              data-testid="fitting-change-cast"
              onClick={() => setCastSheetOpen(true)}
            >
              {character ? 'Change person or look' : 'Pick a Cast lead'}
            </Button>
          </div>
          {plateSection}
        </div>

        <div className="ui-section-stack min-w-0">
          <FittingCompareSection
            layout="stage"
            frontBack={quality.settings.frontBack}
            compareTryOns={compareTryOns}
            busy={busy}
            onKeepTryOn={keepTryOn}
            onSoftAdvance={href => softAdvanceHref(href, 'Day')}
            onDismissTryOn={dismissTryOn}
            onUseFixedTryOn={applyFixedTryOn}
            onRequeueTryOn={tryOn => void requeueTryOn(tryOn)}
            reviews={tryOnReview.reviews}
            reviewingId={tryOnReview.reviewingId}
            pending={
              pending
                ? {
                    label: pending.wardrobeLabel || pending.wardrobeId || 'the outfit',
                    status: saveStatus,
                    promptId: pending.promptId,
                    backOfPromptId: pending.backOfPromptId,
                    replacesPromptId: pending.replacesPromptId,
                  }
                : null
            }
            empty={
              platePicture ? (
                <div className="space-y-2 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={platePicture}
                    alt=""
                    className="mx-auto max-h-[60vh] rounded-[var(--radius-md)] object-contain opacity-60"
                  />
                  <p className="type-caption text-[var(--text-muted)]">
                    Pick clothes, then Try it on — the try-on shows here.
                  </p>
                </div>
              ) : (
                <p className="type-caption px-2 py-10 text-center text-[var(--text-muted)]">
                  Add a plate first — the picture every try-on starts from.
                </p>
              )
            }
          />

          <ToolSection
            title="Pose"
            description="Try the kit on in the plate's own stance, or drag a figure into a pose."
            data-testid="fitting-pose-section"
          >
            <OutfitPoseSection
              pose={toolSettings.tryOnPose}
              busy={busy}
              hideLabel
              leadNoun={dayPartnerNoun(character ?? {})}
              plateUrl={platePicture}
              onChange={pose => updateToolSettings({ tryOnPose: pose })}
            />
            <OutfitPoseShoesNote
              model={shared.model}
              hasCustomPose={Boolean(toolSettings.tryOnPose?.people?.length)}
              footwear={toolSettings.footwear}
            />
          </ToolSection>
        </div>

        <div className="ui-section-stack min-w-0">
          {/* Try it on first, and it stays in reach (under the header) through a long clothes list. */}
          <div
            className="ui-sticky-surface space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-2 lg:sticky lg:top-[5.5rem] lg:z-10"
            data-testid="fitting-try-panel"
          >
            <FittingActionRow
              variant="panel"
              continueDayHref={softAdvance ? null : continueDayHref}
              dayPlannerHref={dayPlannerHref}
              queueBlocked={queueBlocked}
              queueBlockReason={queueBlockReason}
              swipeDeckLength={swipeDeck.length}
              hasKit={Boolean(shared.lockedWardrobeId?.trim())}
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
            {saveStatus && !pending ? (
              <p className="type-caption text-[var(--text-muted)]">{saveStatus}</p>
            ) : null}
            {error ? <FieldError>{error}</FieldError> : null}
          </div>

          <FittingWardrobeKitSection
            inline
            busy={busy}
            wardrobeReady={wardrobeReady}
            wardrobeCategoryFilter={wardrobeCategoryFilter}
            wardrobeOptions={wardrobeOptions}
            swipeDeck={swipeDeck}
            deckSelectionId={deckSelectionId}
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
            lockedWardrobeLabel={lockedWardrobeLabel}
            completedPreviewCount={completedPreviewCount}
            inFlightPreviewCount={inFlightPreviewCount}
            previewStatus={previewStatus}
            customGarmentImageUrl={toolSettings.customGarmentImageUrl}
            customGarmentImageFilename={toolSettings.customGarmentImageFilename}
            customGarmentDescription={toolSettings.customGarmentDescription}
            garmentUploading={garmentUploading}
            garmentScanStatus={garmentScanStatus}
            onCategoryFilterChange={filter =>
              updateToolSettings({ wardrobeCategoryFilter: filter })
            }
            onSwipeKit={swipeKit}
            onSelectKit={selectKit}
            onClearKit={clearKit}
            onToggleAutoKitPreviews={() =>
              updateToolSettings({ autoKitPreviews: !autoKitPreviews })
            }
            onFillKitPreviews={() => void fillKitPreviews()}
            onApplyCustomGarment={applyCustomGarment}
            onClearCustomGarment={clearCustomGarment}
            onRescanCustomGarment={rescanCustomGarment}
            onSaveCustomGarment={saveCurrentCustomGarment}
            onApplySavedCustomGarment={applySavedCustomGarment}
            onRemoveSavedCustomGarment={removeSavedCustomGarment}
            onCustomGarmentDescriptionChange={value =>
              updateToolSettings({ customGarmentDescription: value })
            }
            footwear={{
              value: toolSettings.footwear,
              imageUrl: toolSettings.footwearImageUrl,
              imageFilename: toolSettings.footwearImageFilename,
              onChange: patch => updateToolSettings(patch),
              onApplyPhoto: applyFootwearPhoto,
            }}
            onError={message => setError(message)}
          />

          <div className="space-y-2">
            <FittingStatusStrip
              statusLine={statusLine}
              queueBlockReason={queueBlocked && character ? queueBlockReason : null}
            />
            <OutfitQualityControls
              busy={busy}
              preset={quality.preset}
              onPresetChange={quality.setPreset}
              summary={quality.summary}
              renderQuality={quality.renderQuality}
              onRenderQualityChange={quality.setRenderQuality}
              autoReview={autoReviewTryOns}
              onAutoReviewChange={next => updateToolSettings({ autoReviewTryOns: next })}
              checksOff={tryOnReview.checksOff}
              frontBack={quality.settings.frontBack}
              onFrontBackChange={next => updateToolSettings({ tryOnFrontBack: next })}
              notes={toolSettings.notes ?? ''}
              onNotesChange={value =>
                updateToolSettings(fittingNotesCachePatch(value, shared.activeCharacterId))
              }
            />
          </div>
        </div>
      </div>

      <TaskRequirementsCard
        task="Outfit try-ons"
        testId="fitting-task-requirements"
        input={{ model: shared.model, autoReview: toolSettings.autoReviewTryOns === true }}
      />

      <CollapsibleSection
        title="Prompt (advanced)"
        summary="Edit the try-on prompt — Try it on is in the Clothes column."
        defaultOpen={false}
        persistKey="fitting-prompt-advanced"
      >
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
          includeStickyBar={false}
          showQueueButton={false}
        />
      </CollapsibleSection>

      <SideSheet
        open={castSheetOpen}
        onClose={() => setCastSheetOpen(false)}
        title="Who tries the clothes on"
        description="The same Cast member as Day and Story — and which of their looks."
        testId="fitting-cast-sheet"
      >
        <FittingCharacterSection
          shared={shared}
          characterHints={character?.hints}
          onApply={patch => updateShared(patch)}
          onError={message => setError(message)}
        />
      </SideSheet>
    </ToolLayout>
  );
}
