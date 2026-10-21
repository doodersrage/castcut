'use client';

import { useEffect, type KeyboardEvent, type RefObject } from 'react';

/**
 * Focus handling shared by the modal surfaces (SideSheet, Dialog): what can take focus, Tab
 * kept inside the panel, focus moved in on open and given back to the opener on close, and a
 * counted body scroll lock.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** Visible, enabled controls inside `root`, in DOM order. */
export function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    element =>
      element.getClientRects().length > 0 && !element.closest('details:not([open]) > :not(summary)')
  );
}

// Several modals can stack (a slot sheet under its clothing sheet, a confirm over a dialog):
// the body scroll lock is counted so the first one to close does not unlock the page under
// the other.
let scrollLocks = 0;
let previousOverflow = '';

export function lockBodyScroll(): () => void {
  if (scrollLocks === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLocks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLocks = Math.max(0, scrollLocks - 1);
    if (scrollLocks === 0) {
      document.body.style.overflow = previousOverflow;
    }
  };
}

/**
 * Keeps Tab and Shift+Tab cycling inside `panel`. Call from the panel's onKeyDown; returns
 * true when it handled the key.
 */
export function trapTabKey(event: KeyboardEvent<HTMLElement>, panel: HTMLElement | null): boolean {
  if (event.key !== 'Tab' || !panel) return false;
  const focusable = focusableIn(panel);
  if (focusable.length === 0) {
    event.preventDefault();
    return true;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === panel || !panel.contains(active))) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && (active === last || !panel.contains(active))) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

// The last few focused elements, so a modal whose field takes focus on mount (autoFocus runs
// before effects) still knows which control opened it.
const focusHistory: HTMLElement[] = [];
let trackingFocus = false;

function trackFocus(): void {
  if (trackingFocus || typeof document === 'undefined') return;
  trackingFocus = true;
  document.addEventListener(
    'focusin',
    event => {
      if (!(event.target instanceof HTMLElement)) return;
      focusHistory.push(event.target);
      if (focusHistory.length > 8) focusHistory.shift();
    },
    true
  );
}

trackFocus();

function openerOutside(panel: HTMLElement | null): HTMLElement | null {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body && !panel?.contains(active)) {
    return active;
  }
  for (let index = focusHistory.length - 1; index >= 0; index -= 1) {
    const candidate = focusHistory[index];
    if (candidate.isConnected && !panel?.contains(candidate)) return candidate;
  }
  return null;
}

/**
 * While `open`: locks body scroll, moves focus into the panel (to `pickInitial`'s choice, else
 * the first control, else the panel itself), and on close gives focus back to whatever had it
 * before.
 */
export function useModalFocus(
  open: boolean,
  panelRef: RefObject<HTMLElement | null>,
  options: {
    pickInitial?: (panel: HTMLElement) => HTMLElement | null | undefined;
    lockScroll?: boolean;
  } = {}
): void {
  const { pickInitial, lockScroll = true } = options;
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const opener = openerOutside(panel);
    const unlock = lockScroll ? lockBodyScroll() : () => {};
    if (panel && !panel.contains(document.activeElement)) {
      const initial = pickInitial?.(panel) ?? focusableIn(panel)[0] ?? panel;
      initial.focus({ preventScroll: true });
    }
    return () => {
      unlock();
      if (opener && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
    // pickInitial is read once per open; callers pass inline functions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lockScroll, panelRef]);
}
