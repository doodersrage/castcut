'use client';

import { useCallback, useState, type MutableRefObject } from 'react';
import {
  CUSTOM_ROLEPLAY_PERSONA_ID,
  ROLEPLAY_ARCHETYPES,
  ROLEPLAY_CONTENT,
  ROLEPLAY_TONES,
  getRoleplayArchetype,
  patchRoleplayStoryBeat,
  selectRoleplayClipTakePatch,
  selectRoleplayStillTakePatch,
  type RoleplayBio,
  type RoleplayContentId,
  type RoleplayStoryBeat,
  type RoleplayTone,
} from '@/lib/roleplay';
import { downloadRoleplayStoryBundle } from '@/lib/roleplay-export';
import {
  applyRoleplayLibrarySession,
  archiveAndStartNewRoleplaySession,
  persistRoleplayLibraryFromCache,
  type RoleplayLibrarySession,
} from '@/lib/roleplay-library';
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
  stampRoleplayCharacter: (patch: Partial<RoleplayToolCache>) => void;
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
  stampRoleplayCharacter,
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
          selectRoleplayStillTakePatch(latest, index)
        ),
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

  const shelfAndStartNew = useCallback(
    (patch?: Partial<RoleplayToolCache>) => {
      const { next } = archiveAndStartNewRoleplaySession(toolSettings);
      updateToolSettings({ ...next, ...patch });
      setScenes([]);
      setOwnBibleOpen(false);
    },
    [setOwnBibleOpen, setScenes, toolSettings, updateToolSettings]
  );

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

  const restartStory = useCallback(() => {
    updateToolSettings({ story: [], rejectedScenes: [] });
    setScenes([]);
  }, [setScenes, updateToolSettings]);

  const surpriseCast = useCallback(() => {
    const pick = ROLEPLAY_ARCHETYPES[Math.floor(Math.random() * ROLEPLAY_ARCHETYPES.length)];
    shelfAndStartNew({ personaId: pick.id, customPersona: undefined });
  }, [shelfAndStartNew]);

  const continueLibrarySession = useCallback(
    (session: RoleplayLibrarySession) => {
      persistRoleplayLibraryFromCache(toolSettings);
      updateToolSettings(applyRoleplayLibrarySession(session));
      stampRoleplayCharacter(applyRoleplayLibrarySession(session));
      setScenes([]);
      setOwnBibleOpen(false);
    },
    [setOwnBibleOpen, setScenes, stampRoleplayCharacter, toolSettings, updateToolSettings]
  );

  const startLibrarySession = useCallback(() => {
    shelfAndStartNew();
  }, [shelfAndStartNew]);

  return {
    exporting,
    selectStillTake,
    selectClipTake,
    copyBeatPrompt,
    downloadStory,
    shelfAndStartNew,
    clearBio,
    restartStory,
    surpriseCast,
    continueLibrarySession,
    startLibrarySession,
  };
}
