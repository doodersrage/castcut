'use client';

import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import ScenePromptResultPanel from '@/components/scene-tool/ScenePromptResultPanel';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FieldError, FieldLabel, SelectInput, TextArea } from '@/components/ui/Field';
import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
import {
  CollapsibleSection,
  ToolActionRow,
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import WardrobeKitPicker from '@/components/wardrobe/WardrobeKitPicker';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { resolveQueueFailureGuideLabel } from '@/lib/queue-failure-playbook';
import { ROLEPLAY_SETTING_PRESETS } from '@/lib/roleplay';
import {
  countWardrobeOptionsForFilter,
  normalizeWardrobeCategoryFilter,
  wardrobeCategoryFilterOptions,
} from '@/lib/wardrobe-catalog-ui';
import {
  buildWardrobeKitPickerDeck,
  resolveWardrobeGarmentThumbUrl,
} from '@/lib/wardrobe-garment-thumbs';
import { fittingSwipeNeighbor } from '@/lib/fitting-room';
import { buildDayProgressLightboxState } from '@/lib/day-planner';
import type { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import { useWardrobeGarmentThumbManifestGeneration } from '@/hooks/useWardrobeGarmentThumbManifest';
import { welcomeSampleFilmShots } from '@/lib/welcome-sample-film';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import FilmWatchPlayer from '@/components/FilmWatchPlayer';
import CharacterOsPicker from '@/components/CharacterOsPicker';
import DayPlateSection from '@/components/day-planner/DayPlateSection';
import DayPlayPhaseStrip from '@/components/day-planner/DayPlayPhaseStrip';
import DaySlotBoard from '@/components/day-planner/DaySlotBoard';
import PlaySoftAdvanceBanner from '@/components/PlaySoftAdvanceBanner';
import PlayFilmFunnelChrome from '@/components/PlayFilmFunnelChrome';
import PlayFilmEngineBanner from '@/components/PlayFilmEngineBanner';
import { usePlaySoftAdvance } from '@/hooks/usePlaySoftAdvance';
import { ISOLATE_QUEUE_BLOCKED_MESSAGE } from '@/lib/isolate-subject';
import {
  hasCompletedFirstFilm,
  loadPlayMetrics,
  PLAY_METRICS_UPDATED_EVENT,
} from '@/lib/play-metrics';
import { deriveDayPhase } from '@/lib/play-step-machine';

const ImageLightbox = dynamic(() => import('@/components/ui/ImageLightbox'), {
  ssr: false,
  loading: () => null,
});

const ACCENT = 'teal' as const;
const TOOL_ID = 'day' as const;

function subscribePlayMetrics(onStoreChange: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  window.addEventListener(PLAY_METRICS_UPDATED_EVENT, onStoreChange);
  return () => window.removeEventListener(PLAY_METRICS_UPDATED_EVENT, onStoreChange);
}

type ViewModel = ReturnType<typeof useDayPlannerToolOrchestration>;
type Props = ViewModel & { description: string };

export default function DayPlannerToolSections({ description, ...vm }: Props) {
  useWardrobeGarmentThumbManifestGeneration();
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
    selectedModel,
    plate,
    hasPlate,
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
    wardrobeKitCount,
    actions,
    updateSlot,
    queueSlot,
    queueAll,
    animateSlot,
    animateAllClips,
    cutDayFilm,
    saveFilmToCast,
    goRoleplay,
    completedShotCount,
    fittingWardrobe,
    leanChrome,
    seedDemoStills,
    firstCutCelebrate,
    shareLastCut,
    remixSameLookDay,
  } = vm;
  const [sampleWatch, setSampleWatch] = useState(false);
  const [jumpInMode, setJumpInMode] = useState(false);
  const [progressLightbox, setProgressLightbox] = useState<ImageLightboxState | null>(null);
  const { softAdvance, cancelSoftAdvance, softAdvanceTo } = usePlaySoftAdvance();
  const postCutAdvanceRef = useRef(false);
  const sampleShots = useMemo(() => welcomeSampleFilmShots(), []);
  const wardrobeKitDeck = useMemo(
    () => buildWardrobeKitPickerDeck(filteredWardrobeOptions, activeSlot.wardrobeId),
    [activeSlot.wardrobeId, filteredWardrobeOptions]
  );
  const slotTotal = slots.length || 4;
  const completedClipCount = useMemo(
    () =>
      stills.filter(entry => entry.clipStatus === 'completed' && Boolean(entry.clipUrl?.trim()))
        .length,
    [stills]
  );
  const collapseEditors =
    leanChrome && (jumpInMode || busy || assemblingFilm || completedShotCount > 0);
  const showCutCoach = completedShotCount > 0 && !firstCutCelebrate && !assemblingFilm;
  const queueBlocked = isolateSubject && isolatePending && hasPlate;
  const showReelCut = !showCutCoach && !firstCutCelebrate;
  const showDemoEscape = completedShotCount === 0;
  const showSampleEscape = watchPlaylist.length === 0;
  const setupDefaultOpen = !character || !hasPlate;
  const editDefaultOpen = !collapseEditors;
  const firstFilmDone = useSyncExternalStore(
    subscribePlayMetrics,
    () => hasCompletedFirstFilm(loadPlayMetrics()),
    () => false
  );
  const dayPhase = deriveDayPhase({
    completedStills: completedShotCount,
    completedClips: completedClipCount,
    firstFilmDone,
    filmNeedsCast,
    campaignCompleted: firstCutCelebrate || firstFilmDone,
  });
  const showFinalPass = leanChrome;
  const galleryFilmHref = character
    ? `/gallery?character=${encodeURIComponent(character.id)}&derivedKind=film`
    : '/gallery';
  const watchCastHref = character
    ? `/characters/${encodeURIComponent(character.id)}?media=films`
    : '/characters';

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
    softAdvanceTo('watch', {
      characterId: character.id,
      href: watchCastHref,
      message: 'Opening your film on Cast',
    });
  }, [character, filmNeedsCast, firstCutCelebrate, softAdvanceTo, watchCastHref]);

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

  const engineControls = (
    <SharedToolControls
      shared={shared}
      onModelChange={model => updateShared({ model })}
      onDetailChange={detail => updateShared({ detail })}
      onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
      showWardrobeOption={false}
      seedLlmWithIngredients={false}
      autoFixRules={shared.autoFixRules !== false}
      onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
      recommendFromText={output}
      toolId={TOOL_ID}
      preferEditModels={hasPlate}
      onSharedSettingsChange={updateShared}
      variant="roleplay"
    />
  );
  return (
    <>
      <ToolLayout
        accent={ACCENT}
        badge={<ToolBadge accent={ACCENT}>Day · {selectedModel?.comfyNode ?? 'model'}</ToolBadge>}
        title="Day"
        description={description}
        sidebarPersistKey="day"
        sidebar={engineControls}
        sidebarTitle={leanChrome ? false : undefined}
      >
        <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.day} />
        <PlayFilmEngineBanner />
        <PlayFilmFunnelChrome />
        <PlaySoftAdvanceBanner
          key={softAdvance?.nonce ?? 'idle'}
          target={softAdvance}
          onCancel={cancelSoftAdvance}
        />
        {!firstCutCelebrate ? (
          <div className="mb-3">
            <DayPlayPhaseStrip
              activePhase={dayPhase ?? 'queue'}
              completedStills={completedShotCount}
              completedClips={completedClipCount}
              slotTotal={slotTotal}
            />
          </div>
        ) : null}
        {firstCutCelebrate ? (
          <div
            className="rounded-[var(--radius-lg)] border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] px-4 py-3"
            data-testid="day-first-cut-celebrate"
          >
            <p className="type-overline text-[var(--tint-success-text)]">First film</p>
            <p className="type-heading mt-1 text-[var(--text-primary)]">You cut your first reel</p>
            <p className="type-caption mt-1 text-[var(--text-muted)]">
              {filmNeedsCast
                ? 'Save the cut to Cast first — then Watch or open Gallery.'
                : 'Watch on Cast, browse Gallery, or extend this character’s film with Story.'}
            </p>
            <ToolActionRow className="mt-3">
              {filmNeedsCast ? (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy || assemblingFilm}
                  onClick={saveFilmToCast}
                  data-testid="day-save-film-cast"
                >
                  Save film to Cast
                </Button>
              ) : null}
              {filmNeedsCast && !character ? (
                <ButtonLink
                  href="/characters"
                  size="sm"
                  variant="secondary"
                  data-testid="day-pick-cast"
                >
                  Pick Cast character
                </ButtonLink>
              ) : null}
              {character && !filmNeedsCast ? (
                <ButtonLink
                  href={watchCastHref}
                  size="sm"
                  variant="primary"
                  data-testid="day-first-cut-watch"
                >
                  Watch on Cast
                </ButtonLink>
              ) : null}
              {character && !filmNeedsCast ? (
                <ButtonLink
                  href={galleryFilmHref}
                  size="sm"
                  variant="secondary"
                  data-testid="day-first-cut-gallery"
                >
                  Open in Gallery
                </ButtonLink>
              ) : null}
              <Button
                size="sm"
                variant="secondary"
                data-testid="day-first-cut-share"
                onClick={() => void shareLastCut()}
              >
                Share cut
              </Button>
              {character ? (
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid="day-first-cut-remix"
                  onClick={remixSameLookDay}
                >
                  Same look, new Day
                </Button>
              ) : null}
              {character ? (
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid="day-first-cut-story"
                  onClick={() => {
                    cancelSoftAdvance();
                    goRoleplay();
                  }}
                >
                  Story unlocked
                </Button>
              ) : null}
            </ToolActionRow>
            {character ? (
              <p
                className="type-caption mt-2 text-[var(--text-muted)]"
                data-testid="day-story-unlock-hint"
              >
                Story is unlocked — optional beats that continue this character’s film.
              </p>
            ) : null}
          </div>
        ) : null}

        {showCutCoach ? (
          <div
            className="sticky top-20 z-30 rounded-[var(--radius-lg)] border border-[var(--accent-border)] bg-[var(--bg-elevated)] px-4 py-3 shadow-[var(--shadow-card)]"
            data-testid="day-cut-coach"
            role="status"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="type-overline text-[var(--accent-text)]">Ready to cut</p>
                <p className="type-heading text-[var(--text-primary)]">
                  Cut film · {completedShotCount} of {slotTotal}
                </p>
                <p className="type-caption text-[var(--text-muted)]">
                  {completedShotCount < slotTotal
                    ? 'Cut with what you have, or wait for the rest of the day.'
                    : 'All stills ready — cut the reel.'}
                </p>
              </div>
              <ToolActionRow>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy || assemblingFilm}
                  data-testid="day-cut-coach-cut"
                  onClick={() => void cutDayFilm()}
                >
                  {assemblingFilm ? 'Cutting…' : 'Cut film'}
                </Button>
                {completedShotCount < slotTotal ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    data-testid="day-cut-coach-queue"
                    onClick={() => void queueAll()}
                  >
                    Queue rest
                  </Button>
                ) : null}
              </ToolActionRow>
            </div>
          </div>
        ) : null}

        <ToolSection
          title="Day"
          description="Tap a time of day to edit it. Finished stills open the next slot."
          data-testid="day-slot-board"
        >
          <DaySlotBoard
            slots={slots}
            stills={stills}
            activeSlotId={activeSlotId}
            busy={busy}
            queueBlocked={queueBlocked}
            onSelectSlot={setActiveSlotId}
            onOpenStill={openProgressLightbox}
            onRetrySlot={slot => void queueSlot(slot)}
            onAnimateSlot={slot => void animateSlot(slot)}
          />
        </ToolSection>

        {completedShotCount > 0 && !firstCutCelebrate ? (
          <ToolSection
            title="Motion"
            description="Animate stills into clips before Cut — motion reels prefer clips."
            data-testid="day-animate"
          >
            <ToolActionRow>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void animateSlot(activeSlot)}
              >
                Animate {activeSlot.label.toLowerCase()}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void animateAllClips()}
              >
                Animate all ready stills
              </Button>
            </ToolActionRow>
            <p className="type-caption mt-2 text-[var(--text-muted)]">
              Queue stills first, then Animate — Cut after clips land for a motion reel.
            </p>
          </ToolSection>
        ) : null}

        <CollapsibleSection
          title={`Edit · ${activeSlot.label}`}
          summary="Kit, setting, and beat — then Queue day."
          defaultOpen={editDefaultOpen}
          persistKey="day-slots-lean"
        >
          <div data-testid="day-slots">
            <label className="space-y-2">
              <FieldLabel>Outfit kit</FieldLabel>
              {wardrobeKitDeck.length > 0 ? (
                <WardrobeKitPicker
                  kits={wardrobeKitDeck}
                  selectedId={activeSlot.wardrobeId}
                  disabled={!wardrobeReady || busy}
                  testId="day-wardrobe-kit-picker"
                  onSelect={wardrobeId => updateSlot(activeSlot.id, { wardrobeId })}
                  onSwipe={delta => {
                    const next = fittingSwipeNeighbor(
                      wardrobeKitDeck,
                      activeSlot.wardrobeId,
                      delta
                    );
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
                summary="Clothing type and list picker."
                defaultOpen={false}
                persistKey="day-kit-filters"
                className="mt-3"
              >
                <label className="space-y-2">
                  <FieldLabel>Clothing type</FieldLabel>
                  <SelectInput
                    value={wardrobeCategoryFilter}
                    disabled={!wardrobeReady || busy}
                    className={accentFocusClass(ACCENT)}
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
                      Showing {wardrobeKitCount} kit{wardrobeKitCount === 1 ? '' : 's'} for{' '}
                      {activeSlot.label.toLowerCase()}.
                    </p>
                  ) : null}
                </label>
                <label className="mt-3 space-y-2">
                  <FieldLabel>List picker</FieldLabel>
                  <SelectInput
                    value={activeSlot.wardrobeId ?? ''}
                    disabled={!wardrobeReady || busy}
                    className={accentFocusClass(ACCENT)}
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
            <label className="mt-3 space-y-2">
              <FieldLabel>Setting</FieldLabel>
              <TextArea
                rows={2}
                data-testid="day-slot-location"
                value={activeSlot.location ?? ''}
                className={accentFocusClass(ACCENT)}
                placeholder="e.g. sunlit café terrace, rainy commute, rooftop at dusk"
                onChange={event => updateSlot(activeSlot.id, { location: event.target.value })}
              />
              <CollapsibleSection
                title="Setting presets"
                summary="Insert a canned location."
                defaultOpen={false}
                persistKey="day-setting-presets"
              >
                <SelectInput
                  value=""
                  disabled={busy}
                  className={accentFocusClass(ACCENT)}
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
              </CollapsibleSection>
            </label>
            <label className="mt-3 space-y-2">
              <FieldLabel>Beat</FieldLabel>
              <TextArea
                rows={2}
                value={activeSlot.sceneHints ?? ''}
                className={accentFocusClass(ACCENT)}
                placeholder="What happens in this part of the day?"
                onChange={event => updateSlot(activeSlot.id, { sceneHints: event.target.value })}
              />
            </label>
            <ToolActionRow>
              <Button
                size="sm"
                variant="primary"
                disabled={busy || queueBlocked}
                data-testid="day-queue-all"
                onClick={() => void queueAll()}
              >
                {busy
                  ? 'Queueing…'
                  : leanChrome && !firstFilmDone && !firstCutCelebrate
                    ? 'Queue day · draft'
                    : 'Queue day'}
              </Button>
              {showFinalPass ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || queueBlocked}
                  data-testid="day-queue-final"
                  onClick={() => void queueAll({ qualityProfile: 'final' })}
                >
                  Final pass
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || queueBlocked}
                data-testid="day-slot-queue"
                onClick={() => void queueSlot(activeSlot)}
              >
                Queue {activeSlot.label.toLowerCase()} only
              </Button>
              {showDemoEscape ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  data-testid="day-demo-stills"
                  onClick={seedDemoStills}
                >
                  Demo stills
                </Button>
              ) : null}
            </ToolActionRow>
            {leanChrome ? (
              <p
                className="type-caption mt-2 text-[var(--text-muted)]"
                data-testid="day-draft-hint"
              >
                {firstFilmDone || firstCutCelebrate
                  ? 'Queue day uses final quality after your first cut — Final pass re-queues all four. Model & workflow live in Engine.'
                  : 'First film queues as draft for speed — or tap Final pass. Model & workflow live in Engine.'}
              </p>
            ) : null}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Setup"
          summary={
            hasPlate
              ? `${character?.name?.trim() || 'Cast'} · plate ready`
              : 'Character and plate for identity.'
          }
          defaultOpen={setupDefaultOpen}
          persistKey="day-setup-lean"
          className="day-character-section"
        >
          <div data-testid="day-character" className="space-y-4">
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
            <DayPlateSection
              plate={plate}
              platePreviewUrl={platePreviewUrl}
              characterId={shared.activeCharacterId}
              lockedWardrobeId={activeSlot.wardrobeId || shared.lockedWardrobeId}
              busy={busy}
              isolateSubject={isolateSubject}
              isolateBusy={isolateBusy}
              isolateStatus={isolateStatus}
              isolatePending={isolatePending}
              onIsolateSubjectChange={setIsolateSubject}
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Advanced"
          summary="Day-wide notes."
          defaultOpen={false}
          persistKey="day-advanced"
        >
          <div className="space-y-3">
            <label className="block space-y-2">
              <FieldLabel>Day notes</FieldLabel>
              <TextArea
                rows={2}
                value={toolSettings.notes ?? ''}
                className={accentFocusClass(ACCENT)}
                placeholder="e.g. cozy autumn day, light rain in the evening"
                onChange={event => updateToolSettings({ notes: event.target.value })}
              />
            </label>
          </div>
        </CollapsibleSection>

        <ToolSection
          title="Day reel"
          description={
            showCutCoach
              ? 'Cut from the banner above when you are ready.'
              : 'Preview stills here, then Cut film.'
          }
          data-testid="day-reel"
        >
          <FilmWatchPlayer
            shots={sampleWatch ? sampleShots : watchPlaylist}
            emptyLabel="Queue the day — Morning through Night fill in here."
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
          {showReelCut ? (
            <ToolActionRow>
              <Button
                size="sm"
                variant="primary"
                disabled={busy || assemblingFilm || completedShotCount === 0}
                onClick={() => void cutDayFilm()}
              >
                {assemblingFilm ? 'Cutting…' : 'Cut film'}
              </Button>
              {showSampleEscape ? (
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="day-watch-sample-cut"
                  onClick={() => setSampleWatch(prev => !prev)}
                >
                  {sampleWatch ? 'Show my reel' : 'Watch sample cut'}
                </Button>
              ) : null}
            </ToolActionRow>
          ) : null}
          {filmStatus && !firstCutCelebrate ? (
            <CollapsibleSection
              title="After cut"
              summary="Save, share, remix, Gallery, or Cast."
              defaultOpen
              persistKey="day-after-cut"
              className="mt-3"
            >
              <ToolActionRow>
                {filmNeedsCast ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy || assemblingFilm}
                    onClick={saveFilmToCast}
                    data-testid="day-save-film-cast"
                  >
                    Save film to Cast
                  </Button>
                ) : null}
                {filmNeedsCast && !character ? (
                  <ButtonLink
                    href="/characters"
                    size="sm"
                    variant="secondary"
                    data-testid="day-pick-cast"
                  >
                    Pick Cast character
                  </ButtonLink>
                ) : null}
                {character && !assemblingFilm ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    data-testid="day-share-cut"
                    onClick={() => void shareLastCut()}
                  >
                    Share cut
                  </Button>
                ) : null}
                {character && !assemblingFilm ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    data-testid="day-remix-day"
                    onClick={remixSameLookDay}
                  >
                    Same look, new Day
                  </Button>
                ) : null}
                {character && !assemblingFilm ? (
                  <ButtonLink
                    href={`/characters/${encodeURIComponent(character.id)}?media=films`}
                    size="sm"
                    variant="primary"
                    data-testid="day-open-cast-film"
                  >
                    Watch on Cast
                  </ButtonLink>
                ) : null}
                {character && completedShotCount > 0 ? (
                  <ButtonLink
                    href={
                      filmStatus
                        ? `/gallery?character=${encodeURIComponent(character.id)}&derivedKind=film`
                        : `/gallery?character=${encodeURIComponent(character.id)}`
                    }
                    size="sm"
                    variant="ghost"
                    data-testid="day-open-gallery"
                  >
                    Open in Gallery
                  </ButtonLink>
                ) : null}
                {character && !assemblingFilm ? (
                  <ButtonLink
                    href={`/play?character=${encodeURIComponent(character.id)}`}
                    size="sm"
                    variant="ghost"
                    data-testid="day-campaign-complete"
                  >
                    Back to Play
                  </ButtonLink>
                ) : null}
              </ToolActionRow>
            </CollapsibleSection>
          ) : null}
          {filmStatus ? (
            <p className="type-caption text-[var(--text-muted)]">{filmStatus}</p>
          ) : null}
        </ToolSection>

        {!firstCutCelebrate ? (
          leanChrome ? (
            <CollapsibleSection
              title="More"
              summary="Outfit, Look, Story"
              defaultOpen={false}
              persistKey="day-more-links"
            >
              <ToolActionRow>
                {character ? (
                  <>
                    <ButtonLink
                      href={`/fitting?character=${encodeURIComponent(character.id)}${
                        fittingWardrobe ? `&wardrobe=${encodeURIComponent(fittingWardrobe)}` : ''
                      }`}
                      size="sm"
                      variant="ghost"
                    >
                      Open Outfit
                    </ButtonLink>
                    <ButtonLink
                      href={`/moodboard?character=${encodeURIComponent(character.id)}`}
                      size="sm"
                      variant="ghost"
                    >
                      Open Look
                    </ButtonLink>
                  </>
                ) : null}
                <Button size="sm" variant="ghost" disabled={busy} onClick={goRoleplay}>
                  Optional: Story
                </Button>
              </ToolActionRow>
            </CollapsibleSection>
          ) : (
            <ToolActionRow>
              {character ? (
                <>
                  <ButtonLink
                    href={`/fitting?character=${encodeURIComponent(character.id)}${
                      fittingWardrobe ? `&wardrobe=${encodeURIComponent(fittingWardrobe)}` : ''
                    }`}
                    size="sm"
                    variant="ghost"
                  >
                    Open Outfit
                  </ButtonLink>
                  <ButtonLink
                    href={`/moodboard?character=${encodeURIComponent(character.id)}`}
                    size="sm"
                    variant="ghost"
                  >
                    Open Look
                  </ButtonLink>
                </>
              ) : null}
              <Button size="sm" variant="ghost" disabled={busy} onClick={goRoleplay}>
                Optional: Story
              </Button>
            </ToolActionRow>
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
            <ToolActionRow>
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                data-testid="day-error-demo-stills"
                onClick={seedDemoStills}
              >
                Use demo stills
              </Button>
              <Button
                size="sm"
                variant="secondary"
                data-testid="day-error-watch-sample"
                onClick={() => setSampleWatch(true)}
              >
                Watch sample cut
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                data-testid="day-error-retry-queue"
                onClick={() => void queueAll()}
              >
                Retry queue
              </Button>
              {filmGuideHref ? (
                <ButtonLink
                  href={filmGuideHref}
                  size="sm"
                  variant="ghost"
                  data-testid="film-failure-playbook-link"
                >
                  {resolveQueueFailureGuideLabel(filmGuideHref)}
                </ButtonLink>
              ) : null}
            </ToolActionRow>
          </div>
        ) : null}

        {!leanChrome ? (
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
            queueLabel="Queue slot"
            onSendComfyUi={() => void queueSlot(activeSlot)}
          />
        ) : null}
      </ToolLayout>
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
    </>
  );
}
