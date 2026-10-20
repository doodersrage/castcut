import { addComfyGalleryEntry } from './comfyui-gallery';
import { persistGalleryOriginal } from './media-client';
import { loadComfyUiSettings } from '../comfyui/settings';
import { buildEngineViewPath } from '../engine/view-paths';

export const GALLERY_UPLOAD_TOOL = 'upload';
export const MAX_GALLERY_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_GALLERY_UPLOAD_FILES = 12;

const IMAGE_EXTENSION = /\.(jpe?g|png|webp|gif)$/i;

export function isGalleryImportImageFile(file: {
  type?: string;
  name?: string;
  size?: number;
}): boolean {
  const size = typeof file.size === 'number' ? file.size : 0;
  if (size <= 0 || size > MAX_GALLERY_UPLOAD_BYTES) {
    return false;
  }
  const type = file.type?.trim().toLowerCase() ?? '';
  if (type.startsWith('image/') && type !== 'image/svg+xml') {
    return true;
  }
  return IMAGE_EXTENSION.test(file.name ?? '');
}

export function sanitizeGalleryUploadFilename(name: string): string {
  const base = name.trim().split(/[/\\]/).pop() || 'upload.png';
  const cleaned = base
    .replace(/[^\w.\- ()[\]]+/g, '_')
    .slice(0, 180)
    .trim();
  return cleaned || 'upload.png';
}

export function galleryUploadPromptFallback(filename: string): string {
  const stem = sanitizeGalleryUploadFilename(filename).replace(/\.[^.]+$/, '');
  return stem.trim() || 'Uploaded still';
}

export function galleryUploadPromptLooksGeneric(entry: {
  tool?: string;
  prompt: string;
  images?: Array<{ filename?: string }>;
}): boolean {
  if (entry.tool !== GALLERY_UPLOAD_TOOL) {
    return false;
  }
  const prompt = entry.prompt.trim();
  if (!prompt || prompt === 'Uploaded still') {
    return true;
  }
  const stem = (entry.images?.[0]?.filename ?? '').replace(/\.[^.]+$/, '').trim();
  if (stem && prompt === stem) {
    return true;
  }
  // Filename fallback after a Comfy rename, or a short title-like label.
  return !prompt.includes(',') && prompt.split(/\s+/).length <= 8 && prompt.length <= 80;
}

export async function importLocalImagesToGallery(files: File[]): Promise<{
  imported: number;
  failed: number;
  errors: string[];
}> {
  const picked = files.slice(0, MAX_GALLERY_UPLOAD_FILES);
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];
  const created: ReturnType<typeof addComfyGalleryEntry>[] = [];

  for (const file of picked) {
    const label = sanitizeGalleryUploadFilename(file.name || 'upload.png');
    if (!isGalleryImportImageFile(file)) {
      failed += 1;
      errors.push(`${label}: not a supported image (JPEG, PNG, WebP, or GIF, max 25MB).`);
      continue;
    }
    try {
      const id = crypto.randomUUID();
      const prompt = await promptFromUploadFile(file);
      const persisted = await persistGalleryOriginal(id, file);
      if (persisted && !persisted.skipped && persisted.originalUrl && persisted.originalPath) {
        const settings = loadComfyUiSettings();
        created.push(
          addComfyGalleryEntry({
            id,
            promptId: `upload-${id}`,
            prompt,
            tool: GALLERY_UPLOAD_TOOL,
            comfyUrl: settings.apiUrl?.trim() || 'http://127.0.0.1:8188',
            status: 'completed',
            completedAt: Date.now(),
            images: [
              {
                filename: label,
                subfolder: '',
                type: 'output',
                format: file.type || undefined,
              },
            ],
            durableThumbPath: persisted.thumbPath,
            durableOriginalPath: persisted.originalPath,
            sourceImageUrl: persisted.originalUrl,
            userTags: ['upload'],
          })
        );
        imported += 1;
        continue;
      }

      const { uploadComfyInputImage } = await import('../comfyui/image-upload');
      const uploaded = await uploadComfyInputImage({ file });
      const filename = uploaded.name?.trim();
      if (!filename) {
        throw new Error('ComfyUI did not return a filename.');
      }
      const comfyUrl = uploaded.comfyUrl?.trim() || loadComfyUiSettings().apiUrl?.trim() || '';
      const sourceImageUrl = buildEngineViewPath('comfyui', comfyUrl, {
        filename,
        subfolder: uploaded.subfolder ?? '',
        type: uploaded.type ?? 'input',
      });
      created.push(
        addComfyGalleryEntry({
          promptId: `upload-${crypto.randomUUID()}`,
          prompt,
          tool: GALLERY_UPLOAD_TOOL,
          comfyUrl: comfyUrl || 'http://127.0.0.1:8188',
          status: 'completed',
          completedAt: Date.now(),
          images: [
            {
              filename,
              subfolder: uploaded.subfolder ?? '',
              type: uploaded.type ?? 'input',
              format: file.type || undefined,
            },
          ],
          sourceImageUrl,
          userTags: ['upload'],
        })
      );
      imported += 1;
    } catch (error) {
      failed += 1;
      errors.push(
        `${label}: ${error instanceof Error ? error.message : 'Could not import this image.'}`
      );
    }
  }

  if (files.length > MAX_GALLERY_UPLOAD_FILES) {
    errors.push(`Only the first ${MAX_GALLERY_UPLOAD_FILES} files were imported.`);
  }

  if (created.length > 0) {
    void import('./auto-vision-tags').then(({ queueGalleryVisionScans }) => {
      queueGalleryVisionScans(created);
    });
  }

  return { imported, failed, errors };
}

async function promptFromUploadFile(file: File): Promise<string> {
  const fallback = galleryUploadPromptFallback(file.name || 'upload.png');
  if (!/\.png$/i.test(file.name || '') && file.type !== 'image/png') {
    return fallback;
  }
  try {
    const { readPngMetadataFile } = await import('../png-metadata');
    const metadata = await readPngMetadataFile(file);
    const positive = metadata.positive?.trim();
    if (positive) {
      return positive;
    }
  } catch {
    // PNG without Comfy/A1111 chunks is still a valid still.
  }
  return fallback;
}
