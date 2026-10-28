'use client';

import { useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { getCharacter } from '@/lib/character/os';
import type { SceneTake, SceneTakeReview } from '@/lib/day/scenes';
import { hasLocalStoredWorkflow, loadComfyGallery } from '@/lib/gallery/comfyui-gallery';
import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery-entry';
import { galleryEntryProvenance, type ProvenanceRow } from '@/lib/gallery/provenance';

function ProvenanceList({ rows, testId }: { rows: ProvenanceRow[]; testId: string }) {
  const short = rows.filter(row => !row.long);
  const long = rows.filter(row => row.long);
  return (
    <div className="space-y-3" data-testid={testId}>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {short.map(row => (
          <div
            key={row.key}
            className="min-w-0 rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/50 px-3 py-2"
            data-testid={`${testId}-${row.key}`}
          >
            <dt className="type-caption text-[var(--text-muted)]">{row.label}</dt>
            <dd className="mt-0.5 break-words text-sm">{row.value}</dd>
          </div>
        ))}
      </dl>
      {long.map(row => (
        <div key={row.key} data-testid={`${testId}-${row.key}`}>
          <h4 className="type-caption text-[var(--text-muted)]">{row.label}</h4>
          <p className="mt-0.5 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/50 px-3 py-2 text-sm">
            {row.value}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * A take's Gallery entries, its still's and its clip's. The list leaves the stored graph out;
 * whether it is really here is this browser's to say (an entry that came by server sync says it
 * has one, but the graph never syncs: M6 D19).
 */
function takeEntries(
  take: SceneTake | null,
  gallery: ComfyGalleryEntry[]
): { still?: ComfyGalleryEntry; clip?: ComfyGalleryEntry } {
  const byPrompt = (id: string | undefined) => {
    const entry = id?.trim() ? gallery.find(item => item.promptId === id.trim()) : undefined;
    return entry ? { ...entry, hasStoredWorkflow: hasLocalStoredWorkflow(entry) } : undefined;
  };
  return { still: byPrompt(take?.promptId ?? take?.id), clip: byPrompt(take?.clipPromptId) };
}

/**
 * "How this was made" for one Scene take (R4): read from its Gallery entry — the picture's and,
 * once it moves, its clip's. A take whose entry this browser no longer has says so.
 */
export function SceneTakeProvenanceDialog({
  take,
  index,
  castId,
  onClose,
}: {
  take: SceneTake | null;
  index: number;
  castId?: string;
  onClose: () => void;
}) {
  const { still, clip } = takeEntries(take, take ? loadComfyGallery() : []);
  const castName = getCharacter(castId)?.name;
  return (
    <Dialog
      open={Boolean(take)}
      onClose={onClose}
      title={`How take ${index + 1} was made`}
      description="From its Gallery entry — the settings and references it was rendered with."
      size="lg"
      testId="scene-take-provenance"
    >
      {still ? (
        <ProvenanceList
          rows={galleryEntryProvenance(still, { castName, madeWith: 'Scene' })}
          testId="scene-take-provenance-still"
        />
      ) : (
        <p
          className="type-caption text-[var(--text-muted)]"
          data-testid="scene-take-provenance-missing"
        >
          This browser no longer has this take’s Gallery entry, so only the picture is known. (A
          server copy, when storage sync is on, may still have it.)
        </p>
      )}
      {take?.clipUrl ? (
        <div className="mt-4 space-y-2">
          <h3 className="type-caption font-medium">Its clip</h3>
          {clip ? (
            <ProvenanceList
              rows={galleryEntryProvenance(clip, { castName, madeWith: 'Scene clip' })}
              testId="scene-take-provenance-clip"
            />
          ) : (
            <p className="type-caption text-[var(--text-muted)]">
              The clip’s Gallery entry isn’t in this browser.
            </p>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}

/**
 * Two of a Scene's takes side by side (M7 T3): the pictures, how each was made, and keep or
 * reject from here. Opens on the kept take and the newest other one; the pair is fixed while it
 * is open (keeping the right-hand take doesn't swap the sides). Mount it only while open.
 */
export function SceneTakeCompareDialog({
  open,
  takes,
  keptTakeId,
  castId,
  onKeep,
  onReview,
  onClose,
}: {
  open: boolean;
  takes: SceneTake[];
  keptTakeId?: string;
  castId?: string;
  onKeep: (takeId: string) => void;
  onReview: (takeId: string, review: SceneTakeReview | null) => void;
  onClose: () => void;
}) {
  const shown = takes.filter(take => take.review !== 'rejected');
  const pool = shown.length >= 2 ? shown : takes;
  const [picked, setPicked] = useState<[string | undefined, string | undefined]>(() => {
    const kept = pool.find(take => take.id === keptTakeId);
    const newest = [...pool].reverse();
    const first = kept ?? newest[0];
    return [first?.id, newest.find(take => take !== first)?.id];
  });
  // A take dropped while open falls back to any other.
  const sides = [0, 1].map(
    side =>
      pool.find(take => take.id === picked[side]) ??
      pool.find(take => take.id !== picked[side === 0 ? 1 : 0])
  );
  const gallery = open ? loadComfyGallery() : [];
  const castName = getCharacter(castId)?.name;
  const numberOf = (take: SceneTake) => takes.indexOf(take) + 1;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Compare takes"
      description="Two takes side by side, with how each was made."
      size="3xl"
      testId="scene-take-compare"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {sides.map((take, side) => {
          if (!take) return null;
          const { still } = takeEntries(take, gallery);
          const isKept = take.id === keptTakeId;
          return (
            <section
              key={side}
              className="min-w-0 space-y-3"
              data-testid={`scene-take-compare-${side}`}
              data-take={take.id}
            >
              <label className="type-caption flex items-center gap-2">
                <span className="text-[var(--text-muted)]">{side === 0 ? 'Left' : 'Right'}</span>
                <select
                  className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-sm text-[var(--text-primary)]"
                  value={take.id}
                  data-testid={`scene-take-compare-pick-${side}`}
                  onChange={event => {
                    const next: [string | undefined, string | undefined] = [
                      sides[0]?.id,
                      sides[1]?.id,
                    ];
                    next[side] = event.target.value;
                    setPicked(next);
                  }}
                >
                  {pool.map(option => (
                    <option key={option.id} value={option.id}>
                      Take {numberOf(option)}
                      {option.id === keptTakeId ? ' · kept' : ''}
                      {option.review === 'approved' ? ' · good' : ''}
                      {option.review === 'rejected' ? ' · rejected' : ''}
                    </option>
                  ))}
                </select>
              </label>
              {/* eslint-disable-next-line @next/next/no-img-element -- Gallery / ComfyUI view URL */}
              <img
                src={take.imageUrl}
                alt={`Take ${numberOf(take)}`}
                className="max-h-[50vh] w-full rounded-[var(--radius-md)] object-contain"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={isKept ? 'primary' : 'secondary'}
                  aria-pressed={isKept}
                  data-testid={`scene-take-compare-keep-${side}`}
                  onClick={() => onKeep(take.id)}
                >
                  {isKept ? '★ Kept' : '☆ Keep this one'}
                </Button>
                <Button
                  variant="ghost"
                  disabled={isKept}
                  title={isKept ? 'Keep another take first — Cut uses this one' : undefined}
                  data-testid={`scene-take-compare-reject-${side}`}
                  onClick={() => onReview(take.id, take.review === 'rejected' ? null : 'rejected')}
                >
                  {take.review === 'rejected' ? 'Restore' : 'Reject'}
                </Button>
              </div>
              {still ? (
                <ProvenanceList
                  rows={galleryEntryProvenance(still, { castName, madeWith: 'Scene' })}
                  testId={`scene-take-compare-made-${side}`}
                />
              ) : (
                <p className="type-caption text-[var(--text-muted)]">
                  This browser no longer has this take’s Gallery entry.
                </p>
              )}
            </section>
          );
        })}
      </div>
    </Dialog>
  );
}
