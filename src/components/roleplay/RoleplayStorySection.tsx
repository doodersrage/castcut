'use client';

import type { ReactNode } from 'react';
import RoleplayFilmCutActions from '@/components/RoleplayFilmCutActions';
import RoleplayStoryReel from '@/components/RoleplayStoryReel';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ToolActionRow, ToolSection } from '@/components/ui/ToolPageShell';
import { remixDayFilmHref } from '@/lib/play-starter';
import type { RoleplayBeatOutput } from '@/lib/roleplay-film';
import type { RoleplayStoryBeat } from '@/lib/roleplay';

export type RoleplayStorySectionProps = {
  beatOutput: RoleplayBeatOutput;
  autoQueue: boolean;
  assemblingFilm: boolean;
  busy: boolean;
  story: RoleplayStoryBeat[];
  bioPresent?: boolean;
  scenesLoading?: boolean;
  filmNeedsCast: boolean;
  filmCharacterId: string | null | undefined;
  filmStatus: string | null | undefined;
  filmError?: string | null;
  filmGuideHref?: string | null;
  firstCutCelebrate?: boolean;
  onClearFirstCutCelebrate?: () => void;
  downloadAction: ReactNode;
  onCutFilm: () => void;
  onSaveToCast: () => void;
  onShareCut?: () => void;
  onSavePoster?: () => void;
  posterBusy?: boolean;
  canShareCut?: boolean;
  onQueue: (beat: RoleplayStoryBeat) => void;
  onRetry: (beat: RoleplayStoryBeat) => void;
  onRetryClip: (beat: RoleplayStoryBeat) => void;
  onAnimate: (beat: RoleplayStoryBeat) => void;
  onExtend: (beat: RoleplayStoryBeat) => void;
  onSelectTake: (beat: RoleplayStoryBeat, index: number) => void;
  onPoseChange?: (
    beat: RoleplayStoryBeat,
    patch: Pick<RoleplayStoryBeat, 'poseLayout' | 'poseVariant'>
  ) => void;
  onSelectClipTake: (beat: RoleplayStoryBeat, index: number) => void;
  onCopy: (beat: RoleplayStoryBeat) => void;
  onRollScenes?: () => void;
  /** Cast home where bible rewrite/edit/clear live. */
  castBibleHref?: string;
  filmCutOptions?: import('@/components/FilmCutOptionsControls').FilmCutOptionsValue;
  onFilmCutOptionsChange?: (
    next: import('@/components/FilmCutOptionsControls').FilmCutOptionsValue
  ) => void;
};

export default function RoleplayStorySection({
  beatOutput,
  autoQueue,
  assemblingFilm,
  busy,
  story,
  bioPresent = false,
  scenesLoading = false,
  filmNeedsCast,
  filmCharacterId,
  filmStatus,
  filmError,
  filmGuideHref,
  firstCutCelebrate = false,
  onClearFirstCutCelebrate,
  downloadAction,
  onCutFilm,
  onSaveToCast,
  onShareCut,
  onSavePoster,
  posterBusy = false,
  canShareCut = false,
  onQueue,
  onRetry,
  onRetryClip,
  onAnimate,
  onExtend,
  onSelectTake,
  onPoseChange,
  onSelectClipTake,
  onCopy,
  onRollScenes,
  castBibleHref,
  filmCutOptions,
  onFilmCutOptionsChange,
}: RoleplayStorySectionProps) {
  return (
    <ToolSection title="Story reel">
      <p className="text-sm text-[var(--text-muted)]">
        {beatOutput === 'clip'
          ? 'Clips land here as they render'
          : 'Stills land here as they render'}
        {autoQueue
          ? beatOutput === 'clip'
            ? ' — T2V from the beat prompt. From photo uses that photo as I2V. Continuity uses Extend clip, Continue from last frame, or Stitch continue (by engine)'
            : ' — queued automatically from the bio and each pick'
          : ''}
        .
      </p>

      {firstCutCelebrate ? (
        <div
          className="mb-3 rounded-[var(--radius-lg)] border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] px-4 py-3"
          data-testid="story-first-cut-celebrate"
        >
          <p className="type-overline text-[var(--tint-success-text)]">First film</p>
          <p className="type-heading mt-1 text-[var(--text-primary)]">You cut your first reel</p>
          <p className="type-caption mt-1 text-[var(--text-muted)]">
            {filmNeedsCast
              ? 'Save the cut to Cast first — then tap Watch on Cast.'
              : 'Tap Watch on Cast when you are ready — or share / cut another Story reel.'}
          </p>
          <ToolActionRow className="mt-3">
            {filmNeedsCast && onSaveToCast ? (
              <Button
                size="sm"
                variant="primary"
                disabled={busy || assemblingFilm}
                onClick={onSaveToCast}
                data-testid="story-save-film-cast"
              >
                Save film to Cast
              </Button>
            ) : null}
            {filmCharacterId && !filmNeedsCast ? (
              <ButtonLink
                href={`/characters/${encodeURIComponent(filmCharacterId)}?media=films`}
                size="sm"
                variant="primary"
                data-testid="story-first-cut-watch"
                onClick={() => {
                  onClearFirstCutCelebrate?.();
                }}
              >
                Watch on Cast
              </ButtonLink>
            ) : null}
            {onShareCut ? (
              <Button
                size="sm"
                variant="secondary"
                data-testid="story-first-cut-share"
                onClick={onShareCut}
              >
                Share cut
              </Button>
            ) : null}
            {onSavePoster ? (
              <Button
                size="sm"
                variant="secondary"
                loading={posterBusy}
                loadingLabel="Saving"
                data-testid="story-first-cut-poster"
                title="Save a poster frame from a finished still"
                onClick={onSavePoster}
              >
                Save poster
              </Button>
            ) : null}
            {filmCharacterId ? (
              <ButtonLink
                href={remixDayFilmHref(filmCharacterId)}
                size="sm"
                variant="secondary"
                data-testid="story-first-cut-remix"
                onClick={() => {
                  onClearFirstCutCelebrate?.();
                }}
              >
                Same look, new Day
              </ButtonLink>
            ) : null}
          </ToolActionRow>
        </div>
      ) : null}

      <RoleplayFilmCutActions
        assemblingFilm={assemblingFilm}
        busy={busy}
        storyEmpty={story.length === 0}
        filmNeedsCast={filmNeedsCast}
        filmCharacterId={filmCharacterId}
        filmStatus={filmStatus}
        filmError={filmError}
        filmGuideHref={filmGuideHref}
        hidePostCutLinks={firstCutCelebrate}
        filmCutOptions={filmCutOptions}
        onFilmCutOptionsChange={onFilmCutOptionsChange}
        onCutFilm={onCutFilm}
        onSaveToCast={onSaveToCast}
        onShareCut={onShareCut}
        onSavePoster={onSavePoster}
        posterBusy={posterBusy}
        canShareCut={canShareCut && !firstCutCelebrate}
      >
        {firstCutCelebrate ? null : downloadAction}
      </RoleplayFilmCutActions>
      <RoleplayStoryReel
        story={story}
        busy={busy}
        bioPresent={bioPresent}
        castBibleHref={castBibleHref}
        scenesLoading={scenesLoading}
        onQueue={onQueue}
        onRetry={onRetry}
        onRetryClip={onRetryClip}
        onAnimate={onAnimate}
        onExtend={onExtend}
        onSelectTake={onSelectTake}
        onPoseChange={onPoseChange}
        onSelectClipTake={onSelectClipTake}
        onCopy={onCopy}
        onRollScenes={onRollScenes}
      />
    </ToolSection>
  );
}
