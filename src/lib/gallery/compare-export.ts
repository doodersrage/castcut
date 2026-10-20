import type { ComfyGalleryEntry } from './comfyui-gallery';
import { galleryEntryViewUrls } from './comfyui-gallery';
import {
  brandedHtmlDocument,
  brandedHtmlSection,
  escapeBrandedHtml,
} from '../app/branded-html-shell';
import { downloadTextFile } from '../history/export-formats';

export type CompareExportEntry = {
  id: string;
  model?: string;
  seed?: string;
  rating?: number;
  favorite?: boolean;
  prompt: string;
  negativePrompt?: string;
  imageUrl?: string;
};

export function buildCompareExport(entries: ComfyGalleryEntry[]): CompareExportEntry[] {
  return entries.map(entry => ({
    id: entry.id,
    model: entry.model,
    seed: entry.queueParams?.seed != null ? String(entry.queueParams.seed) : undefined,
    rating: entry.reviewRating,
    favorite: entry.favorite,
    prompt: entry.prompt,
    negativePrompt: entry.negativePrompt,
    imageUrl: entry.images?.length ? galleryEntryViewUrls(entry)[0] : undefined,
  }));
}

export function exportCompareJson(entries: ComfyGalleryEntry[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      count: entries.length,
      entries: buildCompareExport(entries),
    },
    null,
    2
  );
}

export function exportCompareHtml(entries: ComfyGalleryEntry[]): string {
  const cards = buildCompareExport(entries)
    .map(entry => {
      const model = escapeBrandedHtml(entry.model ?? 'unknown');
      const seed = escapeBrandedHtml(entry.seed ?? '?');
      const rating =
        typeof entry.rating === 'number' && Number.isFinite(entry.rating)
          ? ` · ${escapeBrandedHtml(String(entry.rating))}★`
          : '';
      const imageUrl = safeImageUrlAttr(entry.imageUrl);
      return brandedHtmlSection(`
  <h2 style="margin:0 0 8px;font-size:16px;">${model} · seed ${seed}${rating}</h2>
  ${imageUrl ? `<img src="${imageUrl}" alt="" style="max-width:100%;border-radius:8px;margin-bottom:12px;border:1px solid rgba(255,255,255,0.06);" />` : ''}
  <pre style="white-space:pre-wrap;font-size:13px;line-height:1.5;color:#9eb6e0;font-family:ui-monospace,monospace;">${escapeBrandedHtml(entry.prompt)}</pre>
`);
    })
    .join('\n');

  return brandedHtmlDocument({
    title: `Compare (${entries.length})`,
    subtitle: 'Gallery A/B compare',
    metaLine: `Exported ${new Date().toLocaleString()}`,
    bodyHtml: cards,
  });
}

function safeImageUrlAttr(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  try {
    const url = new URL(value, 'http://localhost');
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined;
    }
    return escapeBrandedHtml(value);
  } catch {
    return undefined;
  }
}

export function downloadCompareExport(
  entries: ComfyGalleryEntry[],
  format: 'json' | 'html' = 'json'
): void {
  if (format === 'html') {
    downloadTextFile(exportCompareHtml(entries), 'gallery-compare.html', 'text/html;charset=utf-8');
    return;
  }
  downloadTextFile(
    exportCompareJson(entries),
    'gallery-compare.json',
    'application/json;charset=utf-8'
  );
}
