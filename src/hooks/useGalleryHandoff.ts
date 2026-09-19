'use client';

import { useEffect, useRef } from 'react';
import { whenBrowserStorageReady } from '@/lib/browser-storage';
import {
  clearGalleryHandoff,
  fetchHandoffImageFile,
  loadGalleryHandoff,
  type GalleryHandoffPayload,
} from '@/lib/gallery-handoff';

export type GalleryHandoffReadyPayload = {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  improveIntent?: string;
  queueParams?: GalleryHandoffPayload['queueParams'];
  sessionActiveLoraIds?: string[];
  queueQualityProfile?: GalleryHandoffPayload['queueQualityProfile'];
  handoffMode?: GalleryHandoffPayload['handoffMode'];
  controlImageUrls?: string[];
  file: File | null;
  previewUrl: string | null;
  payload: GalleryHandoffPayload;
};

/**
 * Consume a gallery→tool handoff once.
 * Return `false` (or throw) to keep the handoff for a later retry (e.g. Cast
 * character not hydrated yet).
 *
 * `onReady` is read from a ref so identity changes mid-flight do not restart
 * the effect and cancel an in-progress Cast plate apply.
 */
export function useGalleryHandoff(
  target: GalleryHandoffPayload['target'],
  onReady: (payload: GalleryHandoffReadyPayload) => void | boolean | Promise<void | boolean>,
  options?: { ready?: boolean }
): void {
  const appliedRef = useRef(false);
  const onReadyRef = useRef(onReady);
  const ready = options?.ready !== false;

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    if (appliedRef.current || !ready || typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('from') !== 'gallery') {
      return;
    }

    const payload = loadGalleryHandoff(target);
    if (!payload) {
      return;
    }

    let cancelled = false;

    void (async () => {
      await whenBrowserStorageReady();
      if (cancelled || appliedRef.current) {
        return;
      }

      let file: File | null = null;
      let previewUrl: string | null = null;
      try {
        file = await fetchHandoffImageFile(payload);
        previewUrl = file ? URL.createObjectURL(file) : (payload.imageUrl ?? null);
      } catch {
        previewUrl = payload.imageUrl ?? null;
      }

      if (cancelled || appliedRef.current) {
        return;
      }

      try {
        const result = await onReadyRef.current({
          prompt: payload.prompt,
          negativePrompt: payload.negativePrompt,
          model: payload.model,
          improveIntent: payload.improveIntent,
          queueParams: payload.queueParams,
          sessionActiveLoraIds: payload.sessionActiveLoraIds,
          queueQualityProfile: payload.queueQualityProfile,
          handoffMode: payload.handoffMode,
          controlImageUrls: payload.controlImageUrls,
          file,
          previewUrl,
          payload,
        });
        if (result === false) {
          return;
        }
        // Apply already landed — clear even if this effect instance was cleaned up
        // (React Strict Mode), so a remount cannot double-consume incorrectly.
        appliedRef.current = true;
        clearGalleryHandoff();
        try {
          const url = new URL(window.location.href);
          if (url.searchParams.get('from') === 'gallery') {
            url.searchParams.delete('from');
            window.history.replaceState(
              window.history.state,
              '',
              `${url.pathname}${url.search}${url.hash}`
            );
          }
        } catch {
          // ignore
        }
      } catch {
        // Leave handoff so a ready flip can retry.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [target, ready]);
}
