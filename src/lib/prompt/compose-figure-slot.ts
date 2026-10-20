import { MAX_COMPOSE_FIGURES } from '@/lib/prompt/compose-prompt';

export type FigureSlot = {
  file: File | null;
  originalFile: File | null;
  previewUrl: string | null;
  originalPreviewUrl: string | null;
  isolated?: boolean;
};

export function emptyFigure(): FigureSlot {
  return {
    file: null,
    originalFile: null,
    previewUrl: null,
    originalPreviewUrl: null,
    isolated: false,
  };
}

export function emptySlots(): FigureSlot[] {
  return Array.from({ length: MAX_COMPOSE_FIGURES }, () => emptyFigure());
}

export function revokeBlobUrl(url: string | null | undefined) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

export function revokeFigureUrls(slot: FigureSlot | undefined) {
  if (!slot) {
    return;
  }
  revokeBlobUrl(slot.previewUrl);
  if (slot.originalPreviewUrl && slot.originalPreviewUrl !== slot.previewUrl) {
    revokeBlobUrl(slot.originalPreviewUrl);
  }
}

export async function fileFromPreviewUrl(previewUrl: string, filename: string): Promise<File> {
  const response = await fetch(previewUrl);
  if (!response.ok) {
    throw new Error('Could not load Image 1 to isolate.');
  }
  const blob = await response.blob();
  return new File([blob], filename, {
    type: blob.type || 'image/png',
    lastModified: Date.now(),
  });
}
