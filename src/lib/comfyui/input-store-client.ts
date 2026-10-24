'use client';

import { collectComfyFileRefs } from '@/lib/storage/media-backup-refs';
import { exportStudioBackup } from '@/lib/storage/studio-backup';
import { loadComfyUiSettings } from './settings';

/** Names sent per request (the route takes at most 5000). */
const CHUNK = 2000;

/**
 * Tell the server which ComfyUI pictures this browser's data names — Cast plates and the renders
 * a look uses, clothing and shoe photos, face crops, pose guides (the Pictures backup's list:
 * Gallery renders are left out, they keep their own copies) — so it keeps a copy of each
 * (api/comfyui/input-store). The browser's data can be days ahead of what the server holds, so
 * the server's own backfill alone missed Cast pictures on a ComfyUI switch (2026-10-24).
 */
export async function keepReferencedComfyFiles(): Promise<{ named: number; queued: number }> {
  const refs = collectComfyFileRefs(exportStudioBackup());
  const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
  let named = 0;
  let queued = 0;
  for (let at = 0; at < refs.length; at += CHUNK) {
    const response = await fetch('/api/comfyui/input-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: refs.slice(at, at + CHUNK),
        ...(comfyUrl ? { comfyUrl } : {}),
      }),
    });
    if (!response.ok) break;
    const data = (await response.json().catch(() => ({}))) as { named?: number; queued?: number };
    named += data.named ?? 0;
    queued = data.queued ?? queued;
  }
  return { named, queued };
}
