import { footwearIsBarefoot, normalizeFootwear } from './footwear';
import { formatWardrobeKitLabel } from './wardrobe-kit-picker';

/**
 * The one line a Clothing row shows for what is worn now — "Boxy chocolate nun habit · black
 * pumps", "Your clothing photo · barefoot", or the page's own empty label. Outfit and Story
 * build theirs from this; Day's slot sheet has its own ("Outfit kit for this slot").
 */
export function clothingSummaryLine({
  kitLabel,
  hasPhoto,
  footwear,
  emptyLabel,
}: {
  /** The picked kit's label (or id) when one is locked. */
  kitLabel?: string | null;
  /** A clothing photo is on (it turns kits off). */
  hasPhoto: boolean;
  /** Footwear words ('' / unset = auto). */
  footwear?: string | null;
  emptyLabel: string;
}): string {
  const clothes = hasPhoto
    ? 'Your clothing photo'
    : kitLabel?.trim()
      ? formatWardrobeKitLabel(kitLabel.trim())
      : '';
  const shoes = footwearIsBarefoot(footwear) ? 'barefoot' : normalizeFootwear(footwear);
  if (!clothes) {
    return shoes ? `${emptyLabel} · ${shoes}` : emptyLabel;
  }
  return shoes ? `${clothes} · ${shoes}` : clothes;
}
