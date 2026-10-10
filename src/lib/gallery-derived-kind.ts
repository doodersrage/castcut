import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

export const GALLERY_DERIVED_KIND_FILTERS = [
  'upscale',
  'refine',
  'soft-pass',
  'variation',
  'moire-clean',
  'face-detail',
  'fix-area',
  'controlnet',
  'i2v',
  't2v',
  'extend',
  'voice',
  'film',
] as const satisfies ReadonlyArray<NonNullable<ComfyGalleryEntry['derivedKind']>>;

export type GalleryDerivedKindFilter = (typeof GALLERY_DERIVED_KIND_FILTERS)[number];

export function galleryDerivedKindLabel(
  kind: ComfyGalleryEntry['derivedKind'] | undefined
): string | undefined {
  switch (kind) {
    case 'upscale':
      return 'upscaled from prior';
    case 'refine':
      return 'refined from prior';
    case 'soft-pass':
      return 'soft second pass from prior';
    case 'variation':
      return 'variation of prior';
    case 'moire-clean':
      return 'moiré-cleaned from prior';
    case 'face-detail':
      return 'face-detailed from prior';
    case 'fix-area':
      return 'area fixed from prior';
    case 'controlnet':
      return 'ControlNet from prior';
    case 'i2v':
      return 'animated from still';
    case 't2v':
      return 'text-to-video clip';
    case 'extend':
      return 'extended clip (Make it 30 s, Fal extend or last-frame I2V)';
    case 'voice':
      return 'clip with an added soundtrack';
    case 'film':
      return 'assembled film';
    default:
      return undefined;
  }
}

export function galleryDerivedKindChipLabel(kind: GalleryDerivedKindFilter): string {
  switch (kind) {
    case 'upscale':
      return 'Upscale';
    case 'refine':
      return 'Refine';
    case 'soft-pass':
      return 'Soft pass';
    case 'variation':
      return 'Variation';
    case 'moire-clean':
      return 'Moiré';
    case 'face-detail':
      return 'Face detail';
    case 'fix-area':
      return 'Fixed area';
    case 'controlnet':
      return 'ControlNet';
    case 'i2v':
      return 'I2V';
    case 't2v':
      return 'T2V';
    case 'extend':
      return 'Extend';
    case 'voice':
      return 'Voice';
    case 'film':
      return 'Film';
    default:
      return kind;
  }
}
