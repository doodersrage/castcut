'use client';

import { Button, ButtonLink } from '@/components/ui/Button';
import { ChipButton, FieldError } from '@/components/ui/Field';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import { resolveQueueFailureGuideLabel } from '@/lib/queue-failure-playbook';
import type { RoleplayBeatOutput } from '@/lib/roleplay-film';
import type { RoleplayScene, RoleplayStoryPhase } from '@/lib/roleplay';

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
  onRestartStory: () => void;
  onBeatOutputChange: (beatOutput: RoleplayBeatOutput) => void;
  onAutoQueueChange: (autoQueue: boolean) => void;
  onRollScenes: () => void;
  onPlayScene: (scene: RoleplayScene) => void;
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
  onRestartStory,
  onBeatOutputChange,
  onAutoQueueChange,
  onRollScenes,
  onPlayScene,
}: RoleplayBeatOutputSectionProps) {
  return (
    <ToolSection title={storyProgress.heading}>
      <p className="text-sm text-[var(--text-muted)]">{storyProgress.hint}</p>
      {storyProgress.phase === 'complete' ? (
        <Button variant="secondary" disabled={busy} onClick={onRestartStory}>
          Restart story
        </Button>
      ) : (
        <>
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
              Queue a {beatOutput === 'clip' ? 'clip' : 'still'} when I write a bio or pick a scene
              <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                {beatOutput === 'clip'
                  ? 'Queues T2V (or I2V from photo). Extend / Continue / Stitch labels show which path ran.'
                  : 'Uses the sidebar model. Turn off to write the prompt first.'}
              </span>
            </span>
          </label>
          <Button
            variant="secondary"
            loading={scenesLoading}
            loadingLabel="Rolling scenes"
            disabled={!bioPresent || busy}
            onClick={onRollScenes}
          >
            {scenes.length > 0 ? storyProgress.rerollLabel : storyProgress.rollLabel}
          </Button>
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
        </>
      )}
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
