'use client';

import { useCallback, useRef } from 'react';

/**
 * Fixed bottom bars (mobile Queue bar, shell tab navs, gallery review bar) report their live
 * height here, published as `--bottom-dock-height` on <html> — the tallest one wins, since they
 * all sit at bottom 0. The system tray floats just above it: a fixed 5.5rem lift covered the
 * Queue button whenever a tool put extra controls in its bar.
 *
 * A bar hidden by a breakpoint (`md:hidden`) measures 0, so desktop falls back to the corner.
 */
export const BOTTOM_DOCK_HEIGHT_VAR = '--bottom-dock-height';

const heights = new Map<Element, number>();

function publish(): void {
  if (typeof document === 'undefined') {
    return;
  }
  const tallest = Math.max(0, ...heights.values());
  document.documentElement.style.setProperty(BOTTOM_DOCK_HEIGHT_VAR, `${Math.round(tallest)}px`);
}

function measure(element: Element): void {
  heights.set(element, element.getBoundingClientRect().height);
  publish();
}

/** Callback ref for a fixed bottom bar — attach it to the element that has `fixed bottom-0`. */
export function useBottomDockRef<T extends HTMLElement>(): (element: T | null) => void {
  const observed = useRef<{ element: T; observer: ResizeObserver | null } | null>(null);

  return useCallback((element: T | null) => {
    const previous = observed.current;
    if (previous) {
      previous.observer?.disconnect();
      heights.delete(previous.element);
      observed.current = null;
      publish();
    }
    if (!element) {
      return;
    }
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure(element));
    observer?.observe(element);
    observed.current = { element, observer };
    measure(element);
  }, []);
}
