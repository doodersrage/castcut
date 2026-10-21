'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export function ActionMenu(props: { label: string; children: ReactNode; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const menuTone =
    'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]';

  if (props.disabled) {
    return (
      <button
        type="button"
        disabled
        className={`ui-btn-ghost ui-btn-sm text-xs opacity-35 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]`}
      >
        {props.label}
      </button>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        className={`ui-btn-ghost ui-btn-sm text-xs rounded-[var(--radius-md)] border border-[var(--border-subtle)] transition ${menuTone} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]`}
        onClick={() => setOpen(value => !value)}
      >
        {props.label}
      </button>
      {open ? <div className="ui-menu left-0">{props.children}</div> : null}
    </div>
  );
}

export function MenuItem(props: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={`ui-menu-item rounded-xl border-[var(--border-subtle)]/60 bg-[var(--bg-elevated)] text-2xs transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)] hover:text-[var(--accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]`}
    >
      {props.label}
    </button>
  );
}
