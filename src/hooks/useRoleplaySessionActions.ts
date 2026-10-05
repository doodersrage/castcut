'use client';

import { useCallback, useState, type MutableRefObject } from 'react';
import {
  confirmRoleplayUndoScene,
  CUSTOM_ROLEPLAY_PERSONA_ID,
  ROLEPLAY_CONTENT,
  ROLEPLAY_TONES,
  getRoleplayArchetype,
  patchRoleplayStoryBeat,
  selectRoleplayClipTakePatch,
  pinRoleplayStillTakePatch,
  type RoleplayBio,
  type RoleplayContentId,
  type RoleplayStoryBeat,
  type RoleplayTone,
} from '@/lib/roleplay';
import { downloadRoleplayStoryBundle } from '@/lib/roleplay-export';
import { addRoleplayFixedTakePatch } from '@/lib/roleplay-gallery-takes';
import { storyRatingNeedsAdultSafeguards } from '@/lib/adult-appearance-gate';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import type { FixAreaTarget } from '@/lib/fix-area-client';
import { findGalleryEntryForStill, recordFixAreaInGallery } from '@/lib/fix-area-gallery';
import { comfyViewUrlForStill, isComfyViewUrl } from '@/lib/still-comfy-url';
import type { RoleplayScene } from '@/lib/roleplay';
import type { RoleplayToolCache } from '@/lib/settings-cache';

type AssembledFilmRef = MutableRefObject<{ filename: string; data: Uint8Array } | null>;

type UseRoleplaySessionActionsOptions = {
  storyRef: MutableRefObject<RoleplayStoryBeat[]>;
  toolSettings: RoleplayToolCache;
  updateToolSettings: (patch: Partial<RoleplayToolCache>) => void;
  bio: RoleplayBio | undefined;
  personaId: string;
  tone: RoleplayTone;
  content: RoleplayContentId;
  assembledFilmRef: AssembledFilmRef;
  setScenes: (scenes: RoleplayScene[]) => void;
  setOwnBibleOpen: (open: boolean) => void;
  setError: (value: string | null) => void;
};

export function useRoleplaySessionActions({
  storyRef,
  toolSettings,
  updateToolSettings,
  bio,
  personaId,
  tone,
  content,
  assembledFilmRef,
  setScenes,
  setOwnBibleOpen,
  setError,
}: UseRoleplaySessionActionsOptions) {
  const [exporting, setExporting] = useState(false);

  const selectStillTake = useCallback(
    (beat: RoleplayStoryBeat, index: number) => {
      const latest =
        storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? beat;
      updateToolSettings({
        story: patchRoleplayStoryBeat(
          storyRef.current,
          latest,
          pinRoleplayStillTakePatch(latest, index)
        ),
      });
    },
    [storyRef, updateToolSettings]
  );

  // Fix an area (fix-area.ts) on a beat's shown still.
  const fixAreaTargetForBeat = useCallback(
    (beat: RoleplayStoryBeat): FixAreaTarget | null => {
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
        title: latest.title,
        adult:
          storyRatingNeedsAdultSafeguards(content) || parent?.adultCheck
            ? { clothed: false }
            : null,
        onUse: async result => {
          const current =
            storyRef.current.find(entry => entry.id === latest.id && entry.at === latest.at) ??
            null;
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
    },
    [content, storyRef, updateToolSettings]
  );

  const setBeatPose = useCallback(
    (
      beat: RoleplayStoryBeat,
      patch: Pick<
        RoleplayStoryBeat,
        'poseLayout' | 'poseVariant' | 'posePhoto' | 'poseCamera' | 'poseLead' | 'poseLook'
      >
    ) => {
      const latest =
        storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? beat;
      updateToolSettings({
        story: patchRoleplayStoryBeat(storyRef.current, latest, patch),
      });
    },
    [storyRef, updateToolSettings]
  );

  const selectClipTake = useCallback(
    (beat: RoleplayStoryBeat, index: number) => {
      const latest =
        storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? beat;
      updateToolSettings({
        story: patchRoleplayStoryBeat(
          storyRef.current,
          latest,
          selectRoleplayClipTakePatch(latest, index)
        ),
      });
    },
    [storyRef, updateToolSettings]
  );

  const copyBeatPrompt = useCallback(
    async (beat: RoleplayStoryBeat) => {
      const prompt = beat.prompt?.trim();
      if (!prompt) {
        return;
      }
      try {
        await navigator.clipboard.writeText(prompt);
      } catch {
        setError('Could not copy to clipboard.');
      }
    },
    [setError]
  );

  const downloadStory = useCallback(async () => {
    if (!bio && storyRef.current.length === 0) {
      setError('Write a bio or a beat first.');
      return;
    }
    setExporting(true);
    setError(null);
    try {
      const personaLabel =
        personaId === CUSTOM_ROLEPLAY_PERSONA_ID
          ? toolSettings.customPersona?.trim() || 'Custom'
          : (getRoleplayArchetype(personaId)?.label ?? personaId);
      const toneLabel = ROLEPLAY_TONES.find(entry => entry.id === tone)?.label ?? tone;
      const contentLabel = ROLEPLAY_CONTENT.find(entry => entry.id === content)?.label ?? content;
      await downloadRoleplayStoryBundle({
        bio,
        story: storyRef.current,
        tone: toneLabel,
        content: contentLabel,
        personaLabel,
        film: assembledFilmRef.current,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the story.');
    } finally {
      setExporting(false);
    }
  }, [
    assembledFilmRef,
    bio,
    content,
    personaId,
    setError,
    storyRef,
    tone,
    toolSettings.customPersona,
  ]);

  /** Clear bio/story for the current Cast lead without shelving a separate session. */
  const clearBio = useCallback(() => {
    updateToolSettings({
      bio: undefined,
      story: [],
      rejectedScenes: [],
    });
    setScenes([]);
    setOwnBibleOpen(false);
  }, [setOwnBibleOpen, setScenes, updateToolSettings]);

  /** Clear the scenes, keep the bible. The question is asked in the page (StoryStartOverDialog). */
  const restartStory = useCallback(() => {
    updateToolSettings({ story: [], rejectedScenes: [] });
    setScenes([]);
  }, [setScenes, updateToolSettings]);

  /** Take the last scene back out of the reel — the step before it is open again. */
  const undoLastScene = useCallback(() => {
    const story = storyRef.current;
    const last = story[story.length - 1];
    if (!last || !confirmRoleplayUndoScene(last.title)) {
      return;
    }
    updateToolSettings({ story: story.slice(0, -1) });
    setScenes([]);
  }, [setScenes, storyRef, updateToolSettings]);

  return {
    undoLastScene,
    exporting,
    selectStillTake,
    fixAreaTargetForBeat,
    setBeatPose,
    selectClipTake,
    copyBeatPrompt,
    downloadStory,
    clearBio,
    restartStory,
  };
}
