'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import CharacterOsPicker from '@/components/CharacterOsPicker';
import FilmWatchPlayer from '@/components/FilmWatchPlayer';
import PlaySoftAdvanceBanner, {
  type PlaySoftAdvanceTarget,
} from '@/components/PlaySoftAdvanceBanner';
import { Button, ButtonLink, PrimaryButton } from '@/components/ui/Button';
import { ChipButton, FieldError, FieldLabel, SelectInput, TextArea } from '@/components/ui/Field';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';
import type { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import { ROLEPLAY_SETTING_PRESETS } from '@/lib/roleplay';
import {
  resolveFilmFailurePlaybook,
  resolveQueueFailureGuideLabel,
} from '@/lib/queue-failure-playbook';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { toMobileStudioHref } from '@/lib/mobile-studio';
import { welcomeSampleFilmShots } from '@/lib/welcome-sample-film';
import {
  countWardrobeOptionsForFilter,
  normalizeWardrobeCategoryFilter,
  wardrobeCategoryFilterOptions,
} from '@/lib/wardrobe-catalog-ui';

type ViewModel = ReturnType<typeof useDayPlannerToolOrchestration>;

export default function MobileDayToolSections(vm: ViewModel) {
  const {
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    error,
    setError,
    filmGuideHref,
    busy,
    activeSlotId,
    setActiveSlotId,
    assemblingFilm,
    filmStatus,
    filmNeedsCast,
    slots,
    stills,
    watchPlaylist,
    activeSlot,
    character,
    hasPlate,
    wardrobeOptions,
    wardrobeReady,
    wardrobeCategoryFilter,
    filteredWardrobeOptions,
    wardrobeKitCount,
    updateSlot,
    queueSlot,
    queueAll,
    animateSlot,
    animateAllClips,
    cutDayFilm,
    saveFilmToCast,
    completedShotCount,
    fittingWardrobe,
    firstCutCelebrate,
    shareLastCut,
    remixSameLookDay,
    seedDemoStills,
  } = vm;

  const [sampleWatch, setSampleWatch] = useState(false);
  const [softAdvance, setSoftAdvance] = useState<PlaySoftAdvanceTarget | null>(null);
  const sampleShots = useMemo(() => welcomeSampleFilmShots(), []);
  const slotTotal = slots.length || 4;
  const showCutCoach = completedShotCount > 0 && !firstCutCelebrate && !assemblingFilm;
  const playbookHref =
    filmGuideHref ?? (error ? resolveFilmFailurePlaybook(error).href : undefined);

  useEffect(() => {
    if (!firstCutCelebrate || !character?.id) {
      return;
    }
    let cancelled = false;
    scheduleAfterCommit(() => {
      if (cancelled) {
        return;
      }
      setSoftAdvance({
        href: toMobileStudioHref(`/characters/${encodeURIComponent(character.id)}?media=films`),
        label: 'Watch on Cast',
        nonce: Date.now(),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [firstCutCelebrate, character?.id]);

  return (
    <div className="space-y-4" data-testid="mobile-day">
      <div className="space-y-1">
        <h1 className="type-display text-2xl tracking-tight">Day</h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          Four slots → stills → Cut film. Animate clips after your first cut.
        </p>
      </div>

      <PlaySoftAdvanceBanner
        key={softAdvance?.nonce ?? 'idle'}
        target={softAdvance}
        onCancel={() => setSoftAdvance(null)}
      />

      {firstCutCelebrate ? (
        <div
          className="rounded-2xl border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] px-4 py-3"
          data-testid="day-first-cut-celebrate"
        >
          <p className="type-overline text-[var(--tint-success-text)]">First film</p>
          <p className="type-heading mt-1 text-[var(--text-primary)]">You cut your first reel</p>
          <p className="type-caption mt-1 text-[var(--text-muted)]">
            Watch on Cast is next — share or queue another Day with the same look.
          </p>
          <div className="mt-3 grid gap-2">
            {character ? (
              <Link
                href={toMobileStudioHref(
                  `/characters/${encodeURIComponent(character.id)}?media=films`
                )}
                className="ui-btn-primary w-full justify-center text-center text-sm"
                data-testid="day-first-cut-watch"
                onClick={() => {
                  setSoftAdvance(null);
                  void import('@/lib/onboarding-hooks').then(({ markOnboardingWatchFirstFilm }) => {
                    markOnboardingWatchFirstFilm();
                  });
                }}
              >
                Watch on Cast
              </Link>
            ) : null}
            <Button
              variant="secondary"
              className="w-full justify-center"
              data-testid="day-first-cut-share"
              onClick={() => void shareLastCut()}
            >
              Share cut
            </Button>
            {character ? (
              <Button
                variant="secondary"
                className="w-full justify-center"
                data-testid="day-first-cut-remix"
                onClick={remixSameLookDay}
              >
                Same look, new Day
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {showCutCoach ? (
        <div
          className="rounded-2xl border border-[var(--accent-border)] bg-[var(--bg-elevated)] px-4 py-3"
          data-testid="day-cut-coach"
          role="status"
        >
          <p className="type-overline text-[var(--accent-text)]">Ready to cut</p>
          <p className="type-heading text-[var(--text-primary)]">
            Cut film · {completedShotCount} of {slotTotal}
          </p>
          <p className="type-caption text-[var(--text-muted)]">
            {completedShotCount < slotTotal
              ? 'Cut with what you have, or wait for the rest.'
              : 'All stills ready — cut the reel.'}
          </p>
          <div className="mt-3 grid gap-2">
            <PrimaryButton
              disabled={busy || assemblingFilm}
              loading={assemblingFilm}
              loadingLabel="Cutting film"
              className="w-full justify-center"
              data-testid="day-cut-coach-cut"
              onClick={() => void cutDayFilm()}
            >
              Cut film
            </PrimaryButton>
            {completedShotCount < slotTotal ? (
              <Button
                variant="ghost"
                disabled={busy}
                className="w-full justify-center"
                data-testid="day-cut-coach-queue"
                onClick={() => void queueAll()}
              >
                Queue rest
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="space-y-2" data-testid="day-progress">
        <p className="type-caption text-[var(--text-muted)]">Day progress</p>
        <ol className="grid grid-cols-2 gap-2">
          {slots.map(slot => {
            const still = stills.find(entry => entry.slotId === slot.id);
            const state =
              still?.status === 'completed'
                ? 'done'
                : still?.status === 'error'
                  ? 'failed'
                  : still?.status === 'queued' || still?.status === 'running'
                    ? 'queued'
                    : 'idle';
            const label =
              state === 'done'
                ? 'Done'
                : state === 'failed'
                  ? 'Failed'
                  : state === 'queued'
                    ? 'Queueing…'
                    : 'Waiting';
            const thumb = still?.status === 'completed' ? still.imageUrl?.trim() : '';
            return (
              <li
                key={slot.id}
                data-testid={`day-progress-${slot.id}`}
                data-state={state}
                className={[
                  'overflow-hidden rounded-xl border',
                  state === 'done'
                    ? 'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)]'
                    : state === 'failed'
                      ? 'border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)]'
                      : state === 'queued'
                        ? 'border-[var(--accent-border)] bg-[var(--accent-muted)]'
                        : 'border-[var(--border-subtle)]',
                ].join(' ')}
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt={`${slot.label} still`}
                    className="aspect-video w-full object-cover"
                  />
                ) : null}
                <div className="px-2.5 py-2">
                  <p className="type-heading text-sm">{slot.label}</p>
                  <p className="type-caption text-[var(--text-muted)]">{label}</p>
                  {state === 'failed' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-2"
                      disabled={busy}
                      data-testid={`day-progress-retry-${slot.id}`}
                      onClick={() => void queueSlot(slot)}
                    >
                      Retry
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

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
        <p className="type-caption mt-2 text-[var(--text-muted)]">
          {hasPlate
            ? 'Cast plate detected — identity lock when available.'
            : 'No Cast plate — stills queue as text scenes.'}
        </p>
      </div>

      <div className="space-y-2" data-testid="day-slots">
        <div className="flex flex-wrap gap-2">
          {slots.map(slot => {
            const still = stills.find(entry => entry.slotId === slot.id);
            const stillStatus =
              still?.status === 'completed'
                ? ' · still'
                : still?.status === 'queued' || still?.status === 'running'
                  ? ' · queued'
                  : still?.status === 'error'
                    ? ' · failed'
                    : '';
            const clipStatus =
              still?.clipStatus === 'completed'
                ? ' · clip'
                : still?.clipStatus === 'queued' || still?.clipStatus === 'running'
                  ? ' · animating'
                  : '';
            return (
              <ChipButton
                key={slot.id}
                active={activeSlotId === slot.id}
                disabled={busy}
                onClick={() => setActiveSlotId(slot.id)}
              >
                {slot.label}
                {stillStatus}
                {clipStatus}
              </ChipButton>
            );
          })}
        </div>

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
              {wardrobeKitCount} kit{wardrobeKitCount === 1 ? '' : 's'} for{' '}
              {activeSlot.label.toLowerCase()}.
            </p>
          ) : null}
        </label>

        <label className="block space-y-1.5 text-sm">
          <FieldLabel>Outfit kit</FieldLabel>
          <SelectInput
            value={activeSlot.wardrobeId ?? ''}
            disabled={!wardrobeReady || busy}
            onChange={event => {
              const value = event.target.value.trim();
              updateSlot(activeSlot.id, { wardrobeId: value || undefined });
            }}
          >
            {filteredWardrobeOptions.map(option => (
              <option key={option.value || 'default'} value={option.value}>
                {option.group ? `${option.label} · ${option.group}` : option.label}
              </option>
            ))}
          </SelectInput>
        </label>

        <label className="block space-y-1.5 text-sm">
          <FieldLabel>Setting</FieldLabel>
          <SelectInput
            value=""
            disabled={busy}
            onChange={event => {
              const preset = ROLEPLAY_SETTING_PRESETS.find(
                entry => entry.id === event.target.value
              );
              if (preset) {
                updateSlot(activeSlot.id, { location: preset.setting });
              }
            }}
          >
            <option value="">Insert preset…</option>
            {ROLEPLAY_SETTING_PRESETS.map(preset => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </SelectInput>
          <TextArea
            rows={2}
            data-testid="day-slot-location"
            value={activeSlot.location ?? ''}
            placeholder="e.g. sunlit café, rainy commute"
            onChange={event => updateSlot(activeSlot.id, { location: event.target.value })}
          />
        </label>

        <label className="block space-y-1.5 text-sm">
          <FieldLabel>Beat</FieldLabel>
          <TextArea
            rows={3}
            value={activeSlot.sceneHints ?? ''}
            placeholder="What happens in this part of the day?"
            onChange={event => updateSlot(activeSlot.id, { sceneHints: event.target.value })}
          />
        </label>

        <div className="grid gap-2">
          <PrimaryButton
            disabled={busy}
            loading={busy}
            data-testid="day-slot-queue"
            onClick={() => void queueSlot(activeSlot)}
            className="w-full justify-center"
          >
            Queue {activeSlot.label.toLowerCase()}
          </PrimaryButton>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void queueAll()}
            className="w-full justify-center"
          >
            Queue all slots
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            data-testid="day-demo-stills"
            onClick={seedDemoStills}
            className="w-full justify-center"
          >
            Use demo stills
          </Button>
        </div>

        <CollapsibleSection
          title="Animate clips"
          summary="Optional — after your first still cut."
          defaultOpen={false}
          persistKey="mobile-day-animate"
        >
          <div className="grid gap-2">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void animateSlot(activeSlot)}
              className="w-full justify-center"
            >
              Animate slot
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void animateAllClips()}
              className="w-full justify-center"
            >
              Animate all
            </Button>
          </div>
        </CollapsibleSection>
      </div>

      <label className="block space-y-1.5 text-sm">
        <FieldLabel>Day notes</FieldLabel>
        <TextArea
          rows={2}
          value={toolSettings.notes ?? ''}
          placeholder="Optional notes for every slot"
          onChange={event => updateToolSettings({ notes: event.target.value })}
        />
      </label>

      <div className="space-y-2" data-testid="day-reel">
        <p className="type-caption text-[var(--text-muted)]">Day reel</p>
        <FilmWatchPlayer
          shots={sampleWatch ? sampleShots : watchPlaylist}
          emptyLabel="Queue slot stills, then Cut film."
        />
        {sampleWatch ? (
          <p className="type-caption text-[var(--text-muted)]" data-testid="day-sample-cut-hint">
            Sample reel — use demo stills or queue when Comfy is ready.
          </p>
        ) : null}
        {!firstCutCelebrate ? (
          <div className="grid gap-2">
            <PrimaryButton
              disabled={busy || assemblingFilm || completedShotCount === 0}
              loading={assemblingFilm}
              loadingLabel="Cutting film"
              onClick={() => void cutDayFilm()}
              className="w-full justify-center"
              data-testid="mobile-day-cut"
            >
              Cut film
            </PrimaryButton>
            <Button
              variant="ghost"
              className="w-full justify-center"
              data-testid="day-watch-sample-cut"
              onClick={() => setSampleWatch(prev => !prev)}
            >
              {sampleWatch ? 'Show my reel' : 'Watch sample cut'}
            </Button>
            {filmNeedsCast ? (
              <Button
                variant="secondary"
                disabled={busy || assemblingFilm}
                onClick={saveFilmToCast}
                className="w-full justify-center"
                data-testid="day-save-film-cast"
              >
                Save film to Cast
              </Button>
            ) : null}
            {character && filmStatus && !assemblingFilm ? (
              <>
                <Button
                  variant="secondary"
                  className="w-full justify-center"
                  data-testid="day-share-cut"
                  onClick={() => void shareLastCut()}
                >
                  Share cut
                </Button>
                <Button
                  variant="secondary"
                  className="w-full justify-center"
                  data-testid="day-remix-day"
                  onClick={remixSameLookDay}
                >
                  Same look, new Day
                </Button>
                <Link
                  href={toMobileStudioHref(
                    `/characters/${encodeURIComponent(character.id)}?media=films`
                  )}
                  className="ui-btn-primary w-full justify-center text-center text-sm"
                  data-testid="day-open-cast-film"
                  onClick={() => {
                    void import('@/lib/onboarding-hooks').then(
                      ({ markOnboardingWatchFirstFilm }) => {
                        markOnboardingWatchFirstFilm();
                      }
                    );
                  }}
                >
                  Watch / Save on Cast
                </Link>
              </>
            ) : null}
          </div>
        ) : null}
        {filmStatus ? <p className="type-caption text-[var(--text-muted)]">{filmStatus}</p> : null}
      </div>

      {!firstCutCelebrate && !softAdvance ? (
        <div className="grid gap-2">
          {character ? (
            <>
              <Link
                href={`/m/fitting?character=${encodeURIComponent(character.id)}${
                  fittingWardrobe ? `&wardrobe=${encodeURIComponent(fittingWardrobe)}` : ''
                }`}
                className="ui-btn-ghost w-full justify-center text-center text-sm"
              >
                Open Outfit
              </Link>
              <Link
                href={`/m/moodboard?character=${encodeURIComponent(character.id)}`}
                className="ui-btn-ghost w-full justify-center text-center text-sm"
              >
                Open Look
              </Link>
              <Link
                href="/m/play"
                className="ui-btn-ghost w-full justify-center text-center text-sm"
              >
                Optional: Story
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="space-y-2">
          <FieldError>{error}</FieldError>
          <div className="grid gap-2">
            <Button
              variant="primary"
              disabled={busy}
              data-testid="day-error-demo-stills"
              onClick={seedDemoStills}
              className="w-full justify-center"
            >
              Use demo stills
            </Button>
            <Button
              variant="secondary"
              data-testid="day-error-watch-sample"
              onClick={() => setSampleWatch(true)}
              className="w-full justify-center"
            >
              Watch sample cut
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              data-testid="day-error-retry-queue"
              onClick={() => void queueAll()}
              className="w-full justify-center"
            >
              Retry queue
            </Button>
            {playbookHref ? (
              <ButtonLink
                href={playbookHref}
                size="sm"
                variant="ghost"
                className="justify-center"
                data-testid="film-failure-playbook-link"
              >
                {resolveQueueFailureGuideLabel(playbookHref)}
              </ButtonLink>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
