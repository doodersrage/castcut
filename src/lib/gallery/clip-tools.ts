'use client';

/**
 * Clip tools in the Gallery card menu (⋯ → Clip): finishing passes a feature offers on any clip
 * in the Gallery. Shared code names no tool; a feature registers its own (Castcut's Play
 * registers Sharpen & smooth and Make more realistic in play/features.ts), and the classic app,
 * registering none, shows no Clip group. A tool resolves to the new clip's URL; the Gallery keeps
 * it as a child of the clip it came from.
 */

import { pushAppToast } from '../app/toast';
import { ClipJobBusyError, type ClipJobTool } from '../clip/clip-jobs';
import { runClipJob, runningTrackedClipJob } from '../clip/clip-jobs-tracker';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

export type GalleryClipTool = {
  id: string;
  /** Menu label. */
  label: string;
  /** Tooltip: what it does and how long it takes. */
  title?: string;
  /** Toast while it runs ("Sharpening…"). */
  busyText: string;
  /** How the new clip is filed (its derived kind and file name). */
  keepKind: 'finish' | 'realism';
  /** The background clip job it runs (clip-jobs.ts). */
  job: ClipJobTool;
  /** Extra request fields (e.g. a strength). */
  body?: (input: { clipUrl: string; entry: ComfyGalleryEntry }) => Record<string, unknown>;
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

/** The clip job running now (one at a time: these are minutes-long GPU jobs), or null. */
export function runningGalleryClipTool(): string | null {
  return runningTrackedClipJob()?.tool ?? null;
}

/**
 * Starts `tool` on the entry's clip as a background job; the jobs tray shows its progress (with
 * Cancel), and the new clip is kept in the Gallery as the entry's child — also if the page is
 * reloaded meanwhile. Resolves to the error message, or null when the new clip is kept.
 */
export async function runGalleryClipTool(
  tool: GalleryClipTool,
  entry: ComfyGalleryEntry,
  clipUrl: string,
  deps: {
    run?: typeof runClipJob;
    toast?: typeof pushAppToast;
  } = {}
): Promise<string | null> {
  const toast = deps.toast ?? pushAppToast;
  if (runningTrackedClipJob()) {
    const message = 'Another clip job is running — one at a time. It is in the jobs tray.';
    toast({ text: message, tone: 'warning' });
    return message;
  }
  toast({
    text: `${tool.busyText} It takes a few minutes — follow it in the jobs tray.`,
    tone: 'info',
    ttlMs: 8000,
  });
  try {
    await (deps.run ?? runClipJob)({
      tool: tool.job,
      body: { clipUrl, entryId: entry.id, ...tool.body?.({ clipUrl, entry }) },
      keep: {
        kind: tool.keepKind,
        prompt: `${tool.label}${entry.prompt ? ` · ${entry.prompt.slice(0, 120)}` : ''}`,
        tool: entry.tool || 'gallery',
        sourceEntryId: entry.id,
      },
      owner: { feature: 'gallery', ref: entry.id },
      label: `${tool.label}${entry.prompt ? ` · ${entry.prompt.slice(0, 60)}` : ''}`,
    });
    return null;
  } catch (error) {
    // The tracker has already said why (with Retry) — a busy server is the one case it doesn't.
    if (error instanceof ClipJobBusyError) toast({ text: error.message, tone: 'warning' });
    return error instanceof Error ? error.message : `${tool.label} failed.`;
  }
}
