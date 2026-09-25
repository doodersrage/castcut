'use client';

import type { ReactNode } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ChipButton, FieldError } from '@/components/ui/Field';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import {
  DAY_INTIMATE_MIX_OPTIONS,
  normalizeDayIntimateMix,
  type DayIntimateMix,
} from '@/lib/day-planner';
import { resolveQueueFailureGuideLabel } from '@/lib/queue-failure-playbook';
import {
  isRoleplayAdultContent,
  type RoleplayContentId,
  type RoleplayScene,
  type RoleplayStoryPhase,
} from '@/lib/roleplay';
import type { RoleplayBeatOutput } from '@/lib/roleplay-film';

const ACCENT = 'amber' as const;

export type RoleplayBeatOutputProgress = {
  phase: RoleplayStoryPhase;
  heading: string;
  hint: string;
  rollLabel: string;
  rerollLabel: string;
};

export type RoleplayBeatOutputSectionProps = {
  storyProgress: RoleplayBeatOutputProgress;
  beatOutput: RoleplayBeatOutput;
  autoQueue: boolean;
  busy: boolean;
  bioPresent: boolean;
  scenesLoading: boolean;
  scenes: RoleplayScene[];
  playingId: string | null;
  error: string | null;
  filmError: string | null | undefined;
  filmGuideHref?: string | null;
  queueBlockReason?: string | null;
  content?: RoleplayContentId;
  intimateMix?: DayIntimateMix;
  onIntimateMixChange?: (next: DayIntimateMix) => void;
  onRestartStory: () => void;
  onBeatOutputChange: (beatOutput: RoleplayBeatOutput) => void;
  onAutoQueueChange: (autoQueue: boolean) => void;
  onRollScenes: () => void;
  onPlayScene: (scene: RoleplayScene) => void;
  /** Pinned Setting / Tone / Content controls (Day-style plan strip). */
  moodControls?: ReactNode;
  /** One line for the folded Story settings, e.g. "Silly · PG-13 · any setting". */
  moodSummary?: string;
};

export default function RoleplayBeatOutputSection({
  storyProgress,
  beatOutput,
  autoQueue,
  busy,
  bioPresent,
  scenesLoading,
  scenes,
  playingId,
  error,
  filmError,
  filmGuideHref,
  queueBlockReason = null,
  content,
  intimateMix = 'mixed',
  onIntimateMixChange,
  onRestartStory,
  onBeatOutputChange,
  onAutoQueueChange,
  onRollScenes,
  onPlayScene,
  moodControls,
  moodSummary,
}: RoleplayBeatOutputSectionProps) {
  const rollBlocked = Boolean(queueBlockReason) || !bioPresent;
  const showIntimateMix =
    Boolean(onIntimateMixChange) && content != null && isRoleplayAdultContent(content);
  const mix = normalizeDayIntimateMix(intimateMix);

  return (
    <ToolSection title={storyProgress.heading} data-testid="story-beat-picker">
      <p className="text-sm text-[var(--text-muted)]">{storyProgress.hint}</p>
      {storyProgress.phase === 'complete' ? (
        <Button variant="secondary" disabled={busy} onClick={onRestartStory}>
          Restart story
        </Button>
      ) : (
        <>
          <Button
            variant="primary"
            loading={scenesLoading}
            loadingLabel="Rolling scenes"
            disabled={rollBlocked || busy}
            data-testid="story-roll-scenes"
            onClick={onRollScenes}
          >
            {scenes.length > 0 ? storyProgress.rerollLabel : storyProgress.rollLabel}
          </Button>
          {queueBlockReason ? (
            <p
              className="type-caption text-[var(--text-muted)]"
              data-testid="story-queue-block-reason"
            >
              {queueBlockReason}
            </p>
          ) : null}
          {scenes.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {scenes.map(scene => (
                <button
                  key={scene.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onPlayScene(scene)}
                  className={`rounded-[var(--radius-lg)] border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                    playingId === scene.id
                      ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
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
                </button>
              ))}
            </div>
          ) : null}
          <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
            <div className="flex flex-wrap gap-2">
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
                Clip
              </ChipButton>
            </div>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={autoQueue}
                disabled={busy}
                onChange={event => onAutoQueueChange(event.target.checked)}
                className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] ${accentFocusClass(ACCENT)}`}
              />
              <span>
                Queue a {beatOutput === 'clip' ? 'clip' : 'still'} when I write a bio or pick a
                scene
                <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                  {beatOutput === 'clip'
                    ? 'Queues T2V (or I2V from photo). Extend / Continue / Stitch labels show which path ran.'
                    : 'Uses the sidebar model. Turn off to write the prompt first.'}
                </span>
              </span>
            </label>
          </div>
        </>
      )}
      {/* Tone / Content / Setting are set-and-forget: folded so Roll leads the card. */}
      <details
        className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2"
        data-testid="story-settings"
      >
        <summary className="type-caption cursor-pointer text-[var(--text-secondary)]">
          Story settings{moodSummary ? ` · ${moodSummary}` : ''}
        </summary>
        <div className="mt-3 space-y-3">
          {moodControls ? (
            <div className="space-y-3" data-testid="story-active-plan">
              {moodControls}
            </div>
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
    </ToolSection>
  );
}
