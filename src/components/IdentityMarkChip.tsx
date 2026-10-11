'use client';

import type { IdentityMark } from '@/lib/identity-mark';

/** "Looks like Nora 72%" / "Face may drift 48%" / "Not Nora? 31%" (identity-mark.ts). */
export default function IdentityMarkChip({
  mark,
  testId,
  compact = false,
}: {
  mark: IdentityMark;
  testId?: string;
  compact?: boolean;
}) {
  const tone =
    mark.tone === 'miss'
      ? 'border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] text-[var(--tint-danger-text)]'
      : mark.tone === 'warn'
        ? 'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]'
        : 'border-[var(--border-subtle)] bg-[var(--bg-muted)] text-[var(--text-secondary)]';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] leading-4 ${tone}`}
      title={mark.detail}
      data-testid={testId}
      data-tone={mark.tone}
    >
      {compact ? null : <span>{mark.label}</span>}
      <span className="tabular-nums">{mark.pct}%</span>
      <span className="sr-only"> — {mark.detail}</span>
    </span>
  );
}
