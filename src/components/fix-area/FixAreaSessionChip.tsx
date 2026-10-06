'use client';

import { useFixAreaSessionForStill } from '@/lib/fix-area-session-store';
import { fixAreaSessionChipLabel, fixAreaSessionProgress } from '@/lib/fix-area-session';
import { openFixAreaSession } from '@/components/fix-area/FixAreaTray';

/**
 * A small chip on a still's card or lightbox while a Fix of it renders out of sight ("Fixing… 1
 * of 2") and once it has landed ("Fix ready — compare", which reopens the results). Nothing
 * when no Fix is tracked for the still or its dialog is open.
 */
export default function FixAreaSessionChip({
  url,
  className = '',
  testId,
}: {
  /** The still as shown, or its ComfyUI output URL. */
  url: string | null | undefined;
  className?: string;
  testId?: string;
}) {
  const session = useFixAreaSessionForStill(url);
  const label = fixAreaSessionChipLabel(session);
  if (!session || !label) return null;
  const settled = fixAreaSessionProgress(session).settled;
  return (
    <button
      type="button"
      className={`type-caption inline-flex items-center gap-1.5 rounded-[var(--radius-full)] border px-2 py-0.5 ${
        settled
          ? 'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]'
          : 'border-[var(--accent-border)] bg-[var(--bg-elevated)] text-[var(--accent-text)]'
      } ${className}`}
      onClick={event => {
        event.stopPropagation();
        openFixAreaSession(session.id);
      }}
      title={settled ? 'Open the takes and compare them' : 'Open the takes as they render'}
      data-testid={testId ?? 'fix-area-chip'}
      data-settled={settled ? 'true' : 'false'}
    >
      {!settled ? <span className="ui-spinner h-3 w-3" aria-hidden /> : null}
      {label}
    </button>
  );
}
