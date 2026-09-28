'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';
import WardrobeKitBrowser from '@/components/wardrobe/WardrobeKitBrowser';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import UiIcon from '@/components/ui/UiIcon';
import type { FittingSwipeKit } from '@/lib/fitting-room';
import { useWardrobeGarmentThumbManifestGeneration } from '@/hooks/useWardrobeGarmentThumbManifest';
import { resolveWardrobeGarmentThumbUrl } from '@/lib/wardrobe-garment-thumbs';
import {
  buildWardrobeKitStrip,
  filterWardrobeKitsByQuery,
  formatWardrobeKitCount,
  formatWardrobeKitLabel,
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

/** Strip tile widths — every tile is 3:4 so photos line up. */
const SIZE_CLASS = {
  sm: 'w-14',
  md: 'w-[4.5rem]',
} as const;

/** Soft edges on the scrolling strip, independent of the card colour behind it. */
const STRIP_EDGE_MASK =
  '[mask-image:linear-gradient(to_right,transparent,black_14px,black_calc(100%-14px),transparent)]';

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
  emptyLabel = 'No kit picked yet — choose one below.',
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

  const activeThumb = activeKit
    ? (
        resolveThumb?.(activeKit) ?? { url: resolveWardrobeGarmentThumbUrl(activeKit.id) }
      ).url?.trim() || ''
    : '';
  const navigable = showNav && Boolean(onSwipe) && Boolean(activeKit);

  return (
    <div className="space-y-2.5" data-testid={testId}>
      {/* Current kit: what's on her now, with Prev / Next once there is something to step from. */}
      <div className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-1.5">
        {navigable ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={!canSwipe}
            aria-label="Previous kit"
            title="Previous kit"
            className="shrink-0 px-2"
            onClick={() => onSwipe?.(-1)}
          >
            <UiIcon name="chevronLeft" size={16} />
          </Button>
        ) : null}
        <div className="flex min-w-0 flex-1 items-center gap-2.5 px-1">
          {activeKit ? (
            <>
              {activeThumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeThumb}
                  alt=""
                  decoding="async"
                  className="aspect-[3/4] w-9 shrink-0 rounded-md bg-[var(--bg-muted)] object-cover"
                />
              ) : null}
              <div className="min-w-0">
                <p className="type-body truncate text-[var(--text-primary)]">
                  {formatWardrobeKitLabel(activeKit.label)}
                </p>
                <p className="type-caption truncate text-[var(--text-muted)]">
                  {[
                    activeKit.group,
                    kits.length > 1
                      ? `${formatWardrobeKitCount(selectedIndex + 1)} of ${formatWardrobeKitCount(kits.length)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  {navigable && size === 'sm' && kits.length > 1 ? ' · swipe to browse' : ''}
                </p>
              </div>
            </>
          ) : (
            <p className="type-caption py-1.5 text-[var(--text-muted)]">{emptyLabel}</p>
          )}
        </div>
        {navigable ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={!canSwipe}
            aria-label="Next kit"
            title="Next kit"
            className="shrink-0 px-2"
            onClick={() => onSwipe?.(1)}
          >
            <UiIcon name="chevronRight" size={16} />
          </Button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <UiIcon
            name="search"
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <TextInput
            value={query}
            disabled={disabled}
            placeholder="Search kits…"
            className="w-full pl-8"
            aria-label="Search outfit kits"
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                openBrowser();
              }
            }}
          />
        </div>
        <Button
          variant="secondary"
          disabled={disabled}
          onClick={openBrowser}
          data-testid={testId ? `${testId}-browse` : undefined}
          className="shrink-0"
        >
          {/* Preflight makes SVGs block-level; keep the icon on the label's line. */}
          <span className="inline-flex items-center gap-1.5">
            <UiIcon name="grid" size={14} />
            Browse
          </span>
        </Button>
      </div>

      <div
        ref={stripRef}
        className={`flex items-start gap-2 overflow-x-auto px-3 py-2 [scrollbar-width:none] ${STRIP_EDGE_MASK}`}
      >
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
            const label = formatWardrobeKitLabel(kit.label);
            return (
              <button
                key={kit.id}
                ref={selected ? assignActiveRef : undefined}
                type="button"
                data-active={selected ? 'true' : 'false'}
                disabled={disabled}
                title={label}
                aria-label={`${label}${selected ? ' (selected)' : ''}`}
                aria-current={selected ? 'true' : undefined}
                onClick={() => selectKit(kit.id)}
                className={`group relative shrink-0 rounded-lg transition duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${SIZE_CLASS[size]} ${
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
                    className="block aspect-[3/4] w-full rounded-lg bg-[var(--bg-muted)] object-cover"
                  />
                ) : (
                  <span className="flex aspect-[3/4] w-full items-center justify-center rounded-lg bg-[var(--bg-muted)] type-caption text-[var(--text-muted)]">
                    {pending ? '…' : '—'}
                  </span>
                )}
                {selected ? (
                  <span
                    aria-hidden
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-sm ring-2 ring-[var(--bg-base)]"
                  >
                    <UiIcon name="check" size={12} />
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>

      <p className="type-caption text-[var(--text-muted)]">
        {trimmedQuery
          ? `${stripKits.length} match${stripKits.length === 1 ? '' : 'es'} here · Browse for everything`
          : `Recent and nearby · ${formatWardrobeKitCount(kits.length)} kits in this type`}
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
