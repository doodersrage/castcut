'use client';

export function TrayProgressBar({
  percent,
  label,
  compact = false,
}: {
  percent: number;
  label?: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      <div
        className={`ui-progress-track ${compact ? '!h-1' : ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label || `Progress ${percent}%`}
      >
        <div className="ui-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      {label && !compact ? (
        <p className="type-caption text-[var(--text-tertiary)]">{label}</p>
      ) : null}
    </div>
  );
}
