'use client';

/**
 * Still tools in the Gallery card menu (⋯ → Make it move): actions a feature offers on any
 * finished still. Shared code names no tool; Castcut's Play registers its Director
 * (play/features.ts), and the classic app, registering none, shows no group.
 */

import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

export type GalleryStillTool = {
  id: string;
  label: string;
  title?: string;
  /** Opens the tool on the still. */
  run: (input: { entry: ComfyGalleryEntry; stillUrl: string }) => void;
};

const tools: GalleryStillTool[] = [];

/** Adds a tool (a second registration with the same id replaces the first). */
export function registerGalleryStillTool(tool: GalleryStillTool): void {
  const index = tools.findIndex(existing => existing.id === tool.id);
  if (index >= 0) tools[index] = tool;
  else tools.push(tool);
}

export function galleryStillTools(): readonly GalleryStillTool[] {
  return tools;
}
