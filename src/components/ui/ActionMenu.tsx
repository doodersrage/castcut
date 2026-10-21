'use client';

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import ModalPortal from '@/components/ui/ModalPortal';
import { Z_INDEX } from '@/components/ui/z-index';
import {
  computeAnchoredMenuPosition,
  type AnchoredMenuPosition,
} from '@/lib/app/anchored-menu-position';

/** Opens the menu from elsewhere (a phone dock's More opening the header's menu). */
export type ActionMenuHandle = { open: () => void };

type ActionMenuProps = {
  label: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  testId?: string;
  /** Test id of the trigger, when it is not `${testId}-trigger` (a menu rebuilt on this one). */
  triggerTestId?: string;
  /** Test id of the opened panel. */
  panelTestId?: string;
  summaryClassName?: string;
  /** Accessible name for an icon-only trigger (a ⋯ button). */
  summaryAriaLabel?: string;
  /** The "▾" after the label; off for icon triggers. */
  caret?: boolean;
  handleRef?: Ref<ActionMenuHandle>;
  /**
   * Portal the panel to the body at a fixed position next to the trigger (flipping above near
   * the bottom, clamped to the screen, clear of the header and phone dock, scrolling past its
   * max height). For menus inside clipped or virtualized containers — the Gallery grid's cards —
   * where an absolutely-positioned panel would be cut off or painted over.
   */
  portal?: boolean;
  /** Portal mode: control the open state (the Gallery card lifts itself while its menu is open). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Portal mode: the tallest the panel gets before it scrolls (px). */
  maxPanelHeight?: number;
  /** Portal mode: extra classes for the panel. */
  panelClassName?: string;
};

/**
 * A small "Label ▾" overflow menu for rare row / page actions. Closes when an item is
 * picked, on Escape, or on an outside click. The panel is opaque — it opens over content.
 */
export default function ActionMenu(props: ActionMenuProps) {
  return props.portal ? <PortalActionMenu {...props} /> : <InlineActionMenu {...props} />;
}

function InlineActionMenu({
  label,
  children,
  align = 'right',
  testId,
  triggerTestId,
  panelTestId,
  summaryClassName = 'ui-btn-ghost ui-btn-sm type-caption',
  summaryAriaLabel,
  caret = true,
  handleRef,
}: ActionMenuProps) {
  const ref = useRef<HTMLDetailsElement>(null);
  useImperativeHandle(handleRef, () => ({
    open: () => {
      if (ref.current) ref.current.open = true;
    },
  }));
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
        data-testid={triggerTestId ?? (testId ? `${testId}-trigger` : undefined)}
      >
        {label}
        {caret ? ' ▾' : null}
      </summary>
      <div
        ref={panelRef}
        data-testid={panelTestId}
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

const MENU_ITEM_SELECTOR = '[role="menuitem"], button:not([disabled]), a[href], summary';

/** Arrow keys / Home / End move focus between the panel's items. */
function moveMenuFocus(panel: HTMLElement, event: ReactKeyboardEvent) {
  const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  const items = Array.from(panel.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)).filter(
    item => item.offsetParent !== null
  );
  if (items.length === 0) return;
  event.preventDefault();
  const index = items.indexOf(document.activeElement as HTMLElement);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : event.key === 'ArrowDown'
          ? (index + 1) % items.length
          : (index - 1 + items.length) % items.length;
  items[next]?.focus();
}

/** ActionMenu's `portal` mode: a button trigger and a fixed panel on the body. */
function PortalActionMenu({
  label,
  children,
  align = 'right',
  testId,
  triggerTestId,
  panelTestId,
  summaryClassName = 'ui-btn-ghost ui-btn-sm type-caption',
  summaryAriaLabel,
  caret = true,
  handleRef,
  open: controlledOpen,
  onOpenChange,
  maxPanelHeight = 360,
  panelClassName = '',
}: ActionMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange]
  );
  useImperativeHandle(handleRef, () => ({ open: () => setOpen(true) }));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<AnchoredMenuPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      // Keep clear of the fixed bottom tabs and top header — the menu ran under the Film nav.
      const rootStyle = getComputedStyle(document.documentElement);
      const dockHeight = parseFloat(rootStyle.getPropertyValue('--bottom-dock-height')) || 0;
      const headerBottom =
        document.querySelector('header.fixed')?.getBoundingClientRect().bottom ?? 0;
      setPosition(
        computeAnchoredMenuPosition({
          anchor: trigger.getBoundingClientRect(),
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          menuWidth: panelRef.current?.offsetWidth || 208,
          maxMenuHeight: maxPanelHeight,
          headerBottom,
          dockHeight,
          align,
        })
      );
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, align, maxPanelHeight]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  return (
    <div className="relative" data-testid={testId}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={summaryAriaLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        data-testid={triggerTestId ?? (testId ? `${testId}-trigger` : undefined)}
        className={summaryClassName}
        onClick={() => setOpen(!open)}
        onKeyDown={event => {
          // ArrowDown on the trigger opens the menu and moves into it.
          if (event.key !== 'ArrowDown') return;
          event.preventDefault();
          if (!open) setOpen(true);
          requestAnimationFrame(() =>
            panelRef.current?.querySelector<HTMLElement>(MENU_ITEM_SELECTOR)?.focus()
          );
        }}
      >
        {label}
        {caret ? ' ▾' : null}
      </button>
      {open ? (
        <ModalPortal>
          <div
            ref={panelRef}
            role="menu"
            data-testid={panelTestId}
            data-placement={position?.placement}
            className={`ui-menu-panel fixed flex min-w-[12.5rem] flex-col items-stretch gap-0.5 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-1 shadow-lg ${panelClassName}`}
            style={{
              zIndex: Z_INDEX.popover,
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              maxHeight: position?.maxHeight,
              // Measured before it is placed: hidden for that first frame.
              visibility: position ? undefined : 'hidden',
            }}
            onKeyDown={event => {
              if (panelRef.current) moveMenuFocus(panelRef.current, event);
            }}
            onClick={event => {
              // Picking an item (button or link) closes the menu.
              if ((event.target as HTMLElement).closest('button, a')) setOpen(false);
            }}
          >
            {children}
          </div>
        </ModalPortal>
      ) : null}
    </div>
  );
}

/** Menu item class — left-aligned ghost button. */
export const ACTION_MENU_ITEM_CLASS =
  'ui-btn-ghost ui-btn-sm w-full !justify-start text-left type-caption !text-[var(--text-secondary)] hover:!text-[var(--text-primary)]';

/** Menu item for a destructive action (Remove, Delete). */
export const ACTION_MENU_DANGER_ITEM_CLASS =
  'ui-btn-ghost ui-btn-sm w-full !justify-start text-left type-caption !text-[var(--tint-danger-text)] hover:!bg-[var(--tint-danger-bg)]';
