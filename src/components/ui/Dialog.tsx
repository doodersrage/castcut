'use client';

import {
  useId,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import ModalPortal from '@/components/ui/ModalPortal';
import UiIcon from '@/components/ui/UiIcon';
import { trapTabKey, useModalFocus } from '@/components/ui/modal-focus';
import { Z_INDEX, type ZLayer } from '@/components/ui/z-index';

const SIZE_CLASS = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[min(96rem,100%)]',
} as const;

export type DialogSize = keyof typeof SIZE_CLASS;

export type DialogProps = {
  open: boolean;
  /** Called on Escape, a backdrop click and the header close button. */
  onClose: () => void;
  /**
   * The heading. Rendered in the dialog's header and used as its accessible name. Leave it out
   * only when the children render their own heading and pass its id as `labelledBy`.
   */
  title?: ReactNode;
  /** Id of a heading inside the children, when `title` is not given. */
  labelledBy?: string;
  /** A line under the title (aria-describedby). */
  description?: ReactNode;
  /** Controls beside the title. */
  headerActions?: ReactNode;
  /** Shows the ✕ in the header (default true when there is a `title`). */
  showClose?: boolean;
  footer?: ReactNode;
  children?: ReactNode;
  /** On the dialog element. `${testId}-close` goes on the header close button. */
  testId?: string;
  /** Extra attributes on the dialog element. */
  dataAttributes?: Record<string, string>;
  size?: DialogSize;
  /** Stacking layer from the z-index scale (default `dialog`). */
  layer?: ZLayer;
  /** Backdrop click closes (default true). */
  closeOnBackdrop?: boolean;
  /** Escape closes (default true). */
  closeOnEscape?: boolean;
  /** `alertdialog` for a question that needs an answer (the confirm). */
  role?: 'dialog' | 'alertdialog';
  /** Focused on open; else the first control, else the panel. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Replaces the panel's look (border, background, padding, width). Layout stays a column. */
  panelClassName?: string;
  panelStyle?: CSSProperties;
  /** Replaces the backdrop's look. */
  backdropClassName?: string;
  /** Extra classes on the full-screen wrapper (alignment, padding). */
  overlayClassName?: string;
  /** Classes on the scrolling body around the children (default padded). */
  bodyClassName?: string;
};

const DEFAULT_PANEL =
  'rounded-[var(--radius-xl)] border border-[var(--border-default)] bg-[var(--bg-base)] text-[var(--text-primary)] shadow-[0_24px_80px_rgba(0,0,0,0.45)]';

/**
 * A centred modal dialog on document.body: focus moves in on open, Tab cycles inside, Escape
 * and a backdrop click close it (each can be turned off), and focus goes back to the control
 * that opened it. Rendered only while open, so what is inside mounts fresh each time.
 */
export default function Dialog({
  open,
  onClose,
  title,
  labelledBy,
  description,
  headerActions,
  showClose,
  footer,
  children,
  testId,
  dataAttributes,
  size = 'md',
  layer = 'dialog',
  closeOnBackdrop = true,
  closeOnEscape = true,
  role = 'dialog',
  initialFocusRef,
  panelClassName,
  panelStyle,
  backdropClassName,
  overlayClassName,
  bodyClassName,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useModalFocus(open, panelRef, { pickInitial: () => initialFocusRef?.current ?? null });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // A modal opened from inside this one is portalled to document.body: its keys bubble here
    // through the React tree, but they are its own.
    if (panelRef.current && !panelRef.current.contains(event.target as Node)) return;
    if (event.key === 'Escape') {
      // Only this dialog closes — the page (or a lightbox under it) never sees this Escape.
      event.stopPropagation();
      event.preventDefault();
      if (closeOnEscape) onClose();
      return;
    }
    trapTabKey(event, panelRef.current);
  };

  if (!open) return null;

  const hasHeader = title != null || headerActions != null;
  const close = showClose ?? title != null;

  return (
    <ModalPortal>
      <div
        className={`fixed inset-0 flex items-center justify-center p-4 ${overlayClassName ?? ''}`}
        style={{ zIndex: Z_INDEX[layer] }}
        data-testid={testId ? `${testId}-root` : undefined}
      >
        <div
          className={`absolute inset-0 ${backdropClassName ?? 'bg-[rgb(0_0_0_/0.55)] backdrop-blur-sm'}`}
          aria-hidden
          data-testid={testId ? `${testId}-backdrop` : undefined}
          onClick={closeOnBackdrop ? onClose : undefined}
        />
        <div
          ref={panelRef}
          role={role}
          aria-modal="true"
          aria-labelledby={title != null ? titleId : labelledBy}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          data-testid={testId}
          {...dataAttributes}
          onKeyDown={onKeyDown}
          style={panelStyle}
          className={`relative flex max-h-full w-full flex-col outline-none ${SIZE_CLASS[size]} ${
            panelClassName ?? DEFAULT_PANEL
          }`}
        >
          {hasHeader ? (
            <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-4">
              <div className="min-w-0">
                {title != null ? (
                  <h2 id={titleId} className="type-heading">
                    {title}
                  </h2>
                ) : null}
                {description ? (
                  <p id={descriptionId} className="type-caption mt-1 text-[var(--text-muted)]">
                    {description}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {headerActions}
                {close ? (
                  <button
                    type="button"
                    className="ui-btn-ghost ui-btn-sm flex h-8 w-8 items-center justify-center !px-0"
                    aria-label="Close"
                    data-testid={testId ? `${testId}-close` : undefined}
                    onClick={onClose}
                  >
                    <UiIcon name="close" size={16} />
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          <div
            className={
              bodyClassName ??
              `min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 ${hasHeader ? 'pb-4' : 'py-4'}`
            }
          >
            {children}
          </div>
          {footer ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] px-5 py-3">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </ModalPortal>
  );
}
