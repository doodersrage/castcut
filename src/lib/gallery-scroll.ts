/**
 * Scroll a mounted gallery card into view. Retries across frames so window-virtualized
 * rows that were scrolled into range have time to mount their `data-gallery-entry` nodes.
 */
export function scrollGalleryEntryIntoView(
  entryId: string,
  options?: { behavior?: ScrollBehavior; attempts?: number }
): void {
  const behavior = options?.behavior ?? 'smooth';
  let remaining = options?.attempts ?? 12;

  const tryScroll = () => {
    const node = document.querySelector(`[data-gallery-entry="${CSS.escape(entryId)}"]`);
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ behavior, block: 'nearest' });
      return;
    }
    remaining -= 1;
    if (remaining > 0) {
      requestAnimationFrame(tryScroll);
    }
  };

  requestAnimationFrame(tryScroll);
}

export function displayRowContainsEntry(
  row: {
    kind: string;
    entries?: { id: string }[];
    root?: { id: string };
    derivatives?: { id: string }[];
  },
  entryId: string
): boolean {
  if (row.kind === 'cards' || row.kind === 'experiment') {
    return Boolean(row.entries?.some(entry => entry.id === entryId));
  }
  if (row.kind === 'lineage') {
    return (
      row.root?.id === entryId || Boolean(row.derivatives?.some(entry => entry.id === entryId))
    );
  }
  return false;
}
