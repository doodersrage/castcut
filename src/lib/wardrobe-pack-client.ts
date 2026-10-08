'use client';

import { comfyInputViewUrl } from '@/lib/face-match-client';
import {
  loadSavedFittingGarments,
  saveFittingGarment,
  FITTING_SAVED_GARMENTS_LIMIT,
} from '@/lib/fitting-saved-garments';
import { loadSavedFootwear, saveFootwear, SAVED_FOOTWEAR_LIMIT } from '@/lib/footwear-saved';
import { loadImageBlobFromUrls } from '@/lib/isolate-subject';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import {
  buildWardrobePackZip,
  parseWardrobePack,
  wardrobePackDuplicate,
  type WardrobePackItemInput,
} from '@/lib/wardrobe-pack';

export type WardrobePackKind = 'clothing' | 'shoes';

async function imageBytes(filename: string, imageUrl?: string): Promise<Uint8Array> {
  const urls = [comfyInputViewUrl(filename), imageUrl].filter((url): url is string => Boolean(url));
  const blob = await loadImageBlobFromUrls(urls);
  return new Uint8Array(await blob.arrayBuffer());
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

/**
 * Download the saved clothing photos or saved shoes as a wardrobe pack. Photos whose file is gone
 * from ComfyUI are left out and counted.
 */
export async function exportWardrobePack(
  kind: WardrobePackKind
): Promise<{ exported: number; missing: number }> {
  const saved =
    kind === 'clothing'
      ? loadSavedFittingGarments().map(entry => ({ ...entry, text: entry.description }))
      : loadSavedFootwear().map(entry => ({ ...entry, text: entry.words }));
  const items: WardrobePackItemInput[] = [];
  let missing = 0;
  for (const entry of saved) {
    try {
      items.push({
        label: entry.label,
        text: entry.text,
        image: await imageBytes(entry.imageFilename, entry.imageUrl),
      });
    } catch {
      missing += 1;
    }
  }
  if (items.length === 0) {
    throw new Error(
      saved.length === 0
        ? `No saved ${kind} to export.`
        : 'The saved pictures could not be read from ComfyUI.'
    );
  }
  const blob = buildWardrobePackZip({
    clothing: kind === 'clothing' ? items : [],
    shoes: kind === 'shoes' ? items : [],
  });
  download(blob, `castcut-${kind}-pack-${new Date().toISOString().slice(0, 10)}.zip`);
  return { exported: items.length, missing };
}

export type WardrobePackImportResult = {
  clothing: number;
  shoes: number;
  skipped: number;
  failed: number;
  /** More than the saved lists keep: the oldest saved ones dropped off. */
  overLimit: boolean;
};

/** Add a pack's clothing and shoes to the saved lists (pictures uploaded to ComfyUI). */
export async function importWardrobePack(file: File): Promise<WardrobePackImportResult> {
  const pack = await parseWardrobePack(await file.arrayBuffer());
  const clothingBefore = loadSavedFittingGarments().length;
  const shoesBefore = loadSavedFootwear().length;
  const result: WardrobePackImportResult = {
    clothing: 0,
    shoes: 0,
    skipped: 0,
    failed: 0,
    overLimit: false,
  };
  const upload = async (name: string, data: Uint8Array) => {
    const base = `wardrobe-pack-${Date.now()}-${name.replace(/[^\w.-]+/g, '-')}`;
    const type = /\.jpe?g$/i.test(name)
      ? 'image/jpeg'
      : /\.webp$/i.test(name)
        ? 'image/webp'
        : 'image/png';
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    const uploaded = await resolveQueueInputImage({
      file: new File([copy], base, { type, lastModified: Date.now() }),
      filename: base,
    });
    const filename = uploaded?.filename?.trim();
    if (!filename) throw new Error('upload returned no filename');
    return filename;
  };
  for (const item of pack.clothing) {
    const saved = loadSavedFittingGarments().map(entry => ({
      label: entry.label,
      text: entry.description,
    }));
    if (wardrobePackDuplicate(item.description, item.label, saved)) {
      result.skipped += 1;
      continue;
    }
    try {
      const imageFilename = await upload(item.name, item.image);
      saveFittingGarment({ imageFilename, description: item.description, label: item.label });
      result.clothing += 1;
    } catch {
      result.failed += 1;
    }
  }
  for (const item of pack.shoes) {
    const saved = loadSavedFootwear().map(entry => ({ label: entry.label, text: entry.words }));
    if (wardrobePackDuplicate(item.words, item.label, saved)) {
      result.skipped += 1;
      continue;
    }
    try {
      const imageFilename = await upload(item.name, item.image);
      saveFootwear({ imageFilename, words: item.words ?? item.label });
      result.shoes += 1;
    } catch {
      result.failed += 1;
    }
  }
  // Only when the saved list could not hold them all (it keeps the newest 12 of each).
  result.overLimit =
    clothingBefore + result.clothing > FITTING_SAVED_GARMENTS_LIMIT ||
    shoesBefore + result.shoes > SAVED_FOOTWEAR_LIMIT;
  return result;
}

export function wardrobePackImportMessage(result: WardrobePackImportResult): string {
  const added = [
    result.clothing ? `${result.clothing} clothing photo${result.clothing === 1 ? '' : 's'}` : '',
    result.shoes ? `${result.shoes} pair${result.shoes === 1 ? '' : 's'} of shoes` : '',
  ].filter(Boolean);
  return [
    added.length ? `Added ${added.join(' and ')}.` : 'Nothing new to add.',
    result.skipped ? `${result.skipped} already saved.` : '',
    result.failed ? `${result.failed} could not be uploaded to ComfyUI.` : '',
    result.overLimit ? 'The saved lists keep the newest 12 — older ones dropped off.' : '',
  ]
    .filter(Boolean)
    .join(' ');
}
