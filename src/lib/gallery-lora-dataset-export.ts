import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import { withoutHiddenGalleryEntries } from './gallery-adult-check';
import { buildComfyViewPath, type ComfyOutputImage } from './comfyui-outputs';
import { buildZipBlob, type ZipFileEntry } from './gallery-zip-export';
import { isAssembledFilmEntry } from './media-kind';
import { isVideoLikeEntry } from './media-kind';
import { mapWithConcurrency } from './concurrency';
import { getLlmMaxInflight } from './llm-backpressure';

/** Local ComfyUI host tolerates a handful of concurrent /view fetches (see comfyui-gallery-client.ts). */
const IMAGE_FETCH_CONCURRENCY = 6;

/**
 * Gallery → LoRA training dataset export. Pulls selected/favorited/high-rated
 * gallery entries and packages each as an `NNNN_slug.<ext>` image alongside a
 * matching `NNNN_slug.txt` caption file (cleaned prompt text), zipped with the
 * same lightweight inline ZIP writer used by gallery-zip-export.ts.
 */

/** Minimum `reviewRating` (out of 5) that counts as "high-rated" for the default selection. */
export const DEFAULT_LORA_DATASET_MIN_RATING = 4;

export type LoraDatasetSelectionOptions = {
  /** Explicit gallery entry ids (e.g. current bulk selection). Takes priority over favorites/rating when non-empty. */
  selectedIds?: Iterable<string>;
  /** Minimum reviewRating to include when no explicit selection is provided (default 4). */
  minRating?: 1 | 2 | 3 | 4 | 5;
};

/**
 * Resolves the entries to export: an explicit selection when provided,
 * otherwise every favorited or `minRating`+ starred entry. Either way, only
 * completed entries with at least one output image are eligible.
 */
export function selectLoraDatasetEntries(
  entries: ComfyGalleryEntry[],
  options?: LoraDatasetSelectionOptions
): ComfyGalleryEntry[] {
  const selectedIdSet = options?.selectedIds ? new Set(options.selectedIds) : null;
  const minRating = options?.minRating ?? DEFAULT_LORA_DATASET_MIN_RATING;

  const candidates =
    selectedIdSet && selectedIdSet.size > 0
      ? entries.filter(entry => selectedIdSet.has(entry.id))
      : entries.filter(entry => entry.favorite === true || (entry.reviewRating ?? 0) >= minRating);

  return withoutHiddenGalleryEntries(candidates).filter(
    entry =>
      entry.status === 'completed' && entry.images.length > 0 && Boolean(entry.prompt?.trim())
  );
}

export function isLoraDatasetStill(
  entry: Pick<ComfyGalleryEntry, 'status' | 'images' | 'prompt' | 'derivedKind' | 'tool'>
): boolean {
  if (entry.status !== 'completed' || !entry.images.length || !entry.prompt?.trim()) {
    return false;
  }
  if (isAssembledFilmEntry(entry) || isVideoLikeEntry(entry)) {
    return false;
  }
  const filename = entry.images[0]?.filename ?? '';
  return !/\.(mp4|webm|mov|mkv)(\?|#|$)/i.test(filename);
}

/** Keepers for one Character OS record — explicit look ids, else favorite / 4★+ stills. */
export function selectCharacterKeepers(
  entries: ComfyGalleryEntry[],
  characterId: string,
  options?: { keeperIds?: string[] }
): ComfyGalleryEntry[] {
  const id = characterId.trim();
  if (!id) {
    return [];
  }
  const stamped = entries.filter(entry => entry.characterId === id && isLoraDatasetStill(entry));
  const explicit = [
    ...new Set((options?.keeperIds ?? []).map(item => item.trim()).filter(Boolean)),
  ];
  if (options && 'keeperIds' in options) {
    const order = new Map(explicit.map((entryId, index) => [entryId, index]));
    return stamped
      .filter(entry => order.has(entry.id))
      .sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
  }
  return selectLoraDatasetEntries(stamped);
}

const WEIGHT_SYNTAX_RE = /\(([^()]+?):\s*-?[\d.]+\)/g;
const TOKEN_PLACEHOLDER_RE = /\{\{[A-Z0-9_]+\}\}/g;

/**
 * Cleans a raw prompt for use as a LoRA caption: unwraps ComfyUI-style
 * attention weighting (`(subject:1.3)` → `subject`), drops unresolved
 * `{{TOKEN}}` placeholders and stray `BREAK` separators, and collapses
 * whitespace/newlines/commas into a single tidy comma-separated line.
 */
export function cleanLoraCaptionText(prompt: string | undefined): string {
  if (!prompt?.trim()) {
    return '';
  }

  let text = prompt;
  let previous: string;
  do {
    previous = text;
    text = text.replace(WEIGHT_SYNTAX_RE, '$1');
  } while (text !== previous);

  return text
    .replace(TOKEN_PLACEHOLDER_RE, '')
    .replace(/\bBREAK\b/gi, ',')
    .replace(/[\r\n]+/g, ', ')
    .replace(/[ \t]+/g, ' ')
    .replace(/,\s*,+/g, ',')
    .replace(/\s*,\s*/g, ', ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();
}

export type LoraCaptionMode = 'prompt' | 'tags' | 'vision';

export type LoraCaptionOptions = {
  triggerWord?: string;
  captionMode?: LoraCaptionMode;
  /** Precomputed vision caption when mode is `vision`. */
  visionCaption?: string;
};

function applyTriggerWord(caption: string, triggerWord?: string): string {
  const trigger = triggerWord?.trim();
  if (!trigger) {
    return caption;
  }
  if (caption.toLowerCase().includes(trigger.toLowerCase())) {
    return caption;
  }
  return caption ? `${trigger}, ${caption}` : trigger;
}

/** Cleaned caption text, optionally prefixed with a LoRA trigger word (skipped if already present). */
export function buildLoraCaptionText(
  entry: Pick<ComfyGalleryEntry, 'prompt' | 'visionTags'>,
  options?: LoraCaptionOptions
): string {
  const mode = options?.captionMode ?? 'prompt';
  const cleaned = cleanLoraCaptionText(entry.prompt);
  let caption = cleaned;

  if (mode === 'tags') {
    const tags = (entry.visionTags ?? [])
      .map(tag => tag.trim())
      .filter(Boolean)
      .slice(0, 12);
    if (tags.length > 0) {
      caption = cleaned ? `${cleaned}, ${tags.join(', ')}` : tags.join(', ');
    }
  } else if (mode === 'vision') {
    const vision = cleanLoraCaptionText(options?.visionCaption);
    if (vision) {
      caption = vision;
    }
  }

  return applyTriggerWord(caption, options?.triggerWord);
}

/** Lowercase, hyphenated, filesystem-safe slug — falls back to "image" when nothing usable remains. */
export function sanitizeLoraDatasetSlug(value: string | undefined): string {
  const slug = (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'image';
}

/** Image filename extension (without the dot), defaulting to "png" when it can't be determined. */
export function loraDatasetImageExtension(filename: string | undefined): string {
  const match = /\.([a-z0-9]{2,5})$/i.exec(filename ?? '');
  return match ? match[1].toLowerCase() : 'png';
}

/** Zero-padded ordinal + model/tool slug — image and caption share this base name. */
export function buildLoraDatasetBaseName(
  entry: Pick<ComfyGalleryEntry, 'model' | 'tool' | 'id'>,
  ordinal: number
): string {
  const index = String(Math.max(1, Math.floor(ordinal))).padStart(4, '0');
  const slug = sanitizeLoraDatasetSlug(entry.model || entry.tool || entry.id);
  return `${index}_${slug}`;
}

export type LoraDatasetManifestEntry = {
  id: string;
  baseName: string;
  imageFilename: string;
  captionFilename: string;
  caption: string;
  sourceImageUrl: string;
  model?: string;
  favorite: boolean;
  reviewRating?: number;
};

/** Builds the per-entry image/caption filename + caption text plan, without fetching any bytes. */
export function buildLoraDatasetManifest(
  entries: ComfyGalleryEntry[],
  options?: LoraCaptionOptions & {
    visionCaptionsById?: Record<string, string>;
  }
): LoraDatasetManifestEntry[] {
  const manifest: LoraDatasetManifestEntry[] = [];
  let ordinal = 0;

  for (const entry of entries) {
    const image: ComfyOutputImage | undefined = entry.images[0];
    if (!image) {
      continue;
    }
    ordinal += 1;
    const baseName = buildLoraDatasetBaseName(entry, ordinal);
    const extension = loraDatasetImageExtension(image.filename);
    manifest.push({
      id: entry.id,
      baseName,
      imageFilename: `${baseName}.${extension}`,
      captionFilename: `${baseName}.txt`,
      caption: buildLoraCaptionText(entry, {
        triggerWord: options?.triggerWord,
        captionMode: options?.captionMode,
        visionCaption: options?.visionCaptionsById?.[entry.id],
      }),
      sourceImageUrl: buildComfyViewPath(entry.comfyUrl, image),
      model: entry.model,
      favorite: Boolean(entry.favorite),
      reviewRating: entry.reviewRating,
    });
  }

  return manifest;
}

export type LoraDatasetExportResult = {
  count: number;
  manifest: LoraDatasetManifestEntry[];
};

/**
 * Fetches each manifest entry's output image and packages it with its caption
 * `.txt` (+ a `manifest.json` summary) into a single downloadable ZIP. Entries
 * whose image fetch fails are skipped (not fatal) so a partial dataset is
 * still exported.
 */
async function fetchVisionCaptionsForEntries(
  entries: ComfyGalleryEntry[]
): Promise<Record<string, string>> {
  // Was a plain sequential for-loop — for a hundred-plus-entry dataset export
  // (the whole point of this feature) that meant a hundred-plus sequential
  // fetch+caption round-trips back to back. Fanned out through the same
  // shared LLM inflight cap used by batch-from-topics.ts / best-of-n-campaign.ts
  // so this doesn't trip LlmBusyError by exceeding LLM_MAX_INFLIGHT.
  const pairs = await mapWithConcurrency(entries, getLlmMaxInflight(), async entry => {
    const image = entry.images[0];
    if (!image) {
      return null;
    }
    try {
      const imageUrl = buildComfyViewPath(entry.comfyUrl, image);
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        return null;
      }
      const blob = await imageResponse.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      const response = await fetch('/api/gallery/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl: dataUrl,
          prompt: entry.prompt,
          model: entry.model,
        }),
      });
      if (!response.ok) {
        return null;
      }
      const data = (await response.json()) as { caption?: string };
      return data.caption?.trim() ? ([entry.id, data.caption.trim()] as const) : null;
    } catch {
      // Fall back to cleaned prompt for this entry.
      return null;
    }
  });

  const captions: Record<string, string> = {};
  for (const pair of pairs) {
    if (pair) {
      captions[pair[0]] = pair[1];
    }
  }
  return captions;
}

async function collectLoraDatasetImageFiles(
  entries: ComfyGalleryEntry[],
  options?: LoraCaptionOptions
): Promise<{
  manifest: LoraDatasetManifestEntry[];
  exportedManifest: LoraDatasetManifestEntry[];
  pairs: Array<{ item: LoraDatasetManifestEntry; imageBytes: Uint8Array }>;
}> {
  const captionMode = options?.captionMode ?? 'prompt';
  const visionCaptionsById =
    captionMode === 'vision' ? await fetchVisionCaptionsForEntries(entries) : undefined;
  const manifest = buildLoraDatasetManifest(entries, {
    ...options,
    captionMode,
    visionCaptionsById,
  });
  const exportedManifest: LoraDatasetManifestEntry[] = [];
  const pairs: Array<{ item: LoraDatasetManifestEntry; imageBytes: Uint8Array }> = [];

  // Independent /view fetches to the local ComfyUI host — was sequential,
  // which serialized what should be I/O-bound work for every entry in the
  // dataset. mapWithConcurrency keeps result order stable so exportedManifest
  // (and the embedded manifest.json) still lists entries in the same order
  // as before, just fetched IMAGE_FETCH_CONCURRENCY at a time.
  const fetched = await mapWithConcurrency(manifest, IMAGE_FETCH_CONCURRENCY, async item => {
    try {
      const response = await fetch(item.sourceImageUrl);
      if (!response.ok) {
        return null;
      }
      const imageBytes = new Uint8Array(await response.arrayBuffer());
      return { item, imageBytes };
    } catch {
      // Skip this entry — the rest of the dataset still exports.
      return null;
    }
  });

  for (const result of fetched) {
    if (!result) {
      continue;
    }
    pairs.push(result);
    exportedManifest.push(result.item);
  }

  return { manifest, exportedManifest, pairs };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function downloadLoraDatasetZip(
  entries: ComfyGalleryEntry[],
  options?: LoraCaptionOptions
): Promise<LoraDatasetExportResult> {
  const { manifest, exportedManifest, pairs } = await collectLoraDatasetImageFiles(
    entries,
    options
  );
  const files: ZipFileEntry[] = [];

  for (const result of pairs) {
    files.push({ filename: result.item.imageFilename, data: result.imageBytes });
    files.push({
      filename: result.item.captionFilename,
      data: new TextEncoder().encode(result.item.caption),
    });
  }

  if (files.length === 0) {
    return { count: 0, manifest };
  }

  files.push({
    filename: 'manifest.json',
    data: new TextEncoder().encode(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          count: exportedManifest.length,
          entries: exportedManifest,
        },
        null,
        2
      )
    ),
  });

  const blob = buildZipBlob(files);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `lora-dataset-${Date.now()}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);

  return { count: exportedManifest.length, manifest };
}

export type PersistLoraDatasetOnServerOptions = LoraCaptionOptions & {
  characterId?: string;
  lookId?: string;
};

export type PersistLoraDatasetOnServerResult = LoraDatasetExportResult & {
  datasetPath: string;
  datasetId: string;
};

/**
 * Fetch keeper stills and write them under PROMPT_DATA_DIR via POST /api/lora-train
 * (action=export-dataset). Returns the absolute datasetPath for train start.
 */
export async function persistLoraDatasetOnServer(
  entries: ComfyGalleryEntry[],
  options?: PersistLoraDatasetOnServerOptions
): Promise<PersistLoraDatasetOnServerResult> {
  const { manifest, exportedManifest, pairs } = await collectLoraDatasetImageFiles(
    entries,
    options
  );
  if (pairs.length === 0) {
    return { count: 0, manifest, datasetPath: '', datasetId: '' };
  }

  const response = await fetch('/api/lora-train', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'export-dataset',
      trigger: options?.triggerWord,
      characterId: options?.characterId,
      lookId: options?.lookId,
      files: pairs.map(pair => ({
        filename: pair.item.imageFilename,
        caption: pair.item.caption,
        imageBase64: bytesToBase64(pair.imageBytes),
      })),
    }),
  });
  const data = (await response.json()) as {
    error?: string;
    datasetPath?: string;
    datasetId?: string;
    count?: number;
  };
  if (!response.ok) {
    throw new Error(data.error || 'Failed to persist LoRA dataset on server.');
  }
  if (!data.datasetPath?.trim()) {
    throw new Error('Server did not return a datasetPath.');
  }

  return {
    count: data.count ?? exportedManifest.length,
    manifest: exportedManifest,
    datasetPath: data.datasetPath.trim(),
    datasetId: data.datasetId?.trim() || '',
  };
}

/**
 * Single fetch pass: download ZIP and persist under PROMPT_DATA_DIR when the API allows.
 */
export async function downloadAndPersistLoraDataset(
  entries: ComfyGalleryEntry[],
  options?: PersistLoraDatasetOnServerOptions
): Promise<PersistLoraDatasetOnServerResult & { zipDownloaded: boolean }> {
  const { manifest, exportedManifest, pairs } = await collectLoraDatasetImageFiles(
    entries,
    options
  );
  if (pairs.length === 0) {
    return { count: 0, manifest, datasetPath: '', datasetId: '', zipDownloaded: false };
  }

  const files: ZipFileEntry[] = [];
  for (const result of pairs) {
    files.push({ filename: result.item.imageFilename, data: result.imageBytes });
    files.push({
      filename: result.item.captionFilename,
      data: new TextEncoder().encode(result.item.caption),
    });
  }
  files.push({
    filename: 'manifest.json',
    data: new TextEncoder().encode(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          count: exportedManifest.length,
          entries: exportedManifest,
        },
        null,
        2
      )
    ),
  });
  const blob = buildZipBlob(files);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `lora-dataset-${Date.now()}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);

  let datasetPath = '';
  let datasetId = '';
  try {
    const response = await fetch('/api/lora-train', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'export-dataset',
        trigger: options?.triggerWord,
        characterId: options?.characterId,
        lookId: options?.lookId,
        files: pairs.map(pair => ({
          filename: pair.item.imageFilename,
          caption: pair.item.caption,
          imageBase64: bytesToBase64(pair.imageBytes),
        })),
      }),
    });
    const data = (await response.json()) as {
      error?: string;
      datasetPath?: string;
      datasetId?: string;
    };
    if (response.ok && data.datasetPath?.trim()) {
      datasetPath = data.datasetPath.trim();
      datasetId = data.datasetId?.trim() || '';
    }
  } catch {
    // ZIP still succeeded.
  }

  return {
    count: exportedManifest.length,
    manifest: exportedManifest,
    datasetPath,
    datasetId,
    zipDownloaded: true,
  };
}
