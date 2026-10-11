'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode, RefObject } from 'react';
import ClothingTile, { CLOTHING_STRIP_CLASS } from '@/components/wardrobe/ClothingTile';
import WardrobeKitBrowser from '@/components/wardrobe/WardrobeKitBrowser';
import WearingCard from '@/components/wardrobe/WearingCard';
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
  /** Extra control between search and Browse (e.g. a clothing-type filter). */
  toolbarExtra?: ReactNode;
  /** Extra action at the end of the "now wearing" card (e.g. let the planner pick). */
  cardAction?: ReactNode;
};

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
  toolbarExtra,
  cardAction,
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
      <WearingCard
        thumbUrl={activeThumb}
        title={activeKit ? formatWardrobeKitLabel(activeKit.label) : null}
        emptyLabel={emptyLabel}
        meta={
          activeKit
            ? [
                activeKit.group,
                kits.length > 1
                  ? `${formatWardrobeKitCount(selectedIndex + 1)} of ${formatWardrobeKitCount(kits.length)}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ') +
              (navigable && size === 'sm' && kits.length > 1 ? ' · swipe to browse' : '')
            : null
        }
        start={
          navigable ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={!canSwipe}
              aria-label="Previous kit"
              title="Previous kit"
              className="shrink-0 px-1.5"
              onClick={() => onSwipe?.(-1)}
            >
              <UiIcon name="chevronLeft" size={16} />
            </Button>
          ) : null
        }
        end={
          <>
            {cardAction}
            {navigable ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={!canSwipe}
                aria-label="Next kit"
                title="Next kit"
                className="shrink-0 px-1.5"
                onClick={() => onSwipe?.(1)}
              >
                <UiIcon name="chevronRight" size={16} />
              </Button>
            ) : null}
          </>
        }
      />

      {/* Search + Browse on top, the extra control (clothing type) full width below — at every
          width: Outfit's clothes column is narrow even on desktop, and one row squeezed the
          search box to ~40 px under the type filter (UI audit 2026-10-11). */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
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
        {toolbarExtra ? <div className="order-last col-span-2 flex">{toolbarExtra}</div> : null}
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

      <div ref={stripRef} className={CLOTHING_STRIP_CLASS}>
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
            const selected = selectedId === kit.id;
            return (
              <ClothingTile
                key={kit.id}
                label={formatWardrobeKitLabel(kit.label)}
                thumbUrl={state.url}
                pending={Boolean(state.pending)}
                selected={selected}
                disabled={disabled}
                size={size}
                buttonRef={selected ? assignActiveRef : undefined}
                onSelect={() => selectKit(kit.id)}
              />
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
