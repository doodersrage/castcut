'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import CharacterOsPicker from '@/components/CharacterOsPicker';
import FilmWatchPlayer from '@/components/FilmWatchPlayer';
import PlaySoftAdvanceBanner, {
  type PlaySoftAdvanceTarget,
} from '@/components/PlaySoftAdvanceBanner';
import SharedToolControls from '@/components/SharedToolControls';
import { Button, ButtonLink, PrimaryButton } from '@/components/ui/Button';
import { ChipButton, FieldError, FieldLabel, SelectInput, TextArea } from '@/components/ui/Field';
import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';
import WardrobeKitPicker from '@/components/wardrobe/WardrobeKitPicker';
import DaySlotBoard from '@/components/day-planner/DaySlotBoard';
import type { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import { buildDayProgressLightboxState } from '@/lib/day-planner';
import { fittingSwipeNeighbor } from '@/lib/fitting-room';
import {
  resolveFilmFailurePlaybook,
  resolveQueueFailureGuideLabel,
} from '@/lib/queue-failure-playbook';
import { toMobileStudioHref } from '@/lib/mobile-studio';
import { welcomeSampleFilmShots } from '@/lib/welcome-sample-film';
import {
  countWardrobeOptionsForFilter,
  normalizeWardrobeCategoryFilter,
  wardrobeCategoryFilterOptions,
} from '@/lib/wardrobe-catalog-ui';
import { useWardrobeGarmentThumbManifestGeneration } from '@/hooks/useWardrobeGarmentThumbManifest';
import {
  buildWardrobeKitPickerDeck,
  resolveWardrobeGarmentThumbUrl,
} from '@/lib/wardrobe-garment-thumbs';
import { ISOLATE_QUEUE_BLOCKED_MESSAGE } from '@/lib/isolate-subject';
import {
  hasCompletedFirstFilm,
  loadPlayMetrics,
  PLAY_METRICS_UPDATED_EVENT,
} from '@/lib/play-metrics';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

const ImageLightbox = dynamic(() => import('@/components/ui/ImageLightbox'), {
  ssr: false,
  loading: () => null,
});

function subscribePlayMetrics(onStoreChange: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  window.addEventListener(PLAY_METRICS_UPDATED_EVENT, onStoreChange);
  return () => window.removeEventListener(PLAY_METRICS_UPDATED_EVENT, onStoreChange);
}

type ViewModel = ReturnType<typeof useDayPlannerToolOrchestration>;

export default function MobileDayToolSections(vm: ViewModel) {
  useWardrobeGarmentThumbManifestGeneration();
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
    plate,
    isolateSubject,
    isolatePending,
    isolateBusy,
    isolateStatus,
    platePreviewUrl,
    setIsolateSubject,
    wardrobeOptions,
    wardrobeReady,
    wardrobeCategoryFilter,
    filteredWardrobeOptions,
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
    leanChrome,
    goRoleplay,
  } = vm;

  const [sampleWatch, setSampleWatch] = useState(false);
  const [jumpInMode, setJumpInMode] = useState(false);
  const [progressLightbox, setProgressLightbox] = useState<ImageLightboxState | null>(null);
  const [softAdvance, setSoftAdvance] = useState<PlaySoftAdvanceTarget | null>(null);
  const postCutAdvanceRef = useRef(false);
  const sampleShots = useMemo(() => welcomeSampleFilmShots(), []);
  const wardrobeKitDeck = useMemo(
    () => buildWardrobeKitPickerDeck(filteredWardrobeOptions, activeSlot.wardrobeId),
    [activeSlot.wardrobeId, filteredWardrobeOptions]
  );
  const slotTotal = slots.length || 4;
  const collapseEditors =
    leanChrome && (jumpInMode || busy || assemblingFilm || completedShotCount > 0);
  const showCutCoach = completedShotCount > 0 && !firstCutCelebrate && !assemblingFilm;
  const queueBlocked = isolateSubject && isolatePending && hasPlate;
  const showDemoEscape = completedShotCount === 0;
  const showSampleEscape = watchPlaylist.length === 0;
  const setupDefaultOpen = !character || !hasPlate;
  const editDefaultOpen = !collapseEditors;
  const playbookHref =
    filmGuideHref ?? (error ? resolveFilmFailurePlaybook(error).href : undefined);
  const firstFilmDone = useSyncExternalStore(
    subscribePlayMetrics,
    () => hasCompletedFirstFilm(loadPlayMetrics()),
    () => false
  );
  const showFinalPass = leanChrome;
  const galleryFilmHref = character
    ? toMobileStudioHref(`/gallery?character=${encodeURIComponent(character.id)}&derivedKind=film`)
    : toMobileStudioHref('/gallery');
  const watchCastHref = character
    ? toMobileStudioHref(`/characters/${encodeURIComponent(character.id)}?media=films`)
    : toMobileStudioHref('/characters');

  useEffect(() => {
    if (!firstCutCelebrate || filmNeedsCast || !character) {
      if (!firstCutCelebrate) {
        postCutAdvanceRef.current = false;
      }
      return;
    }
    if (postCutAdvanceRef.current) {
      return;
    }
    postCutAdvanceRef.current = true;
    setSoftAdvance({
      href: watchCastHref,
      label: 'Watch',
      message: 'Opening your film on Cast',
      nonce: Date.now(),
    });
  }, [character, filmNeedsCast, firstCutCelebrate, watchCastHref]);

  const openProgressLightbox = useCallback(
    (slotId: string) => {
      const next = buildDayProgressLightboxState(slots, stills, slotId);
      if (!next) {
        return;
      }
      setProgressLightbox({
        images: next.images,
        titles: next.titles,
        originalImages: next.images,
        index: next.index,
        title: next.title,
      });
    },
    [slots, stills]
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    let cancelled = false;
    scheduleAfterCommit(() => {
      if (cancelled) {
        return;
      }
      const params = new URLSearchParams(window.location.search);
      setJumpInMode(
        params.get('starter') === '1' ||
          params.get('remix') === '1' ||
          params.get('autocut') === '1' ||
          params.get('autoqueue') === '1'
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4" data-testid="mobile-day">
      <div className="space-y-1">
        <h1 className="type-display text-2xl tracking-tight">Day</h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          Tap a time of day → Queue day → Cut film.
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
            {filmNeedsCast
              ? 'Save the cut to Cast first — then Watch or open Gallery.'
              : 'Watch on Cast, browse Gallery, or stay here to share / cut another Day.'}
          </p>
          <div className="mt-3 grid gap-2">
            {filmNeedsCast ? (
              <Button
                variant="primary"
                className="w-full justify-center"
                disabled={busy || assemblingFilm}
                onClick={saveFilmToCast}
                data-testid="day-save-film-cast"
              >
                Save film to Cast
              </Button>
            ) : null}
            {filmNeedsCast && !character ? (
              <Link
                href="/m"
                className="ui-btn-secondary w-full justify-center text-center text-sm"
                data-testid="day-pick-cast"
              >
                Pick Cast character
              </Link>
            ) : null}
            {character && !filmNeedsCast ? (
              <Link
                href={watchCastHref}
                className="ui-btn-primary w-full justify-center text-center text-sm"
                data-testid="day-first-cut-watch"
              >
                Watch on Cast
              </Link>
            ) : null}
            {character && !filmNeedsCast ? (
              <Link
                href={galleryFilmHref}
                className="ui-btn-secondary w-full justify-center text-center text-sm"
                data-testid="day-first-cut-gallery"
              >
                Open in Gallery
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
            {character ? (
              <Button
                variant="secondary"
                className="w-full justify-center"
                data-testid="day-first-cut-story"
                onClick={() => {
                  setSoftAdvance(null);
                  goRoleplay();
                }}
              >
                Story unlocked
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
                disabled={busy || queueBlocked}
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

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="type-caption text-[var(--text-muted)]">Day</p>
          <p className="type-caption text-[var(--accent-text)]">Editing {activeSlot.label}</p>
        </div>
        <DaySlotBoard
          slots={slots}
          stills={stills}
          activeSlotId={activeSlotId}
          busy={busy}
          queueBlocked={queueBlocked}
          compact
          onSelectSlot={setActiveSlotId}
          onOpenStill={openProgressLightbox}
          onRetrySlot={slot => void queueSlot(slot)}
          onAnimateSlot={slot => void animateSlot(slot)}
        />
      </div>

      {completedShotCount > 0 && !firstCutCelebrate ? (
        <div className="space-y-2" data-testid="day-animate">
          <p className="type-caption text-[var(--text-muted)]">
            Motion — animate stills before Cut for a clip reel.
          </p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void animateSlot(activeSlot)}
            className="w-full justify-center"
          >
            Animate {activeSlot.label.toLowerCase()}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void animateAllClips()}
            className="w-full justify-center"
          >
            Animate all ready stills
          </Button>
        </div>
      ) : null}

      <CollapsibleSection
        title={`Edit · ${activeSlot.label}`}
        summary="Kit, setting, beat — then Queue day."
        defaultOpen={editDefaultOpen}
        persistKey="mobile-day-slots-lean"
      >
        <div className="space-y-2" data-testid="day-slots">
          <label className="block space-y-1.5 text-sm">
            <FieldLabel>Outfit kit</FieldLabel>
            {wardrobeKitDeck.length > 0 ? (
              <WardrobeKitPicker
                kits={wardrobeKitDeck}
                selectedId={activeSlot.wardrobeId}
                disabled={!wardrobeReady || busy}
                size="sm"
                testId="mobile-day-wardrobe-kit-picker"
                onSelect={wardrobeId => updateSlot(activeSlot.id, { wardrobeId })}
                onSwipe={delta => {
                  const next = fittingSwipeNeighbor(wardrobeKitDeck, activeSlot.wardrobeId, delta);
                  if (next) {
                    updateSlot(activeSlot.id, { wardrobeId: next.id });
                  }
                }}
                resolveThumb={kit => ({
                  url: resolveWardrobeGarmentThumbUrl(kit.id),
                })}
              />
            ) : null}
            <CollapsibleSection
              title="Kit filters"
              summary="Clothing type and list."
              defaultOpen={false}
              persistKey="mobile-day-kit-filters"
              className="mt-2"
            >
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
              </label>
              <label className="mt-2 block space-y-1.5 text-sm">
                <FieldLabel>List picker</FieldLabel>
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
            </CollapsibleSection>
          </label>

          <label className="block space-y-1.5 text-sm">
            <FieldLabel>Setting</FieldLabel>
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
              rows={2}
              value={activeSlot.sceneHints ?? ''}
              placeholder="What happens in this part of the day?"
              onChange={event => updateSlot(activeSlot.id, { sceneHints: event.target.value })}
            />
          </label>

          <div className="grid gap-2">
            <PrimaryButton
              disabled={busy || queueBlocked}
              loading={busy}
              data-testid="day-queue-all"
              onClick={() => void queueAll()}
              className="w-full justify-center"
            >
              {leanChrome && !firstFilmDone && !firstCutCelebrate
                ? 'Queue day · draft'
                : 'Queue day'}
            </PrimaryButton>
            {showFinalPass ? (
              <Button
                variant="secondary"
                disabled={busy || queueBlocked}
                data-testid="day-queue-final"
                onClick={() => void queueAll({ qualityProfile: 'final' })}
                className="w-full justify-center"
              >
                Final pass
              </Button>
            ) : null}
            <Button
              variant="ghost"
              disabled={busy || queueBlocked}
              data-testid="day-slot-queue"
              onClick={() => void queueSlot(activeSlot)}
              className="w-full justify-center"
            >
              Queue {activeSlot.label.toLowerCase()} only
            </Button>
            {showDemoEscape ? (
              <Button
                variant="ghost"
                disabled={busy}
                data-testid="day-demo-stills"
                onClick={seedDemoStills}
                className="w-full justify-center"
              >
                Demo stills
              </Button>
            ) : null}
          </div>
          {leanChrome ? (
            <p className="type-caption text-[var(--text-muted)]" data-testid="day-draft-hint">
              {firstFilmDone || firstCutCelebrate
                ? 'Queue day uses final quality after your first cut.'
                : 'First film queues as draft — or tap Final pass.'}
            </p>
          ) : null}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Setup"
        summary={
          hasPlate ? `${character?.name?.trim() || 'Cast'} · plate ready` : 'Character and plate.'
        }
        defaultOpen={setupDefaultOpen}
        persistKey="mobile-day-setup-lean"
      >
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 p-3">
          <div data-testid="day-character">
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
          <p className="type-caption mt-2 text-[var(--text-muted)]">
            {hasPlate
              ? isolateSubject && isolatePending
                ? 'Isolating plate on white…'
                : 'Plate ready.'
              : 'No plate — Keep in Outfit or add a Cast look.'}
          </p>
          {hasPlate ? (
            <div className="mt-2">
              <ChipButton
                active={isolateSubject}
                disabled={busy || isolateBusy || !hasPlate}
                data-testid="day-plate-isolate"
                onClick={() => setIsolateSubject(!isolateSubject)}
              >
                Isolate on white
              </ChipButton>
              {isolateStatus ? (
                <p
                  className="type-caption mt-2 text-[var(--text-muted)]"
                  data-testid="day-plate-isolate-status"
                >
                  {isolateStatus}
                </p>
              ) : null}
            </div>
          ) : null}
          {platePreviewUrl || plate?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={platePreviewUrl || plate?.imageUrl}
              alt="Day plate"
              className="mt-3 max-h-48 w-full rounded-xl border border-[var(--border-subtle)] object-contain"
              data-testid="mobile-day-plate-preview"
              data-source={plate?.source}
              data-isolated={plate?.isolated === true ? 'true' : 'false'}
            />
          ) : null}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Advanced"
        summary="Day-wide notes."
        defaultOpen={false}
        persistKey="mobile-day-advanced"
      >
        <label className="block space-y-1.5 text-sm">
          <FieldLabel>Day notes</FieldLabel>
          <TextArea
            rows={2}
            value={toolSettings.notes ?? ''}
            placeholder="Optional notes for every slot"
            onChange={event => updateToolSettings({ notes: event.target.value })}
          />
        </label>
      </CollapsibleSection>

      <CollapsibleSection
        title="Engine"
        summary="Model, detail, and workflow."
        defaultOpen={false}
        persistKey="mobile-day-engine"
      >
        <div data-testid="mobile-day-engine">
          <SharedToolControls
            shared={shared}
            onModelChange={model => updateShared({ model })}
            onDetailChange={detail => updateShared({ detail })}
            onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
            showWardrobeOption={false}
            seedLlmWithIngredients={false}
            autoFixRules={shared.autoFixRules !== false}
            onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
            recommendFromText=""
            toolId="day"
            preferEditModels={hasPlate}
            onSharedSettingsChange={updateShared}
            variant="roleplay"
          />
        </div>
      </CollapsibleSection>

      <div className="space-y-2" data-testid="day-reel">
        <p className="type-caption text-[var(--text-muted)]">Day reel</p>
        <FilmWatchPlayer
          shots={sampleWatch ? sampleShots : watchPlaylist}
          emptyLabel="Queue day, then Cut film."
        />
        {sampleWatch ? (
          <p className="type-caption text-[var(--text-muted)]" data-testid="day-sample-cut-hint">
            Sample reel — queue your own Day when Comfy is ready.
          </p>
        ) : null}
        {firstCutCelebrate ? (
          <p
            className="type-caption text-[var(--text-muted)]"
            data-testid="day-reel-celebrate-hint"
          >
            Use Save / Watch above when you are ready — the reel stays here to replay.
          </p>
        ) : null}
        {!firstCutCelebrate ? (
          <div className="grid gap-2">
            {!showCutCoach ? (
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
            ) : null}
            {showSampleEscape ? (
              <Button
                variant="ghost"
                className="w-full justify-center"
                data-testid="day-watch-sample-cut"
                onClick={() => setSampleWatch(prev => !prev)}
              >
                {sampleWatch ? 'Show my reel' : 'Watch sample cut'}
              </Button>
            ) : null}
          </div>
        ) : null}
        {filmStatus && !firstCutCelebrate ? (
          <CollapsibleSection
            title="After cut"
            summary="Save, share, remix, Cast."
            defaultOpen={false}
            persistKey="mobile-day-after-cut"
          >
            <div className="grid gap-2">
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
              {character && !assemblingFilm ? (
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
                  >
                    Watch on Cast
                  </Link>
                </>
              ) : null}
            </div>
          </CollapsibleSection>
        ) : null}
        {filmStatus ? <p className="type-caption text-[var(--text-muted)]">{filmStatus}</p> : null}
      </div>

      {!firstCutCelebrate ? (
        leanChrome ? (
          <CollapsibleSection
            title="More"
            summary="Outfit, Look, Story"
            defaultOpen={false}
            persistKey="mobile-day-more-links"
          >
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
                </>
              ) : null}
              <Button
                variant="secondary"
                className="w-full justify-center"
                disabled={busy}
                data-testid="day-after-cut-story"
                onClick={goRoleplay}
              >
                Story unlocked
              </Button>
            </div>
          </CollapsibleSection>
        ) : (
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
                {firstFilmDone ? (
                  <Button
                    variant="secondary"
                    className="w-full justify-center"
                    onClick={goRoleplay}
                    data-testid="mobile-day-story"
                  >
                    Story unlocked
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        )
      ) : null}

      {queueBlocked && !error ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="day-isolate-blocked">
          {ISOLATE_QUEUE_BLOCKED_MESSAGE}
        </p>
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
      <ImageLightbox
        state={progressLightbox}
        onClose={() => setProgressLightbox(null)}
        onIndexChange={index =>
          setProgressLightbox(previous =>
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
    </div>
  );
}
