'use client';

import type { ComfyImageModel } from './comfy-models/client';
import { uploadComfyInputImage } from './comfyui/image-upload';

export type ResolveQueueInputImageOptions = {
  file?: File | null;
  filename?: string;
  imageUrl?: string;
  model?: ComfyImageModel | string;
  comfyUrl?: string;
  kind?: 'image' | 'mask';
  originalRef?: {
    name: string;
    subfolder?: string;
    type?: string;
  };
};

export type ResolvedQueueInputImage = {
  filename: string;
  width?: number;
  height?: number;
  subfolder?: string;
  type?: string;
  comfyUrl?: string;
};

export async function resolveQueueInputImageFilename(
  options: ResolveQueueInputImageOptions
): Promise<string | undefined> {
  const resolved = await resolveQueueInputImage(options);
  return resolved?.filename;
}

/** Upload (or reuse filename) and return pixel size of what Comfy actually got. */
export async function resolveQueueInputImage(
  options: ResolveQueueInputImageOptions
): Promise<ResolvedQueueInputImage | undefined> {
  if (options.file) {
    const uploaded = await uploadComfyInputImage({
      file: options.file,
      model: options.model,
      comfyUrl: options.comfyUrl,
      kind: options.kind,
      originalRef: options.originalRef,
    });
    return {
      filename: uploaded.name,
      width: uploaded.width,
      height: uploaded.height,
      subfolder: uploaded.subfolder,
      type: uploaded.type,
      comfyUrl: uploaded.comfyUrl,
    };
  }

  if (options.imageUrl?.trim()) {
    const response = await fetch(options.imageUrl);
    if (!response.ok) {
      throw new Error(`Could not fetch image for ComfyUI upload (HTTP ${response.status}).`);
    }
    const blob = await response.blob();
    const filename = options.filename?.trim() || `prompt-studio-${Date.now()}.png`;
    const file = new File([blob], filename, { type: blob.type || 'image/png' });
    const uploaded = await uploadComfyInputImage({
      file,
      model: options.model,
      comfyUrl: options.comfyUrl,
      kind: options.kind,
      originalRef: options.originalRef,
    });
    return {
      filename: uploaded.name,
      width: uploaded.width,
      height: uploaded.height,
      subfolder: uploaded.subfolder,
      type: uploaded.type,
      comfyUrl: uploaded.comfyUrl,
    };
  }

  const existing = options.filename?.trim();
  return existing ? { filename: existing } : undefined;
}
