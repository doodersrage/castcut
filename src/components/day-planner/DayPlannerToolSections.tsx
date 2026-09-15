'use client';

import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import ScenePromptResultPanel from '@/components/scene-tool/ScenePromptResultPanel';
import { Button, ButtonLink } from '@/components/ui/Button';
import {
  ChipButton,
  FieldDivider,
  FieldError,
  FieldLabel,
  SelectInput,
  TextArea,
} from '@/components/ui/Field';
import {
  CollapsibleSection,
  ToolActionRow,
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { resolveQueueFailureGuideLabel } from '@/lib/queue-failure-playbook';
import { ROLEPLAY_SETTING_PRESETS } from '@/lib/roleplay';
import {
  countWardrobeOptionsForFilter,
  filterWardrobeSelectOptions,
  normalizeWardrobeCategoryFilter,
  wardrobeCategoryFilterOptions,
} from '@/lib/wardrobe-catalog-ui';
import type { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import { welcomeSampleFilmShots } from '@/lib/welcome-sample-film';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { useEffect, useMemo, useState } from 'react';
import FilmWatchPlayer from '@/components/FilmWatchPlayer';
import CharacterOsPicker from '@/components/CharacterOsPicker';
import PlaySoftAdvanceBanner, {
  type PlaySoftAdvanceTarget,
} from '@/components/PlaySoftAdvanceBanner';
const ACCENT = 'teal' as const;
const TOOL_ID = 'day' as const;

type ViewModel = ReturnType<typeof useDayPlannerToolOrchestration>;
type Props = ViewModel & { description: string };

export default function DayPlannerToolSections({ description, ...vm }: Props) {
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
    hasPlate,
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
  const [softAdvance, setSoftAdvance] = useState<PlaySoftAdvanceTarget | null>(null);
  const [jumpInMode, setJumpInMode] = useState(false);
  const sampleShots = useMemo(() => welcomeSampleFilmShots(), []);
  const slotTotal = slots.length || 4;
  const collapseEditors =
    leanChrome && (jumpInMode || busy || assemblingFilm || completedShotCount > 0);
  const showCutCoach = completedShotCount > 0 && !firstCutCelebrate && !assemblingFilm;

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
        href: `/characters/${encodeURIComponent(character.id)}?media=films`,
        label: 'Watch on Cast',
        nonce: Date.now(),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [firstCutCelebrate, character?.id]);

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
      onSharedSettingsChange={updateShared}
      variant="roleplay"
    />
  );
  return (
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
      <PlaySoftAdvanceBanner
        key={softAdvance?.nonce ?? 'idle'}
        target={softAdvance}
        onCancel={() => setSoftAdvance(null)}
      />
      {firstCutCelebrate ? (
        <div
          className="rounded-[var(--radius-lg)] border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] px-4 py-3"
          data-testid="day-first-cut-celebrate"
        >
          <p className="type-overline text-[var(--tint-success-text)]">First film</p>
          <p className="type-heading mt-1 text-[var(--text-primary)]">You cut your first reel</p>
          <p className="type-caption mt-1 text-[var(--text-muted)]">
            Watch on Cast is next — share the cut or queue another Day with the same look.
          </p>
          <ToolActionRow className="mt-3">
            {character ? (
              <ButtonLink
                href={`/characters/${encodeURIComponent(character.id)}?media=films`}
                size="sm"
                variant="primary"
                data-testid="day-first-cut-watch"
                onClick={() => {
                  setSoftAdvance(null);
                  void import('@/lib/onboarding-hooks').then(({ markOnboardingWatchFirstFilm }) => {
                    markOnboardingWatchFirstFilm();
                  });
                }}
              >
                Watch on Cast
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
              <ButtonLink
                href={`/roleplay?character=${encodeURIComponent(character.id)}`}
                size="sm"
                variant="ghost"
                data-testid="day-first-cut-story"
              >
                Optional: Story
              </ButtonLink>
            ) : null}
          </ToolActionRow>
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

      <CollapsibleSection
        title="Character"
        summary="Cast lead for Look, Outfit, and Story."
        defaultOpen={!collapseEditors}
        persistKey="day-character-lean"
        className="day-character-section"
      >
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
          {hasPlate ? (
            <p className="type-caption mt-2 text-[var(--text-muted)]">
              Cast plate detected — queues use identity lock when available.
            </p>
          ) : (
            <p className="type-caption mt-2 text-[var(--text-muted)]">
              No Cast plate yet — stills queue as text scenes. Add a look in Cast or open Outfit.
            </p>
          )}
        </div>
      </CollapsibleSection>

      <ToolSection
        title="Day progress"
        description="Stay here while jobs run — slots fill as stills complete."
        data-testid="day-progress"
      >
        <ol className="grid gap-2 sm:grid-cols-4">
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
                  'overflow-hidden rounded-[var(--radius-md)] border',
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
                <div className="px-3 py-2">
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
                      Retry {slot.label}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </ToolSection>

      <CollapsibleSection
        title="Day slots"
        summary="Morning → night. Kit, setting, and beat per slot."
        defaultOpen={!collapseEditors}
        persistKey="day-slots-lean"
      >
        <div data-testid="day-slots">
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
              const status = `${stillStatus}${clipStatus}`;
              return (
                <ChipButton
                  key={slot.id}
                  active={activeSlotId === slot.id}
                  disabled={busy}
                  onClick={() => setActiveSlotId(slot.id)}
                >
                  {slot.label}
                  {status}
                </ChipButton>
              );
            })}
          </div>
          <FieldDivider />
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
            <FieldLabel>Outfit kit</FieldLabel>
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
          <label className="mt-3 space-y-2">
            <FieldLabel>Setting</FieldLabel>
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
            <TextArea
              rows={2}
              data-testid="day-slot-location"
              value={activeSlot.location ?? ''}
              className={accentFocusClass(ACCENT)}
              placeholder="e.g. sunlit café terrace, rainy commute, rooftop at dusk"
              onChange={event => updateSlot(activeSlot.id, { location: event.target.value })}
            />
          </label>
          <label className="mt-3 space-y-2">
            <FieldLabel>Beat</FieldLabel>
            <TextArea
              rows={3}
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
              disabled={busy}
              data-testid="day-slot-queue"
              onClick={() => void queueSlot(activeSlot)}
            >
              {busy ? 'Queueing…' : `Queue ${activeSlot.label.toLowerCase()}`}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              data-testid="day-queue-all"
              onClick={() => void queueAll()}
            >
              Queue day
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              data-testid="day-demo-stills"
              onClick={seedDemoStills}
            >
              Use demo stills
            </Button>
          </ToolActionRow>
          {leanChrome ? (
            <p className="type-caption text-[var(--text-muted)]" data-testid="day-draft-hint">
              Play queues draft stills for a faster first film. Animate clips (Final quality) after
              you&apos;ve cut once — open Animate below anytime.
            </p>
          ) : null}
          <CollapsibleSection
            title="Animate clips"
            summary={
              leanChrome
                ? 'Optional — turn completed stills into clips after your first cut.'
                : 'Turn completed stills into I2V clips for the day reel.'
            }
            defaultOpen={!leanChrome}
            persistKey="day-animate"
          >
            <ToolActionRow>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void animateSlot(activeSlot)}
              >
                Animate slot
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void animateAllClips()}
              >
                Animate all
              </Button>
            </ToolActionRow>
          </CollapsibleSection>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Day notes"
        summary="Optional notes layered onto every slot prompt."
        defaultOpen={!leanChrome}
        persistKey="day-notes"
      >
        <TextArea
          rows={2}
          value={toolSettings.notes ?? ''}
          className={accentFocusClass(ACCENT)}
          placeholder="e.g. cozy autumn day, light rain in the evening"
          onChange={event => updateToolSettings({ notes: event.target.value })}
        />
      </CollapsibleSection>

      <ToolSection
        title="Day reel"
        description={
          leanChrome
            ? 'Stills are enough to Cut film. Clips play first when you animate later.'
            : 'Completed clips play first; otherwise stills. Cut film uses the same playlist.'
        }
        data-testid="day-reel"
      >
        <FilmWatchPlayer
          shots={sampleWatch ? sampleShots : watchPlaylist}
          emptyLabel="Queue the day and wait here — Morning through Night fill in as jobs finish."
        />
        {sampleWatch ? (
          <p className="type-caption text-[var(--text-muted)]" data-testid="day-sample-cut-hint">
            Sample reel — queue your own Day when Comfy is ready, or use demo stills to Cut offline.
          </p>
        ) : null}
        {firstCutCelebrate ? (
          <p
            className="type-caption text-[var(--text-muted)]"
            data-testid="day-reel-celebrate-hint"
          >
            Use the celebration above for Watch / Share / next Day — the reel stays here to replay.
          </p>
        ) : (
          <ToolActionRow>
            <Button
              size="sm"
              variant="primary"
              disabled={busy || assemblingFilm || completedShotCount === 0}
              onClick={() => void cutDayFilm()}
            >
              {assemblingFilm ? 'Cutting…' : 'Cut film'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-testid="day-watch-sample-cut"
              onClick={() => setSampleWatch(prev => !prev)}
            >
              {sampleWatch ? 'Show my reel' : 'Watch sample cut'}
            </Button>
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
            {character && filmStatus && !assemblingFilm ? (
              <Button
                size="sm"
                variant="secondary"
                data-testid="day-share-cut"
                onClick={() => void shareLastCut()}
              >
                Share cut
              </Button>
            ) : null}
            {character && filmStatus && !assemblingFilm ? (
              <Button
                size="sm"
                variant="secondary"
                data-testid="day-remix-day"
                onClick={remixSameLookDay}
              >
                Same look, new Day
              </Button>
            ) : null}
            {character && filmStatus && !assemblingFilm ? (
              <ButtonLink
                href={`/characters/${encodeURIComponent(character.id)}?media=films`}
                size="sm"
                variant="primary"
                data-testid="day-open-cast-film"
                onClick={() => {
                  void import('@/lib/onboarding-hooks').then(({ markOnboardingWatchFirstFilm }) => {
                    markOnboardingWatchFirstFilm();
                  });
                }}
              >
                Watch / Save on Cast
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
            {character && filmStatus && !assemblingFilm ? (
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
        )}
        {filmStatus ? <p className="type-caption text-[var(--text-muted)]">{filmStatus}</p> : null}
      </ToolSection>

      <ToolActionRow>
        {!firstCutCelebrate && character ? (
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
        {!firstCutCelebrate ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={goRoleplay}>
            Optional: Story
          </Button>
        ) : null}
      </ToolActionRow>
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
    </ToolLayout>
  );
}
