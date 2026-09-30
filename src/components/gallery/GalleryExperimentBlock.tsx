'use client';

import { galleryCardCaption } from '@/lib/gallery-card-caption';
import { useMemo, type ReactNode } from 'react';
import type { ComfyGalleryEntry, GalleryLayoutMode } from '@/lib/comfyui-gallery';
import { formatExperimentParamDiffChips } from '@/lib/gallery-param-diff';
import { filmRunMisses } from '@/lib/gallery-queue-runs';
import { loadCharacters } from '@/lib/character-os';
import { Button, ButtonLink } from '@/components/ui/Button';
import GalleryExperimentCardGrid from '@/components/gallery/GalleryExperimentCardGrid';

type GalleryExperimentBlockProps = {
  groupId: string;
  label: string;
  /** Members on this page — a part of the group when it spans several pages. */
  entries: ComfyGalleryEntry[];
  /** The whole group; defaults to `entries`. */
  groupEntries?: ComfyGalleryEntry[];
  /** 1-based position of `entries[0]` within `groupEntries`. */
  partStart?: number;
  winnerEntryId?: string;
  /** `run`: a Film run block — review / reroll misses / open the Cast lead. */
  groupKind?: 'experiment' | 'run';
  characterId?: string;
  onReviewRun?: (entries: ComfyGalleryEntry[]) => void;
  collapsed: boolean;
  onToggle: () => void;
  onCrown?: (entryId: string) => void;
  onCompare?: () => void;
  onRequeueSeeds?: () => void;
  onWinnerUpscale?: (entry: ComfyGalleryEntry) => void;
  onWinnerRefine?: (entry: ComfyGalleryEntry) => void;
  onWinnerContinue?: (entry: ComfyGalleryEntry) => void;
  layout: GalleryLayoutMode;
  columns?: number;
  gridClassName: string;
  renderCard: (entry: ComfyGalleryEntry) => ReactNode;
};

/** "Loose Lana · 30 Sep 11:36 · 12 stills" — the Cast roster can load after the groups. */
function runTitle(label: string, characterId: string | undefined): string {
  const name = characterId
    ? loadCharacters()
        .find(character => character.id === characterId)
        ?.name?.trim()
    : undefined;
  if (!name || label.startsWith(`${name} · `)) {
    return label;
  }
  return `${name} · ${label}`;
}

export default function GalleryExperimentBlock({
  label,
  entries,
  groupEntries = entries,
  partStart = 1,
  winnerEntryId,
  groupKind = 'experiment',
  characterId,
  onReviewRun,
  collapsed,
  onToggle,
  onCrown,
  onCompare,
  onRequeueSeeds,
  onWinnerUpscale,
  onWinnerRefine,
  onWinnerContinue,
  layout,
  columns,
  gridClassName,
  renderCard,
}: GalleryExperimentBlockProps) {
  const collapsedPreview = entries.find(entry => entry.id === winnerEntryId) ?? entries[0];
  const shown = collapsed ? (collapsedPreview ? [collapsedPreview] : []) : entries;
  const paramDiffChips = useMemo(
    () => formatExperimentParamDiffChips(groupEntries),
    [groupEntries]
  );
  const winner = winnerEntryId
    ? (groupEntries.find(entry => entry.id === winnerEntryId) ?? null)
    : null;
  const isPart = entries.length < groupEntries.length;
  const partEnd = partStart + entries.length - 1;
  const showWinnerActions = Boolean(
    winner && (onWinnerUpscale || onWinnerRefine || onWinnerContinue)
  );

  if (groupKind === 'run') {
    const misses = filmRunMisses(groupEntries);
    const unreviewed = groupEntries.filter(
      entry => entry.status === 'completed' && !entry.reviewRating
    ).length;
    return (
      <div
        data-testid="gallery-film-run"
        className={`${layout === 'list' ? '' : 'col-span-full '}space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="min-w-0">
            <p className="type-overline text-[var(--text-muted)]">
              Run{isPart ? ` · showing ${partStart}–${partEnd} of ${groupEntries.length}` : ''}
              {unreviewed > 0 ? ` · ${unreviewed} to review` : ' · reviewed'}
            </p>
            <p className="type-heading truncate text-[var(--text-primary)]" title={label}>
              {runTitle(label, characterId)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {onReviewRun && unreviewed > 0 ? (
              <Button
                type="button"
                variant="primary"
                size="sm"
                data-testid="gallery-run-review"
                onClick={() => onReviewRun(groupEntries)}
              >
                Review run
              </Button>
            ) : null}
            {onRequeueSeeds && misses.length > 0 ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-testid="gallery-run-reroll"
                title="Queue a new take of each still rated 2★ or lower, or that missed its pose / face check"
                onClick={onRequeueSeeds}
              >
                Reroll misses ({misses.length})
              </Button>
            ) : null}
            {characterId ? (
              <ButtonLink
                href={`/characters/${encodeURIComponent(characterId)}`}
                variant="ghost"
                size="sm"
              >
                Open in Film
              </ButtonLink>
            ) : null}
            {onCompare ? (
              <Button type="button" variant="ghost" size="sm" onClick={onCompare}>
                Compare
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="sm" onClick={onToggle}>
              {collapsed ? 'Expand' : 'Collapse'}
            </Button>
          </div>
        </div>
        <GalleryExperimentCardGrid
          entries={shown}
          layout={layout}
          columns={columns}
          gridClassName={gridClassName}
          renderCard={renderCard}
        />
      </div>
    );
  }

  return (
    <div
      className={
        layout === 'list'
          ? 'space-y-3 rounded-2xl border border-[var(--tint-info-border)] bg-gradient-to-br from-[var(--tint-info-bg)] via-[var(--bg-elevated)]/40 to-transparent p-3'
          : 'col-span-full space-y-3 rounded-2xl border border-[var(--tint-info-border)] bg-gradient-to-br from-[var(--tint-info-bg)] via-[var(--bg-elevated)]/40 to-transparent p-3'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="min-w-0 space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--tint-info-text)]">
            Experiment · {groupEntries.length} variants
            {isPart ? ` · showing ${partStart}–${partEnd}` : ''}
            {winnerEntryId ? ' · crowned' : ''}
          </p>
          <p className="truncate text-xs text-[var(--text-secondary)]" title={label}>
            {galleryCardCaption(label) || label}
          </p>
          {paramDiffChips.length > 0 ? (
            <div data-testid="gallery-experiment-param-diff" className="flex flex-wrap gap-1.5">
              {paramDiffChips.map(chip => (
                <span
                  key={chip}
                  className="rounded-lg border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] px-2 py-0.5 text-[10px] text-[var(--tint-info-text)]"
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
          {showWinnerActions && winner ? (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {onWinnerUpscale ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onWinnerUpscale(winner)}
                >
                  Upscale winner
                </Button>
              ) : null}
              {onWinnerRefine ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onWinnerRefine(winner)}
                >
                  Refine winner
                </Button>
              ) : null}
              {onWinnerContinue ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onWinnerContinue(winner)}
                >
                  Continue winner
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {onCompare ? (
            <Button type="button" variant="ghost" size="sm" onClick={onCompare}>
              Compare
            </Button>
          ) : null}
          {onRequeueSeeds ? (
            <Button type="button" variant="ghost" size="sm" onClick={onRequeueSeeds}>
              Re-queue seeds
            </Button>
          ) : null}
          <button
            type="button"
            onClick={onToggle}
            className="rounded-lg border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--tint-info-text)] backdrop-blur-sm transition hover:border-[var(--tint-info-border)] hover:bg-[var(--tint-info-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>
      </div>
      <GalleryExperimentCardGrid
        entries={shown}
        winnerEntryId={winnerEntryId}
        onCrown={onCrown}
        layout={layout}
        columns={columns}
        gridClassName={gridClassName}
        renderCard={renderCard}
      />
    </div>
  );
}
