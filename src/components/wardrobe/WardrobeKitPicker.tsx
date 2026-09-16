'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';
import WardrobeKitBrowser from '@/components/wardrobe/WardrobeKitBrowser';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import type { FittingSwipeKit } from '@/lib/fitting-room';
import { useWardrobeGarmentThumbManifestGeneration } from '@/hooks/useWardrobeGarmentThumbManifest';
import { resolveWardrobeGarmentThumbUrl } from '@/lib/wardrobe-garment-thumbs';
import {
  buildWardrobeKitStrip,
  filterWardrobeKitsByQuery,
  loadRecentWardrobeKitIds,
  rememberWardrobeKitId,
  subscribeRecentWardrobeKitIds,
} from '@/lib/wardrobe-kit-picker';

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

function useRecentWardrobeKitIds(): string[] {
  const snapshot = useSyncExternalStore(
    subscribeRecentWardrobeKitIds,
    () => JSON.stringify(loadRecentWardrobeKitIds()),
    () => '[]'
  );
  return useMemo(() => {
    try {
      const parsed = JSON.parse(snapshot) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((entry): entry is string => typeof entry === 'string')
        : [];
    } catch {
      return [];
    }
  }, [snapshot]);
}

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
  useWardrobeGarmentThumbManifestGeneration();
  const internalActiveRef = useRef<HTMLButtonElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const [browserOpen, setBrowserOpen] = useState(false);
  const [browserKey, setBrowserKey] = useState(0);
  const recentIds = useRecentWardrobeKitIds();

  const selectedIndex = selectedId ? kits.findIndex(kit => kit.id === selectedId) : -1;
  const activeKit = selectedIndex >= 0 ? kits[selectedIndex] : null;
  const canSwipe = Boolean(onSwipe) && kits.length > 1 && !disabled;
  const trimmedQuery = query.trim();

  const stripKits = useMemo(() => {
    if (trimmedQuery) {
      return filterWardrobeKitsByQuery(kits, trimmedQuery).slice(0, 24);
    }
    return buildWardrobeKitStrip(kits, selectedId, recentIds);
  }, [kits, recentIds, selectedId, trimmedQuery]);

  useEffect(() => {
    const strip = stripRef.current;
    const node = internalActiveRef.current;
    if (!strip || !node || trimmedQuery) {
      return;
    }
    const stripRect = strip.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const delta = nodeRect.left + nodeRect.width / 2 - (stripRect.left + stripRect.width / 2);
    if (Math.abs(delta) < 1) {
      return;
    }
    strip.scrollBy({ left: delta, behavior: 'smooth' });
  }, [selectedId, stripKits, trimmedQuery]);

  const selectKit = useCallback(
    (wardrobeId: string) => {
      rememberWardrobeKitId(wardrobeId);
      onSelect(wardrobeId);
      setQuery('');
    },
    [onSelect]
  );

  const openBrowser = useCallback(() => {
    setBrowserKey(key => key + 1);
    setBrowserOpen(true);
  }, []);

  if (kits.length === 0) {
    return null;
  }

  const assignActiveRef = (node: HTMLButtonElement | null) => {
    internalActiveRef.current = node;
    if (activeThumbRef) {
      activeThumbRef.current = node;
    }
  };

  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          value={query}
          disabled={disabled}
          placeholder="Search kits…"
          className="min-w-[10rem] flex-1"
          aria-label="Search outfit kits"
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              openBrowser();
            }
          }}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={openBrowser}
          data-testid={testId ? `${testId}-browse` : undefined}
        >
          Browse
        </Button>
      </div>

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
      ) : activeKit ? (
        <p className="type-caption text-[var(--text-muted)]">
          <span className="text-[var(--text-secondary)]">{activeKit.label}</span>
          {activeKit.group ? ` · ${activeKit.group}` : ''}
          {kits.length > 1 ? ` · ${selectedIndex + 1} / {kits.length}` : ''}
        </p>
      ) : (
        <p className="type-caption text-[var(--text-muted)]">{emptyLabel}</p>
      )}

      <div ref={stripRef} className="-mx-1 flex items-end gap-2 overflow-x-auto px-1 py-1.5">
        {stripKits.length === 0 ? (
          <p className="type-caption px-1 text-[var(--text-muted)]">
            No kits match “{trimmedQuery}”. Try Browse for the full grid.
          </p>
        ) : (
          stripKits.map(kit => {
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
                ref={selected ? assignActiveRef : undefined}
                type="button"
                data-active={selected ? 'true' : 'false'}
                disabled={disabled}
                title={kit.label}
                aria-label={`${kit.label}${selected ? ' (selected)' : ''}`}
                aria-current={selected ? 'true' : undefined}
                onClick={() => selectKit(kit.id)}
                className={`relative shrink-0 overflow-hidden rounded-md border-2 p-1 transition ${
                  selected
                    ? 'z-[1] scale-105 border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_0_0_3px_var(--accent-ring)]'
                    : 'border-[var(--border-default)] bg-transparent opacity-45 hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] hover:opacity-80'
                }`}
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={`block rounded object-cover ${SIZE_CLASS[size]}`}
                  />
                ) : (
                  <span
                    className={`flex items-center justify-center rounded border border-[var(--border-subtle)] type-caption text-[var(--text-muted)] ${SIZE_CLASS[size]}`}
                  >
                    {pending ? '…' : '—'}
                  </span>
                )}
                {selected ? (
                  <span
                    aria-hidden
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[11px] font-bold leading-none text-white shadow-sm"
                  >
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>

      <p className="type-caption text-[var(--text-muted)]">
        {trimmedQuery
          ? `${stripKits.length} match${stripKits.length === 1 ? '' : 'es'} in strip · Browse for the full grid`
          : `Nearby & recent kits · ${kits.length} in this type · Browse to search the rest`}
      </p>

      <WardrobeKitBrowser
        key={browserKey}
        open={browserOpen}
        kits={kits}
        selectedId={selectedId}
        initialQuery={query}
        disabled={disabled}
        resolveThumb={resolveThumb}
        onClose={() => setBrowserOpen(false)}
        onSelect={selectKit}
      />
    </div>
  );
}
