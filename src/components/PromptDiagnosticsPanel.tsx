'use client';

import type { PromptDiagnostics } from '@/lib/prompt/diagnostics';
import { summarizeDiagnostics } from '@/lib/queue/generation-diagnostics';

type PromptDiagnosticsPanelProps = {
  diagnostics: PromptDiagnostics | null;
  loading?: boolean;
};

const severityStyles = {
  error:
    'border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] text-[var(--tint-danger-text)]',
  warn: 'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]',
  info: 'border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] text-[var(--tint-info-text)]',
} as const;

export default function PromptDiagnosticsPanel({
  diagnostics,
  loading = false,
}: PromptDiagnosticsPanelProps) {
  if (loading) {
    return (
      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]/60 p-4 text-sm text-[var(--text-muted)]">
        Analyzing prompt…
      </section>
    );
  }

  if (!diagnostics) {
    return null;
  }

  const summary = summarizeDiagnostics(diagnostics);

  return (
    <section className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Diagnostics</h3>
        <span className="rounded-full border border-[var(--border-default)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
          {summary}
        </span>
      </div>

      <dl className="grid gap-2 text-xs text-[var(--text-muted)] sm:grid-cols-2">
        {diagnostics.inferred.sport && (
          <>
            <dt>Sport</dt>
            <dd className="text-[var(--text-primary)]">{diagnostics.inferred.sport}</dd>
          </>
        )}
        {diagnostics.inferred.cyclingDiscipline && (
          <>
            <dt>Discipline</dt>
            <dd className="text-[var(--text-primary)]">{diagnostics.inferred.cyclingDiscipline}</dd>
          </>
        )}
        {diagnostics.inferred.peopleCount && (
          <>
            <dt>People</dt>
            <dd className="text-[var(--text-primary)]">{diagnostics.inferred.peopleCount}</dd>
          </>
        )}
        {diagnostics.inferred.athleticCompetition && (
          <>
            <dt>Competition kit</dt>
            <dd className="text-[var(--text-primary)]">shared race kit</dd>
          </>
        )}
      </dl>

      {diagnostics.issues.length > 0 && (
        <ul className="space-y-2">
          {diagnostics.issues.map(issue => (
            <li
              key={issue.code}
              className={`rounded-lg border px-3 py-2 text-xs ${severityStyles[issue.severity]}`}
            >
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      {diagnostics.suggestions.length > 0 && (
        <ul className="space-y-1 text-xs text-[var(--text-muted)]">
          {diagnostics.suggestions.map(suggestion => (
            <li key={suggestion}>• {suggestion}</li>
          ))}
        </ul>
      )}

      {diagnostics.issues.length === 0 && diagnostics.suggestions.length === 0 && (
        <p className="text-xs text-[var(--tint-success-text)]/90">No issues detected.</p>
      )}
    </section>
  );
}
