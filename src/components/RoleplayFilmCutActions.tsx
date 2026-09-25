'use client';

import type { ReactNode } from 'react';
import {
  FilmCutOptionsDisclosure,
  type FilmCutOptionsValue,
} from '@/components/FilmCutOptionsControls';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/Field';
import { resolveQueueFailureGuideLabel } from '@/lib/queue-failure-playbook';
import { remixDayFilmHref } from '@/lib/play-starter';

export type RoleplayFilmCutActionsProps = {
  assemblingFilm: boolean;
  busy: boolean;
  storyEmpty: boolean;
  filmNeedsCast: boolean;
  filmCharacterId: string | null | undefined;
  filmStatus: string | null | undefined;
  filmError?: string | null;
  filmGuideHref?: string | null;
  canShareCut?: boolean;
  /** While first-cut celebrate owns Watch/Share/Remix, hide duplicate Cast links. */
  hidePostCutLinks?: boolean;
  filmCutOptions?: FilmCutOptionsValue;
  onFilmCutOptionsChange?: (next: FilmCutOptionsValue) => void;
  onCutFilm: () => void;
  onSaveToCast: () => void;
  onShareCut?: () => void;
  onSavePoster?: () => void;
  posterBusy?: boolean;
  /** Optional leading controls (e.g. Download story) kept in the same flex row. */
  children?: ReactNode;
};

export default function RoleplayFilmCutActions({
  assemblingFilm,
  busy,
  storyEmpty,
  filmNeedsCast,
  filmCharacterId,
  filmStatus,
  filmError,
  filmGuideHref,
  canShareCut = false,
  hidePostCutLinks = false,
  filmCutOptions,
  onFilmCutOptionsChange,
  onCutFilm,
  onSaveToCast,
  onShareCut,
  onSavePoster,
  posterBusy = false,
  children,
}: RoleplayFilmCutActionsProps) {
  const showPostCut = Boolean(
    filmCharacterId && filmStatus && !assemblingFilm && !hidePostCutLinks
  );

  return (
    <>
      {filmCutOptions && onFilmCutOptionsChange ? (
        <div className="mb-2">
          <FilmCutOptionsDisclosure
            value={filmCutOptions}
            onChange={onFilmCutOptionsChange}
            disabled={assemblingFilm}
            testIdPrefix="story-cut"
          />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          loading={assemblingFilm}
          loadingLabel="Cutting film"
          disabled={storyEmpty || (busy && !assemblingFilm)}
          onClick={onCutFilm}
        >
          Cut film
        </Button>
        {/* Download is the export path; Cut is the main one. */}
        {children}
        {canShareCut && onShareCut && filmStatus && !assemblingFilm ? (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={onShareCut}
            data-testid="roleplay-share-cut"
          >
            Share cut
          </Button>
        ) : null}
        {onSavePoster && !assemblingFilm ? (
          <Button
            variant="ghost"
            disabled={busy || storyEmpty}
            loading={posterBusy}
            loadingLabel="Saving"
            onClick={onSavePoster}
            data-testid="roleplay-save-poster"
            title="Save a poster frame from a finished still"
          >
            Save poster
          </Button>
        ) : null}
        {filmNeedsCast && !hidePostCutLinks ? (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={onSaveToCast}
            data-testid="roleplay-save-film-cast"
          >
            Save to Cast
          </Button>
        ) : null}
        {showPostCut ? (
          <ButtonLink
            href={`/characters/${encodeURIComponent(filmCharacterId!)}?media=films`}
            size="sm"
            variant="ghost"
            data-testid="roleplay-open-cast-film"
          >
            Open on Cast
          </ButtonLink>
        ) : null}
        {showPostCut ? (
          <ButtonLink
            href={`/gallery?character=${encodeURIComponent(filmCharacterId!)}&derivedKind=film`}
            size="sm"
            variant="ghost"
            data-testid="roleplay-open-gallery"
          >
            Open in Gallery
          </ButtonLink>
        ) : null}
        {showPostCut ? (
          <ButtonLink
            href={remixDayFilmHref(filmCharacterId!)}
            size="sm"
            variant="secondary"
            data-testid="roleplay-remix-day"
          >
            Same look, new Day
          </ButtonLink>
        ) : null}
      </div>
      {filmStatus ? <p className="type-caption text-[var(--text-muted)]">{filmStatus}</p> : null}
      {filmError ? (
        <div className="mt-2 space-y-2">
          <FieldError>{filmError}</FieldError>
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
        </div>
      ) : null}
    </>
  );
}
