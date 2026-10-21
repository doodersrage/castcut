'use client';

export function FilterChip(props: {
  active: boolean;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  const isActive = props.active;

  return (
    <button
      type="button"
      onClick={props.onClick}
      data-testid={props.testId}
      data-active={isActive ? 'true' : 'false'}
      className={`${
        isActive
          ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
          : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:border-[var(--border-default)] hover:text-[var(--text-secondary)]'
      } rounded-xl px-2.5 py-1 text-2xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]`}
    >
      {props.label}
    </button>
  );
}
