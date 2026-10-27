'use client';

import { useEffect } from 'react';
import { COMFYUI_GALLERY_UPDATED_EVENT } from '@/lib/gallery/comfyui-gallery-storage-meta';
import { clipCheckApplies } from '@/lib/gallery/needs-look';

/**
 * Checks each clip as it lands (2026-10-14): a hard cut inside it (MiniMax-H3 cut a talking clip
 * to a face close-up mid-line) and, for an MP4, whether it has sound. Uses the film check's server
 * probe; the reading goes on the Gallery entry, where Needs a look and the card badge show it.
 * Clips already in the Gallery when the app opens are left alone, and so are Cut's films.
 */
export default function ClipCheckWatcher() {
  useEffect(() => {
    let cancelled = false;
    const seen = new Set<string>();
    let baselined = false;
    let running = false;
    const scan = async () => {
      if (cancelled || running) return;
      running = true;
      try {
        const gallery = await import('@/lib/gallery/comfyui-gallery');
        const entries = gallery.loadComfyGallery();
        const videos = entries.filter(
          entry =>
            entry.status === 'completed' &&
            gallery.galleryEntryPrimaryMediaKind(entry) === 'video' &&
            clipCheckApplies(entry) &&
            entry.playChecks?.clipSilent === undefined
        );
        if (!baselined) {
          baselined = true;
          for (const entry of videos) seen.add(entry.promptId);
          return;
        }
        for (const entry of videos) {
          if (cancelled || seen.has(entry.promptId)) continue;
          seen.add(entry.promptId);
          const url = gallery.galleryEntryPrimaryViewUrl(entry)?.trim();
          if (!url) continue;
          // An MP4 should carry sound (LTX-2.5, MiniMax-H3, Add voice); WAN's WebP never does.
          // Gallery URLs carry no extension, so the output's own file name says.
          const output =
            entry.images[gallery.galleryEntryPrimaryPlaybackIndex(entry)] ?? entry.images[0];
          const expectSpeech = /\.mp4$/i.test(output?.filename ?? '');
          const response = await fetch('/api/film/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
              shots: [{ key: entry.promptId, url, kind: 'clip', entryId: entry.id, expectSpeech }],
            }),
          }).catch(() => null);
          const json = response?.ok
            ? ((await response.json().catch(() => null)) as {
                ffmpeg?: boolean;
                results?: Array<{
                  cutAtSec?: number;
                  hasAudio?: boolean;
                  maxVolumeDb?: number;
                  missing?: string;
                }>;
              } | null)
            : null;
          const probe = json?.ffmpeg ? json.results?.[0] : undefined;
          if (!probe || probe.missing) continue;
          const silent =
            expectSpeech &&
            (probe.hasAudio === false ||
              (typeof probe.maxVolumeDb === 'number' && probe.maxVolumeDb < -50));
          gallery.recordGalleryPlayChecks(entry.promptId, {
            ...(typeof probe.cutAtSec === 'number' ? { clipCutAt: probe.cutAtSec } : {}),
            clipSilent: silent,
          });
        }
      } finally {
        running = false;
      }
    };
    void scan();
    const onUpdate = () => void scan();
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onUpdate);
    };
  }, []);
  return null;
}
