'use client';

import { useEffect, useMemo, useState } from 'react';
import { galleryEntryHeroPreviewUrl, type ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import GalleryEntryPreview from '@/components/ui/GalleryEntryPreview';
import { Button } from '@/components/ui/Button';
import {
  createEloBracket,
  initEloEntries,
  updateEloRatings,
  type EloEntry,
} from '@/lib/gallery-elo';
import { galleryEloWinnerId, loadGalleryElo, saveGalleryElo } from '@/lib/gallery-elo-store';
import { experimentGroupIdForPrompt } from '@/lib/experiment-groups';
import { markExperimentWinner } from '@/lib/experiment-winners';
import {
  canUpscaleGalleryEntry,
  galleryEntryAlreadyEnrichedForUpscale,
  galleryEntrySupportsMoireClean,
  galleryEntrySupportsRefine,
  galleryEntrySupportsSoftSecondPass,
  canSkinRefineGalleryEntry,
  galleryEntrySupportsUpscale,
} from '@/lib/gallery-entry-actions';
import { buildGalleryParamDiff } from '@/lib/gallery-param-diff';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { resolvePlaySkinRefineModel } from '@/lib/play-skin-refine';

export type GalleryComparePanelProps = {
  entries: ComfyGalleryEntry[];
  onClose: () => void;
  onPickWinner?: (entry: ComfyGalleryEntry) => void;
  /** Persist the preferred stack as a reusable tool quality recipe. */
  onSaveWinnerRecipe?: (entry: ComfyGalleryEntry) => void;
  compareWinnerId?: string | null;
  onUpscaleWinner?: (entry: ComfyGalleryEntry) => void;
  onRate?: (entryId: string, rating: ComfyGalleryEntry['reviewRating']) => void;
  onFavorite?: (entryId: string) => void;
  onMutate?: (entry: ComfyGalleryEntry) => void;
  onImprove?: (entry: ComfyGalleryEntry) => void;
  onUpscale?: (entry: ComfyGalleryEntry, qualityProfile: 'final' | 'max') => void;
  onMoireClean?: (entry: ComfyGalleryEntry, qualityProfile: 'final' | 'max') => void;
  onRefine?: (entry: ComfyGalleryEntry) => void;
  onSoftSecondPass?: (entry: ComfyGalleryEntry) => void;
  onSkinRefine?: (entry: ComfyGalleryEntry) => void;
  /** Open the shared image lightbox for a compare entry. */
  onOpenPreview?: (entry: ComfyGalleryEntry) => void;
  status?: string | null;
};

function entryEnhanceCapabilities(entry: ComfyGalleryEntry) {
  const isRapid = galleryEntrySupportsMoireClean(entry.model);
  const canUpscaleFinal = canUpscaleGalleryEntry(entry, 'final');
  const canUpscaleMax = canUpscaleGalleryEntry(entry, 'max');
  const canMoireFinal =
    isRapid &&
    entry.status === 'completed' &&
    !galleryEntryAlreadyEnrichedForUpscale(entry, 'final');
  const canMoireMax =
    isRapid && entry.status === 'completed' && !galleryEntryAlreadyEnrichedForUpscale(entry, 'max');
  const skinModel = resolvePlaySkinRefineModel(loadComfyUiSettings());
  return {
    isRapid,
    canUpscaleFinal,
    canUpscaleMax,
    canMoireFinal,
    canMoireMax,
    canRefine: galleryEntrySupportsRefine(entry.model) && entry.status === 'completed',
    canSoftSecondPass:
      galleryEntrySupportsSoftSecondPass(entry.model) && entry.status === 'completed',
    canSkinRefine: canSkinRefineGalleryEntry(entry, skinModel),
    supportsUpscaleModel: galleryEntrySupportsUpscale(entry.model),
  };
}

export default function GalleryComparePanel({
  entries,
  onClose,
  onPickWinner,
  onSaveWinnerRecipe,
  compareWinnerId,
  onUpscaleWinner,
  onRate,
  onFavorite,
  onMutate,
  onImprove,
  onUpscale,
  onMoireClean,
  onRefine,
  onSoftSecondPass,
  onSkinRefine,
  onOpenPreview,
  status,
}: GalleryComparePanelProps) {
  const [tournament, setTournament] = useState(false);
  const [elo, setElo] = useState<EloEntry[]>([]);
  const [pairIndex, setPairIndex] = useState(0);
  const pairs = useMemo(
    () => (tournament ? createEloBracket(entries.map(entry => entry.id)) : []),
    [tournament, entries]
  );

  const winnerCanUpscaleMax = useMemo(() => {
    if (!compareWinnerId) {
      return false;
    }
    const winner = entries.find(entry => entry.id === compareWinnerId);
    if (!winner) {
      return false;
    }
    const caps = entryEnhanceCapabilities(winner);
    return caps.isRapid ? caps.canMoireMax : caps.canUpscaleMax;
  }, [compareWinnerId, entries]);

  const paramDiff = useMemo(() => buildGalleryParamDiff(entries), [entries]);
  const differingParams = useMemo(() => paramDiff.filter(row => row.differs), [paramDiff]);
  const eloGroupId = useMemo(
    () =>
      experimentGroupIdForPrompt(entries[0]?.prompt ?? '') ??
      `compare-${entries
        .map(entry => entry.id)
        .join('-')
        .slice(0, 24)}`,
    [entries]
  );

  useEffect(() => {
    if (!tournament || elo.length === 0 || pairIndex < pairs.length) {
      return;
    }
    const winnerId = galleryEloWinnerId(elo);
    if (!winnerId) {
      return;
    }
    saveGalleryElo({
      groupId: eloGroupId,
      entries: elo,
      winnerId,
      updatedAt: Date.now(),
    });
    markExperimentWinner(eloGroupId, winnerId);
  }, [tournament, elo, pairIndex, pairs.length, eloGroupId]);

  if (entries.length === 0) {
    return null;
  }

  function startTournament() {
    setTournament(true);
    const stored = loadGalleryElo(eloGroupId);
    const labels = Object.fromEntries(
      entries.map(entry => [entry.id, entry.model ?? entry.id.slice(0, 8)])
    );
    const initial = initEloEntries(
      entries.map(entry => entry.id),
      labels
    );
    const merged =
      stored?.entries?.length && stored.entries.every(item => labels[item.id] !== undefined)
        ? initial.map(entry => {
            const prior = stored.entries.find(item => item.id === entry.id);
            return prior ? { ...entry, rating: prior.rating, matches: prior.matches } : entry;
          })
        : initial;
    setElo(merged);
    setPairIndex(0);
  }

  function pickTournamentWinner(winnerId: string, loserId: string) {
    setElo(prev => updateEloRatings(prev, winnerId, loserId));
    setPairIndex(prev => prev + 1);
  }

  return (
    <div className="space-y-4 rounded-[var(--radius-xl)] border border-[var(--accent-border)] bg-[var(--accent-muted)] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-[var(--accent-text)]">
            Compare {entries.length} selected outputs
          </p>
          <p className="type-caption mt-0.5 text-[var(--text-muted)]">
            Pick a winner to unlock recipe save and Max upscale. Or run an ELO tournament for 3+
            images.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-[var(--radius-md)] px-2 py-1 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
        >
          Close
        </button>
      </div>
      {entries.length >= 2 ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={startTournament}>
            ELO tournament
          </Button>
          {onUpscaleWinner && compareWinnerId && winnerCanUpscaleMax ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const winner = entries.find(entry => entry.id === compareWinnerId);
                if (winner) {
                  onUpscaleWinner(winner);
                }
              }}
            >
              Upscale winner (Max)
            </Button>
          ) : null}
          {onSaveWinnerRecipe && compareWinnerId ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                const winner = entries.find(entry => entry.id === compareWinnerId);
                if (winner) {
                  onSaveWinnerRecipe(winner);
                }
              }}
            >
              Save winner as recipe
            </Button>
          ) : (
            <p className="self-center text-[11px] text-[var(--text-muted)]">
              Select a winner below to save its quality recipe
            </p>
          )}
        </div>
      ) : null}
      {tournament && pairs[pairIndex] ? (
        <p className="text-xs text-[var(--accent-text)]">
          Match {pairIndex + 1}/{pairs.length} — pick the better output
        </p>
      ) : null}
      {tournament && elo.length > 0 && pairIndex >= pairs.length ? (
        <ul className="text-xs text-[var(--text-secondary)]">
          {[...elo]
            .sort((a, b) => b.rating - a.rating)
            .map(entry => (
              <li key={entry.id}>
                {entry.label}: {entry.rating} ELO ({entry.matches} matches)
              </li>
            ))}
        </ul>
      ) : null}
      {status ? <p className="text-xs text-[var(--accent-text)]/90">{status}</p> : null}
      {differingParams.length > 0 ? (
        <div data-testid="gallery-compare-param-diff" className="ui-table-shell">
          <table className="ui-table text-[11px]">
            <thead>
              <tr>
                <th>Param</th>
                {entries.map((entry, index) => (
                  <th key={entry.id}>#{index + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {differingParams.map(row => (
                <tr
                  key={row.key}
                  className="border-b border-[var(--border-subtle)]/70 last:border-0"
                >
                  <td className="px-3 py-1.5 text-[var(--text-secondary)]">{row.label}</td>
                  {row.values.map((value, index) => (
                    <td
                      key={`${row.key}-${entries[index]?.id ?? index}`}
                      className="px-3 py-1.5 font-medium text-[var(--accent-text)]"
                    >
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {entries.map(entry => {
          const url = galleryEntryHeroPreviewUrl(entry);
          const caps = entryEnhanceCapabilities(entry);
          return (
            <article
              key={entry.id}
              className={`space-y-2 rounded-[var(--radius-lg)] border p-2 transition ${
                compareWinnerId === entry.id
                  ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] ring-2 ring-[var(--accent-ring)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]'
              }`}
            >
              {url ? (
                onOpenPreview ? (
                  <div className="relative overflow-hidden rounded">
                    <GalleryEntryPreview
                      entry={entry}
                      className="aspect-square w-full object-cover transition hover:opacity-95"
                    />
                    <button
                      type="button"
                      onClick={() => onOpenPreview(entry)}
                      className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                      aria-label="Open preview"
                    />
                  </div>
                ) : (
                  <GalleryEntryPreview
                    entry={entry}
                    className="aspect-square w-full rounded object-cover"
                  />
                )
              ) : (
                <div className="flex aspect-square items-center justify-center rounded bg-[var(--bg-muted)] text-xs text-[var(--text-muted)]">
                  No image
                </div>
              )}
              <p className="text-[11px] text-[var(--text-muted)]">
                {entry.model} · seed {entry.queueParams?.seed ?? '?'}
                {entry.queueParams?.cfg != null ? ` · cfg ${entry.queueParams.cfg}` : ''}
                {entry.queueParams?.steps != null ? ` · ${entry.queueParams.steps} steps` : ''}
                {entry.reviewRating ? ` · ${entry.reviewRating}★` : ''}
              </p>
              <pre
                className="ui-code-block max-h-24 overflow-auto p-2 text-[11px]"
                data-tone="muted"
              >
                {entry.prompt}
              </pre>
              <div className="flex flex-wrap gap-1">
                {onPickWinner ? (
                  <Button
                    variant={compareWinnerId === entry.id ? 'primary' : 'secondary'}
                    className="!min-h-7 px-2 text-[11px]"
                    onClick={() => {
                      if (tournament && pairs[pairIndex]) {
                        const [a, b] = pairs[pairIndex];
                        const loserId = entry.id === a ? b : a;
                        pickTournamentWinner(entry.id, loserId);
                        return;
                      }
                      onPickWinner(entry);
                    }}
                  >
                    {tournament
                      ? 'Win match'
                      : compareWinnerId === entry.id
                        ? 'Winner'
                        : 'Pick winner'}
                  </Button>
                ) : null}
                {[5, 4, 3, 2, 1].map(rating => (
                  <button
                    key={rating}
                    type="button"
                    disabled={!onRate}
                    onClick={() => onRate?.(entry.id, rating as ComfyGalleryEntry['reviewRating'])}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                      entry.reviewRating === rating
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--bg-muted)] text-[var(--text-muted)] hover:bg-[var(--bg-muted)]'
                    }`}
                  >
                    {rating}★
                  </button>
                ))}
                {onFavorite ? (
                  <button
                    type="button"
                    onClick={() => onFavorite(entry.id)}
                    className="ui-chip !min-h-0 px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
                  >
                    {entry.favorite ? '★ Fav' : '☆ Fav'}
                  </button>
                ) : null}
                {onMutate ? (
                  <button
                    type="button"
                    onClick={() => onMutate(entry)}
                    className="ui-chip !min-h-0 px-1.5 py-0.5 text-[10px] text-[var(--tint-success-text)]"
                  >
                    Mutate
                  </button>
                ) : null}
                {onImprove ? (
                  <button
                    type="button"
                    onClick={() => onImprove(entry)}
                    className="ui-chip !min-h-0 px-1.5 py-0.5 text-[10px] text-[var(--tint-info-text)]"
                  >
                    Improve
                  </button>
                ) : null}
                {caps.isRapid && onMoireClean ? (
                  <>
                    {caps.canMoireFinal ? (
                      <button
                        type="button"
                        onClick={() => onMoireClean(entry, 'final')}
                        className="ui-chip !min-h-0 px-1.5 py-0.5 text-[10px] text-[var(--tint-success-text)]"
                      >
                        Moiré Final
                      </button>
                    ) : null}
                    {caps.canMoireMax ? (
                      <button
                        type="button"
                        onClick={() => onMoireClean(entry, 'max')}
                        className="ui-chip !min-h-0 px-1.5 py-0.5 text-[10px] text-[var(--tint-success-text)]"
                      >
                        Moiré Max
                      </button>
                    ) : null}
                  </>
                ) : null}
                {!caps.isRapid && onUpscale ? (
                  <>
                    {caps.canUpscaleFinal ? (
                      <button
                        type="button"
                        onClick={() => onUpscale(entry, 'final')}
                        className="ui-chip !min-h-0 px-1.5 py-0.5 text-[10px] text-[var(--tint-success-text)]"
                      >
                        Upscale Final
                      </button>
                    ) : null}
                    {caps.canUpscaleMax ? (
                      <button
                        type="button"
                        onClick={() => onUpscale(entry, 'max')}
                        className="ui-chip !min-h-0 px-1.5 py-0.5 text-[10px] text-[var(--tint-success-text)]"
                      >
                        Upscale Max
                      </button>
                    ) : null}
                  </>
                ) : null}
                {onSoftSecondPass && caps.canSoftSecondPass ? (
                  <button
                    type="button"
                    onClick={() => onSoftSecondPass(entry)}
                    className="ui-chip !min-h-0 px-1.5 py-0.5 text-[10px] text-[var(--tint-info-text)]"
                  >
                    Soft pass
                  </button>
                ) : null}
                {onSkinRefine && caps.canSkinRefine ? (
                  <button
                    type="button"
                    onClick={() => onSkinRefine(entry)}
                    className="ui-chip !min-h-0 px-1.5 py-0.5 text-[10px] text-[var(--tint-info-text)]"
                    data-testid="compare-skin-refine"
                  >
                    Skin refine
                  </button>
                ) : null}
                {onRefine && caps.canRefine ? (
                  <button
                    type="button"
                    onClick={() => onRefine(entry)}
                    className="ui-chip !min-h-0 px-1.5 py-0.5 text-[10px] text-[var(--tint-warning-text)]"
                  >
                    Refine
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
