// Literal class names (Tailwind only ships classes it can see in the source).
const PHONE_COLS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
  7: 'grid-cols-7',
};
const WIDE_COLS: Record<number, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-5',
  6: 'sm:grid-cols-6',
};

/**
 * One column per tab. On a phone More sits in the row too; from sm up More is hidden, so the
 * row is the tabs alone — counting More there left an empty column and the tabs off center.
 */
export function dockGridColsClass(primaryCount: number, hasMore: boolean): string {
  const clamp = (count: number, max: number) => Math.min(max, Math.max(2, count));
  // Film, Day, Outfit, Story, Scene, Cut + More: seven on a phone.
  const phone = clamp(primaryCount + (hasMore ? 1 : 0), 7);
  const wide = clamp(primaryCount, 6);
  return `${PHONE_COLS[phone]} ${WIDE_COLS[wide]}`;
}
