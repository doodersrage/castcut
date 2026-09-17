'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import CharacterOsPicker from '@/components/CharacterOsPicker';
import PlaySoftAdvanceBanner from '@/components/PlaySoftAdvanceBanner';
import PlayFilmEngineBanner from '@/components/PlayFilmEngineBanner';
import { Button } from '@/components/ui/Button';
import { FieldError, FieldLabel, SelectInput } from '@/components/ui/Field';
import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
import WardrobeKitPicker from '@/components/wardrobe/WardrobeKitPicker';
import { usePlaySoftAdvance } from '@/hooks/usePlaySoftAdvance';
import type { useFittingRoomToolOrchestration } from '@/hooks/useFittingRoomToolOrchestration';
import { buildFittingCompareLightboxState } from '@/lib/fitting-room';
import { getFittingKitPreview } from '@/lib/fitting-kit-previews';
import {
  findSavedFittingGarmentByFilename,
  loadSavedFittingGarments,
  subscribeSavedFittingGarments,
  type SavedFittingGarment,
} from '@/lib/fitting-saved-garments';
import { ISOLATE_QUEUE_BLOCKED_MESSAGE } from '@/lib/isolate-subject';
import { toMobileStudioHref, withCharacterQuery } from '@/lib/mobile-studio';
import {
  countWardrobeOptionsForFilter,
  normalizeWardrobeCategoryFilter,
  wardrobeCategoryFilterOptions,
} from '@/lib/wardrobe-catalog-ui';
import { useWardrobeGarmentThumbManifestGeneration } from '@/hooks/useWardrobeGarmentThumbManifest';
import {
  resolveWardrobeGarmentThumbUrl,
  resolveWardrobeKitThumbUrl,
} from '@/lib/wardrobe-garment-thumbs';

const ImageLightbox = dynamic(() => import('@/components/ui/ImageLightbox'), {
  ssr: false,
  loading: () => null,
});

function useSavedFittingGarments(): SavedFittingGarment[] {
  const json = useSyncExternalStore(
    subscribeSavedFittingGarments,
    () => JSON.stringify(loadSavedFittingGarments()),
    () => '[]'
  );
  return useMemo(() => JSON.parse(json) as SavedFittingGarment[], [json]);
}

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
    wardrobeKitCount,
    swipeDeck,
    activeSwipeKit,
    deckSelectionId,
    deckSelectionIndex,
    activeThumbRef,
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
    dayPlannerHref,
    garmentUploading,
    garmentScanStatus,
    applyCustomGarment,
    clearCustomGarment,
    rescanCustomGarment,
    saveCurrentCustomGarment,
    applySavedCustomGarment,
    removeSavedCustomGarment,
    clearKit,
  } = vm;

  const savedGarments = useSavedFittingGarments();
  const alreadySavedGarment = Boolean(
    findSavedFittingGarmentByFilename(toolSettings.customGarmentImageFilename)?.id
  );
  const touchStartX = useRef<number | null>(null);
  const mobileContinueDay = continueDayHref ? toMobileStudioHref(continueDayHref) : null;
  const mobileDayHref = toMobileStudioHref(dayPlannerHref);
  const plateUrl = referencePreviewUrl || toolSettings.referenceImageUrl?.trim() || '';
  const activePreview = activeSwipeKit
    ? getFittingKitPreview(kitPreviews, activeSwipeKit.id, activeLookId)
    : undefined;
  const activeThumb = activePreview?.status === 'completed' ? activePreview.imageUrl?.trim() : '';
  const activeHeroUrl =
    activeThumb ||
    (activeSwipeKit ? resolveWardrobeGarmentThumbUrl(activeSwipeKit.id) : null) ||
    plateUrl;

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

  return (
    <div className="space-y-4" data-testid="mobile-fitting">
      <div className="space-y-1">
        <h1 className="type-display text-2xl tracking-tight">Outfit</h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          Swipe kits on a locked plate. Keep a winner, then continue in Day.
        </p>
      </div>

      <PlayFilmEngineBanner />
      <PlaySoftAdvanceBanner
        key={softAdvance?.nonce ?? 'idle'}
        target={softAdvance}
        onCancel={cancelSoftAdvance}
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

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 p-3">
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
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--text-muted)]">No plate yet.</p>
          <Link href="/m" className="ui-btn-primary mt-3 inline-flex justify-center">
            Capture one
          </Link>
          <Link
            href={withCharacterQuery('/m/moodboard', shared.activeCharacterId)}
            className="ui-btn-secondary mt-2 inline-flex w-full justify-center text-sm"
          >
            Or open Look
          </Link>
        </div>
      )}

      <label className="block space-y-1.5 text-sm">
        <FieldLabel>Clothing type</FieldLabel>
        <SelectInput
          value={wardrobeCategoryFilter}
          disabled={!wardrobeReady || busy}
          onChange={event =>
            updateToolSettings({
              wardrobeCategoryFilter: normalizeWardrobeCategoryFilter(event.target.value),
            })
          }
        >
          {wardrobeCategoryFilterOptions().map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
              {option.value !== 'all' && wardrobeReady
                ? ` (${countWardrobeOptionsForFilter(wardrobeOptions, option.value)})`
                : option.value === 'all' && wardrobeReady
                  ? ` (${countWardrobeOptionsForFilter(wardrobeOptions, 'all')})`
                  : ''}
            </option>
          ))}
        </SelectInput>
        {wardrobeReady && wardrobeCategoryFilter !== 'all' ? (
          <p className="type-caption text-[var(--text-muted)]">
            {wardrobeKitCount} kit{wardrobeKitCount === 1 ? '' : 's'} in this type.
          </p>
        ) : null}
      </label>

      <div className="space-y-2" data-testid="mobile-fitting-custom-garment">
        <FieldLabel>Your clothing photo</FieldLabel>
        <p className="type-caption text-[var(--text-muted)]">
          Extract from a worn still, or upload a ready packshot (skips the edit pass).
        </p>
        <label className="block space-y-1">
          <span className="type-caption text-[var(--text-muted)]">Extract from photo</span>
          <input
            type="file"
            accept="image/*"
            aria-label="Upload clothing photo to extract a packshot"
            disabled={busy || garmentUploading}
            className="ui-file-input block w-full"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) {
                return;
              }
              void applyCustomGarment({ file }).catch(err => {
                setError(
                  err instanceof Error ? err.message : 'Could not upload that clothing photo.'
                );
              });
            }}
          />
        </label>
        <label className="block space-y-1">
          <span className="type-caption text-[var(--text-muted)]">Ready packshot</span>
          <input
            type="file"
            accept="image/*"
            aria-label="Upload a ready clothing packshot"
            data-testid="fitting-upload-ready-packshot"
            disabled={busy || garmentUploading}
            className="ui-file-input block w-full"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) {
                return;
              }
              void applyCustomGarment({ file, asPackshot: true }).catch(err => {
                setError(err instanceof Error ? err.message : 'Could not upload that packshot.');
              });
            }}
          />
        </label>
        {garmentUploading || garmentScanStatus ? (
          <p
            className="type-caption text-[var(--text-muted)]"
            data-testid="fitting-garment-scan-status"
          >
            {garmentScanStatus || 'Working on clothing photo…'}
          </p>
        ) : null}
        {toolSettings.customGarmentImageUrl?.trim() ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={toolSettings.customGarmentImageUrl}
              alt="Custom clothing"
              className="max-h-40 w-full rounded-xl border border-[var(--border-subtle)] object-contain"
            />
            {toolSettings.customGarmentDescription?.trim() ? (
              <p className="type-caption text-[var(--text-secondary)]">
                {toolSettings.customGarmentDescription}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || garmentUploading || alreadySavedGarment}
                data-testid="fitting-save-garment"
                onClick={() => {
                  try {
                    saveCurrentCustomGarment();
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : 'Could not save that clothing photo.'
                    );
                  }
                }}
              >
                {alreadySavedGarment ? 'Saved' : 'Save for later'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || garmentUploading}
                onClick={() => {
                  void rescanCustomGarment().catch(err => {
                    setError(err instanceof Error ? err.message : 'Vision scan failed.');
                  });
                }}
              >
                Rescan
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || garmentUploading}
                onClick={clearCustomGarment}
              >
                Clear photo
              </Button>
            </div>
          </div>
        ) : null}
        {savedGarments.length > 0 ? (
          <div className="space-y-2" data-testid="fitting-saved-garments">
            <FieldLabel>Saved clothing</FieldLabel>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {savedGarments.map(entry => {
                const active =
                  toolSettings.customGarmentImageFilename?.trim() === entry.imageFilename ||
                  toolSettings.customGarmentImageUrl?.trim() === entry.imageUrl;
                return (
                  <div
                    key={entry.id}
                    className={`relative shrink-0 rounded-xl border ${
                      active ? 'border-[var(--accent-rose)]' : 'border-[var(--border-subtle)]'
                    } bg-[var(--bg-muted)]/40`}
                  >
                    <button
                      type="button"
                      disabled={busy || garmentUploading}
                      className="block w-24 space-y-1 p-1.5 text-left"
                      title={entry.description || entry.label}
                      onClick={() => {
                        try {
                          applySavedCustomGarment(entry.id);
                        } catch (err) {
                          setError(
                            err instanceof Error
                              ? err.message
                              : 'Could not use that saved clothing photo.'
                          );
                        }
                      }}
                    >
                      {entry.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={entry.imageUrl}
                          alt=""
                          className="h-20 w-full rounded-lg object-contain"
                        />
                      ) : (
                        <div className="flex h-20 items-center justify-center type-caption text-[var(--text-muted)]">
                          Packshot
                        </div>
                      )}
                      <span className="line-clamp-2 type-caption text-[var(--text-secondary)]">
                        {entry.label}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${entry.label}`}
                      disabled={busy || garmentUploading}
                      className="absolute right-1 top-1 rounded-full bg-[var(--bg-elevated)]/90 px-1.5 type-caption text-[var(--text-muted)]"
                      onClick={() => removeSavedCustomGarment(entry.id)}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
        {shared.lockedWardrobeId?.trim() ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={clearKit}>
            Clear kit
          </Button>
        ) : null}
      </div>

      {swipeDeck.length > 0 ? (
        <div
          className="space-y-3"
          data-testid="mobile-fitting-swipe"
          onTouchStart={event => {
            touchStartX.current = event.changedTouches[0]?.clientX ?? null;
          }}
          onTouchEnd={event => {
            const start = touchStartX.current;
            touchStartX.current = null;
            if (start == null || swipeDeck.length < 2 || busy) {
              return;
            }
            const end = event.changedTouches[0]?.clientX ?? start;
            const delta = end - start;
            if (Math.abs(delta) < 48) {
              return;
            }
            swipeKit(delta < 0 ? 1 : -1);
          }}
        >
          <div className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40">
            {activeHeroUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeHeroUrl}
                alt={activeSwipeKit?.label || 'Kit'}
                className="mx-auto max-h-72 w-full object-contain"
              />
            ) : (
              <div className="flex h-56 items-center justify-center text-sm text-[var(--text-muted)]">
                Swipe for kits
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-3 py-3 text-white">
              <p className="truncate text-sm font-medium">
                {activeSwipeKit?.label || 'Pick a kit'}
                {activeSwipeKit?.group ? ` · ${activeSwipeKit.group}` : ''}
              </p>
              <p className="type-caption opacity-90">
                {deckSelectionIndex + 1} / {swipeDeck.length} · swipe left/right
              </p>
            </div>
          </div>

          <WardrobeKitPicker
            kits={swipeDeck}
            selectedId={deckSelectionId}
            disabled={busy || Boolean(toolSettings.customGarmentImageUrl?.trim())}
            size="sm"
            activeThumbRef={activeThumbRef}
            testId="mobile-fitting-thumbs"
            onSelect={selectKit}
            onSwipe={delta => swipeKit(delta)}
            resolveThumb={kit => {
              const preview = activeLookId
                ? getFittingKitPreview(kitPreviews, kit.id, activeLookId)
                : undefined;
              const personUrl =
                preview?.status === 'completed' ? preview.imageUrl?.trim() || null : null;
              const pending = preview?.status === 'queued' || preview?.status === 'running';
              return {
                url: resolveWardrobeKitThumbUrl({
                  wardrobeId: kit.id,
                  personPreviewUrl: personUrl,
                }),
                pending: Boolean(pending && !personUrl),
              };
            }}
          />

          {previewStatus || completedPreviewCount > 0 || inFlightPreviewCount > 0 ? (
            <p className="type-caption text-[var(--text-muted)]">
              {previewStatus ||
                `${completedPreviewCount} preview${completedPreviewCount === 1 ? '' : 's'}${
                  inFlightPreviewCount > 0 ? ` · ${inFlightPreviewCount} rendering` : ''
                }`}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="type-caption text-[var(--text-muted)]">
          {wardrobeReady ? 'No kits for this filter.' : 'Loading wardrobe…'}
        </p>
      )}

      {compareTryOns.length > 0 ? (
        <div className="space-y-2" data-testid="mobile-fitting-compare">
          <p className="type-caption text-[var(--text-muted)]">
            Compare try-ons · tap for full size
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {compareTryOns.map(tryOn => (
              <figure
                key={tryOn.promptId}
                className="min-w-[8rem] shrink-0 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 p-2"
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
                <div className="mt-2 grid grid-cols-2 gap-1">
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
                    onClick={skipKit}
                    className="justify-center"
                  >
                    Skip
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
          onClick={() => void queueTryOn()}
          className="w-full justify-center"
        >
          Queue try-on
        </Button>
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
          disabled={queueBlocked || swipeDeck.length < 2}
          onClick={skipKit}
          className="w-full justify-center"
        >
          Skip kit
        </Button>
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
      {isolateSubject && hasReference && toolSettings.referenceIsolated !== true && !error ? (
        <p className="type-caption text-[var(--text-muted)]">{ISOLATE_QUEUE_BLOCKED_MESSAGE}</p>
      ) : null}
    </div>
  );
}
