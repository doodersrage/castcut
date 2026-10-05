'use client';

import OutfitPoseShoesNote from '@/components/fitting/OutfitPoseShoesNote';
import PlateStanceNudge from '@/components/character/PlateStanceNudge';
import Link from 'next/link';
import CharacterOsPicker from '@/components/CharacterOsPicker';
import PlaySoftAdvanceBanner from '@/components/PlaySoftAdvanceBanner';
import PlayFilmEngineBanner from '@/components/PlayFilmEngineBanner';
import { Button } from '@/components/ui/Button';
import { FieldError, TextArea } from '@/components/ui/Field';
import { cacheBustIdentityMediaUrl, IDENTITY_MEDIA_URL } from '@/lib/gallery-media-client';
import { fittingNotesCachePatch } from '@/lib/look-pack';
import TaskRequirementsCard from '@/components/TaskRequirementsCardLazy';
import OutfitPoseSection from '@/components/fitting/OutfitPoseSection';
import { dayPartnerNoun } from '@/lib/day-partner';
import { usePlaySoftAdvance } from '@/hooks/usePlaySoftAdvance';
import type { useFittingRoomToolOrchestration } from '@/hooks/useFittingRoomToolOrchestration';
import { fittingSessionStatusLine, resolveFittingOutfitPhase } from '@/lib/fitting-room';
import { galleryPickPath } from '@/lib/gallery-handoff';
import { toMobileStudioHref, withCharacterQuery } from '@/lib/mobile-studio';
import { bumpPlayCampaignStep } from '@/lib/play-campaign';
import OutfitPlayPhaseStrip from '@/components/fitting/OutfitPlayPhaseStrip';
import FittingStatusStrip from '@/components/fitting/FittingStatusStrip';
import PlayGetStartedCard from '@/components/play/PlayGetStartedCard';
import FittingCompareSection from '@/components/fitting/FittingCompareSection';
import FittingWardrobeKitSection from '@/components/fitting/FittingWardrobeKitSection';
import OutfitQualityControls from '@/components/fitting/OutfitQualityControls';
import { useFittingTryOnReview } from '@/hooks/fitting-room/useFittingTryOnReview';
import { useOutfitQualityPreset } from '@/hooks/fitting-room/useOutfitQualityPreset';

type ViewModel = ReturnType<typeof useFittingRoomToolOrchestration>;

export default function MobileFittingToolSections(vm: ViewModel) {
  const { softAdvance, cancelSoftAdvance, softAdvanceHref } = usePlaySoftAdvance({ mobile: true });
  const {
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    output,
    copied,
    setCopied,
    error,
    setError,
    isolateStatus,
    referencePreviewUrl,
    lockedWardrobeLabel,
    saveStatus,
    continueDayHref,
    isolateSubject,
    referenceImageFilename,
    referenceImageUrl,
    referenceOriginalFilename,
    referenceOriginalUrl,
    setReferencePreviewUrl,
    setIsolateStatus,
    kitPreviews,
    autoKitPreviews,
    hasReference,
    character,
    wardrobeReady,
    wardrobeCategoryFilter,
    wardrobeOptions,
    swipeDeck,
    deckSelectionId,
    activeLookId,
    previewModel,
    previewModelLabel,
    selectedModel,
    completedPreviewCount,
    inFlightPreviewCount,
    fillKitPreviews,
    busy,
    compareTryOns,
    previewStatus,
    queueTryOn,
    keepTryOn,
    queueTryOnAndSwipe,
    skipKit,
    saveKitToCast,
    swipeKit,
    selectKit,
    queueBlocked,
    queueBlockReason,
    dismissTryOn,
    applyFixedTryOn,
    requeueTryOn,
    dayPlannerHref,
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
    applyReference,
    clearReference,
    referenceUploading,
  } = vm;

  const mobileContinueDay = continueDayHref ? toMobileStudioHref(continueDayHref) : null;
  const mobileDayHref = toMobileStudioHref(dayPlannerHref);
  const plateUrl = referencePreviewUrl || toolSettings.referenceImageUrl?.trim() || '';
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
    plateUrl: toolSettings.referenceImageUrl?.trim() || '',
    plateFilename: toolSettings.referenceImageFilename?.trim() || '',
    customGarmentDescription: toolSettings.customGarmentDescription,
    customPose: toolSettings.tryOnPose,
    shared,
  });

  const outfitPhase = resolveFittingOutfitPhase({
    hasPlate: hasReference,
    compareCount: compareTryOns.length,
    continueDayReady: Boolean(continueDayHref || softAdvance),
  });
  const statusLine = fittingSessionStatusLine({
    hasPlate: hasReference,
    kitLabel: lockedWardrobeLabel || shared.lockedWardrobeId,
    hasByo: Boolean(
      toolSettings.customGarmentImageUrl?.trim() || toolSettings.customGarmentImageFilename?.trim()
    ),
    byoLabel: toolSettings.customGarmentDescription,
  });

  return (
    <div className="space-y-4" data-testid="mobile-fitting">
      <div className="space-y-1">
        <h1 className="type-display text-2xl tracking-tight">Outfit</h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          Swipe kits on a locked plate. Keep a winner, then continue in Day.
        </p>
      </div>

      <PlayFilmEngineBanner />
      <OutfitPlayPhaseStrip activePhase={outfitPhase} compareCount={compareTryOns.length} />
      <PlaySoftAdvanceBanner
        key={softAdvance?.nonce ?? 'idle'}
        target={softAdvance}
        onCancel={cancelSoftAdvance}
      />

      <PlayGetStartedCard
        tool="outfit"
        mobile
        hasCharacter={Boolean(character)}
        hasPlate={hasReference}
        characterId={shared.activeCharacterId}
      />

      <FittingStatusStrip
        statusLine={statusLine}
        queueBlockReason={queueBlocked && character ? queueBlockReason : null}
      />

      {compareTryOns.length > 0 && !softAdvance && !continueDayHref ? (
        <div
          className="rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-2"
          data-testid="mobile-fitting-keep-coach"
          role="status"
        >
          <p className="type-overline text-[var(--accent-text)]">Ready to keep</p>
          <p className="type-caption text-[var(--text-muted)]">
            Keep a winner to seed Day — continuing starts after Keep.
          </p>
        </div>
      ) : null}

      <div
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 p-3"
        data-testid="mobile-fitting-character"
      >
        <CharacterOsPicker
          shared={shared}
          hints={character?.hints}
          onApply={patch => {
            try {
              updateShared(patch);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not apply that character.');
            }
          }}
        />
      </div>

      {plateUrl ? (
        <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={plateUrl} alt="" className="max-h-48 w-full object-contain" />
          <p className="type-caption px-3 py-2 text-[var(--text-muted)]">
            {isolateSubject
              ? toolSettings.referenceIsolated === true
                ? 'Plate isolated'
                : isolateStatus || 'Isolating…'
              : 'Plate locked'}
            {lockedWardrobeLabel ? ` · ${lockedWardrobeLabel}` : ''}
          </p>
          <PlateStanceNudge characterId={shared.activeCharacterId} className="px-3 pb-2" />
          <div className="flex flex-wrap gap-2 border-t border-[var(--border-subtle)] px-3 py-2">
            <label className="ui-btn-secondary inline-flex cursor-pointer items-center justify-center px-3 py-1.5 text-sm">
              Upload
              <input
                type="file"
                accept="image/*"
                aria-label="Upload Cast plate photo"
                disabled={busy || referenceUploading}
                className="sr-only"
                onChange={event => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) {
                    return;
                  }
                  void applyReference({ file }).catch(err => {
                    setError(err instanceof Error ? err.message : 'Could not upload that photo.');
                  });
                }}
              />
            </label>
            <Link
              href={toMobileStudioHref(
                galleryPickPath('fitting', { characterId: shared.activeCharacterId })
              )}
              className="ui-btn-secondary inline-flex items-center justify-center px-3 py-1.5 text-sm"
            >
              Gallery
            </Link>
            {hasReference ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={clearReference}>
                Clear
              </Button>
            ) : null}
            {/* Desk Outfit's toggle: off uses the photo as it is, on cuts her out on white. */}
            <button
              type="button"
              role="switch"
              aria-checked={isolateSubject}
              disabled={busy || referenceUploading}
              data-testid="mobile-fitting-isolate"
              className={`inline-flex min-h-8 items-center rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-50 ${
                isolateSubject
                  ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
              }`}
              onClick={() => {
                const next = !isolateSubject;
                const originalUrl = referenceOriginalUrl || referenceImageUrl;
                const originalFilename = referenceOriginalFilename || referenceImageFilename;
                if (!next) {
                  updateToolSettings({
                    isolateSubject: false,
                    referenceIsolated: false,
                    referenceImageFilename: originalFilename,
                    referenceImageUrl: originalUrl,
                  });
                  if (originalUrl) {
                    setReferencePreviewUrl(cacheBustIdentityMediaUrl(originalUrl));
                  }
                  setIsolateStatus(null);
                  return;
                }
                updateToolSettings({ isolateSubject: true });
                if (!originalUrl && !originalFilename) {
                  return;
                }
                void applyReference({
                  imageUrl: originalUrl || IDENTITY_MEDIA_URL,
                  filename: originalFilename || 'fitting-ref.png',
                  isolate: true,
                }).catch(err => {
                  setError(err instanceof Error ? err.message : 'Could not update the plate.');
                });
              }}
            >
              Isolate on white{isolateSubject ? ' ✓' : ''}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--text-muted)]">No plate yet.</p>
          <label className="ui-btn-primary mt-3 inline-flex cursor-pointer justify-center px-4 py-2">
            Upload plate
            <input
              type="file"
              accept="image/*"
              aria-label="Upload Cast plate photo"
              disabled={busy || referenceUploading}
              className="sr-only"
              onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) {
                  return;
                }
                void applyReference({ file }).catch(err => {
                  setError(err instanceof Error ? err.message : 'Could not upload that photo.');
                });
              }}
            />
          </label>
          <Link
            href={toMobileStudioHref(
              galleryPickPath('fitting', { characterId: shared.activeCharacterId })
            )}
            className="ui-btn-secondary mt-2 inline-flex w-full justify-center text-sm"
          >
            Choose from Gallery
          </Link>
          <Link
            href={withCharacterQuery('/m/moodboard', shared.activeCharacterId)}
            className="ui-btn-ghost mt-2 inline-flex w-full justify-center text-sm"
          >
            Or open Look
          </Link>
        </div>
      )}

      <TaskRequirementsCard
        task="Outfit try-ons"
        testId="fitting-task-requirements"
        input={{ model: shared.model, autoReview: toolSettings.autoReviewTryOns === true }}
      />

      <OutfitPoseSection
        pose={toolSettings.tryOnPose}
        busy={busy}
        leadNoun={dayPartnerNoun(character ?? {})}
        plateUrl={plateUrl}
        onChange={pose => updateToolSettings({ tryOnPose: pose })}
      />
      <OutfitPoseShoesNote
        model={shared.model}
        hasCustomPose={Boolean(toolSettings.tryOnPose?.people?.length)}
        footwear={toolSettings.footwear}
      />

      {/* The same Clothing row and sheet as desk Outfit (and Day / Story's picker). */}
      <FittingWardrobeKitSection
        compact
        kitPickerTestId="mobile-fitting-thumbs"
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
        onCategoryFilterChange={filter => updateToolSettings({ wardrobeCategoryFilter: filter })}
        onSwipeKit={swipeKit}
        onSelectKit={selectKit}
        onClearKit={clearKit}
        onToggleAutoKitPreviews={() => updateToolSettings({ autoKitPreviews: !autoKitPreviews })}
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
        onError={setError}
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

      <FittingCompareSection
        compact
        compareTryOns={compareTryOns}
        busy={busy}
        onKeepTryOn={keepTryOn}
        onSoftAdvance={href => softAdvanceHref(href, 'Day')}
        onDismissTryOn={dismissTryOn}
        onUseFixedTryOn={applyFixedTryOn}
        onRequeueTryOn={tryOn => void requeueTryOn(tryOn)}
        reviews={tryOnReview.reviews}
        reviewingId={tryOnReview.reviewingId}
      />

      <div className="grid gap-2">
        {mobileContinueDay && !softAdvance ? (
          <Link
            href={mobileContinueDay}
            className="ui-btn-primary w-full justify-center text-center"
            data-testid="fitting-continue-day"
          >
            Continue to Day
          </Link>
        ) : null}
        <Button
          variant={
            softAdvance || (compareTryOns.length > 0 && !continueDayHref) || mobileContinueDay
              ? 'secondary'
              : 'primary'
          }
          disabled={queueBlocked}
          loading={busy}
          title={queueBlockReason || undefined}
          data-testid="fitting-queue-try-on"
          onClick={() => void queueTryOn()}
          className="w-full justify-center"
        >
          Queue try-on
        </Button>
        {queueBlockReason ? (
          <p
            className="type-caption text-[var(--text-muted)]"
            data-testid="fitting-queue-block-reason"
          >
            {queueBlockReason}
          </p>
        ) : null}
        <Button
          variant="secondary"
          disabled={queueBlocked || swipeDeck.length < 2}
          onClick={() => void queueTryOnAndSwipe()}
          className="w-full justify-center"
        >
          Queue & next
        </Button>
        <Button
          variant="secondary"
          disabled={swipeDeck.length < 2 || busy || !shared.lockedWardrobeId?.trim()}
          title="Advance to the next wardrobe kit"
          data-testid="fitting-skip-kit"
          onClick={skipKit}
          className="w-full justify-center"
        >
          Skip kit
        </Button>
        {character && !mobileContinueDay ? (
          <Link
            href={mobileDayHref}
            className="ui-btn-secondary w-full justify-center text-center text-sm"
            data-testid="fitting-skip-day"
            onClick={() => {
              bumpPlayCampaignStep({ characterId: character.id, stepId: 'day' });
            }}
          >
            Skip outfit · Day
          </Link>
        ) : null}
        <Button
          variant="ghost"
          disabled={busy}
          onClick={saveKitToCast}
          className="w-full justify-center"
        >
          Save kit to Cast
        </Button>
        {!mobileContinueDay ? (
          <Link
            href={mobileDayHref}
            className="ui-btn-ghost w-full justify-center text-center text-sm"
            data-testid="fitting-plan-day"
          >
            Open Day
          </Link>
        ) : null}
      </div>

      {saveStatus ? <p className="type-caption text-[var(--text-muted)]">{saveStatus}</p> : null}
      <FieldError>{error}</FieldError>

      {/* Desk Outfit shows the try-on prompt under "Prompt (advanced)"; the phone page had no
          way to see what was sent. */}
      <details
        className="rounded-2xl border border-[var(--border-subtle)] px-4 py-3"
        data-testid="mobile-fitting-prompt"
      >
        <summary className="flex min-h-8 cursor-pointer items-center text-sm text-[var(--text-secondary)]">
          Prompt (advanced)
        </summary>
        {output?.trim() ? (
          <div className="mt-2 space-y-2">
            <TextArea
              rows={8}
              readOnly
              value={output}
              aria-label="The prompt the last try-on was queued with"
              className="font-mono text-xs"
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard
                  .writeText(output)
                  .then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  })
                  .catch(() => setError('Could not copy — the browser refused clipboard access.'));
              }}
            >
              {copied ? 'Copied' : 'Copy prompt'}
            </Button>
          </div>
        ) : (
          <p className="mt-2 type-caption text-[var(--text-muted)]">
            Queue a try-on to see the prompt it was sent with.
          </p>
        )}
      </details>
    </div>
  );
}
