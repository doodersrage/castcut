'use client';

import type { RefObject } from 'react';
import { Button } from '@/components/ui/Button';
import type { FittingSwipeKit } from '@/lib/fitting-room';
import { resolveWardrobeGarmentThumbUrl } from '@/lib/wardrobe-garment-thumbs';

export type WardrobeKitPickerKit = FittingSwipeKit;

export type WardrobeKitThumbState = {
  url?: string | null;
  pending?: boolean;
};

export type WardrobeKitPickerProps = {
  kits: WardrobeKitPickerKit[];
  selectedId?: string;
  disabled?: boolean;
  /** Visual size of each thumb. */
  size?: 'sm' | 'md';
  activeThumbRef?: RefObject<HTMLButtonElement | null>;
  /**
   * Optional per-kit thumb resolver. Defaults to packaged garment thumbs.
   * Return person draft URL when available (Fitting); garment falls back inside.
   */
  resolveThumb?: (kit: WardrobeKitPickerKit) => WardrobeKitThumbState;
  onSelect: (wardrobeId: string) => void;
  onSwipe?: (delta: -1 | 1) => void;
  showNav?: boolean;
  emptyLabel?: string;
  testId?: string;
};

const SIZE_CLASS = {
  sm: 'h-16 w-14',
  md: 'h-20 w-16',
} as const;

export default function WardrobeKitPicker({
  kits,
  selectedId,
  disabled = false,
  size = 'md',
  activeThumbRef,
  resolveThumb,
  onSelect,
  onSwipe,
  showNav = true,
  emptyLabel = 'Pick a kit to swipe',
  testId,
}: WardrobeKitPickerProps) {
  if (kits.length === 0) {
    return null;
  }

  const selectedIndex = selectedId ? kits.findIndex(kit => kit.id === selectedId) : -1;
  const activeKit = selectedIndex >= 0 ? kits[selectedIndex] : null;
  const canSwipe = Boolean(onSwipe) && kits.length > 1 && !disabled;

  return (
    <div className="space-y-3" data-testid={testId}>
      {showNav && onSwipe ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={!canSwipe}
            onClick={() => onSwipe(-1)}
            className={size === 'sm' ? 'flex-1 justify-center' : undefined}
          >
            Prev
          </Button>
          <span className="type-caption min-w-0 flex-1 text-center text-[var(--text-muted)]">
            {activeKit ? (
              <>
                <span className="block truncate">
                  {activeKit.label}
                  {activeKit.group ? ` · ${activeKit.group}` : ''}
                </span>
                {kits.length > 1 ? (
                  <span className="mt-0.5 block text-[var(--text-muted)]">
                    {selectedIndex + 1} / {kits.length}
                    {size === 'sm' ? ' · swipe left/right' : ''}
                  </span>
                ) : null}
              </>
            ) : (
              emptyLabel
            )}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={!canSwipe}
            onClick={() => onSwipe(1)}
            className={size === 'sm' ? 'flex-1 justify-center' : undefined}
          >
            Next
          </Button>
        </div>
      ) : null}

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {kits.map(kit => {
          const state = resolveThumb?.(kit) ?? {
            url: resolveWardrobeGarmentThumbUrl(kit.id),
            pending: false,
          };
          const thumb = state.url?.trim() || '';
          const pending = Boolean(state.pending);
          const selected = selectedId === kit.id;
          return (
            <button
              key={kit.id}
              ref={selected ? activeThumbRef : undefined}
              type="button"
              data-active={selected ? 'true' : 'false'}
              disabled={disabled}
              title={kit.label}
              aria-label={kit.label}
              aria-current={selected ? 'true' : undefined}
              onClick={() => onSelect(kit.id)}
              className={`shrink-0 overflow-hidden rounded-md border p-1 transition ${
                selected
                  ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] shadow-[0_0_0_1px_var(--accent-border)]'
                  : 'border-[var(--border-default)] bg-transparent hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumb}
                  alt=""
                  className={`block rounded object-cover ${SIZE_CLASS[size]}`}
                />
              ) : (
                <span
                  className={`flex items-center justify-center rounded border border-[var(--border-subtle)] type-caption text-[var(--text-muted)] ${SIZE_CLASS[size]}`}
                >
                  {pending ? '…' : '—'}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
