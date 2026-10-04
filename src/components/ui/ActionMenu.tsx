'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A small "Label ▾" overflow menu for rare row / page actions. Closes when an item is
 * picked, on Escape, or on an outside click. The panel is opaque — it opens over content.
 */
export default function ActionMenu({
  label,
  children,
  align = 'right',
  testId,
  summaryClassName = 'ui-btn-ghost ui-btn-sm type-caption',
  summaryAriaLabel,
  caret = true,
}: {
  label: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  testId?: string;
  summaryClassName?: string;
  /** Accessible name for an icon-only trigger (a ⋯ button). */
  summaryAriaLabel?: string;
  /** The "▾" after the label; off for icon triggers. */
  caret?: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [flip, setFlip] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const close = () => {
      node.open = false;
    };
    const onPointer = (event: PointerEvent) => {
      if (node.open && !node.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && node.open) {
        close();
        node.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <details
      ref={ref}
      className="relative"
      data-testid={testId}
      onToggle={() => {
        // Near a screen edge the preferred side runs off-screen (phone rows) — flip it.
        const node = ref.current;
        const panel = panelRef.current;
        if (!node?.open || !panel) {
          setFlip(false);
          return;
        }
        const rect = panel.getBoundingClientRect();
        setFlip(rect.right > window.innerWidth - 8 || rect.left < 8);
      }}
    >
      <summary
        className={`${summaryClassName} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
        aria-label={summaryAriaLabel}
        data-testid={testId ? `${testId}-trigger` : undefined}
      >
        {label}
        {caret ? ' ▾' : null}
      </summary>
      <div
        ref={panelRef}
        className={`ui-menu-panel absolute z-40 mt-1 flex max-h-[70vh] min-w-[12rem] flex-col items-stretch gap-0.5 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-1 shadow-lg ${
          (align === 'right') !== flip ? 'right-0' : 'left-0'
        }`}
        onClick={event => {
          // Picking an item (button or link) closes the menu.
          if ((event.target as HTMLElement).closest('button, a')) {
            if (ref.current) ref.current.open = false;
          }
        }}
      >
        {children}
      </div>
    </details>
  );
}

/** Menu item class — left-aligned ghost button. */
export const ACTION_MENU_ITEM_CLASS =
  'ui-btn-ghost ui-btn-sm w-full !justify-start text-left type-caption text-[var(--text-secondary)] hover:text-[var(--text-primary)]';
