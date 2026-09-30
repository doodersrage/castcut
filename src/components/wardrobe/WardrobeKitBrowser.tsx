'use client';

import { useEffect, useId, useMemo, useState, type UIEvent } from 'react';
import ModalPortal from '@/components/ui/ModalPortal';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import UiIcon from '@/components/ui/UiIcon';
import type { FittingSwipeKit } from '@/lib/fitting-room';
import {
  filterWardrobeKitsByQuery,
  formatWardrobeKitCount,
  formatWardrobeKitLabel,
  WARDROBE_KIT_BROWSER_PAGE,
} from '@/lib/wardrobe-kit-picker';
import { useWardrobeGarmentThumbManifestGeneration } from '@/hooks/useWardrobeGarmentThumbManifest';
import { resolveWardrobeGarmentThumbUrl } from '@/lib/wardrobe-garment-thumbs';
import type { WardrobeKitThumbState } from '@/components/wardrobe/WardrobeKitPicker';

export type WardrobeKitBrowserProps = {
  open: boolean;
  kits: FittingSwipeKit[];
  selectedId?: string;
  initialQuery?: string;
  disabled?: boolean;
  resolveThumb?: (kit: FittingSwipeKit) => WardrobeKitThumbState;
  onSelect: (wardrobeId: string) => void;
  onClose: () => void;
  /** Reused for saved clothing photos — defaults read as the outfit-kit catalog. */
  title?: string;
  description?: string;
  searchPlaceholder?: string;
  /** Packshots on white read better contained than cropped. */
  thumbFit?: 'cover' | 'contain';
};

/** Fresh mount per open so search state resets without setState-in-effect. */
export default function WardrobeKitBrowser({ open, ...props }: WardrobeKitBrowserProps) {
  if (!open) {
    return null;
  }
  return <WardrobeKitBrowserDialog {...props} />;
}

function WardrobeKitBrowserDialog({
  kits,
  selectedId,
  initialQuery = '',
  disabled = false,
  resolveThumb,
  onSelect,
  onClose,
  title = 'Browse outfit kits',
  description,
  searchPlaceholder = 'Search — tuxedo, monk, hi-vis, sari…',
  thumbFit = 'cover',
}: Omit<WardrobeKitBrowserProps, 'open'>) {
  useWardrobeGarmentThumbManifestGeneration();
  const titleId = useId();
  const searchId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [visibleCount, setVisibleCount] = useState(WARDROBE_KIT_BROWSER_PAGE);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const input = document.getElementById(searchId);
      if (input instanceof HTMLInputElement) {
        input.focus();
        input.select();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [searchId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const matches = useMemo(() => filterWardrobeKitsByQuery(kits, query), [kits, query]);
  const visible = matches.slice(0, visibleCount);
  const hiddenCount = Math.max(0, matches.length - visible.length);

  const onGridScroll = (event: UIEvent<HTMLDivElement>) => {
    if (hiddenCount <= 0) {
      return;
    }
    const node = event.currentTarget;
    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (remaining <= 180) {
      setVisibleCount(previous => Math.min(matches.length, previous + WARDROBE_KIT_BROWSER_PAGE));
    }
  };

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[80] flex items-end justify-center bg-[var(--bg-base)]/70 p-3 backdrop-blur-sm sm:items-center sm:p-4"
        role="presentation"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-testid="wardrobe-kit-browser"
          className="flex max-h-[min(92vh,880px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/95 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
          onClick={event => event.stopPropagation()}
        >
          <div className="space-y-3 border-b border-[var(--border-subtle)] px-4 py-4 sm:px-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h2 id={titleId} className="type-heading text-[var(--text-primary)]">
                  {title}
                </h2>
                <p className="type-caption text-[var(--text-muted)]">
                  {description ??
                    `${formatWardrobeKitCount(kits.length)} kit${kits.length === 1 ? '' : 's'} in this type — search, then tap one to wear it.`}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Close"
                title="Close"
                className="shrink-0 px-2"
                onClick={onClose}
              >
                <UiIcon name="close" size={16} />
              </Button>
            </div>
            <div className="relative">
              <UiIcon
                name="search"
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              />
              <TextInput
                id={searchId}
                value={query}
                disabled={disabled}
                aria-label={`Search ${title.replace(/^Browse\s+/i, '')}`}
                placeholder={searchPlaceholder}
                className="w-full pl-9"
                onChange={event => {
                  setQuery(event.target.value);
                  setVisibleCount(WARDROBE_KIT_BROWSER_PAGE);
                }}
              />
            </div>
            <p className="type-caption text-[var(--text-muted)]">
              {matches.length === kits.length
                ? `Showing ${formatWardrobeKitCount(visible.length)} of ${formatWardrobeKitCount(kits.length)}`
                : `${formatWardrobeKitCount(matches.length)} match${matches.length === 1 ? '' : 'es'} · showing ${formatWardrobeKitCount(visible.length)}`}
            </p>
          </div>

          <div
            className="ui-scroll-region min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5"
            onScroll={onGridScroll}
          >
            {matches.length === 0 ? (
              <p className="type-caption text-[var(--text-muted)]">
                No kits match “{query.trim()}”. Try another word or clear search.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {visible.map(kit => {
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
                      type="button"
                      disabled={disabled}
                      title={label}
                      aria-label={`${label}${selected ? ' (selected)' : ''}`}
                      aria-current={selected ? 'true' : undefined}
                      onClick={() => {
                        onSelect(kit.id);
                        onClose();
                      }}
                      className={`group relative flex flex-col rounded-xl p-1.5 text-left transition duration-150 ${
                        selected
                          ? 'bg-[var(--accent-soft)] ring-2 ring-[var(--accent)]'
                          : 'ring-1 ring-[var(--border-subtle)] hover:-translate-y-0.5 hover:bg-[var(--bg-hover)] hover:ring-[var(--border-strong)]'
                      }`}
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className={`aspect-[3/4] w-full rounded-lg bg-[var(--bg-muted)] ${thumbFit === 'contain' ? 'object-contain' : 'object-cover'}`}
                        />
                      ) : (
                        <span className="flex aspect-[3/4] w-full items-center justify-center rounded-lg bg-[var(--bg-muted)] type-caption text-[var(--text-muted)]">
                          {pending ? '…' : '—'}
                        </span>
                      )}
                      {selected ? (
                        <span
                          aria-hidden
                          className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-sm"
                        >
                          <UiIcon name="check" size={13} />
                        </span>
                      ) : null}
                      {/* Fixed two-line label so every tile in a row is the same height. */}
                      <span
                        className={`mt-2 line-clamp-2 min-h-[2lh] px-0.5 type-caption leading-snug ${
                          selected ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {hiddenCount > 0 ? (
              <div className="mt-4 flex justify-center">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() =>
                    setVisibleCount(previous =>
                      Math.min(matches.length, previous + WARDROBE_KIT_BROWSER_PAGE)
                    )
                  }
                >
                  Load {Math.min(WARDROBE_KIT_BROWSER_PAGE, hiddenCount)} more
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
