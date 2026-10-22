'use client';

import { Button } from '@/components/ui/Button';

export function FilterChip(props: {
  active: boolean;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  const isActive = props.active;

  return (
    <Button
      variant="chip"
      selected={isActive}
      type="button"
      onClick={props.onClick}
      data-testid={props.testId}
      data-active={isActive ? 'true' : 'false'}
      className={`${
        isActive ? '' : 'bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]'
      } rounded-xl border-0 px-2.5 py-1 text-2xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]`}
    >
      {props.label}
    </Button>
  );
}
