'use client';

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import ModalPortal from '@/components/ui/ModalPortal';
import UiIcon from '@/components/ui/UiIcon';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    element =>
      element.getClientRects().length > 0 && !element.closest('details:not([open]) > :not(summary)')
  );
}

// Several sheets can stack (a slot sheet under its clothing sheet): the body scroll lock is
// counted so the first one to close does not unlock the page under the other.
let scrollLocks = 0;
let previousOverflow = '';

function lockBodyScroll(): () => void {
  if (scrollLocks === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLocks += 1;
  return () => {
    scrollLocks = Math.max(0, scrollLocks - 1);
    if (scrollLocks === 0) {
      document.body.style.overflow = previousOverflow;
    }
  };
}

export type SideSheetProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Controls beside the title (prev / next, a badge). */
  headerActions?: ReactNode;
  footer?: ReactNode;
  testId?: string;
  /** Sheet width on desk: `md` (28rem) or `lg` (34rem). Phones always take the full width. */
  size?: 'md' | 'lg';
  /** Stacks above another sheet (the Clothing sheet over the slot sheet). */
  layer?: 'base' | 'raised';
  /** Extra attributes on the dialog element (a `data-slot`, for tests). */
  dataAttributes?: Record<string, string>;
  children: ReactNode;
};

/**
 * A side sheet: on desk a drawer on the right, on a phone a bottom sheet. An accessible modal
 * dialog — focus moves in, Tab cycles inside, Escape and the backdrop close it, focus returns
 * to the control that opened it. Rendered on document.body only while open, so what is inside
 * mounts fresh each time.
 */
export default function SideSheet({
  open,
  onClose,
  title,
  description,
  headerActions,
  footer,
  testId,
  size = 'md',
  layer = 'base',
  dataAttributes,
  children,
}: SideSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockBodyScroll();
    const panel = panelRef.current;
    // The first field, not the close button — the sheet is for editing.
    const first = panel
      ? focusableIn(panel).find(element => element.getAttribute('data-sheet-close') == null)
      : null;
    (first ?? panel)?.focus({ preventScroll: true });
    return () => {
      unlock();
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // A modal opened from inside the sheet (pose joint editor, kit browser) is portalled to
    // document.body: its keys bubble here through the React tree, but they are its own.
    if (panelRef.current && !panelRef.current.contains(event.target as Node)) return;
    if (event.key === 'Escape') {
      // Only this sheet closes — a sheet stacked on top handles its own Escape first.
      event.stopPropagation();
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;
    const focusable = focusableIn(panelRef.current);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panelRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;

  return (
    <ModalPortal>
      <div
        className={[
          'fixed inset-0 flex max-sm:items-end max-sm:justify-center sm:justify-end',
          layer === 'raised' ? 'z-[76]' : 'z-[70]',
        ].join(' ')}
        data-testid={testId ? `${testId}-root` : undefined}
      >
        <button
          type="button"
          className="absolute inset-0 cursor-default bg-black/35"
          aria-label="Close"
          tabIndex={-1}
          onClick={onClose}
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          data-testid={testId}
          {...dataAttributes}
          onKeyDown={onKeyDown}
          className={[
            'relative flex w-full flex-col border-[var(--border-default)] bg-[var(--bg-base)] text-[var(--text-primary)] shadow-[var(--shadow-card-hover)] outline-none',
            'max-sm:max-h-[88dvh] max-sm:rounded-t-[var(--radius-lg)] max-sm:border max-sm:border-b-0 max-sm:pb-[env(safe-area-inset-bottom,0px)]',
            'sm:h-full sm:border-l',
            size === 'lg' ? 'sm:max-w-[34rem]' : 'sm:max-w-[28rem]',
          ].join(' ')}
        >
          <div
            className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[var(--border-strong)] sm:hidden"
            aria-hidden
          />
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
            <div className="min-w-0">
              <h2 id={titleId} className="type-heading truncate">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="type-caption mt-0.5 text-[var(--text-muted)]">
                  {description}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {headerActions}
              <button
                type="button"
                className="ui-btn-ghost ui-btn-sm flex h-8 w-8 items-center justify-center !px-0"
                aria-label="Close"
                data-sheet-close="true"
                data-testid={testId ? `${testId}-close` : undefined}
                onClick={onClose}
              >
                <UiIcon name="close" size={16} />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
            {children}
          </div>
          {footer ? (
            <div className="shrink-0 border-t border-[var(--border-subtle)] px-4 py-3">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </ModalPortal>
  );
}
