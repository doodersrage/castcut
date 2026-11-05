'use client';

import type { ReactNode } from 'react';
import FilmWatchPlayer from '@/components/FilmWatchPlayer';
import CastChip from '@/components/ui/CastChip';
import { Button, ButtonLink } from '@/components/ui/Button';
import { galleryEntryPrimaryViewUrl } from '@/lib/gallery/comfyui-gallery';
import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery-entry';
import type { FilmPlaylistShot } from '@/lib/film/character-film';
import { clipJobProgressText } from '@/lib/clip/clip-jobs';
import type { TrackedClipJob } from '@/lib/clip/clip-jobs-tracker';
import type { CutReviewNote } from '@/lib/film/review-notes';

/** A film's name: what it was cut as, without the "Assembled film ·" boilerplate. */
export function filmTitle(entry: Pick<ComfyGalleryEntry, 'prompt'>): string {
  return entry.prompt?.replace(/^Assembled film\s*·\s*/i, '').trim() || 'Film';
}

function filmDate(entry: Pick<ComfyGalleryEntry, 'completedAt' | 'queuedAt'>): string {
  return new Date(entry.completedAt ?? entry.queuedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * The top of the Film page (2026-11-05): the film itself — the cut picked below, else the latest,
 * else its latest stills as a reel — beside who it's about, what's made and the next step.
 */
export function PlayFilmHero({
  who,
  film,
  reel,
  progress,
  actions,
  aside,
}: {
  /** The Cast chip (opens who / which look). */
  who: ReactNode;
  film: ComfyGalleryEntry | null;
  /** Stills to play in order when there's no film yet. */
  reel: readonly string[];
  progress: string;
  actions: ReactNode;
  /** What's waiting (running jobs, new comments). */
  aside?: ReactNode;
}) {
  const filmUrl = film ? galleryEntryPrimaryViewUrl(film) : null;
  const shots: FilmPlaylistShot[] =
    film && filmUrl
      ? [{ entryId: film.id, title: filmTitle(film), url: filmUrl, kind: 'clip' }]
      : reel.map((url, index) => ({
          key: `${index}-${url}`,
          title: 'Still',
          url,
          kind: 'still' as const,
          holdSec: 2,
        }));
  return (
    <section
      className="grid gap-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
      data-testid="play-film-hero"
    >
      <div className="min-w-0" data-testid="play-film-hero-player">
        {shots.length ? (
          <FilmWatchPlayer key={film?.id ?? 'stills'} compact shots={shots} />
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] bg-[var(--bg-muted)] px-6 text-center">
            <p className="type-caption text-[var(--text-muted)]">
              The film shows here — its stills as they render, then the cut.
            </p>
          </div>
        )}
        {film ? (
          <p
            className="type-caption mt-1 text-[var(--text-muted)]"
            data-testid="play-film-hero-caption"
          >
            {filmTitle(film)} · {filmDate(film)}
          </p>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        {who}
        <p className="type-caption text-[var(--text-secondary)]" data-testid="play-film-progress">
          {progress}
        </p>
        {actions}
        {aside}
      </div>
    </section>
  );
}

/** The Cast and look as one chip — the picker opens in a sheet (the shared CastChip). */
export function PlayCastChip({
  name,
  look,
  plate,
  onOpen,
  testId = 'play-cast-chip',
}: {
  name: string;
  /** After the name: the look (Film) or the outfit (Story). */
  look?: string;
  plate?: string | null;
  onOpen: () => void;
  testId?: string;
}) {
  return <CastChip name={name} detail={look} plateUrl={plate} onOpen={onOpen} testId={testId} />;
}

/** Long jobs still running and review comments not yet ticked off — one small panel. */
export function PlayFilmWaiting({
  jobs,
  notes,
  notesHref,
}: {
  jobs: readonly TrackedClipJob[];
  notes: readonly CutReviewNote[];
  notesHref: string;
}) {
  if (!jobs.length && !notes.length) return null;
  return (
    <div
      className="space-y-1.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2"
      data-testid="play-film-waiting"
    >
      <p className="type-overline text-[var(--text-muted)]">Waiting for you</p>
      {jobs.map(entry => (
        <p key={entry.jobId} className="type-caption" data-testid="play-film-waiting-job">
          <span className="text-[var(--text-primary)]">{entry.label}</span>
          <span className="text-[var(--text-muted)]"> · {clipJobProgressText(entry.job)}</span>
        </p>
      ))}
      {notes.length ? (
        <p
          className="type-caption flex flex-wrap items-center gap-x-2"
          data-testid="play-film-waiting-notes"
        >
          <span>
            {notes.length} review {notes.length === 1 ? 'note' : 'notes'} to look at
            {notes[0] ? (
              <span className="text-[var(--text-muted)]">
                {' '}
                — {notes[0].name}: “{notes[0].text.slice(0, 60)}”
              </span>
            ) : null}
          </span>
          <ButtonLink href={notesHref} size="sm" variant="underline">
            Open in Cut
          </ButtonLink>
        </p>
      ) : null}
    </div>
  );
}

/** Saved films, newest first: watch one up top, or open them all on Cast to re-cut or share. */
export function PlayFilmsShelf({
  films,
  selectedId,
  onWatch,
  allHref,
}: {
  films: readonly ComfyGalleryEntry[];
  selectedId?: string;
  onWatch: (id: string) => void;
  /** Where the rest live (Cast's films); none on Cast itself. */
  allHref?: string;
}) {
  if (!films.length) return null;
  return (
    <section className="space-y-2" data-testid="play-films-shelf">
      <div className="flex items-center justify-between gap-2">
        <h2 className="type-heading">Your films</h2>
        {allHref ? (
          <ButtonLink href={allHref} size="sm" variant="ghost" data-testid="play-films-all">
            Re-cut or share on Cast
          </ButtonLink>
        ) : null}
      </div>
      <ol className="flex gap-3 overflow-x-auto pb-1">
        {films.slice(0, 12).map(film => {
          const url = galleryEntryPrimaryViewUrl(film);
          const selected = film.id === selectedId;
          return (
            <li key={film.id} className="w-44 shrink-0">
              <Button
                variant="plain"
                aria-pressed={selected}
                aria-label={`Watch ${filmTitle(film)}`}
                data-testid={`play-films-shelf-${film.id}`}
                className={`block w-full overflow-hidden rounded-[var(--radius-md)] border-2 text-left ${
                  selected ? 'border-[var(--accent)]' : 'border-[var(--border-subtle)]'
                }`}
                onClick={() => onWatch(film.id)}
              >
                {url ? (
                  <video
                    src={`${url}#t=0.1`}
                    preload="metadata"
                    muted
                    playsInline
                    className="aspect-video w-full bg-black object-cover"
                  />
                ) : (
                  <span className="block aspect-video w-full bg-[var(--bg-muted)]" />
                )}
                <span className="block px-2 py-1">
                  <span className="type-label block truncate">{filmTitle(film)}</span>
                  <span className="type-caption text-[var(--text-muted)]">{filmDate(film)}</span>
                </span>
              </Button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
