'use client';

import { useEffect } from 'react';

const CARD = 'article[data-gallery-entry]';

function cardOpener(card: Element): HTMLButtonElement | null {
  return card.querySelector<HTMLButtonElement>('button[aria-label^="Open"]');
}

/** The card in that direction from `from`: the next / previous one, or the nearest above / below. */
export function galleryNeighbour(
  cards: readonly { top: number; left: number; width: number }[],
  from: number,
  key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'
): number {
  if (key === 'ArrowLeft') return Math.max(0, from - 1);
  if (key === 'ArrowRight') return Math.min(cards.length - 1, from + 1);
  const here = cards[from];
  if (!here) return from;
  const centre = here.left + here.width / 2;
  const down = key === 'ArrowDown';
  let best = from;
  let bestRow = Infinity;
  let bestGap = Infinity;
  cards.forEach((card, index) => {
    const rowGap = down ? card.top - here.top : here.top - card.top;
    if (rowGap <= 4) return;
    const gap = Math.abs(card.left + card.width / 2 - centre);
    if (rowGap < bestRow - 4 || (Math.abs(rowGap - bestRow) <= 4 && gap < bestGap)) {
      best = index;
      bestRow = rowGap;
      bestGap = gap;
    }
  });
  return best;
}

/**
 * Keys on the grid (2026-11-05), outside review mode (which has its own 1–5 / F / N P): arrows
 * move between pictures, Enter opens the one in focus (it's a button), F favourites it, X
 * selects it. Not while typing, nor over a dialog.
 */
export function useGalleryGridKeys(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (target &&
          (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) ||
        document.querySelector('[role="dialog"]') ||
        document.querySelector('[data-testid="gallery-review-banner"]')
      ) {
        return;
      }
      const cards = [...document.querySelectorAll(CARD)];
      if (!cards.length) return;
      const current = target?.closest(CARD) ?? null;
      const at = current ? cards.indexOf(current) : -1;
      const key = event.key;
      if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
        const next =
          at < 0
            ? 0
            : galleryNeighbour(
                cards.map(card => card.getBoundingClientRect()),
                at,
                key
              );
        const opener = cards[next] ? cardOpener(cards[next]) : null;
        if (!opener) return;
        event.preventDefault();
        opener.focus();
        opener.scrollIntoView({ block: 'nearest' });
        return;
      }
      if (!current) return;
      const lower = key.toLowerCase();
      const control =
        lower === 'f'
          ? current.querySelector<HTMLElement>('[data-gallery-fav]')
          : lower === 'x'
            ? current.querySelector<HTMLElement>('[data-gallery-select]')
            : null;
      if (control) {
        event.preventDefault();
        control.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
