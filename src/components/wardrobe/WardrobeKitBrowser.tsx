'use client';

import { useEffect, useId, useMemo, useState, type UIEvent } from 'react';
import ModalPortal from '@/components/ui/ModalPortal';
import { Button } from '@/components/ui/Button';
import { FieldLabel, TextInput } from '@/components/ui/Field';
import type { FittingSwipeKit } from '@/lib/fitting-room';
import { filterWardrobeKitsByQuery, WARDROBE_KIT_BROWSER_PAGE } from '@/lib/wardrobe-kit-picker';
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
                  Browse outfit kits
                </h2>
                <p className="type-caption text-[var(--text-muted)]">
                  Search the filtered catalog, then pick a kit. {kits.length} kit
                  {kits.length === 1 ? '' : 's'} in this type.
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
            <label className="block space-y-1.5">
              <FieldLabel htmlFor={searchId}>Search</FieldLabel>
              <TextInput
                id={searchId}
                value={query}
                disabled={disabled}
                placeholder="e.g. tuxedo, monk, hi-vis, sari…"
                onChange={event => {
                  setQuery(event.target.value);
                  setVisibleCount(WARDROBE_KIT_BROWSER_PAGE);
                }}
              />
            </label>
            <p className="type-caption text-[var(--text-muted)]">
              {matches.length === kits.length
                ? `Showing ${visible.length} of ${kits.length}`
                : `${matches.length} match${matches.length === 1 ? '' : 'es'} · showing ${visible.length}`}
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
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {visible.map(kit => {
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
                      type="button"
                      disabled={disabled}
                      title={kit.label}
                      aria-label={`${kit.label}${selected ? ' (selected)' : ''}`}
                      aria-current={selected ? 'true' : undefined}
                      onClick={() => {
                        onSelect(kit.id);
                        onClose();
                      }}
                      className={`overflow-hidden rounded-lg border-2 p-1.5 text-left transition ${
                        selected
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_0_0_2px_var(--accent-ring)]'
                          : 'border-[var(--border-default)] bg-transparent hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="aspect-[3/4] w-full rounded object-cover"
                        />
                      ) : (
                        <span className="flex aspect-[3/4] w-full items-center justify-center rounded border border-[var(--border-subtle)] type-caption text-[var(--text-muted)]">
                          {pending ? '…' : '—'}
                        </span>
                      )}
                      <span className="mt-1.5 line-clamp-2 block type-caption text-[var(--text-secondary)]">
                        {kit.label}
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
