'use client';

import { Button } from '@/components/ui/Button';
import {
  EXPORT_PROFILES,
  type CheckStatus,
  type ExportCheck,
  type ExportProfileId,
} from '@/lib/film/export-profiles';

const MARK: Record<CheckStatus, { sign: string; tone: string; label: string }> = {
  ok: { sign: '✓', tone: 'ui-status-success', label: 'fine' },
  warn: {
    sign: '!',
    tone: 'text-[var(--tint-warning-text,var(--accent-text))]',
    label: 'look at it',
  },
  fail: { sign: '✗', tone: 'ui-status-danger', label: 'needs fixing' },
};

function Checks({ checks, testId }: { checks: ExportCheck[]; testId: string }) {
  return (
    <ul className="space-y-0.5" data-testid={testId}>
      {checks.map(check => (
        <li
          key={check.id}
          className="type-caption flex gap-1.5"
          data-testid={`${testId}-${check.id}`}
          data-status={check.status}
        >
          <span
            className={`w-3 shrink-0 font-semibold ${MARK[check.status].tone}`}
            aria-label={MARK[check.status].label}
          >
            {MARK[check.status].sign}
          </span>
          <span>
            <span className="font-medium">{check.label}:</span> {check.detail}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Cut's export (M4 F6): a profile for where the film goes (review copy, master, vertical, square
 * — "Export for an editor" is the handoff), the preflight — what is checked now and what is left
 * for the cut — and the finished file read back against the profile.
 */
export default function CutExport({
  profile,
  preflight,
  output,
  disabled,
  onProfile,
}: {
  profile?: ExportProfileId;
  preflight: { checks: ExportCheck[]; remains: string[]; blocks: boolean };
  output: ExportCheck[] | null;
  disabled?: boolean;
  onProfile: (id: ExportProfileId) => void;
}) {
  return (
    <div className="space-y-2" data-testid="cut-export">
      <div>
        <p className="type-caption mb-1 font-medium">Made for</p>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Export profile">
          {EXPORT_PROFILES.map(entry => (
            <Button
              key={entry.id}
              size="sm"
              variant={profile === entry.id ? 'secondary' : 'ghost'}
              aria-pressed={profile === entry.id}
              disabled={disabled}
              title={entry.hint}
              data-testid={`cut-profile-${entry.id}`}
              onClick={() => onProfile(entry.id)}
            >
              {entry.label}
            </Button>
          ))}
        </div>
        {profile ? (
          <p className="type-caption mt-1 text-[var(--text-muted)]">
            {EXPORT_PROFILES.find(entry => entry.id === profile)?.hint}
          </p>
        ) : null}
      </div>
      <div>
        <p className="type-caption mb-1 font-medium">
          Before cutting{preflight.blocks ? ' — fix what’s marked ✗ first' : ''}
        </p>
        <Checks checks={preflight.checks} testId="cut-preflight" />
        <p className="type-caption mt-1 text-[var(--text-muted)]">
          Still to check: {preflight.remains.join('; ')}.
        </p>
      </div>
      {output ? (
        <div>
          <p className="type-caption mb-1 font-medium">The film as cut</p>
          <Checks checks={output} testId="cut-output" />
        </div>
      ) : null}
    </div>
  );
}
