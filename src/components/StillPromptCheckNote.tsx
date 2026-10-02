import { promptCheckSummary, type StillPromptCheck } from '@/lib/still-prompt-audit';

/**
 * The queue-time prompt check on a still's card (Day slot, Story beat): one quiet line —
 * "Prompt check: fixed 1", or "Prompt check: 1 problem" in the warning tone — that opens to
 * list what was fixed and what is still wrong. Nothing when the prompt was clean.
 */
export default function StillPromptCheckNote({
  check,
  testId,
  className = '',
}: {
  check: StillPromptCheck | null | undefined;
  testId: string;
  className?: string;
}) {
  const summary = promptCheckSummary(check);
  if (!summary || !check) return null;
  return (
    <details
      className={`type-caption ${
        summary.tone === 'warning'
          ? 'text-[var(--tint-warning-text,var(--text-muted))]'
          : 'text-[var(--text-muted)]'
      } ${className}`.trim()}
      data-testid={testId}
      data-tone={summary.tone}
    >
      <summary className="cursor-pointer">{summary.label}</summary>
      <ul className="mt-1 space-y-0.5 pl-3 text-[var(--text-secondary)]">
        {check.remaining.map((message, index) => (
          <li key={`left-${index}`} data-testid={`${testId}-remaining`}>
            Not fixed: {message}
          </li>
        ))}
        {check.repaired.map((message, index) => (
          <li key={`fixed-${index}`} data-testid={`${testId}-repaired`}>
            Fixed: {message}
          </li>
        ))}
      </ul>
    </details>
  );
}
