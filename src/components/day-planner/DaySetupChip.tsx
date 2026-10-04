'use client';

import type { CharacterRecord } from '@/lib/character-os';

/**
 * Setup as a status chip — "Nora · plate ready" — that opens the Setup sheet (Cast lead, look,
 * plate). Setup is done on the Cast page; on Day it is a check, not a section.
 */
export default function DaySetupChip({
  character,
  hasPlate,
  onClick,
  className = '',
}: {
  character: CharacterRecord | null | undefined;
  hasPlate: boolean;
  onClick: () => void;
  className?: string;
}) {
  const name = character?.name?.trim() || '';
  const text = !character
    ? 'No Cast lead'
    : hasPlate
      ? `${name || 'Cast'} · plate ready`
      : `${name || 'Cast'} · no plate yet`;
  const tone = !character || !hasPlate ? 'warn' : 'ok';
  return (
    <button
      type="button"
      className={[
        'ui-chip inline-flex max-w-full items-center gap-1.5',
        tone === 'warn' ? 'border-[var(--tint-warning-border,var(--accent-border))]' : '',
        className,
      ]
        .join(' ')
        .trim()}
      title="Setup — Cast lead, look and plate"
      aria-haspopup="dialog"
      data-testid="day-setup-chip"
      data-state={tone}
      onClick={onClick}
    >
      <span
        aria-hidden
        className={[
          'h-1.5 w-1.5 shrink-0 rounded-full',
          tone === 'ok'
            ? 'bg-[var(--tint-success-text)]'
            : 'bg-[var(--tint-warning-text,var(--accent-text))]',
        ].join(' ')}
      />
      <span className="truncate">{text}</span>
      <span aria-hidden className="text-[var(--text-muted)]">
        ▾
      </span>
    </button>
  );
}
