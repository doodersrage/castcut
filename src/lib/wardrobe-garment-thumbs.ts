/**
 * Garment-only wardrobe kit thumbs — keyed by wardrobeId (no person / look).
 * Packaged SVGs under /wardrobe-thumbs ship with the app; Fitting person drafts stay separate.
 */

import type { ClothingCategory } from './clothing-catalog-fields';
import type { FittingSwipeKit } from './fitting-room';
import { buildFittingSwipeDeck } from './fitting-room';
import wardrobeGarmentThumbManifest from '../data/wardrobe-garment-thumbs.manifest.json';

export const WARDROBE_GARMENT_THUMB_PUBLIC_DIR = '/wardrobe-thumbs';
export const WARDROBE_GARMENT_THUMB_CURATED_LIMIT = 200;
export const WARDROBE_GARMENT_THUMB_WIDTH = 128;
export const WARDROBE_GARMENT_THUMB_HEIGHT = 160;

export type WardrobeGarmentThumbManifestEntry = {
  file: string;
  label: string;
  category?: ClothingCategory | string;
  /** `comfy` = RealVis packshot WebP; `svg` = silhouette placeholder. */
  source?: 'comfy' | 'svg';
  promptId?: string;
};

export type WardrobeGarmentThumbManifest = {
  version: number;
  generatedAt?: string;
  thumbs: Record<string, WardrobeGarmentThumbManifestEntry>;
};

const MANIFEST = wardrobeGarmentThumbManifest as WardrobeGarmentThumbManifest;

/** Prompt for T2I / offline Comfy garment packshots (no person). */
export function buildWardrobeGarmentThumbPrompt(input: { label: string; script?: string }): string {
  const label = input.label.trim() || 'clothing kit';
  const script = input.script?.trim();
  return [
    `Ecommerce clothing product photograph of exactly this outfit: ${label}.`,
    script ? `Fabric and construction details: ${script}.` : null,
    'Show the real garments clearly — silhouette, color, and materials must match the description.',
    'Ghost mannequin or neat flat lay on a seamless pure white studio background.',
    'No person, no face, no skin, no hands, no head, no mannequin head.',
    'Single centered outfit, catalog packshot, soft even lighting, sharp fabric detail.',
    'No text, logos, hangers, props, or busy scenery.',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Stable curated Full-outfit ids for packaging (stride sample when catalog is large). */
export function selectCuratedWardrobeGarmentThumbIds(
  entries: Array<{ id: string; category: string }>,
  limit = WARDROBE_GARMENT_THUMB_CURATED_LIMIT
): string[] {
  const outfits = entries
    .filter(entry => entry.category === 'outfit' && entry.id.trim())
    .map(entry => ({ id: entry.id.trim() }))
    .sort((left, right) => left.id.localeCompare(right.id));
  if (outfits.length === 0) {
    return [];
  }
  if (outfits.length <= limit) {
    return outfits.map(entry => entry.id);
  }
  const stride = outfits.length / limit;
  const picked: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < limit; index += 1) {
    const id = outfits[Math.min(outfits.length - 1, Math.floor(index * stride))]!.id;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    picked.push(id);
  }
  return picked;
}

export function getWardrobeGarmentThumbManifest(): WardrobeGarmentThumbManifest {
  return {
    version: typeof MANIFEST.version === 'number' ? MANIFEST.version : 1,
    generatedAt: typeof MANIFEST.generatedAt === 'string' ? MANIFEST.generatedAt : undefined,
    thumbs: MANIFEST.thumbs && typeof MANIFEST.thumbs === 'object' ? MANIFEST.thumbs : {},
  };
}

/** Public URL for a packaged garment thumb, or null when not in the manifest. */
export function resolveWardrobeGarmentThumbUrl(
  wardrobeId: string | null | undefined
): string | null {
  const id = wardrobeId?.trim();
  if (!id) {
    return null;
  }
  const entry = getWardrobeGarmentThumbManifest().thumbs[id];
  const file = entry?.file?.trim();
  if (!file) {
    return null;
  }
  if (file.startsWith('/') || file.startsWith('http://') || file.startsWith('https://')) {
    return file;
  }
  return `${WARDROBE_GARMENT_THUMB_PUBLIC_DIR}/${file.replace(/^\//, '')}`;
}

/**
 * Absolute URL for queue upload (same-origin fetch). Null when no packshot exists.
 * Prefer Comfy packshots; skip SVG placeholders which are weak clothing references.
 */
export function resolveWardrobeGarmentThumbQueueUrl(
  wardrobeId: string | null | undefined
): string | null {
  const id = wardrobeId?.trim();
  if (!id) {
    return null;
  }
  const entry = getWardrobeGarmentThumbManifest().thumbs[id];
  if (!entry?.file?.trim()) {
    return null;
  }
  if (entry.source === 'svg') {
    return null;
  }
  const path = resolveWardrobeGarmentThumbUrl(id);
  if (!path) {
    return null;
  }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`;
  }
  return path;
}

/** Queue extras: custom clothing photo or kit packshot as Figure 2 (never Image 1). */
export function buildFittingGarmentReferenceExtras(input: {
  wardrobeId?: string | null;
  customGarmentUrl?: string | null;
  customGarmentFilename?: string | null;
}): {
  /** Sparse: slot 0 left empty so plate stays Image 1 via inputImageUrl/Filename. */
  inputImageUrls?: [undefined, string];
  inputImageFilenames?: [undefined, string];
  hasGarmentReference: true;
  source: 'custom' | 'packshot';
} | null {
  const customFilename = input.customGarmentFilename?.trim();
  const custom = input.customGarmentUrl?.trim();
  if (custom || customFilename) {
    const url = !custom
      ? ''
      : custom.startsWith('http://') || custom.startsWith('https://') || custom.startsWith('blob:')
        ? custom
        : typeof window !== 'undefined' && window.location?.origin && custom.startsWith('/')
          ? `${window.location.origin}${custom}`
          : custom;
    if (!url && !customFilename) {
      return null;
    }
    return {
      ...(url ? { inputImageUrls: [undefined, url] as [undefined, string] } : {}),
      ...(customFilename
        ? { inputImageFilenames: [undefined, customFilename] as [undefined, string] }
        : {}),
      hasGarmentReference: true,
      source: 'custom',
    };
  }
  const packshot = resolveWardrobeGarmentThumbQueueUrl(input.wardrobeId);
  if (!packshot) {
    return null;
  }
  return {
    inputImageUrls: [undefined, packshot],
    hasGarmentReference: true,
    source: 'packshot',
  };
}

/** Prefer person draft when ready; otherwise packaged garment thumb. */
export function resolveWardrobeKitThumbUrl(input: {
  wardrobeId: string;
  personPreviewUrl?: string | null;
}): string | null {
  const person = input.personPreviewUrl?.trim();
  if (person) {
    return person;
  }
  return resolveWardrobeGarmentThumbUrl(input.wardrobeId);
}

/**
 * Kit deck for shared picker thumbs. Defaults to the full filtered catalog
 * (same as Fitting swipe). Pass `limit` only when a caller needs a short window.
 * Keeps the current selection visible when it would otherwise fall outside a limit.
 */
export function buildWardrobeKitPickerDeck(
  options: Array<{ value: string; label: string; group?: string }>,
  selectedId?: string,
  limit?: number
): FittingSwipeKit[] {
  const base = buildFittingSwipeDeck(options, limit);
  const id = selectedId?.trim();
  if (!id || base.some(kit => kit.id === id)) {
    return base;
  }
  const match = options.find(option => option.value?.trim() === id);
  if (!match?.value?.trim()) {
    return base;
  }
  const withSelection: FittingSwipeKit[] = [
    {
      id,
      label: match.label?.trim() || id,
      group: match.group?.trim() || undefined,
    },
    ...base,
  ];
  if (limit && limit > 0) {
    return withSelection.slice(0, Math.max(limit, 1));
  }
  return withSelection;
}

/** Deterministic pastel fill for SVG placeholders from a kit id. */
export function wardrobeGarmentThumbPlaceholderHue(wardrobeId: string): number {
  let hash = 0;
  for (let index = 0; index < wardrobeId.length; index += 1) {
    hash = (hash * 31 + wardrobeId.charCodeAt(index)) >>> 0;
  }
  return hash % 360;
}

export function buildWardrobeGarmentThumbSvg(input: {
  wardrobeId: string;
  label: string;
  width?: number;
  height?: number;
}): string {
  const width = input.width ?? WARDROBE_GARMENT_THUMB_WIDTH;
  const height = input.height ?? WARDROBE_GARMENT_THUMB_HEIGHT;
  const hue = wardrobeGarmentThumbPlaceholderHue(input.wardrobeId);
  const label = input.label.trim() || input.wardrobeId;
  const short = label.length > 42 ? `${label.slice(0, 40).trimEnd()}…` : label;
  const lines = wrapSvgLabel(short, 16);
  const text = lines
    .map(
      (line, index) =>
        `<text x="${width / 2}" y="${height * 0.62 + index * 14}" text-anchor="middle" fill="#3f3f46" font-family="system-ui,sans-serif" font-size="11">${escapeSvg(line)}</text>`
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeSvg(label)}">
  <rect width="100%" height="100%" fill="#f4f4f5"/>
  <rect x="18" y="18" width="${width - 36}" height="${height * 0.42}" rx="10" fill="hsl(${hue} 42% 72%)"/>
  <path d="M${width / 2 - 22} ${height * 0.22} h44 v8 h-10 v28 h-24 v-28 h-10 z" fill="hsl(${hue} 38% 58%)" opacity="0.85"/>
  ${text}
</svg>
`;
}

function wrapSvgLabel(label: string, maxChars: number): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [label];
  }
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length >= 3) {
        break;
      }
    } else {
      current = next;
    }
  }
  if (current && lines.length < 3) {
    lines.push(current);
  }
  return lines;
}

function escapeSvg(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
