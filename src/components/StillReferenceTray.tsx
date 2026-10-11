'use client';

import { useEffect, useState } from 'react';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { stillReferenceViewUrl, type StillReference } from '@/lib/still-references';
import { loadStillReferences } from '@/lib/still-references-client';

/**
 * "Made with": the pictures this still was rendered from (face, look, clothes, partner, pose
 * guide…), read off its own graph, plus the place it was set in. Shows nothing until the still
 * has rendered.
 */
export default function StillReferenceTray({
  promptId,
  place,
  testId = 'still-references',
}: {
  promptId?: string;
  /** The Setting the still was written for. */
  place?: string;
  testId?: string;
}) {
  const [refs, setRefs] = useState<StillReference[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const id = promptId?.trim();
    if (!id) {
      scheduleAfterCommit(() => setRefs(null));
      return;
    }
    void loadStillReferences(id).then(found => {
      if (!cancelled) setRefs(found);
    });
    return () => {
      cancelled = true;
    };
  }, [promptId]);

  if (!refs || (refs.length === 0 && !place?.trim())) return null;
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <p className="type-caption text-[var(--text-muted)]">Made with</p>
      <ul className="flex flex-wrap items-start gap-2">
        {refs.map(ref => (
          <li key={ref.filename} className="w-14" data-testid={`${testId}-${ref.role}`}>
            <a
              href={stillReferenceViewUrl(ref.filename)}
              target="_blank"
              rel="noreferrer"
              title={`${ref.label}: ${ref.filename}`}
              className="block overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- ComfyUI input via proxy */}
              <img
                src={stillReferenceViewUrl(ref.filename)}
                alt={ref.label}
                loading="lazy"
                className="aspect-[3/4] w-full object-cover"
              />
            </a>
            <span className="type-caption mt-0.5 block truncate text-center text-[var(--text-secondary)]">
              {ref.label}
            </span>
          </li>
        ))}
        {place?.trim() ? (
          <li
            className="type-caption max-w-[12rem] self-center rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-2 py-1 text-[var(--text-secondary)]"
            data-testid={`${testId}-place`}
          >
            Place: {place.trim()}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
