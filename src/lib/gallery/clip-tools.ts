'use client';

/**
 * Clip tools in the Gallery card menu (⋯ → Clip): finishing passes a feature offers on any clip
 * in the Gallery. Shared code names no tool; a feature registers its own (Castcut's Play
 * registers Sharpen & smooth and Make more realistic in play/features.ts), and the classic app,
 * registering none, shows no Clip group. A tool resolves to the new clip's URL; the Gallery keeps
 * it as a child of the clip it came from.
 */

import { keepClipInGallery } from '../clip/gallery-keep';
import { pushAppToast } from '../app/toast';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

export type GalleryClipTool = {
  id: string;
  /** Menu label. */
  label: string;
  /** Tooltip: what it does and how long it takes. */
  title?: string;
  /** Toast while it runs ("Sharpening…"). */
  busyText: string;
  /** Toast when the new clip is in the Gallery. */
  doneText: string;
  /** How the new clip is filed (its derived kind and file name). */
  keepKind: 'finish' | 'realism';
  run: (input: { clipUrl: string; entry: ComfyGalleryEntry }) => Promise<string>;
};

const tools: GalleryClipTool[] = [];

/** Adds a tool (a second registration with the same id replaces the first). */
export function registerGalleryClipTool(tool: GalleryClipTool): void {
  const index = tools.findIndex(existing => existing.id === tool.id);
  if (index >= 0) tools[index] = tool;
  else tools.push(tool);
}

export function galleryClipTools(): readonly GalleryClipTool[] {
  return tools;
}

let running: string | null = null;

/** The tool running now (one at a time: these are minutes-long GPU jobs), or null. */
export function runningGalleryClipTool(): string | null {
  return running;
}

/**
 * Runs `tool` on the entry's clip and keeps the result in the Gallery as its child. Progress and
 * the outcome show as toasts; resolves to the error message, or null when the new clip is kept.
 */
export async function runGalleryClipTool(
  tool: GalleryClipTool,
  entry: ComfyGalleryEntry,
  clipUrl: string,
  deps: {
    keep?: typeof keepClipInGallery;
    toast?: typeof pushAppToast;
  } = {}
): Promise<string | null> {
  const toast = deps.toast ?? pushAppToast;
  if (running) {
    const message = 'Another clip job is running — one at a time.';
    toast({ text: message, tone: 'warning' });
    return message;
  }
  running = tool.id;
  toast({ text: `${tool.busyText} This takes a few minutes.`, tone: 'info', ttlMs: 8000 });
  try {
    const url = await tool.run({ clipUrl, entry });
    await (deps.keep ?? keepClipInGallery)({
      url,
      kind: tool.keepKind,
      prompt: `${tool.label}${entry.prompt ? ` · ${entry.prompt.slice(0, 120)}` : ''}`,
      tool: entry.tool || 'gallery',
      sourceEntryId: entry.id,
    });
    toast({ text: tool.doneText, tone: 'success' });
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : `${tool.label} failed.`;
    toast({ text: message, tone: 'danger', ttlMs: 0 });
    return message;
  } finally {
    running = null;
  }
}
