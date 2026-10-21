'use client';

import { Children, type ReactNode } from 'react';
import ActionMenu, { ACTION_MENU_ITEM_CLASS } from '@/components/ui/ActionMenu';

/** Menu item class for a shot card's ⋯ menu — left-aligned ghost button or link. */
export const SHOT_CARD_MENU_ITEM_CLASS = ACTION_MENU_ITEM_CLASS;

/**
 * The one overflow menu a shot card carries (Day slot cards; Story beat and Outfit compare
 * cards can adopt it): a small ⋯ button that opens an opaque panel of the card's actions.
 * Sits over the picture, so the trigger has a solid backing.
 */
export default function ShotCardMenu({
  label,
  testId,
  align = 'right',
  className = '',
  children,
}: {
  /** The shot's name, for the button's accessible name ("Morning actions"). */
  label: string;
  testId?: string;
  align?: 'left' | 'right';
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <ActionMenu
        label={<span aria-hidden="true">⋯</span>}
        summaryAriaLabel={`${label} actions`}
        caret={false}
        align={align}
        testId={testId}
        summaryClassName="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-base)]/90 text-base font-semibold leading-none text-[var(--text-primary)] shadow-sm transition hover:bg-[var(--bg-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
      >
        {children}
      </ActionMenu>
    </div>
  );
}

/**
 * A group of a shot card's actions under a small heading, set off from the group above by a thin
 * line ("Redo", "Touch up the still", "Make it move", "The clip"). Renders nothing when every
 * item in it is hidden, so a shot that is not finished yet keeps a short menu. Put the items in
 * directly (not inside a fragment), so an empty group is seen as empty.
 */
export function ShotCardMenuGroup({ label, children }: { label?: string; children: ReactNode }) {
  const items = Children.toArray(children);
  if (items.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-col gap-0.5 border-t border-[var(--border-subtle)] pt-1 first:border-t-0 first:pt-0"
    >
      {label ? (
        <p
          aria-hidden="true"
          className="px-2 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
        >
          {label}
        </p>
      ) : null}
      {items}
    </div>
  );
}
