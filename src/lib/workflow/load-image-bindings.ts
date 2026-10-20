export type LoadImageBindingKind =
  | 'inputImage'
  | 'inputImage2'
  | 'inputImage3'
  | 'inputImage4'
  | 'controlImage'
  | 'maskImage'
  | 'skip';

const CONTROL_IMAGE_TITLE =
  /\b(control|cnet|controlnet|depth|pose|canny|normal|lineart|edge|openpose|scribble)\b/i;
const MASK_IMAGE_TITLE = /\b(mask|inpaint|alpha|matte)\b/i;
const FIGURE_INDEX_TITLE = /\b(?:figure|image|ref|reference|photo|picture)\s*([1-4])\b/i;
const INPUT_IMAGE_TITLE =
  /\b(input|source|reference|ref|edit|init|base|figure\s*1|photo\s*1|image\s*1)\b/i;

const INPUT_IMAGE_KINDS: LoadImageBindingKind[] = [
  'inputImage',
  'inputImage2',
  'inputImage3',
  'inputImage4',
];

export function inputImageBindingForFigureIndex(figureIndex: number): LoadImageBindingKind {
  if (figureIndex <= 1) {
    return 'inputImage';
  }
  if (figureIndex === 2) {
    return 'inputImage2';
  }
  if (figureIndex === 3) {
    return 'inputImage3';
  }
  if (figureIndex === 4) {
    return 'inputImage4';
  }
  return 'skip';
}

export function figureIndexForLoadImageBinding(kind: LoadImageBindingKind): number | null {
  switch (kind) {
    case 'inputImage':
      return 1;
    case 'inputImage2':
      return 2;
    case 'inputImage3':
      return 3;
    case 'inputImage4':
      return 4;
    default:
      return null;
  }
}

export function isInputImageBindingKind(
  kind: LoadImageBindingKind
): kind is 'inputImage' | 'inputImage2' | 'inputImage3' | 'inputImage4' {
  return INPUT_IMAGE_KINDS.includes(kind);
}

export function inferLoadImageBinding(
  classType: string,
  title: string,
  options?: {
    loadImageIndex?: number;
    loadImageCount?: number;
  }
): LoadImageBindingKind {
  if (classType === 'LoadImageMask') {
    return 'maskImage';
  }

  if (classType !== 'LoadImage' && classType !== 'LoadImageOutput') {
    return 'skip';
  }

  const normalizedTitle = title.trim();
  if (CONTROL_IMAGE_TITLE.test(normalizedTitle)) {
    return 'controlImage';
  }
  if (MASK_IMAGE_TITLE.test(normalizedTitle)) {
    return 'maskImage';
  }

  const figureMatch = normalizedTitle.match(FIGURE_INDEX_TITLE);
  if (figureMatch?.[1]) {
    return inputImageBindingForFigureIndex(Number(figureMatch[1]));
  }

  if (INPUT_IMAGE_TITLE.test(normalizedTitle)) {
    return 'inputImage';
  }

  const index = options?.loadImageIndex ?? 0;
  const count = options?.loadImageCount ?? 1;
  if (count === 1) {
    return 'inputImage';
  }
  // Sequential unbound LoadImages after Figure 1 → Figure 2–4 (not controlImage).
  if (index >= 0 && index < INPUT_IMAGE_KINDS.length) {
    return INPUT_IMAGE_KINDS[index]!;
  }

  return 'skip';
}

export function countLoadImageNodes(parsed: Record<string, { class_type?: string }>): number {
  return Object.values(parsed).filter(node => {
    const classType = node.class_type ?? '';
    return classType === 'LoadImage' || classType === 'LoadImageOutput';
  }).length;
}

/** Figure / input LoadImages only — control and mask titles do not count. */
export function countFigureLoadImageSlots(
  parsed: Record<string, { class_type?: string; _meta?: { title?: string } }>
): number {
  const entries = Object.values(parsed).filter(node => {
    const classType = node.class_type ?? '';
    return classType === 'LoadImage' || classType === 'LoadImageOutput';
  });
  let figureCount = 0;
  let loadImageIndex = 0;
  for (const node of entries) {
    const kind = inferLoadImageBinding(node.class_type ?? '', node._meta?.title ?? '', {
      loadImageIndex,
      loadImageCount: entries.length,
    });
    loadImageIndex += 1;
    if (isInputImageBindingKind(kind)) {
      figureCount += 1;
    }
  }
  return figureCount;
}

/**
 * Reference pictures a queue carries (Image 1 … Image N). Qwen-Image 2.1's encoder takes up to 16;
 * eight leaves room for a four-person still plus its room photo (Turbo 2026-10-17: the room as
 * Image 5 — the exact room 3/3, four distinct people, ~7 s more). Engines whose encoder reads
 * fewer simply ignore the extra inputs (Edit 2511 / Rapid read image1–image3; image4 already rode
 * along this way).
 */
export const MAX_INPUT_IMAGE_FILENAMES = 8;

/** `image1` … `imageN` — the edit encoder's picture inputs, one per reference slot. */
export const QWEN_EDIT_ENCODE_IMAGE_KEYS: readonly string[] = Array.from(
  { length: MAX_INPUT_IMAGE_FILENAMES },
  (_, i) => `image${i + 1}`
);

/** Normalize figure filenames: prefer array; fall back to single primary. */
export function normalizeInputImageFilenames(
  inputImageFilename?: string | null,
  inputImageFilenames?: Array<string | undefined | null> | null
): string[] {
  const fromArray = (inputImageFilenames ?? [])
    .slice(0, MAX_INPUT_IMAGE_FILENAMES)
    .map(entry => entry?.trim() ?? '');
  const primary = inputImageFilename?.trim();
  if (fromArray.some(Boolean) || primary) {
    const next = fromArray.slice();
    if (primary) {
      if (next.length === 0) {
        next.push(primary);
      } else {
        next[0] = primary;
      }
    }
    while (next.length > 1 && !next[next.length - 1]) {
      next.pop();
    }
    return next;
  }
  return primary ? [primary] : [];
}
