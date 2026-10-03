'use client';

import { compressImageForEngineUpload } from './browser-compress-image';
import { fileToDataUrl } from './browser-file-data-url';
import { resolveRuntimeForModel } from './comfyui-runtime-for-model';
import type { ComfyImageModel } from './comfy-models/client';

export type ComfyUploadedImage = {
  name: string;
  subfolder?: string;
  type?: string;
  width?: number;
  height?: number;
  /** Host that received the file — pin identity queues here. */
  comfyUrl?: string;
};

async function uploadJson(
  file: File,
  comfyUrl: string | undefined,
  extra?: { kind?: 'image' | 'mask'; originalRef?: ComfyUploadedImage; keepName?: boolean }
): Promise<ComfyUploadedImage> {
  const image = await fileToDataUrl(file);
  // ~10MB proxy/Next truncation — refuse before a cryptic JSON parse error.
  if (image.length > 9_000_000) {
    throw new Error(
      'Image is still too large after compression. Try a smaller figure (under ~6MB).'
    );
  }

  const response = await fetch('/api/comfyui/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image,
      mimeType: file.type || 'image/png',
      filename: file.name || 'prompt-studio-upload.png',
      ...(comfyUrl ? { comfyUrl } : {}),
      ...(extra?.kind ? { kind: extra.kind } : {}),
      ...(extra?.keepName ? { keepName: true } : {}),
      ...(extra?.originalRef?.name
        ? {
            originalRef: {
              filename: extra.originalRef.name,
              type: extra.originalRef.type,
              subfolder: extra.originalRef.subfolder,
            },
          }
        : {}),
    }),
  });

  const data = (await response.json()) as ComfyUploadedImage & { error?: string };
  if (!response.ok || !data.name?.trim()) {
    throw new Error(data.error ?? 'ComfyUI image upload failed.');
  }

  return {
    name: data.name.trim(),
    subfolder: data.subfolder?.trim() || undefined,
    type: data.type?.trim() || undefined,
    comfyUrl: typeof data.comfyUrl === 'string' ? data.comfyUrl.trim() || undefined : undefined,
  };
}

async function uploadMultipart(
  file: File,
  comfyUrl: string | undefined,
  extra?: { kind?: 'image' | 'mask'; originalRef?: ComfyUploadedImage; keepName?: boolean }
): Promise<ComfyUploadedImage> {
  const formData = new FormData();
  formData.append('image', file, file.name);
  if (comfyUrl) {
    formData.append('comfyUrl', comfyUrl);
  }
  if (extra?.kind) {
    formData.append('kind', extra.kind);
  }
  if (extra?.keepName) {
    formData.append('keepName', 'true');
  }
  if (extra?.originalRef?.name) {
    formData.append(
      'originalRef',
      JSON.stringify({
        filename: extra.originalRef.name,
        type: extra.originalRef.type,
        subfolder: extra.originalRef.subfolder,
      })
    );
  }

  const response = await fetch('/api/comfyui/upload', {
    method: 'POST',
    body: formData,
  });

  const data = (await response.json()) as ComfyUploadedImage & { error?: string };
  if (!response.ok || !data.name?.trim()) {
    throw new Error(data.error ?? 'ComfyUI image upload failed.');
  }

  return {
    name: data.name.trim(),
    subfolder: data.subfolder?.trim() || undefined,
    type: data.type?.trim() || undefined,
    comfyUrl: typeof data.comfyUrl === 'string' ? data.comfyUrl.trim() || undefined : undefined,
  };
}

export async function uploadComfyInputImage(input: {
  file: File;
  model?: ComfyImageModel | string;
  comfyUrl?: string;
  kind?: 'image' | 'mask';
  originalRef?: ComfyUploadedImage;
  /**
   * Store under `file.name` exactly, overwriting. Off by default: ComfyUI gets a name made from
   * the picture's bytes (`<prefix>-<sha256[:16]>.<ext>`) and a picture it already has is not
   * sent again — so use the returned `name`, never `file.name`.
   */
  keepName?: boolean;
}): Promise<ComfyUploadedImage> {
  const runtime = input.model ? resolveRuntimeForModel(input.model as ComfyImageModel) : undefined;
  const comfyUrl = input.comfyUrl?.trim() || runtime?.apiUrl?.trim() || undefined;
  const extra = {
    kind: input.kind,
    originalRef: input.originalRef,
    keepName: input.keepName,
  };

  // Masks stay lossless so inpaint edges remain sharp. Compress figures only.
  const prepared =
    input.kind === 'mask'
      ? input.file
      : await compressImageForEngineUpload(input.file, {
          maxEdge: 2048,
          maxBytes: 7_000_000,
          quality: 0.92,
        });

  let width: number | undefined;
  let height: number | undefined;
  try {
    const { probeImageFileDimensions } = await import('./browser-image-dimensions');
    const size = await probeImageFileDimensions(prepared);
    if (size) {
      width = size.width;
      height = size.height;
    }
  } catch {
    /* optional */
  }

  const { getEngineAdapter } = await import('./engine');
  const adapter = getEngineAdapter();
  if (adapter.id !== 'comfyui') {
    const uploaded = await adapter.uploadInputImage({
      file: prepared,
      engineUrl: comfyUrl,
      model: typeof input.model === 'string' ? input.model : undefined,
    });
    return {
      name: uploaded.name,
      subfolder: uploaded.subfolder,
      type: uploaded.type,
      width,
      height,
    };
  }

  try {
    const uploaded = await uploadMultipart(prepared, comfyUrl, extra);
    return { ...uploaded, width, height };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Next/undici multipart parse failures — JSON data URL is reliable once compressed.
    if (!/FormData|parse body|multipart/i.test(message)) {
      throw error;
    }
    const uploaded = await uploadJson(prepared, comfyUrl, extra);
    return { ...uploaded, width, height };
  }
}
