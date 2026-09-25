'use client';

import {
  DEFAULT_COMPOSE_IDENTITY_KIND,
  DEFAULT_COMPOSE_IDENTITY_LOCK_STRENGTH,
  normalizeComposeIdentityKind,
  normalizeComposeIdentityLockStrength,
} from './compose-identity-lock';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import { resolveComfyOutputMediaKind } from './comfyui-outputs';
import { persistIdentityImage, IDENTITY_MEDIA_URL } from './gallery-media-client';
import { galleryToolHrefForEntry, galleryToolLabel } from './gallery-tool-href';
import { resolveQueueInputImage } from './queue-input-image';
import { loadSettingsCache, saveSharedSettings } from './settings-cache';

export function galleryEntryCanLockFace(
  entry: Pick<ComfyGalleryEntry, 'status' | 'images'>
): boolean {
  if (entry.status !== 'completed') {
    return false;
  }
  const image = entry.images?.[0];
  if (!image?.filename?.trim()) {
    return false;
  }
  return resolveComfyOutputMediaKind(image) === 'image';
}

/** Upload this still into Comfy input and lock it as the Generate identity ref. */
export async function applyGalleryFaceToSession(
  entry: ComfyGalleryEntry,
  options?: { toast?: boolean }
): Promise<{
  ok: boolean;
  filename?: string;
  error?: string;
}> {
  if (typeof window === 'undefined') {
    return { ok: false, error: 'Browser only.' };
  }
  if (!galleryEntryCanLockFace(entry)) {
    return { ok: false, error: 'This still has no image to lock.' };
  }
  const { galleryEntryPrimaryViewUrl } = await import('./comfyui-gallery');
  const viewUrl = galleryEntryPrimaryViewUrl(entry);
  if (!viewUrl) {
    return { ok: false, error: 'No view URL for this still.' };
  }

  try {
    const uploaded = await resolveQueueInputImage({
      imageUrl: viewUrl,
      filename: entry.images[0]?.filename?.trim() || `gallery-face-${Date.now()}.png`,
      model: entry.model,
    });
    if (!uploaded) {
      return { ok: false, error: 'Upload did not return a filename.' };
    }
    const filename = uploaded.filename.trim();
    if (!filename) {
      return { ok: false, error: 'Upload did not return a filename.' };
    }
    const still = entry.images[0];
    const durableUrl = await persistIdentityImage({
      galleryEntryId: entry.id,
      comfyUrl: entry.comfyUrl,
      imageFilename: still?.filename,
      subfolder: still?.subfolder,
      type: still?.type,
    });
    const shared = loadSettingsCache().shared;
    saveSharedSettings(
      {
        ...shared,
        ipAdapterImageFilename: filename,
        ipAdapterImageFilenames: [filename],
        ipAdapterImageUrl: durableUrl || viewUrl,
        ipAdapterComfyUrl: uploaded.comfyUrl,
        ipAdapterStrength: normalizeComposeIdentityLockStrength(
          shared.ipAdapterStrength ?? DEFAULT_COMPOSE_IDENTITY_LOCK_STRENGTH
        ),
        identityKind: normalizeComposeIdentityKind(
          shared.identityKind ?? DEFAULT_COMPOSE_IDENTITY_KIND
        ),
      },
      { notify: true }
    );
    if (options?.toast !== false) {
      void import('./app-toast').then(({ pushAppToast }) => {
        pushAppToast({
          text: `Face locked on ${galleryToolLabel(entry.tool)} · ${filename}`,
          href: galleryToolHrefForEntry(entry),
        });
      });
    }
    return { ok: true, filename };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Face lock upload failed.';
    if (options?.toast !== false) {
      void import('./app-toast').then(({ pushAppToast }) => {
        pushAppToast({ text: message, tone: 'warning' });
      });
    }
    return { ok: false, error: message };
  }
}

/** Re-upload the locked face to a live host and update the pin. */
export async function relocateIdentityLockToLiveHost(input?: {
  deadComfyUrl?: string;
  targetComfyUrl?: string;
  model?: string;
}): Promise<{ ok: boolean; filename?: string; comfyUrl?: string; error?: string }> {
  if (typeof window === 'undefined') {
    return { ok: false, error: 'Browser only.' };
  }
  const shared = loadSettingsCache().shared;
  const currentName = shared.ipAdapterImageFilename?.trim();
  const storedUrl = shared.ipAdapterImageUrl?.trim();
  const imageUrl = storedUrl && !storedUrl.startsWith('blob:') ? storedUrl : IDENTITY_MEDIA_URL;
  if (!currentName) {
    return { ok: false, error: 'No identity preview to re-upload.' };
  }

  const deadUrl = input?.deadComfyUrl?.trim() || shared.ipAdapterComfyUrl?.trim() || undefined;
  let targetUrl = input?.targetComfyUrl?.trim() || undefined;
  if (!targetUrl) {
    const { fetchComfyUiPoolUrlsForRetry, pickAlternateComfyUrl } = await import('./oom-retry');
    const poolUrls = await fetchComfyUiPoolUrlsForRetry();
    targetUrl = pickAlternateComfyUrl(poolUrls, deadUrl);
  }

  try {
    const uploaded = await resolveQueueInputImage({
      imageUrl,
      filename: currentName,
      comfyUrl: targetUrl,
      ...(targetUrl ? { model: input?.model ?? shared.model } : {}),
    });
    if (!uploaded) {
      return { ok: false, error: 'Identity re-upload did not return a filename.' };
    }
    const filename = uploaded.filename.trim();
    if (!filename) {
      return { ok: false, error: 'Identity re-upload did not return a filename.' };
    }
    const nextHost = uploaded.comfyUrl?.trim() || targetUrl || '';
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        ipAdapterImageFilename: filename,
        ipAdapterImageFilenames: [filename],
        ipAdapterImageUrl: imageUrl,
        ...(nextHost ? { ipAdapterComfyUrl: nextHost } : {}),
      },
      { notify: true }
    );
    return { ok: true, filename, comfyUrl: nextHost || undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Identity re-upload failed.';
    return { ok: false, error: message };
  }
}
