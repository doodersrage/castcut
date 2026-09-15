'use client';

import type { ReactNode } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/Field';
import { resolveQueueFailureGuideLabel } from '@/lib/queue-failure-playbook';

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
  onCutFilm: () => void;
  onSaveToCast: () => void;
  onShareCut?: () => void;
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
  onCutFilm,
  onSaveToCast,
  onShareCut,
  children,
}: RoleplayFilmCutActionsProps) {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {children}
        <Button
          variant="secondary"
          loading={assemblingFilm}
          loadingLabel="Cutting film"
          disabled={storyEmpty || (busy && !assemblingFilm)}
          onClick={onCutFilm}
        >
          Cut film
        </Button>
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
        {filmNeedsCast ? (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={onSaveToCast}
            data-testid="roleplay-save-film-cast"
          >
            Save to Cast
          </Button>
        ) : null}
        {filmCharacterId && filmStatus && !assemblingFilm ? (
          <ButtonLink
            href={`/characters/${encodeURIComponent(filmCharacterId)}?media=films`}
            size="sm"
            variant="ghost"
            data-testid="roleplay-open-cast-film"
            onClick={() => {
              void import('@/lib/onboarding-hooks').then(({ markOnboardingWatchFirstFilm }) => {
                markOnboardingWatchFirstFilm();
              });
            }}
          >
            Open on Cast
          </ButtonLink>
        ) : null}
        {filmCharacterId && filmStatus && !assemblingFilm ? (
          <ButtonLink
            href={`/gallery?character=${encodeURIComponent(filmCharacterId)}&derivedKind=film`}
            size="sm"
            variant="ghost"
            data-testid="roleplay-open-gallery"
          >
            Open in Gallery
          </ButtonLink>
        ) : null}
        {filmCharacterId && filmStatus && !assemblingFilm ? (
          <ButtonLink
            href={`/play?character=${encodeURIComponent(filmCharacterId)}`}
            size="sm"
            variant="secondary"
            data-testid="roleplay-campaign-complete"
          >
            Campaign complete — Open Play
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
