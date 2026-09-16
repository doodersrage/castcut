'use client';

import {
  useCallback,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { buildRoleplayRequestBody, type RoleplayApiPayload } from '@/lib/roleplay-play-core';
import {
  appendRoleplayStoryBeat,
  lastRoleplayPlotBeat,
  patchRoleplayStoryBeat,
  roleplayIntroScene,
  type RoleplayBio,
  type RoleplayScene,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import type { RoleplayPlayAs } from '@/lib/roleplay';
import type { RoleplayToolCache } from '@/lib/settings-cache';

const TOOL_ID = 'roleplay';

type UseRoleplayBioFlowOptions = {
  storyRef: MutableRefObject<RoleplayStoryBeat[]>;
  updateToolSettings: (patch: Partial<RoleplayToolCache>) => void;
  requestBody: (
    action: 'bio' | 'scenes' | 'prompt',
    situation?: RoleplayScene
  ) => ReturnType<typeof buildRoleplayRequestBody>;
  commitStill: (
    data: RoleplayApiPayload,
    beat: RoleplayStoryBeat,
    bio: RoleplayBio,
    writingStory: RoleplayStoryBeat[],
    options: { queueStill: boolean }
  ) => Promise<RoleplayStoryBeat[]>;
  skipStillForClip: boolean;
  autoQueue: boolean;
  playAsResolved: RoleplayPlayAs;
  hasReferenceImage: boolean;
  setError: (value: string | null) => void;
  setScenes: Dispatch<SetStateAction<RoleplayScene[]>>;
  setOwnBibleOpen: (open: boolean) => void;
};

export function useRoleplayBioFlow({
  storyRef,
  updateToolSettings,
  requestBody,
  commitStill,
  skipStillForClip,
  autoQueue,
  playAsResolved,
  hasReferenceImage,
  setError,
  setScenes,
  setOwnBibleOpen,
}: UseRoleplayBioFlowOptions) {
  const [bioLoading, setBioLoading] = useState(false);

  const beginStoryFromBio = useCallback(
    async (nextBio: RoleplayBio) => {
      const intro = roleplayIntroScene(nextBio);
      const writingStory = appendRoleplayStoryBeat([], intro, {
        stillStatus: skipStillForClip ? undefined : 'writing',
      });
      const introBeat = writingStory[writingStory.length - 1];
      updateToolSettings({
        bio: nextBio,
        story: writingStory,
        rejectedScenes: [],
      });
      rememberDraftFields({
        toolKey: TOOL_ID,
        label: 'Story',
        href: '/story',
        fields: [nextBio.name, nextBio.look],
      });
      if (!introBeat) {
        return;
      }
      try {
        const [stillResponse, scenesResponse] = await Promise.all([
          fetch('/api/roleplay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...requestBody('prompt', intro),
              bio: nextBio,
              story: [],
              rejectedScenes: [],
            }),
          }),
          fetch('/api/roleplay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...requestBody('scenes'),
              bio: nextBio,
              story: writingStory,
              rejectedScenes: [],
            }),
          }).catch(() => null),
        ]);
        const stillData = (await stillResponse.json()) as RoleplayApiPayload;
        if (!stillResponse.ok || !stillData.prompt?.trim()) {
          throw new Error(
            stillData.error ??
              (skipStillForClip
                ? 'Bio saved, but the first clip prompt failed.'
                : 'Bio saved, but the first still failed.')
          );
        }
        await commitStill(stillData, introBeat, nextBio, writingStory, {
          queueStill: autoQueue && !skipStillForClip,
        });
        if (scenesResponse) {
          const scenesData = (await scenesResponse.json()) as RoleplayApiPayload;
          setScenes(scenesResponse.ok && Array.isArray(scenesData.scenes) ? scenesData.scenes : []);
        } else {
          setScenes([]);
        }
      } catch (err) {
        updateToolSettings({
          story: patchRoleplayStoryBeat(
            writingStory,
            introBeat,
            skipStillForClip ? {} : { stillStatus: 'error' }
          ),
        });
        throw err;
      }
    },
    [autoQueue, commitStill, requestBody, skipStillForClip, setScenes, updateToolSettings]
  );

  const writeBio = useCallback(async () => {
    if (playAsResolved === 'photo' && !hasReferenceImage) {
      setError('Upload a photo or pick a gallery still first.');
      return;
    }
    setBioLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/roleplay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody('bio')),
      });
      const data = (await response.json()) as RoleplayApiPayload;
      if (!response.ok || !data.bio) {
        throw new Error(data.error ?? 'Could not write a bio.');
      }
      await beginStoryFromBio(data.bio);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not write a bio.');
    } finally {
      setBioLoading(false);
    }
  }, [beginStoryFromBio, hasReferenceImage, playAsResolved, requestBody, setError]);

  const applyOwnBible = useCallback(
    async (nextBio: RoleplayBio) => {
      if (playAsResolved === 'photo' && !hasReferenceImage) {
        setError('Upload a photo or pick a gallery still first.');
        return;
      }
      setError(null);
      const hasPlot = Boolean(lastRoleplayPlotBeat(storyRef.current));
      if (hasPlot || storyRef.current.length > 0) {
        updateToolSettings({ bio: nextBio });
        setOwnBibleOpen(false);
        return;
      }
      setBioLoading(true);
      try {
        await beginStoryFromBio(nextBio);
        setOwnBibleOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start from this bible.');
      } finally {
        setBioLoading(false);
      }
    },
    [
      beginStoryFromBio,
      hasReferenceImage,
      playAsResolved,
      setError,
      setOwnBibleOpen,
      storyRef,
      updateToolSettings,
    ]
  );

  return { bioLoading, writeBio, applyOwnBible };
}
