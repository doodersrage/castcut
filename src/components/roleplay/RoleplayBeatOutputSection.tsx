'use client';

import StoryOwnScene from '@/components/roleplay/StoryOwnScene';
import StoryProgressBar from '@/components/roleplay/StoryProgressBar';
import StoryScenePoseFigure from '@/components/roleplay/StoryScenePoseFigure';
import type { StoryScenePose } from '@/hooks/roleplay/story-scene-pose';
import type { ReactNode } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ChipButton, FieldError } from '@/components/ui/Field';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import {
  DAY_INTIMATE_MIX_OPTIONS,
  normalizeDayIntimateMix,
  type DayIntimateMix,
} from '@/lib/day/planner';
import { resolveQueueFailureGuideLabel } from '@/lib/queue/failure-playbook';
import {
  isRoleplayAdultContent,
  type RoleplayContentId,
  type RoleplayScene,
  type RoleplayStoryPhase,
} from '@/lib/story/roleplay';
import type { RoleplayBeatOutput } from '@/lib/story/roleplay-film';

const ACCENT = 'amber' as const;

export type RoleplayBeatOutputProgress = {
  phase: RoleplayStoryPhase;
  heading: string;
  hint: string;
  rollLabel: string;
  rerollLabel: string;
  plot?: number;
  plotTotal?: number;
};

export type RoleplayBeatOutputSectionProps = {
  storyProgress: RoleplayBeatOutputProgress;
  beatOutput: RoleplayBeatOutput;
  autoQueue: boolean;
  busy: boolean;
  bioPresent: boolean;
  scenesLoading: boolean;
  scenes: RoleplayScene[];
  /** The pose each offered scene's still would be drawn in, by scene id. */
  scenePoses?: ReadonlyMap<string, StoryScenePose>;
  playingId: string | null;
  error: string | null;
  filmError: string | null | undefined;
  filmGuideHref?: string | null;
  queueBlockReason?: string | null;
  content?: RoleplayContentId;
  intimateMix?: DayIntimateMix;
  onIntimateMixChange?: (next: DayIntimateMix) => void;
  onRestartStory: () => void;
  /** Beats already in the story — start-over is offered once there is one. */
  storyBeatCount?: number;
  /** Take the last scene back (the step before it opens again). */
  onUndoLastScene?: () => void;
  onBeatOutputChange: (beatOutput: RoleplayBeatOutput) => void;
  onAutoQueueChange: (autoQueue: boolean) => void;
  onRollScenes: () => void;
  onPlayScene: (scene: RoleplayScene) => void;
  /** Pinned Setting / Tone / Content controls (Day-style plan strip). */
  moodControls?: ReactNode;
  /** One line for the folded Story settings, e.g. "Silly · PG-13 · any setting". */
  moodSummary?: string;
  /**
   * Desk Story (2026-11-05): kept in view at the bottom like a message box, with the progress
   * bar, the four beats in one row and `footer` (the cut) under them.
   */
  composer?: boolean;
  /** The start card above already offers Roll (beside "Open with today's Day"). */
  hideRoll?: boolean;
  footer?: ReactNode;
};

export default function RoleplayBeatOutputSection({
  storyProgress,
  beatOutput,
  autoQueue,
  busy,
  bioPresent,
  scenesLoading,
  scenes,
  scenePoses,
  playingId,
  error,
  filmError,
  filmGuideHref,
  queueBlockReason = null,
  content,
  intimateMix = 'mixed',
  onIntimateMixChange,
  onRestartStory,
  storyBeatCount = 0,
  onUndoLastScene,
  onBeatOutputChange,
  onAutoQueueChange,
  onRollScenes,
  onPlayScene,
  moodControls,
  moodSummary,
  composer = false,
  hideRoll = false,
  footer,
}: RoleplayBeatOutputSectionProps) {
  const rollBlocked = Boolean(queueBlockReason) || !bioPresent;
  const showIntimateMix =
    Boolean(onIntimateMixChange) && content != null && isRoleplayAdultContent(content);
  const mix = normalizeDayIntimateMix(intimateMix);

  // Tone / Content / Setting are set-and-forget: folded so Roll leads the card.
  const settingsDetails = (
    <details
      className={`rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2 ${
        composer ? 'min-w-[16rem] flex-1 open:basis-full' : ''
      }`}
      data-testid="story-settings"
    >
      <summary className="type-caption cursor-pointer text-[var(--text-secondary)]">
        Story settings{moodSummary ? ` · ${moodSummary}` : ''}
      </summary>
      <div className="mt-3 space-y-3">
        <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={!autoQueue}
            disabled={busy}
            data-testid="story-manual-queue"
            onChange={event => onAutoQueueChange(!event.target.checked)}
            className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] ${accentFocusClass(ACCENT)}`}
          />
          <span>
            Write each scene&apos;s prompt, don&apos;t queue it
            <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
              To read or edit it first, then queue it from the scene.
            </span>
          </span>
        </label>
        {moodControls ? (
          <div className="space-y-3" data-testid="story-active-plan">
            {moodControls}
          </div>
        ) : null}
        {storyBeatCount > 0 ? (
          <p className="type-caption text-[var(--text-muted)]" data-testid="story-settings-midway">
            Changes apply from the next scene — the {storyBeatCount} scene
            {storyBeatCount === 1 ? '' : 's'} so far stay as they are.{' '}
            <button type="button" className="ui-text-link" disabled={busy} onClick={onRestartStory}>
              Start the story over
            </button>{' '}
            to use them from the first scene.
          </p>
        ) : null}
        {showIntimateMix ? (
          <div className="space-y-2" data-testid="story-intimate-mix">
            <p className="type-caption text-[var(--text-muted)]">Intimate mix</p>
            <div className="flex flex-wrap gap-2">
              {DAY_INTIMATE_MIX_OPTIONS.map(option => (
                <ChipButton
                  key={option.id}
                  active={mix === option.id}
                  disabled={busy}
                  data-testid={`story-intimate-mix-${option.id}`}
                  title={option.hint}
                  onClick={() => onIntimateMixChange?.(option.id)}
                >
                  {option.label}
                </ChipButton>
              ))}
            </div>
            <p className="type-caption text-[var(--text-muted)]">
              {mix === 'solo'
                ? 'Solo — one adult; self-touch / undress beats.'
                : mix === 'duo'
                  ? 'Duo — partner scenes; partners get different faces from Cast.'
                  : 'Mixed — solo and duo beats across the four cards.'}
            </p>
          </div>
        ) : null}
      </div>
    </details>
  );
  const ownScene =
    bioPresent && !rollBlocked ? (
      <StoryOwnScene
        disabled={busy}
        ending={storyProgress.phase === 'finale'}
        onPlay={onPlayScene}
      />
    ) : null;

  return (
    <ToolSection
      title={composer ? undefined : storyProgress.heading}
      aria-label={composer ? storyProgress.heading : undefined}
      padded={!composer}
      data-testid="story-beat-picker"
      data-sticky-bottom={composer ? 'tall' : undefined}
      className={
        composer
          ? 'ui-sticky-surface px-4 py-3 lg:sticky lg:bottom-2 lg:z-20 lg:max-h-[72vh] lg:overflow-y-auto lg:shadow-lg'
          : undefined
      }
    >
      {composer && storyProgress.plotTotal ? (
        <div className="flex items-center gap-3" title={storyProgress.hint}>
          <h2 className="type-heading shrink-0">{storyProgress.heading}</h2>
          <StoryProgressBar
            plot={storyProgress.plot ?? 0}
            plotTotal={storyProgress.plotTotal}
            ended={storyProgress.phase === 'complete'}
          />
          <p className="sr-only">{storyProgress.hint}</p>
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">{storyProgress.hint}</p>
      )}
      {storyProgress.phase === 'complete' ? (
        <Button variant="secondary" disabled={busy} onClick={onRestartStory}>
          Restart story
        </Button>
      ) : (
        <>
          <div className={composer ? 'flex flex-wrap items-center gap-2' : 'contents'}>
            {hideRoll ? null : (
              <Button
                variant="primary"
                loading={scenesLoading}
                loadingLabel="Rolling scenes"
                disabled={rollBlocked || busy}
                data-testid="story-roll-scenes"
                title="R"
                onClick={onRollScenes}
              >
                {scenes.length > 0 ? storyProgress.rerollLabel : storyProgress.rollLabel}
              </Button>
            )}
            {/* Mid-story there was no way back to the first scene: rerolling only replaced the
              next four cards. */}
            {storyBeatCount > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {onUndoLastScene ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    data-testid="story-undo-scene"
                    onClick={onUndoLastScene}
                  >
                    Undo last scene
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  data-testid="story-start-over"
                  onClick={onRestartStory}
                >
                  Start the story over
                </Button>
              </div>
            ) : null}
            {composer && ownScene ? <div className="min-w-[14rem] flex-1">{ownScene}</div> : null}
          </div>
          {queueBlockReason ? (
            <p
              className="type-caption text-[var(--text-muted)]"
              data-testid="story-queue-block-reason"
            >
              {queueBlockReason}
            </p>
          ) : null}
          {scenes.length > 0 ? (
            <div className={`grid gap-2 sm:grid-cols-2 ${composer ? 'xl:grid-cols-4' : ''}`}>
              {scenes.map((scene, sceneIndex) => (
                <Button
                  variant="chip"
                  selected={playingId === scene.id}
                  key={scene.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onPlayScene(scene)}
                  title={composer ? `${scene.title} (${sceneIndex + 1})` : undefined}
                  data-testid="story-scene-card"
                  className={`flex items-start gap-3 rounded-[var(--radius-lg)] px-4 py-3 text-left text-inherit transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                    playingId === scene.id
                      ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <span className="block min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[var(--text-primary)]">
                      {scene.title}
                    </span>
                    <span className="type-caption mt-1 block text-[var(--text-muted)]">
                      {scene.blurb}
                    </span>
                    {playingId === scene.id ? (
                      <span className="type-caption mt-2 block text-[var(--accent-text)]">
                        {beatOutput === 'clip'
                          ? scene.kind === 'ending'
                            ? 'Writing ending clip…'
                            : 'Writing clip…'
                          : scene.kind === 'ending'
                            ? 'Writing ending…'
                            : 'Writing still…'}
                      </span>
                    ) : null}
                  </span>
                  {/* At the side, in a fixed box: the text column keeps its width whether or
                      not a card has a figure. */}
                  <StoryScenePoseFigure pose={scenePoses?.get(scene.id)} />
                </Button>
              ))}
            </div>
          ) : null}
          {composer ? null : ownScene}
          {/* One choice: a still per scene, or a still and its clip (a Still / Clip toggle and a
              "Queue a clip when I write a bio or pick a scene" box said it twice, unclearly). */}
          <div
            className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3"
            role="group"
            aria-label="Each new scene makes"
          >
            <span className="type-caption text-[var(--text-muted)]">Each scene makes</span>
            <ChipButton
              active={beatOutput === 'still'}
              disabled={busy}
              onClick={() => onBeatOutputChange('still')}
            >
              Still
            </ChipButton>
            <ChipButton
              active={beatOutput === 'clip'}
              disabled={busy}
              onClick={() => onBeatOutputChange('clip')}
            >
              Still + clip
            </ChipButton>
            {!autoQueue ? (
              <span
                className="type-caption text-[var(--text-muted)]"
                data-testid="story-manual-note"
              >
                · prompts only (Story settings)
              </span>
            ) : null}
            {composer ? settingsDetails : null}
          </div>
        </>
      )}
      {composer ? null : settingsDetails}
      {error || filmError ? (
        <div className="space-y-2">
          <FieldError>{error || filmError}</FieldError>
          {filmError && filmGuideHref ? (
            <ButtonLink
              href={filmGuideHref}
              size="sm"
              variant="ghost"
              data-testid="film-failure-playbook-link"
            >
              {resolveQueueFailureGuideLabel(filmGuideHref)}
            </ButtonLink>
          ) : null}
        </div>
      ) : null}
      {footer && storyProgress.phase !== 'complete' ? (
        <div className="border-t border-[var(--border-subtle)] pt-3">{footer}</div>
      ) : footer ? (
        footer
      ) : null}
    </ToolSection>
  );
}
