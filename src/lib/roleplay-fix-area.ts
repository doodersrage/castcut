'use client';

/**
 * "Fix an area" on a Story beat's shown still — the dialog target desk Story and the phone
 * Story share: the still as shown, its ComfyUI output and graph, the adult gate when the Story
 * is adult, and "Use this" (the fix joins the beat's takes, pinned; the Gallery gets an entry).
 */

import type { MutableRefObject } from 'react';
import { storyRatingNeedsAdultSafeguards } from '@/lib/adult-appearance-gate';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import type { FixAreaTarget } from '@/lib/fix-area-client';
import { findGalleryEntryForStill, recordFixAreaInGallery } from '@/lib/fix-area-gallery';
import { patchRoleplayStoryBeat, type RoleplayStoryBeat } from '@/lib/roleplay';
import { addRoleplayFixedTakePatch } from '@/lib/roleplay-gallery-takes';
import { comfyViewUrlForStill, isComfyViewUrl } from '@/lib/still-comfy-url';

export function buildStoryFixAreaTarget(input: {
  beat: RoleplayStoryBeat;
  storyRef: MutableRefObject<RoleplayStoryBeat[]>;
  /** The Story's content rating (adult Stories gate the takes). */
  content: Parameters<typeof storyRatingNeedsAdultSafeguards>[0];
  updateToolSettings: (patch: { story: RoleplayStoryBeat[] }) => void;
}): FixAreaTarget | null {
  const { beat, storyRef, content, updateToolSettings } = input;
  const latest =
    storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? beat;
  const shown = latest.stillStatus === 'completed' ? latest.imageUrl?.trim() : '';
  if (!shown) return null;
  const gallery = loadComfyGallery();
  const takeUrl = comfyViewUrlForStill({ promptId: latest.promptId }, gallery);
  const comfyUrl = isComfyViewUrl(shown) ? shown : takeUrl;
  const parent = findGalleryEntryForStill(gallery, {
    promptId: latest.promptId,
    comfyUrl,
  });
  return {
    displayUrl: shown,
    comfyUrl,
    graphUrl: takeUrl,
    workflowJson: parent?.workflowJson ?? null,
    galleryEntryId: parent?.id ?? null,
    title: latest.title,
    adult:
      storyRatingNeedsAdultSafeguards(content) || parent?.adultCheck ? { clothed: false } : null,
    onUse: async result => {
      const current =
        storyRef.current.find(entry => entry.id === latest.id && entry.at === latest.at) ?? null;
      if (!current || current.promptId !== latest.promptId) {
        throw new Error('The beat changed while the fix rendered — nothing was replaced.');
      }
      void recordFixAreaInGallery(parent, result);
      updateToolSettings({
        story: patchRoleplayStoryBeat(
          storyRef.current,
          current,
          addRoleplayFixedTakePatch(current, {
            promptId: result.promptId,
            imageUrl: result.imageUrl,
          })
        ),
      });
    },
  };
}
