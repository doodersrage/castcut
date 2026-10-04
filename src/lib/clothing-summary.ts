import { footwearIsBarefoot, normalizeFootwear } from './footwear';
import { footwearKitForWords, footwearKitImageUrl } from './footwear-kits';
import { formatWardrobeKitLabel } from './wardrobe-kit-picker';

/** A small picture beside a Clothing row's line: the kit's packshot, the photo, the shoes. */
export type ClothingSummaryThumb = { url: string; label: string };

/**
 * The pictures a Clothing row shows next to its Choose button, so what is worn reads without
 * opening the sheet: the clothing photo (it turns kits off) or the kit's packshot, then the
 * shoes' photo or their kit's packshot. Callers resolve the outfit kit's packshot
 * (wardrobe-garment-thumbs).
 */
export function clothingSummaryThumbs({
  kitLabel,
  kitThumbUrl,
  photoUrl,
  footwear,
  footwearImageUrl,
}: {
  kitLabel?: string | null;
  kitThumbUrl?: string | null;
  photoUrl?: string | null;
  footwear?: string | null;
  footwearImageUrl?: string | null;
}): ClothingSummaryThumb[] {
  const thumbs: ClothingSummaryThumb[] = [];
  const photo = photoUrl?.trim();
  const kit = kitThumbUrl?.trim();
  if (photo) {
    thumbs.push({ url: photo, label: 'Your clothing photo' });
  } else if (kit) {
    thumbs.push({
      url: kit,
      label: kitLabel?.trim() ? formatWardrobeKitLabel(kitLabel.trim()) : 'Outfit kit',
    });
  }
  const shoes = footwearImageUrl?.trim();
  const shoeKit = shoes ? null : footwearKitForWords(normalizeFootwear(footwear));
  if (shoes) {
    thumbs.push({ url: shoes, label: normalizeFootwear(footwear) || 'Shoes' });
  } else if (shoeKit) {
    thumbs.push({ url: footwearKitImageUrl(shoeKit.id), label: shoeKit.label });
  }
  return thumbs;
}

/**
 * The one line a Clothing row shows for what is worn now — "Boxy chocolate nun habit · black
 * pumps", "Your clothing photo · barefoot", or the page's own empty label. Outfit, Story and
 * Day (the whole Day's row and each slot's sheet) build theirs from this.
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
