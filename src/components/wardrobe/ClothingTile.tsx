'use client';

import type { Ref } from 'react';
import UiIcon from '@/components/ui/UiIcon';

/** Strip tile widths — every tile is 3:4 so photos line up. */
export const CLOTHING_TILE_WIDTH = {
  sm: 'w-14',
  md: 'w-[4.5rem]',
} as const;

/** Soft edges on a scrolling tile strip, independent of the card colour behind it. */
export const CLOTHING_STRIP_CLASS =
  'flex items-start gap-2 overflow-x-auto px-3 py-2 [scrollbar-width:none] [mask-image:linear-gradient(to_right,transparent,black_14px,black_calc(100%-14px),transparent)]';

/**
 * One 3:4 clothing thumb (catalog kit or saved photo): accent ring + check when picked, a
 * hover lift otherwise, and an optional remove button in the corner.
 */
export default function ClothingTile({
  label,
  thumbUrl,
  pending = false,
  selected = false,
  disabled = false,
  size = 'md',
  fit = 'cover',
  buttonRef,
  onSelect,
  onRemove,
  testId,
}: {
  label: string;
  thumbUrl?: string | null;
  pending?: boolean;
  selected?: boolean;
  disabled?: boolean;
  size?: keyof typeof CLOTHING_TILE_WIDTH;
  /** Packshots on a plain backdrop read better uncropped. */
  fit?: 'cover' | 'contain';
  buttonRef?: Ref<HTMLButtonElement>;
  onSelect: () => void;
  onRemove?: () => void;
  testId?: string;
}) {
  const thumb = thumbUrl?.trim() || '';
  return (
    <div className={`group relative shrink-0 ${CLOTHING_TILE_WIDTH[size]}`} data-testid={testId}>
      <button
        ref={buttonRef}
        type="button"
        data-active={selected ? 'true' : 'false'}
        disabled={disabled}
        title={label}
        aria-label={`${label}${selected ? ' (selected)' : ''}`}
        aria-current={selected ? 'true' : undefined}
        onClick={onSelect}
        className={`block w-full rounded-lg transition duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
          selected
            ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-base)]'
            : 'ring-1 ring-[var(--border-subtle)] hover:-translate-y-0.5 hover:ring-[var(--border-strong)]'
        }`}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            loading="lazy"
            decoding="async"
            className={`block aspect-[3/4] w-full rounded-lg bg-[var(--bg-muted)] ${
              fit === 'contain' ? 'object-contain p-1' : 'object-cover'
            }`}
          />
        ) : (
          <span className="flex aspect-[3/4] w-full items-center justify-center rounded-lg bg-[var(--bg-muted)] type-caption text-[var(--text-muted)]">
            {pending ? '…' : '—'}
          </span>
        )}
      </button>
      {selected ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-sm ring-2 ring-[var(--bg-base)]"
        >
          <UiIcon name="check" size={12} />
        </span>
      ) : onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          title="Remove"
          disabled={disabled}
          onClick={onRemove}
          // Always visible — phones have no hover to reveal it.
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)] shadow-sm ring-1 ring-[var(--border-default)] transition hover:text-[var(--text-primary)]"
        >
          <UiIcon name="close" size={10} />
        </button>
      ) : null}
    </div>
  );
}
