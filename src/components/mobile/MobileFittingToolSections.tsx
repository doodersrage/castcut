'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import CharacterOsPicker from '@/components/CharacterOsPicker';
import PlaySoftAdvanceBanner from '@/components/PlaySoftAdvanceBanner';
import PlayFilmEngineBanner from '@/components/PlayFilmEngineBanner';
import { Button } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/Field';
import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
import ClothingPicker from '@/components/wardrobe/ClothingPicker';
import TaskRequirementsCard from '@/components/TaskRequirementsCard';
import OutfitPoseSection from '@/components/fitting/OutfitPoseSection';
import { dayPartnerNoun } from '@/lib/day-partner';
import { usePlaySoftAdvance } from '@/hooks/usePlaySoftAdvance';
import type { useFittingRoomToolOrchestration } from '@/hooks/useFittingRoomToolOrchestration';
import {
  buildFittingCompareLightboxState,
  fittingSessionStatusLine,
  resolveFittingOutfitPhase,
} from '@/lib/fitting-room';
import { getFittingKitPreview } from '@/lib/fitting-kit-previews';
import { galleryPickPath } from '@/lib/gallery-handoff';
import { toMobileStudioHref, withCharacterQuery } from '@/lib/mobile-studio';
import { bumpPlayCampaignStep } from '@/lib/play-campaign';
import OutfitPlayPhaseStrip from '@/components/fitting/OutfitPlayPhaseStrip';
import FittingStatusStrip from '@/components/fitting/FittingStatusStrip';
import PlayGetStartedCard from '@/components/play/PlayGetStartedCard';
import FittingAutoReviewToggle from '@/components/fitting/FittingAutoReviewToggle';
import { TryOnReviewLine } from '@/components/fitting/FittingCompareSection';
import { useFittingTryOnReview } from '@/hooks/fitting-room/useFittingTryOnReview';
import { suggestTryOnToKeep } from '@/lib/fitting-tryon-review';
import type { ImageLightboxSlideChrome } from '@/components/ui/ImageLightbox';
import {
  countWardrobeOptionsForFilter,
  normalizeWardrobeCategoryFilter,
  wardrobeCategoryFilterOptions,
} from '@/lib/wardrobe-catalog-ui';
import { useWardrobeGarmentThumbManifestGeneration } from '@/hooks/useWardrobeGarmentThumbManifest';
import { resolveWardrobeKitThumbUrl } from '@/lib/wardrobe-garment-thumbs';

const ImageLightbox = dynamic(() => import('@/components/ui/ImageLightbox'), {
  ssr: false,
  loading: () => null,
});

type ViewModel = ReturnType<typeof useFittingRoomToolOrchestration>;

export default function MobileFittingToolSections(vm: ViewModel) {
  useWardrobeGarmentThumbManifestGeneration();
  const { softAdvance, cancelSoftAdvance, softAdvanceHref } = usePlaySoftAdvance({ mobile: true });
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);
  const {
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    error,
    setError,
    isolateStatus,
    referencePreviewUrl,
    lockedWardrobeLabel,
    saveStatus,
    continueDayHref,
    isolateSubject,
    kitPreviews,
    hasReference,
    character,
    wardrobeReady,
    wardrobeCategoryFilter,
    wardrobeOptions,
    swipeDeck,
    deckSelectionId,
    activeLookId,
    completedPreviewCount,
    inFlightPreviewCount,
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
  const autoReviewTryOns = toolSettings.autoReviewTryOns === true;
  const tryOnReview = useFittingTryOnReview({
    enabled: autoReviewTryOns,
    compareTryOns,
    plateUrl: toolSettings.referenceImageUrl?.trim() || '',
    plateFilename: toolSettings.referenceImageFilename?.trim() || '',
    customGarmentDescription: toolSettings.customGarmentDescription,
    customPose: toolSettings.tryOnPose,
    shared,
  });
  const suggestedTryOnId = suggestTryOnToKeep(
    compareTryOns.flatMap(tryOn =>
      tryOnReview.reviews[tryOn.promptId]
        ? [{ promptId: tryOn.promptId, review: tryOnReview.reviews[tryOn.promptId]! }]
        : []
    )
  );
  const openCompareLightbox = useCallback(
    (promptId: string) => {
      const next = buildFittingCompareLightboxState(compareTryOns, promptId);
      if (!next) {
        return;
      }
      setLightbox({
        images: next.images,
        titles: next.titles,
        originalImages: next.images,
        index: next.index,
        title: next.title,
      });
    },
    [compareTryOns]
  );

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

  const activeLightboxTryOn = useMemo(() => {
    if (!lightbox || compareTryOns.length === 0) {
      return null;
    }
    const url = lightbox.images[lightbox.index];
    return (
      compareTryOns.find(tryOn => tryOn.imageUrl === url) || compareTryOns[lightbox.index] || null
    );
  }, [compareTryOns, lightbox]);

  const compareSlideChrome = useMemo((): ImageLightboxSlideChrome | null => {
    if (!activeLightboxTryOn) {
      return null;
    }
    return {
      showKeep: true,
      showPass: true,
      showRequeue: true,
      showSeedVariation: false,
      showImprove: false,
      showCompose: false,
      showInpaint: false,
      showUseStack: false,
      showUsePromptStack: false,
      showUseFace: false,
      onKeep: () => {
        const href = keepTryOn(activeLightboxTryOn);
        setLightbox(null);
        if (href) {
          softAdvanceHref(href, 'Day');
        }
      },
      onPass: () => {
        dismissTryOn(activeLightboxTryOn);
        setLightbox(null);
      },
      onRequeue: () => {
        void requeueTryOn(activeLightboxTryOn);
        setLightbox(null);
      },
    };
  }, [activeLightboxTryOn, dismissTryOn, keepTryOn, requeueTryOn, softAdvanceHref]);

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
        onChange={pose => updateToolSettings({ tryOnPose: pose })}
      />

      {/* Same Clothing picker as Day and Story: a catalog kit or your own photo, Browse. */}
      <div data-testid="mobile-fitting-clothing">
        <ClothingPicker
          accent="rose"
          busy={busy}
          testIdPrefix="fitting"
          emptyKitLabel="No kit picked yet — choose one to try on, or use your own photo."
          clearKitLabel="Clear kit"
          garment={{
            uploading: garmentUploading,
            scanStatus: garmentScanStatus,
            imageUrl: toolSettings.customGarmentImageUrl,
            imageFilename: toolSettings.customGarmentImageFilename,
            description: toolSettings.customGarmentDescription,
            onApply: applyCustomGarment,
            onClear: clearCustomGarment,
            onRescan: rescanCustomGarment,
            onSave: saveCurrentCustomGarment,
            onApplySaved: applySavedCustomGarment,
            onRemoveSaved: removeSavedCustomGarment,
            onDescriptionChange: value => updateToolSettings({ customGarmentDescription: value }),
          }}
          footwear={{
            value: toolSettings.footwear,
            imageUrl: toolSettings.footwearImageUrl,
            imageFilename: toolSettings.footwearImageFilename,
            onChange: patch => updateToolSettings(patch),
            onApplyPhoto: applyFootwearPhoto,
          }}
          kits={swipeDeck}
          kitsReady={wardrobeReady}
          selectedKitId={deckSelectionId}
          kitSize="sm"
          kitPickerTestId="mobile-fitting-thumbs"
          onSelectKit={selectKit}
          onSwipeKit={delta => swipeKit(delta)}
          onClearKit={clearKit}
          resolveKitThumb={kit => {
            const preview = activeLookId
              ? getFittingKitPreview(kitPreviews, kit.id, activeLookId)
              : undefined;
            const personUrl =
              preview?.status === 'completed' ? preview.imageUrl?.trim() || null : null;
            const pending = preview?.status === 'queued' || preview?.status === 'running';
            return {
              url: resolveWardrobeKitThumbUrl({ wardrobeId: kit.id, personPreviewUrl: personUrl }),
              pending: Boolean(pending && !personUrl),
            };
          }}
          category={{
            value: wardrobeCategoryFilter,
            options: wardrobeCategoryFilterOptions().map(option => ({
              value: option.value,
              label: wardrobeReady
                ? `${option.label} (${countWardrobeOptionsForFilter(wardrobeOptions, option.value)})`
                : option.label,
            })),
            onChange: value =>
              updateToolSettings({
                wardrobeCategoryFilter: normalizeWardrobeCategoryFilter(value),
              }),
          }}
          onError={setError}
        />
        {previewStatus || completedPreviewCount > 0 || inFlightPreviewCount > 0 ? (
          <p className="mt-2 type-caption text-[var(--text-muted)]">
            {previewStatus ||
              `${completedPreviewCount} preview${completedPreviewCount === 1 ? '' : 's'}${
                inFlightPreviewCount > 0 ? ` · ${inFlightPreviewCount} rendering` : ''
              }`}
          </p>
        ) : null}
      </div>

      <p className="type-caption text-[var(--text-muted)]" data-testid="fitting-preview-vs-queue">
        Draft thumbs when available · Queue try-on = full quality for Keep → Day.
      </p>

      <FittingAutoReviewToggle
        enabled={autoReviewTryOns}
        checksOff={tryOnReview.checksOff}
        onChange={next => updateToolSettings({ autoReviewTryOns: next })}
      />

      {compareTryOns.length > 0 ? (
        <div className="space-y-2" data-testid="mobile-fitting-compare">
          <p className="type-caption text-[var(--text-muted)]">
            Compare try-ons · tap for full size · Keep / Pass / requeue
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {compareTryOns.map(tryOn => (
              <figure
                key={tryOn.promptId}
                data-testid="fitting-compare-card"
                data-review={tryOnReview.reviews[tryOn.promptId]?.status ?? 'none'}
                className={`w-[9rem] shrink-0 rounded-2xl border bg-[var(--bg-muted)]/40 p-2 ${
                  suggestedTryOnId === tryOn.promptId
                    ? 'border-[var(--accent-border)] ring-2 ring-[var(--accent-ring)]'
                    : tryOnReview.reviews[tryOn.promptId]?.status === 'warn'
                      ? 'border-[var(--tint-warning-border)]'
                      : 'border-[var(--border-subtle)]'
                }`}
              >
                {tryOn.imageUrl ? (
                  <button
                    type="button"
                    className="mb-2 block w-full cursor-zoom-in rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                    aria-label={`View ${tryOn.wardrobeLabel || 'try-on'} larger`}
                    onClick={() => openCompareLightbox(tryOn.promptId)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={tryOn.imageUrl}
                      alt={tryOn.wardrobeLabel || 'Try-on'}
                      className="h-32 w-full rounded-xl object-cover"
                    />
                  </button>
                ) : null}
                <figcaption className="type-caption truncate text-[var(--text-muted)]">
                  {tryOn.wardrobeLabel || tryOn.wardrobeId || 'Try-on'}
                </figcaption>
                <TryOnReviewLine
                  review={tryOnReview.reviews[tryOn.promptId]}
                  reviewing={tryOnReview.reviewingId === tryOn.promptId}
                  suggested={suggestedTryOnId === tryOn.promptId}
                />
                <div className="mt-2 grid grid-cols-3 gap-1">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy}
                    data-testid="fitting-keep"
                    onClick={() => {
                      const href = keepTryOn(tryOn);
                      if (href) {
                        softAdvanceHref(href, 'Day');
                      }
                    }}
                    className="justify-center"
                  >
                    Keep
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    title="Dismiss this try-on"
                    data-testid="fitting-pass-try-on"
                    onClick={() => dismissTryOn(tryOn)}
                    className="justify-center"
                  >
                    Pass
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    title="Queue this kit again"
                    data-testid="fitting-requeue-try-on"
                    onClick={() => void requeueTryOn(tryOn)}
                    className="justify-center"
                  >
                    ↻
                  </Button>
                </div>
              </figure>
            ))}
          </div>
        </div>
      ) : null}

      <ImageLightbox
        state={lightbox}
        onClose={() => setLightbox(null)}
        slideChrome={compareSlideChrome}
        onIndexChange={index =>
          setLightbox(previous =>
            previous
              ? {
                  ...previous,
                  index,
                  title: previous.titles?.[index] ?? previous.title,
                }
              : previous
          )
        }
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
    </div>
  );
}
