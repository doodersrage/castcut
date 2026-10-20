'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import FilmReviewShare from '@/components/character/FilmReviewShare';
import { cutRecipeSummary, isCutRecipe } from '@/lib/cut-recipe';
import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery-entry';
import { recipeShapeAndSize, recutFilm } from '@/lib/film/recut';
import { FILM_SHAPES, normalizeFilmShape, type FilmShape } from '@/lib/video-resolution';

/**
 * Under a film on the Cast page: what's in it (its shots, from the cut recipe) and Re-cut —
 * the same cut in another shape or size, saved as a new film.
 */
export default function FilmRecutPanel({
  entry,
  characterName,
}: {
  entry: ComfyGalleryEntry;
  characterName: string;
}) {
  const recipe = isCutRecipe(entry.cutRecipe) ? entry.cutRecipe : null;
  const start = recipeShapeAndSize(recipe?.resolution);
  const [shape, setShape] = useState<FilmShape>(start.shape === 'wide' ? 'vertical' : 'wide');
  const [quality, setQuality] = useState<'720p' | '1080p'>(start.quality);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  // Films cut before 2.6 kept no recipe: say so, rather than showing nothing.
  if (!recipe) {
    return (
      <p
        className="type-caption border-t border-[var(--border-subtle)] px-2 py-1 text-[var(--text-muted)]"
        data-testid="film-recut-unavailable"
      >
        Re-cut, Export for an editor and Share for review need a film cut in 2.6 or later — cut this
        Day again to get them.
      </p>
    );
  }

  const run = async () => {
    setBusy(true);
    setStatus('Re-cutting…');
    try {
      const result = await recutFilm({
        entry,
        characterName,
        shape,
        quality,
        onProgress: label => setStatus(label),
      });
      setStatus(
        result.persisted
          ? `Saved ${result.filename} — it's in Films.`
          : `Downloaded ${result.filename} (not kept in the Gallery).`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not re-cut this film.');
    } finally {
      setBusy(false);
    }
  };

  /** The cut for an editing app: FCPXML + EDL + SRT + media (film-nle-export.ts). */
  const exportForEditor = async () => {
    setBusy(true);
    setStatus('Preparing the editor package — converting each shot…');
    try {
      const response = await fetch('/api/film/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe, name: `${characterName} film` }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        url?: string;
        shots?: number;
        skipped?: number;
        error?: string;
      };
      if (!response.ok || !body.url) throw new Error(body.error ?? `HTTP ${response.status}`);
      const link = document.createElement('a');
      link.href = body.url;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setStatus(
        `Downloading ${body.shots} shots with the timeline (FCPXML for Resolve, Premiere, Final Cut; EDL; subtitles).` +
          (body.skipped ? ` ${body.skipped} shot(s) could not be fetched — see README.txt.` : '')
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not export this film.');
    } finally {
      setBusy(false);
    }
  };

  return (
    // The buttons in plain sight (they sat behind a collapsed line and players never found them);
    // only the shot breakdown folds away.
    <div
      className="space-y-1 border-t border-[var(--border-subtle)] px-2 py-1.5"
      data-testid="film-recut"
    >
      <details>
        <summary className="type-caption cursor-pointer text-[var(--text-secondary)]">
          What&apos;s in it
        </summary>
        <p className="type-caption mt-1 text-[var(--text-muted)]" data-testid="film-recut-summary">
          {cutRecipeSummary(recipe)}
        </p>
        <ol className="mt-1 flex flex-wrap gap-1" data-testid="film-recut-shots">
          {recipe.shots.map((shot, index) => (
            <li
              key={`${shot.key ?? shot.url}-${index}`}
              className="type-caption rounded border border-[var(--border-subtle)] px-1.5 py-0.5 text-[var(--text-muted)]"
              title={shot.caption || shot.title}
            >
              {index + 1}. {shot.title}
              {shot.kind === 'clip' ? ' · clip' : ''}
              {shot.framing ? ` · ${shot.framing === 'close' ? 'chest up' : 'waist up'}` : ''}
            </li>
          ))}
        </ol>
      </details>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Re-cut shape"
          disabled={busy}
          className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1.5 py-1 text-xs text-[var(--text-primary)]"
          value={shape}
          data-testid="film-recut-shape"
          onChange={event => setShape(normalizeFilmShape(event.target.value))}
        >
          {FILM_SHAPES.map(option => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Re-cut size"
          disabled={busy}
          className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1.5 py-1 text-xs text-[var(--text-primary)]"
          value={quality}
          data-testid="film-recut-quality"
          onChange={event => setQuality(event.target.value === '1080p' ? '1080p' : '720p')}
        >
          <option value="720p">720p</option>
          <option value="1080p">1080p</option>
        </select>
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          loadingLabel="Re-cutting"
          data-testid="film-recut-run"
          onClick={() => void run()}
        >
          Re-cut
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          data-testid="film-export-editor"
          title="A zip with the shots and a timeline for DaVinci Resolve, Premiere Pro or Final Cut, plus subtitles"
          onClick={() => void exportForEditor()}
        >
          Export for an editor
        </Button>
      </div>
      {status ? (
        <p
          className="type-caption mt-1 text-[var(--text-secondary)]"
          role="status"
          data-testid="film-recut-status"
        >
          {status}
        </p>
      ) : null}
      <FilmReviewShare entryId={entry.id} title={`${characterName} — a film`} />
    </div>
  );
}
