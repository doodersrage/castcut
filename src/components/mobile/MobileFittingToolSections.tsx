'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import CharacterOsPicker from '@/components/CharacterOsPicker';
import PlaySoftAdvanceBanner, {
  type PlaySoftAdvanceTarget,
} from '@/components/PlaySoftAdvanceBanner';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { FieldError, FieldLabel, SelectInput } from '@/components/ui/Field';
import type { useFittingRoomToolOrchestration } from '@/hooks/useFittingRoomToolOrchestration';
import { getFittingKitPreview } from '@/lib/fitting-kit-previews';
import { ISOLATE_QUEUE_BLOCKED_MESSAGE } from '@/lib/isolate-subject';
import { toMobileStudioHref } from '@/lib/mobile-studio';
import {
  countWardrobeOptionsForFilter,
  normalizeWardrobeCategoryFilter,
  wardrobeCategoryFilterOptions,
} from '@/lib/wardrobe-catalog-ui';

type ViewModel = ReturnType<typeof useFittingRoomToolOrchestration>;

export default function MobileFittingToolSections(vm: ViewModel) {
  const [softAdvance, setSoftAdvance] = useState<PlaySoftAdvanceTarget | null>(null);
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
  } = vm;

  const touchStartX = useRef<number | null>(null);
  const mobileContinueDay = continueDayHref ? toMobileStudioHref(continueDayHref) : null;
  const mobileDayHref = toMobileStudioHref(dayPlannerHref);
  const plateUrl = referencePreviewUrl || toolSettings.referenceImageUrl?.trim() || '';
  const activePreview = activeSwipeKit
    ? getFittingKitPreview(kitPreviews, activeSwipeKit.id, activeLookId)
    : undefined;
  const activeThumb = activePreview?.status === 'completed' ? activePreview.imageUrl?.trim() : '';

  return (
    <div className="space-y-4" data-testid="mobile-fitting">
      <div className="space-y-1">
        <h1 className="type-display text-2xl tracking-tight">Outfit</h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          Swipe kits on a locked plate. Keep a winner, then continue in Day.
        </p>
      </div>

      <PlaySoftAdvanceBanner
        key={softAdvance?.nonce ?? 'idle'}
        target={softAdvance}
        onCancel={() => setSoftAdvance(null)}
      />

      {compareTryOns.length > 0 && !softAdvance ? (
        <div
          className="rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-2"
          data-testid="mobile-fitting-keep-coach"
          role="status"
        >
          <p className="type-overline text-[var(--accent-text)]">Ready to keep</p>
          <p className="type-caption text-[var(--text-muted)]">
            Keep a winner to seed Day — soft-advance starts after Keep.
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
            href="/m/moodboard"
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
            {activeThumb || plateUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeThumb || plateUrl}
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

          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={busy || swipeDeck.length < 2}
              onClick={() => swipeKit(-1)}
              className="flex-1 justify-center"
            >
              Prev
            </Button>
            <Button
              variant="secondary"
              disabled={busy || swipeDeck.length < 2}
              onClick={() => swipeKit(1)}
              className="flex-1 justify-center"
            >
              Next
            </Button>
          </div>

          <div
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
            data-testid="mobile-fitting-thumbs"
          >
            {swipeDeck.map(kit => {
              const preview = activeLookId
                ? getFittingKitPreview(kitPreviews, kit.id, activeLookId)
                : undefined;
              const thumb = preview?.status === 'completed' ? preview.imageUrl?.trim() : '';
              const pending = preview?.status === 'queued' || preview?.status === 'running';
              const selected = deckSelectionId === kit.id;
              return (
                <button
                  key={kit.id}
                  ref={selected ? activeThumbRef : undefined}
                  type="button"
                  disabled={busy}
                  title={kit.label}
                  aria-label={kit.label}
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => selectKit(kit.id)}
                  className={[
                    'h-16 w-14 shrink-0 overflow-hidden rounded-lg border bg-white',
                    selected
                      ? 'border-[var(--accent-border)] ring-2 ring-[var(--accent-ring)]'
                      : 'border-[var(--border-subtle)]',
                  ].join(' ')}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center type-caption text-[var(--text-muted)]">
                      {pending ? '…' : '—'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
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
          <p className="type-caption text-[var(--text-muted)]">Compare try-ons</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {compareTryOns.map(tryOn => (
              <figure
                key={tryOn.promptId}
                className="min-w-[8rem] shrink-0 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 p-2"
              >
                {tryOn.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={tryOn.imageUrl}
                    alt={tryOn.wardrobeLabel || 'Try-on'}
                    className="mb-2 h-32 w-full rounded-xl object-cover"
                  />
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
                        setSoftAdvance({
                          href: toMobileStudioHref(href),
                          label: 'Day',
                          nonce: Date.now(),
                        });
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

      <div className="grid gap-2">
        {mobileContinueDay && !softAdvance ? (
          <Link
            href={mobileContinueDay}
            className="ui-btn-primary w-full justify-center text-center"
            data-testid="fitting-continue-day"
          >
            Continue in Day
          </Link>
        ) : null}
        <PrimaryButton
          disabled={queueBlocked}
          loading={busy}
          onClick={() => void queueTryOn()}
          className="w-full justify-center"
        >
          Queue try-on
        </PrimaryButton>
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
            Plan a day
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
