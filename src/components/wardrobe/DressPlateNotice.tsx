'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
import type { DayDressPlateEntry } from '@/lib/dress-plate-cache';
import { loadDressPlates, removeDressPlate, subscribeDressPlates } from '@/lib/dress-plate-store';
import {
  getDressPlateActivity,
  setDressPlateActivity,
  subscribeDressPlateActivity,
} from '@/lib/dress-plate-status';

const ImageLightbox = dynamic(() => import('@/components/ui/ImageLightbox'), { ssr: false });

/**
 * The dress-plate step for a tool page: "Dressing … first" while the plate renders, then the
 * plate itself (click to view it large) with "Dress her again". Renders nothing until a plate
 * exists or one is being made.
 */
export default function DressPlateNotice({
  testIdPrefix,
  className = '',
}: {
  testIdPrefix: string;
  className?: string;
}) {
  const activity = useSyncExternalStore(
    subscribeDressPlateActivity,
    getDressPlateActivity,
    () => null
  );
  const json = useSyncExternalStore(
    subscribeDressPlates,
    () => JSON.stringify(loadDressPlates()),
    () => '[]'
  );
  const newest = useMemo(() => (JSON.parse(json) as DayDressPlateEntry[])[0] ?? null, [json]);
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);
  if (!activity && !newest?.imageUrl) return null;
  return (
    <div className={className.trim() || undefined} data-testid={`${testIdPrefix}-dress-plate`}>
      {activity ? (
        <p
          className={`type-caption flex items-center gap-2 ${
            activity.busy
              ? 'rounded-lg border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2.5 py-1.5 font-medium text-[var(--accent-text)]'
              : 'text-[var(--text-muted)]'
          }`}
          role="status"
          data-testid={`${testIdPrefix}-dress-plate-status`}
          data-busy={activity.busy ? 'true' : 'false'}
        >
          {activity.busy ? (
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)]/50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
            </span>
          ) : null}
          {activity.text}
        </p>
      ) : null}
      {newest?.imageUrl && !activity?.busy ? (
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            className="shrink-0 rounded-lg transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            aria-label="View the dressed plate larger"
            title="View larger"
            data-testid={`${testIdPrefix}-dress-plate-open`}
            onClick={() =>
              setLightbox({ images: [newest.imageUrl ?? ''], index: 0, title: 'Dressed plate' })
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- ComfyUI proxy URL */}
            <img
              src={newest.imageUrl}
              alt="Dressed plate the clothed stills start from"
              className="h-16 w-12 cursor-zoom-in rounded-lg border border-[var(--border-subtle)] bg-white object-cover object-top"
            />
          </button>
          <div className="min-w-0">
            <p className="type-caption text-[var(--text-secondary)]">
              Dressed plate — clothed stills start from it while the outfit and shoes stay the same.
            </p>
            <button
              type="button"
              className="ui-text-link type-caption max-md:inline-flex max-md:min-h-8 max-md:items-center"
              data-testid={`${testIdPrefix}-dress-plate-redo`}
              onClick={() => {
                removeDressPlate(newest.key);
                setDressPlateActivity({
                  text: 'The next still dresses her again first.',
                  busy: false,
                });
              }}
            >
              Dress her again
            </button>
          </div>
        </div>
      ) : null}
      {lightbox ? (
        <ImageLightbox
          state={lightbox}
          onClose={() => setLightbox(null)}
          onIndexChange={() => {}}
        />
      ) : null}
    </div>
  );
}
