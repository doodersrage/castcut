'use client';

import { useEffect, useState } from 'react';
import OutfitKitShelf from '@/components/fitting/OutfitKitShelf';
import CastChip from '@/components/ui/CastChip';
import { useWardrobeGarmentThumbManifestGeneration } from '@/hooks/useWardrobeGarmentThumbManifest';
import { resolveWardrobeKitThumbUrl } from '@/lib/wardrobe/garment-thumbs';
import {
  wardrobeCategoryFilterOptions,
  normalizeWardrobeCategoryFilter,
} from '@/lib/wardrobe/catalog-ui';
import SideSheet from '@/components/ui/SideSheet';

import OutfitPoseShoesNote from '@/components/fitting/OutfitPoseShoesNote';
import { TOOL_SETUP_LABELS } from '@/lib/app/tool-page-chrome';
import FittingCharacterSection from '@/components/fitting/FittingCharacterSection';
import FittingCompareSection from '@/components/fitting/FittingCompareSection';
import FittingActionRow from '@/components/fitting/FittingActionRow';
import OutfitQualityControls from '@/components/fitting/OutfitQualityControls';
import { useFittingTryOnReview } from '@/hooks/fitting-room/useFittingTryOnReview';
import { useOutfitQualityPreset } from '@/hooks/fitting-room/useOutfitQualityPreset';
import { outfitQualityPresetLabel } from '@/lib/fitting/outfit-quality-preset';
import FittingPlateSection from '@/components/fitting/FittingPlateSection';
import FittingWardrobeKitSection from '@/components/fitting/FittingWardrobeKitSection';
import TaskRequirementsCard from '@/components/TaskRequirementsCardLazy';
import OutfitPoseSection from '@/components/fitting/OutfitPoseSection';
import FittingStatusStrip from '@/components/fitting/FittingStatusStrip';
import FittingKeeperStandInNote from '@/components/fitting/FittingKeeperStandInNote';
import PlayGetStartedCard from '@/components/play/PlayGetStartedCard';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import ScenePromptResultPanel from '@/components/scene-tool/ScenePromptResultPanel';
import { FieldError } from '@/components/ui/Field';
import { CollapsibleSection, ToolLayout, ToolSection } from '@/components/ui/ToolPageShell';
import PlaySoftAdvanceBanner from '@/components/PlaySoftAdvanceBanner';
import PlayFilmFunnelChrome from '@/components/PlayFilmFunnelChrome';
import { usePlaySoftAdvance } from '@/hooks/usePlaySoftAdvance';
import { fittingSessionStatusLine } from '@/lib/fitting/room';
import { fittingNotesCachePatch } from '@/lib/look/pack';
import { dayPartnerNoun } from '@/lib/day/partner';
import type { useFittingRoomToolOrchestration } from '@/hooks/useFittingRoomToolOrchestration';

const ACCENT = 'rose' as const;
const TOOL_ID = 'fitting' as const;

type ViewModel = ReturnType<typeof useFittingRoomToolOrchestration>;
type Props = ViewModel & { description: string };

export default function FittingRoomToolSections({ description, ...vm }: Props) {
  const {
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
    keeperStandIn,
    makeStandingPicture,
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
  // Starred and recently tried kits, first above the picker (OutfitKitShelf).
  // Re-drawn when the packshot list has loaded (the shelf showed names before that).
  useWardrobeGarmentThumbManifestGeneration();
  const favoriteKitIds = toolSettings.favoriteKitIds ?? [];
  const recentKitIds = toolSettings.recentKitIds ?? [];
  const kitLabelOf = (id: string) =>
    wardrobeOptions.find(option => option.value === id)?.label ?? id;
  const shelf = [...new Set([...favoriteKitIds, ...recentKitIds])].slice(0, 12).map(id => ({
    id,
    label: kitLabelOf(id),
    // As the picker draws it: the packshot, or the catalog's own thumb.
    thumb: resolveWardrobeKitThumbUrl({ wardrobeId: id, personPreviewUrl: null }),
    starred: favoriteKitIds.includes(id),
  }));
  const kitOn = shared.lockedWardrobeId?.trim() || '';
  const rememberKit = () => {
    if (!kitOn) return;
    updateToolSettings({
      recentKitIds: [kitOn, ...recentKitIds.filter(id => id !== kitOn)].slice(0, 8),
    });
  };
  const toggleFavorite = () => {
    if (!kitOn) return;
    updateToolSettings({
      favoriteKitIds: favoriteKitIds.includes(kitOn)
        ? favoriteKitIds.filter(id => id !== kitOn)
        : [kitOn, ...favoriteKitIds].slice(0, 24),
    });
  };
  const tryOnNow = () => {
    rememberKit();
    void queueTryOn();
  };
  const tryOnAndNext = () => {
    rememberKit();
    void queueTryOnAndSwipe();
  };
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
      characterId={shared.activeCharacterId}
    />
  );
  // Keys (not while typing, nor over a dialog): ← → the kit before / after, Enter tries it on,
  // N tries it on then moves to the next, K keeps the try-on on the stage.
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
      const click = (testId: string) => {
        const button = document.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
        if (!button || button.disabled) return false;
        button.click();
        return true;
      };
      const key = event.key.toLowerCase();
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (busy) return;
        event.preventDefault();
        swipeKit(event.key === 'ArrowLeft' ? -1 : 1);
      } else if (event.key === 'Enter' && target?.tagName !== 'BUTTON' && target?.tagName !== 'A') {
        if (click('fitting-queue-try-on')) event.preventDefault();
      } else if (key === 'n') {
        if (click('fitting-queue-and-next')) event.preventDefault();
      } else if (key === 'k') {
        if (click('fitting-keep')) event.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, swipeKit]);
  return (
    <ToolLayout
      accent={ACCENT}
      width="full"
      title="Outfit"
      description={description}
      sidebarPersistKey="fitting"
      sidebar={engineControls}
      sidebarTitle={leanChrome ? false : undefined}
      // The fitting room needs the full width: Engine, quality by hand, LoRA and identity lock
      // open from the header chip as a sheet.
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.fitting} />
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
            {/* The shared Cast chip (it was a name and a "Change person or look" button). */}
            <CastChip
              name={character?.name ?? 'No Cast lead yet'}
              detail={lockedWardrobeLabel || undefined}
              plateUrl={platePicture || null}
              status={character ? (hasReference ? 'ok' : 'warn') : 'warn'}
              disabled={busy}
              testId="fitting-change-cast"
              nameTestId="fitting-who-name"
              onOpen={() => setCastSheetOpen(true)}
            />
          </div>
          {/* With no plate yet it's the first step, in the stage (below); after, it sits here. */}
          {hasReference ? plateSection : null}
        </div>

        <div className="ui-section-stack min-w-0">
          <FittingCompareSection
            plateUrl={platePicture || undefined}
            characterId={shared.activeCharacterId}
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
                // One step at a time: with no plate, nothing else on the page can run.
                <div className="mx-auto max-w-sm space-y-2 py-4" data-testid="fitting-plate-first">
                  <p className="type-heading text-center">Start with a plate</p>
                  <p className="type-caption text-center text-[var(--text-muted)]">
                    The picture every try-on starts from — then pick the clothes.
                  </p>
                  {plateSection}
                </div>
              )
            }
          />

          <ToolSection
            title="Pose"
            description="Try the kit on in the plate's own stance, or drag a figure into a pose."
            data-testid="fitting-pose-section"
            className={hasReference ? '' : 'opacity-60'}
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
          {/* Quality next to the try-on it sets (it was under the clothes list). */}
          <div className="ui-card p-3" data-testid="fitting-quality-card">
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

        <div className="ui-section-stack min-w-0">
          {hasReference ? null : (
            <p className="type-caption text-[var(--text-muted)]" data-testid="fitting-clothes-wait">
              Pick clothes any time — Try it on starts once there&apos;s a plate.
            </p>
          )}
          <div className={hasReference ? '' : 'opacity-60'}>
            <FittingWardrobeKitSection
              inline
              busy={busy}
              kitsHeader={
                <OutfitKitShelf
                  categories={wardrobeCategoryFilterOptions()
                    .filter(option =>
                      [
                        'all',
                        'outfit',
                        'top',
                        'bottom',
                        'outerwear',
                        'swimwear',
                        'formalwear',
                        'sleepwear',
                        'traditional',
                      ].includes(option.value)
                    )
                    .map(option => ({
                      value: option.value,
                      label: option.value === 'all' ? 'All' : option.label,
                    }))}
                  category={wardrobeCategoryFilter}
                  onCategory={value =>
                    updateToolSettings({
                      wardrobeCategoryFilter: normalizeWardrobeCategoryFilter(value),
                    })
                  }
                  shelf={shelf}
                  selectedId={kitOn || undefined}
                  favorite={kitOn ? favoriteKitIds.includes(kitOn) : null}
                  disabled={busy}
                  onSelect={selectKit}
                  onToggleFavorite={toggleFavorite}
                />
              }
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
          </div>
        </div>
      </div>

      {/*
        One place for the next step (Try it on sat at the top of the clothes column, its status
        lines twice under it), kept in view at the bottom while the clothes are picked.
      */}
      <div
        className="ui-sticky-surface sticky bottom-[calc(var(--bottom-dock-height,0px)+0.5rem)] z-20 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] px-3 py-2 shadow-lg"
        data-sticky-bottom
        data-testid="fitting-try-panel"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <FittingStatusStrip
            className="min-w-0 flex-1"
            statusLine={statusLine}
            // A missing plate is said once (the stage and the card at the top).
            queueBlockReason={queueBlocked && character && hasReference ? queueBlockReason : null}
          />
          <div className="w-full min-w-0 space-y-1 sm:w-auto sm:shrink-0">
            <FittingActionRow
              variant="panel"
              continueDayHref={softAdvance ? null : continueDayHref}
              dayPlannerHref={dayPlannerHref}
              queueBlocked={queueBlocked}
              queueBlockReason={null}
              swipeDeckLength={swipeDeck.length}
              hasKit={Boolean(shared.lockedWardrobeId?.trim())}
              busy={busy}
              character={character}
              compareActive={compareTryOns.length > 0 && !continueDayHref}
              softAdvanceActive={Boolean(softAdvance)}
              onSkipKit={skipKit}
              onQueueTryOn={tryOnNow}
              onQueueTryOnAndSwipe={tryOnAndNext}
              onSaveKitToCast={saveKitToCast}
              onGoRoleplay={goRoleplay}
            />
            {saveStatus && !pending ? (
              <p className="type-caption text-[var(--text-muted)]">{saveStatus}</p>
            ) : null}
            <FittingKeeperStandInNote
              status={keeperStandIn}
              busy={busy}
              onMake={makeStandingPicture}
            />
            {error ? <FieldError>{error}</FieldError> : null}
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
        summary="Edit the try-on prompt — Try it on is in the bar at the bottom."
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
