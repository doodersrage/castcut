'use client';

import { useEffect, useRef } from 'react';

export type PortraitTile = {
  id: string;
  label: string;
  /** Tooltip (defaults to the label). */
  title?: string;
  /** A 3:4 picture — a look plate or face; the glyph shows when there is none. */
  thumb?: string;
  glyph?: string;
  /** A second, smaller line under the name (a look's locked outfit). */
  caption?: string;
  /** With no thumb: a dashed "missing picture" box with this text (a look with no plate). */
  placeholder?: string;
};

/**
 * Pick one person (or look) by picture: a scrolling row of 3:4 tiles with a name under each.
 * Used for the Cast, a Cast's looks and Day's partner — a dropdown hid them behind a list of
 * names, and the faces are what you choose by.
 */
export default function PortraitTileStrip({
  label,
  value,
  tiles,
  disabled,
  onChange,
  testIdPrefix,
  className = '',
}: {
  /** Accessible name of the group ("Partner", "Active character"). */
  label: string;
  value: string;
  tiles: PortraitTile[];
  disabled?: boolean;
  onChange: (next: string) => void;
  /** Tiles get `${testIdPrefix}-${id || 'none'}`; the strip gets `${testIdPrefix}s`. */
  testIdPrefix: string;
  className?: string;
}) {
  // Keep the chosen tile in view: with a long Cast the strip scrolls and the pick was off-screen.
  // Scrolls the strip only, never the page.
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = stripRef.current;
    const chosen = strip?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!strip || !chosen) return;
    const left = chosen.offsetLeft - strip.offsetLeft;
    if (
      left < strip.scrollLeft ||
      left + chosen.offsetWidth > strip.scrollLeft + strip.clientWidth
    ) {
      strip.scrollLeft = Math.max(0, left - 8);
    }
  }, [value, tiles.length]);
  return (
    <div
      ref={stripRef}
      role="radiogroup"
      aria-label={label}
      className={`-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 pb-1 ${className}`.trim()}
      data-testid={`${testIdPrefix}s`}
    >
      {tiles.map(tile => {
        const selected = tile.id === value;
        return (
          <button
            key={tile.id || 'none'}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={tile.label}
            title={tile.title ?? tile.label}
            disabled={disabled}
            data-testid={`${testIdPrefix}-${tile.id || 'none'}`}
            data-placeholder={!tile.thumb && tile.placeholder ? 'true' : undefined}
            // Re-tapping the pick must do nothing: a dropdown never fired for the same value, and
            // here it reset the partner's face and re-applied the Cast over unsaved changes.
            onClick={() => {
              if (!selected) onChange(tile.id);
            }}
            className={`group relative flex w-[4.75rem] shrink-0 flex-col items-center gap-1 rounded-xl border p-1 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:cursor-not-allowed disabled:opacity-50 ${
              // The pick has to read at a glance: tinted tile, heavy ring, a tick.
              selected
                ? 'border-[var(--accent)] bg-[var(--accent-muted)]'
                : 'border-transparent hover:bg-[var(--bg-hover)]'
            }`}
          >
            <span
              // 3:4 like the Cast roster: look plates are full-body, a circle showed a speck.
              className={`flex h-16 w-12 items-center justify-center overflow-hidden rounded-lg border-2 bg-[var(--bg-subtle)] text-base font-medium text-[var(--text-muted)] ${
                !tile.thumb && tile.placeholder ? 'border-dashed' : ''
              } ${
                selected
                  ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]'
                  : 'border-[var(--border-subtle)] opacity-80 group-hover:opacity-100'
              }`}
            >
              {tile.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tile.thumb}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover object-top"
                />
              ) : tile.placeholder ? (
                <span className="flex flex-col items-center px-0.5 text-[10px] font-normal leading-tight">
                  <span aria-hidden className="text-base leading-none">
                    +
                  </span>
                  {tile.placeholder}
                </span>
              ) : (
                <span aria-hidden>{tile.glyph ?? tile.label.slice(0, 1).toUpperCase()}</span>
              )}
            </span>
            {selected ? (
              <span
                aria-hidden
                className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-bold leading-none text-white shadow"
              >
                ✓
              </span>
            ) : null}
            <span
              className={`line-clamp-2 w-full text-[11px] leading-tight ${
                selected
                  ? 'font-semibold text-[var(--accent-text)]'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              {tile.label}
            </span>
            {tile.caption ? (
              <span className="line-clamp-1 w-full text-[10px] leading-tight text-[var(--text-muted)]">
                {tile.caption}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
