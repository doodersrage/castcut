import { buildPromptSidecar } from './prompt-sidecar';
import { galleryEntryDownloadUrls, type ComfyGalleryEntry } from './comfyui-gallery';
import { buildComfyViewPath } from './comfyui-outputs';
import { getGalleryEntryById } from './gallery-db-store';
import { stripGalleryWorkflowJsonForExport } from './gallery-workflow-hygiene';
import { isGalleryEntryHidden, withoutHiddenGalleryEntries } from './gallery-adult-check';

export { readSidecarOutputImage, sidecarOutputViewUrl } from './prompt-sidecar';

export function buildGallerySidecar(
  entry: ComfyGalleryEntry,
  options?: { includeWorkflowJson?: boolean }
) {
  const full = getGalleryEntryById(entry.id) ?? entry;
  const exportEntry =
    options?.includeWorkflowJson === true ? full : stripGalleryWorkflowJsonForExport(full);
  const outputImage = exportEntry.images[0];
  return buildPromptSidecar({
    positive: exportEntry.prompt,
    negative: exportEntry.negativePrompt,
    model: exportEntry.model ?? 'unknown',
    tool: exportEntry.tool,
    hints: exportEntry.prompt.slice(0, 200),
    metadata: {
      promptId: exportEntry.promptId,
      galleryEntryId: exportEntry.id,
      comfyUrl: exportEntry.comfyUrl,
      status: exportEntry.status,
      queuedAt: exportEntry.queuedAt,
      completedAt: exportEntry.completedAt,
      outputImage,
      images: exportEntry.images,
      queueParams: exportEntry.queueParams,
      sourceImageUrl:
        exportEntry.sourceImageUrl ??
        (outputImage ? buildComfyViewPath(exportEntry.comfyUrl, outputImage) : undefined),
      maskImageUrl: exportEntry.maskImageUrl,
      controlImageUrls: exportEntry.controlImageUrls,
      queueQualityProfile: exportEntry.queueQualityProfile,
      parentGalleryEntryId: exportEntry.parentGalleryEntryId,
      characterId: exportEntry.characterId,
      lookId: exportEntry.lookId,
      derivedKind: exportEntry.derivedKind,
      hasStoredWorkflow: exportEntry.hasStoredWorkflow,
      workflowJsonOmitted: exportEntry.workflowJsonOmitted,
      ...(options?.includeWorkflowJson && full.workflowJson
        ? { workflowJson: full.workflowJson }
        : {}),
    },
  });
}

export function downloadGallerySidecar(entry: ComfyGalleryEntry): void {
  const sidecar = buildGallerySidecar(entry);
  const payload = JSON.stringify(sidecar, null, 2);
  const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `gallery-${entry.promptId.slice(0, 8)}-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function resolveGalleryImageBlob(viewUrl: string): Promise<Blob> {
  // Prefer Cache API / service-worker hits when Comfy is offline.
  if (typeof caches !== 'undefined') {
    try {
      const cached = await caches.match(viewUrl, { ignoreSearch: false });
      if (cached?.ok) {
        return cached.blob();
      }
      // Thumbs often cache with w=; try common widths then the bare view URL.
      const url = new URL(
        viewUrl,
        typeof window !== 'undefined' ? window.location.origin : 'http://local'
      );
      for (const width of [null, '512', '1024', '256']) {
        if (width) {
          url.searchParams.set('w', width);
        } else {
          url.searchParams.delete('w');
        }
        const hit = await caches.match(url.toString(), { ignoreSearch: false });
        if (hit?.ok) {
          return hit.blob();
        }
      }
    } catch {
      // fall through to network
    }
  }

  const response = await fetch(viewUrl);
  if (!response.ok) {
    throw new Error(`Download failed (HTTP ${response.status})`);
  }
  return response.blob();
}

export async function downloadGalleryImage(
  entry: ComfyGalleryEntry,
  imageIndex = 0
): Promise<void> {
  const image = entry.images[imageIndex];
  // Held or withheld by the adult-appearance gate: never exported.
  if (!image || isGalleryEntryHidden(entry)) {
    return;
  }

  const downloads = galleryEntryDownloadUrls(entry);
  const viewUrl = downloads.url[imageIndex] ?? buildComfyViewPath(entry.comfyUrl, image);
  const blob = await resolveGalleryImageBlob(viewUrl);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download =
    downloads.filename[imageIndex] || image.filename || `comfyui-${entry.promptId.slice(0, 8)}.bin`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadGallerySidecarBundle(allEntries: ComfyGalleryEntry[]): void {
  const entries = withoutHiddenGalleryEntries(allEntries);
  if (entries.length === 0) {
    return;
  }

  const payload = JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      count: entries.length,
      entries: entries.map(entry => buildGallerySidecar(entry)),
    },
    null,
    2
  );
  const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `gallery-sidecars-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadGalleryImagesSequential(
  entries: ComfyGalleryEntry[]
): Promise<number> {
  let downloaded = 0;

  for (const entry of withoutHiddenGalleryEntries(entries)) {
    if (entry.status !== 'completed' || entry.images.length === 0) {
      continue;
    }
    try {
      await downloadGalleryImage(entry, 0);
      downloaded += 1;
      await new Promise(resolve => window.setTimeout(resolve, 350));
    } catch {
      // continue with remaining entries
    }
  }

  return downloaded;
}
