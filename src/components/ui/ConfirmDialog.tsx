'use client';

import { useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import Dialog from '@/components/ui/Dialog';
import type { ZLayer } from '@/components/ui/z-index';

export type ConfirmTone = 'default' | 'danger';

export type ConfirmDialogProps = {
  open: boolean;
  title: ReactNode;
  /** The detail under the title. A string keeps its line breaks. */
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` paints the confirm button red and focuses Cancel first. */
  tone?: ConfirmTone;
  onConfirm: () => void;
  onCancel: () => void;
  /** Test id of the dialog; the buttons are always `confirm-dialog-confirm` / `-cancel`. */
  testId?: string;
  layer?: ZLayer;
};

/**
 * A yes / no question in the page, in place of the browser's confirm. Escape, the backdrop
 * and Cancel all answer no.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel,
  testId = 'confirm-dialog',
  layer = 'confirm',
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      showClose={false}
      role="alertdialog"
      size="md"
      layer={layer}
      testId={testId}
      initialFocusRef={tone === 'danger' ? cancelRef : confirmRef}
      footer={
        <>
          <button
            ref={cancelRef}
            type="button"
            className="ui-btn-ghost"
            data-testid="confirm-dialog-cancel"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={tone === 'danger' ? 'ui-btn-danger' : 'ui-btn-primary'}
            data-testid="confirm-dialog-confirm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {body != null ? (
        typeof body === 'string' ? (
          <p className="whitespace-pre-line text-sm text-[var(--text-secondary)]">{body}</p>
        ) : (
          <div className="text-sm text-[var(--text-secondary)]">{body}</div>
        )
      ) : null}
    </Dialog>
  );
}

export type ConfirmActionOptions = {
  title: ReactNode;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  testId?: string;
};

function HostedConfirm({
  options,
  onDone,
}: {
  options: ConfirmActionOptions;
  onDone: (answer: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  const answer = (value: boolean) => {
    if (!open) return;
    setOpen(false);
    onDone(value);
  };
  return (
    <ConfirmDialog
      open={open}
      {...options}
      onConfirm={() => answer(true)}
      onCancel={() => answer(false)}
    />
  );
}

/**
 * Asks in the page and resolves true for the confirm button, false for Cancel / Escape / the
 * backdrop — an async stand-in for `window.confirm`. Outside a browser it resolves true, as
 * the old `typeof window === 'undefined'` guards did.
 */
export function confirmAction(options: ConfirmActionOptions): Promise<boolean> {
  if (typeof document === 'undefined') {
    return Promise.resolve(true);
  }
  return new Promise<boolean>(resolve => {
    const host = document.createElement('div');
    host.setAttribute('data-confirm-host', '');
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(
      <HostedConfirm
        options={options}
        onDone={answer => {
          resolve(answer);
          // Unmount after this click finishes: focus goes back to the opener on the way out.
          window.setTimeout(() => {
            root.unmount();
            host.remove();
          }, 0);
        }}
      />
    );
  });
}

export default ConfirmDialog;
