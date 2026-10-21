/**
 * Where a menu portalled to the body (fixed position) goes next to its trigger: below it unless
 * there is too little room and more above, right-aligned to the trigger (or left), clamped
 * inside the viewport, kept clear of the fixed header and the phone's bottom dock, and given a
 * max height so a long menu scrolls instead of running off-screen. Used by ActionMenu's
 * `portal` mode (the Gallery card's More menu sits in a clipped, virtualized grid).
 */
export type AnchorRect = { top: number; bottom: number; left: number; right: number };

export type AnchoredMenuPosition = {
  top: number;
  left: number;
  maxHeight: number;
  placement: 'below' | 'above';
};

export function computeAnchoredMenuPosition({
  anchor,
  viewportWidth,
  viewportHeight,
  menuWidth,
  maxMenuHeight = 360,
  headerBottom = 0,
  dockHeight = 0,
  align = 'right',
  padding = 8,
  gap = 6,
  minHeight = 160,
}: {
  anchor: AnchorRect;
  viewportWidth: number;
  viewportHeight: number;
  menuWidth: number;
  /** The tallest the menu gets before it scrolls. */
  maxMenuHeight?: number;
  /** Bottom edge of a fixed header the menu must not slide under. */
  headerBottom?: number;
  /** Height of a fixed bottom dock (phone tabs) the menu must not run under. */
  dockHeight?: number;
  align?: 'left' | 'right';
  padding?: number;
  gap?: number;
  minHeight?: number;
}): AnchoredMenuPosition {
  const topLimit = Math.max(headerBottom, 0);
  const viewportBottom = viewportHeight - Math.max(dockHeight, 0);
  const spaceBelow = viewportBottom - anchor.bottom - padding;
  const spaceAbove = anchor.top - topLimit - padding;
  const placement = spaceBelow < 240 && spaceAbove > spaceBelow ? 'above' : 'below';
  const maxHeight = Math.max(
    minHeight,
    Math.min(maxMenuHeight, (placement === 'above' ? spaceAbove : spaceBelow) - 4)
  );
  const preferredLeft = align === 'right' ? anchor.right - menuWidth : anchor.left;
  const left = Math.max(padding, Math.min(preferredLeft, viewportWidth - menuWidth - padding));
  const top =
    placement === 'above'
      ? Math.max(topLimit + padding, anchor.top - maxHeight - gap)
      : Math.min(anchor.bottom + gap, viewportBottom - maxHeight - padding);
  return { top, left, maxHeight, placement };
}
