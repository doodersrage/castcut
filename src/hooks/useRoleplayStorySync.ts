'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  galleryEntryPrimaryViewUrl,
  loadComfyGallery,
} from '@/lib/comfyui-gallery';
import {
  mergeRoleplayStoryStills,
  patchRoleplayStoryBeat,
  roleplayClipTakes,
  roleplayStoryPromptIds,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import {
  peekContinueStitch,
  stitchContinueClips,
  takeContinueStitch,
} from '@/lib/video-continue-stitch';

/** Keep Roleplay story beats in sync with gallery stills for a shared session. */
export function useRoleplayStorySync(
  storyRef: MutableRefObject<RoleplayStoryBeat[]>,
  updateToolSettings: (patch: { story: RoleplayStoryBeat[] }) => void
): void {
  const stitchingRef = useRef(new Set<string>());

  useEffect(() => {
    const sync = () => {
      const current = storyRef.current;
      if (current.length === 0) {
        return;
      }
      const wanted = new Set(roleplayStoryPromptIds(current));
      if (wanted.size === 0) {
        return;
      }
      const stills = loadComfyGallery()
        .filter(entry => wanted.has(entry.promptId))
        .map(entry => ({
          promptId: entry.promptId,
          status: entry.status,
          imageUrl: galleryEntryPrimaryViewUrl(entry),
          adultCheck: entry.adultCheck?.state,
        }));
      const merged = mergeRoleplayStoryStills(current, stills);
      if (merged.changed) {
        updateToolSettings({ story: merged.story });
      }

      // Server-assisted Stitch continue: when a Gemini (etc.) last-frame take finishes,
      // concat parent + child so the watch playlist gets one continuous clip.
      const storyAfter = merged.changed ? merged.story : current;
      for (const beat of storyAfter) {
        for (const take of roleplayClipTakes(beat)) {
          const promptId = take.clipPromptId?.trim();
          const childUrl = take.clipUrl?.trim();
          if (!promptId || !childUrl || take.clipStatus !== 'completed') {
            continue;
          }
          if (!peekContinueStitch(promptId) || stitchingRef.current.has(promptId)) {
            continue;
          }
          const pending = takeContinueStitch(promptId);
          if (!pending) {
            continue;
          }
          stitchingRef.current.add(promptId);
          void stitchContinueClips({
            parentUrl: pending.parentUrl,
            childUrl,
          }).then(result => {
            if (!result?.objectUrl) {
              stitchingRef.current.delete(promptId);
              return;
            }
            const latest =
              storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? beat;
            const nextTakes = roleplayClipTakes(latest).map(entry =>
              entry.clipPromptId?.trim() === promptId
                ? { ...entry, clipUrl: result.objectUrl, clipStatus: 'completed' as const }
                : entry
            );
            updateToolSettings({
              story: patchRoleplayStoryBeat(storyRef.current, latest, {
                clipTakes: nextTakes,
                clipUrl: result.objectUrl,
                clipStatus: 'completed',
              }),
            });
            stitchingRef.current.delete(promptId);
          });
        }
      }
    };
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, sync);
    sync();
    return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, sync);
  }, [storyRef, updateToolSettings]);
}
