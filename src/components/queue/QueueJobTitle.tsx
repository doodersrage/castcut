'use client';

import Link from 'next/link';
import type { QueueJobLabel } from '@/lib/queue-job-context';

/** A job's title line: where it came from + Open link, the prompt folded away. */
export default function QueueJobTitle({
  label,
  prompt,
}: {
  label?: QueueJobLabel;
  prompt?: string;
}) {
  if (!label) {
    return <p className="truncate text-sm text-[var(--text-primary)]">{prompt}</p>;
  }
  return (
    <>
      <p className="text-sm text-[var(--text-primary)]" data-testid="queue-job-label">
        <span className="font-medium">{label.label}</span>{' '}
        <Link href={label.href} className="ui-text-link type-caption">
          {label.openLabel}
        </Link>
      </p>
      {prompt ? (
        <details className="type-caption text-[var(--text-muted)]">
          <summary className="cursor-pointer">Prompt</summary>
          <p className="mt-1 whitespace-pre-wrap break-words">{prompt}</p>
        </details>
      ) : null}
    </>
  );
}
