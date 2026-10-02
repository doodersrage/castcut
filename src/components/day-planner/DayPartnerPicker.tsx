'use client';

import { useEffect, useRef } from 'react';
import { DAY_NEW_PARTNER_OPTIONS, type DayPartnerNoun } from '@/lib/day-partner';

export type DayPartnerOption = {
  id: string;
  name: string;
  noun: DayPartnerNoun;
  /** The Cast's look plate, when they have one. */
  thumb?: string;
};

type Tile = { id: string; label: string; title: string; thumb?: string; glyph: string };

/**
 * Who plays the second person on two-person stills, picked by face: someone new each still, the
 * same invented woman or man all day, or a Cast member. (A dropdown hid the Cast behind a list of
 * names; the faces are what you choose by.)
 */
export default function DayPartnerPicker({
  value,
  options,
  standInUrl,
  disabled,
  onChange,
}: {
  /** '' = someone new each still, `new:woman` / `new:man`, or a Cast id. */
  value: string;
  options: DayPartnerOption[];
  /** The invented partner's face, once the first two-person still has made it. */
  standInUrl?: string;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  const tiles: Tile[] = [
    {
      id: '',
      label: 'Someone new',
      title: 'A different stranger on each two-person still',
      glyph: '?',
    },
    ...DAY_NEW_PARTNER_OPTIONS.map(option => ({
      id: option.id,
      label: option.noun === 'woman' ? 'Same woman' : 'Same man',
      title: option.label,
      thumb: value === option.id ? standInUrl : undefined,
      glyph: option.noun === 'woman' ? '♀' : '♂',
    })),
    ...options.map(option => ({
      id: option.id,
      label: option.name,
      title: `${option.name} — from your Cast`,
      thumb: option.thumb,
      glyph: option.name.slice(0, 1).toUpperCase(),
    })),
  ];
  // Keep the chosen partner in view: with a long Cast the strip scrolls, and the hint below named
  // someone who was off-screen. Scrolls the strip only, never the page.
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
  }, [value, options.length]);
  return (
    <div
      ref={stripRef}
      role="radiogroup"
      aria-label="Partner"
      className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 pb-1"
      data-testid="day-partner-options"
    >
      {tiles.map(tile => {
        const selected = tile.id === value;
        return (
          <button
            key={tile.id || 'new'}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={tile.label}
            title={tile.title}
            disabled={disabled}
            data-testid={`day-partner-option-${tile.id || 'new'}`}
            onClick={() => onChange(tile.id)}
            className="group flex w-[4.75rem] shrink-0 flex-col items-center gap-1 rounded-xl p-1 text-center transition hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span
              // 3:4 like the Cast roster: look plates are full-body, a circle showed a speck.
              className={`flex h-16 w-12 items-center justify-center overflow-hidden rounded-lg border-2 bg-[var(--bg-subtle)] text-base font-medium text-[var(--text-muted)] ${
                selected ? 'border-[var(--accent)]' : 'border-[var(--border-subtle)]'
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
              ) : (
                <span aria-hidden>{tile.glyph}</span>
              )}
            </span>
            <span
              className={`line-clamp-2 w-full text-[11px] leading-tight ${
                selected ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
              }`}
            >
              {tile.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
