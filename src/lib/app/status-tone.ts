/**
 * One colour rule for status chips (UI review 2026-10-15 — chips used about five schemes):
 * accent = working on it / picked, success = done, warning = needs you, danger = failed,
 * neutral = a plain fact. Rendered with `.ui-badge[data-tone]`.
 */
export type StatusTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

/** A render job's state → its chip tone (queued / pending and cancelled read as plain facts). */
export function jobStatusTone(status: string | undefined | null): StatusTone {
  switch (status) {
    case 'running':
    case 'in_progress':
      return 'accent';
    case 'completed':
    case 'success':
      return 'success';
    case 'error':
    case 'failed':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** Border + tint + text classes for a box (card, notice) that isn't a `.ui-badge`. */
export function statusToneClasses(tone: StatusTone): string {
  switch (tone) {
    case 'accent':
      return 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]';
    case 'success':
      return 'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]';
    case 'warning':
      return 'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]';
    case 'danger':
      return 'border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] text-[var(--tint-danger-text)]';
    default:
      return 'border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]';
  }
}
