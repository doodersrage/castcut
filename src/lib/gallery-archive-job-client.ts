/**
 * Client-safe archive entry descriptors (no Node / server-only imports).
 */

import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import type { ComfyOutputImage } from './comfyui-outputs';

export type GalleryArchiveEntryDescriptor = {
  id: string;
  promptId: string;
  prompt?: string;
  negativePrompt?: string;
  tool?: string;
  model?: string;
  status: ComfyGalleryEntry['status'];
  comfyUrl: string;
  engineId?: ComfyGalleryEntry['engineId'];
  queuedAt?: number;
  completedAt?: number;
  images: ComfyOutputImage[];
  durableOriginalPath?: string;
  durableOriginalPaths?: (string | null)[];
  favorite?: boolean;
  reviewRating?: ComfyGalleryEntry['reviewRating'];
  characterId?: string;
  lookId?: string;
};

export function toArchiveEntryDescriptor(entry: ComfyGalleryEntry): GalleryArchiveEntryDescriptor {
  return {
    id: entry.id,
    promptId: entry.promptId,
    prompt: entry.prompt,
    negativePrompt: entry.negativePrompt,
    tool: entry.tool,
    model: entry.model,
    status: entry.status,
    comfyUrl: entry.comfyUrl,
    engineId: entry.engineId,
    queuedAt: entry.queuedAt,
    completedAt: entry.completedAt,
    images: entry.images ?? [],
    durableOriginalPath: entry.durableOriginalPath,
    durableOriginalPaths: entry.durableOriginalPaths,
    favorite: entry.favorite,
    reviewRating: entry.reviewRating,
    characterId: entry.characterId,
    lookId: entry.lookId,
  };
}
