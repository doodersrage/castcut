'use client';

import BrandBars from '@/components/BrandBars';
import BrandStudioIllustration from '@/components/BrandStudioIllustration';
import PlayContinueChip from '@/components/PlayContinueChip';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/ViewState';
import { resolveStudioEmptyCta } from '@/lib/empty-cta';
import { remixDayFilmHref } from '@/lib/play-starter';

type GalleryEmptyPanelProps = {
  filtered: boolean;
  onClearFilters: () => void;
  onUpload?: () => void;
  /** When Gallery is filtered to films, offer Cut/Remix instead of only Clear. */
  derivedKind?: string | null;
  characterId?: string | null;
};

export default function GalleryEmptyPanel({
  filtered,
  onClearFilters,
  onUpload,
  derivedKind,
  characterId,
}: GalleryEmptyPanelProps) {
  const filmFilter = filtered && derivedKind === 'film';
  const castId = characterId?.trim() || '';

  if (filmFilter) {
    return (
      <div className="space-y-3" data-testid="gallery-film-empty">
        <EmptyState
          icon="inbox"
          title="No films yet"
          description={
            castId
              ? 'Cut a Day film for this cast, or remix the same look with fresh stills.'
              : 'Cut a Day film, then open Cast or Gallery to watch it.'
          }
          action={{
            label: 'Clear film filter',
            onClick: onClearFilters,
          }}
        />
        <div className="flex flex-wrap gap-2">
          {castId ? (
            <ButtonLink
              href={remixDayFilmHref(castId)}
              size="sm"
              variant="primary"
              data-testid="gallery-film-empty-remix"
            >
              Same look, new Day
            </ButtonLink>
          ) : (
            <ButtonLink
              href="/day"
              size="sm"
              variant="primary"
              data-testid="gallery-film-empty-day"
            >
              Open Day
            </ButtonLink>
          )}
          <PlayContinueChip variant="secondary" />
        </div>
      </div>
    );
  }

  if (filtered) {
    return (
      <EmptyState
        icon="search"
        title="No entries match these filters"
        description="Try clearing search, status, or project filters — or turn off semantic search."
        action={{
          label: 'Clear filters',
          onClick: onClearFilters,
        }}
      />
    );
  }

  const filmCta = resolveStudioEmptyCta();

  return (
    <div className="ui-brand-empty relative space-y-4 overflow-hidden">
      <div className="ui-brand-watermark" aria-hidden>
        <BrandStudioIllustration size={200} />
      </div>
      <EmptyState
        branded
        icon="inbox"
        title="No gallery outputs yet"
        description="Start a film to queue Day stills, generate a surprise still, or upload your own."
        action={filmCta}
      />
      <div className="ui-panel-accent relative px-4 py-4">
        <p className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
          <BrandBars size="md" />
          Getting started
        </p>
        <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-[var(--text-muted)]">
          <li>
            Open <strong className="font-medium text-[var(--text-secondary)]">Film</strong> and tap{' '}
            <strong className="font-medium text-[var(--text-secondary)]">
              Make a starter film
            </strong>{' '}
            — Day will queue morning → night stills.
          </li>
          <li>
            Or use <strong className="font-medium text-[var(--text-secondary)]">Generate</strong>{' '}
            for a single still, then continue the film loop.
          </li>
          <li>
            Use <strong className="font-medium text-[var(--text-secondary)]">Upload images</strong>{' '}
            to add stills from disk for Look, Outfit, and identity lock.
          </li>
          <li>
            If Comfy is down, open Day and tap{' '}
            <strong className="font-medium text-[var(--text-secondary)]">Use demo stills</strong> to
            practice Cut film.
          </li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          {onUpload ? (
            <button type="button" className="ui-btn-secondary ui-btn-sm" onClick={onUpload}>
              Upload images
            </button>
          ) : null}
          <ButtonLink href={filmCta.href} size="sm">
            {filmCta.label}
          </ButtonLink>
          <PlayContinueChip variant="secondary" />
          <ButtonLink href="/day" variant="ghost" size="sm">
            Open Day
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
