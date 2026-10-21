'use client';

import { useEffect } from 'react';
import SystemPageShell from '@/components/ui/SystemPageShell';
import { Button } from '@/components/ui/Button';
import ReportBugLink from '@/components/ReportBugLink';
import { stripStackFrames } from '@/lib/server/friendly-error';

/** A plain sentence for the page; the raw text stays behind "Details". */
function friendlyPageError(error: Error & { digest?: string }): string {
  const message = error.message ?? '';
  if (
    /ChunkLoadError|Loading (?:CSS )?chunk|dynamically imported module/i.test(
      `${error.name} ${message}`
    )
  ) {
    return 'This page was updated while it was open. Reload to get the new version.';
  }
  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(message)) {
    return "The page couldn't reach the app's server. Check it's still running, then try again.";
  }
  if (error.digest) {
    return 'Part of this page failed to load on the server. Try again, or reload the page.';
  }
  return 'This page hit an unexpected problem. Try again, or reload the page.';
}

export default function GlobalError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const raw = stripStackFrames(error.message?.trim() ?? '');
  const details = [raw, error.digest ? `ref ${error.digest}` : ''].filter(Boolean).join('\n');

  return (
    <SystemPageShell
      overline="Error"
      title="Something went wrong"
      description={friendlyPageError(error)}
    >
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button variant="secondary" onClick={() => (retry ?? reset)?.()}>
          Try again
        </Button>
        <ReportBugLink variant="button" />
      </div>
      {details ? (
        <details className="w-full text-left">
          <summary className="type-caption cursor-pointer text-center text-[var(--text-muted)]">
            Details
          </summary>
          <pre className="type-caption mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-3 text-[var(--text-secondary)]">
            {details}
          </pre>
        </details>
      ) : null}
    </SystemPageShell>
  );
}
