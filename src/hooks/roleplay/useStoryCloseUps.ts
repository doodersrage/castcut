'use client';

import { useCallback, useState } from 'react';
import {
  leadIsMan,
  type UseRoleplayBeatQueueOptions,
} from '@/hooks/roleplay/useRoleplayBeatQueueCore';
import { makeFilmAngles } from '@/lib/film/angles-client';
import {
  lastCompletedRoleplayStillUrl,
  patchRoleplayStoryBeat,
  type RoleplayStoryBeat,
} from '@/lib/story/roleplay';

/**
 * Story's "Add close-ups" (as Day's): a face close-up and a detail shot of the scene's still,
 * two Edit 2511 passes, kept on the scene and cut in right after its shot (roleplayWatchPlaylist).
 */
export function useStoryCloseUps(options: UseRoleplayBeatQueueOptions) {
  const { actions, setError, shared, storyRef, updateToolSettings } = options;
  const [closeUpsBeatId, setCloseUpsBeatId] = useState<string | null>(null);

  const addStoryCloseUps = useCallback(
    async (beat: RoleplayStoryBeat) => {
      const imageUrl = lastCompletedRoleplayStillUrl(beat) || beat.imageUrl?.trim() || '';
      if (!imageUrl || closeUpsBeatId) return;
      setCloseUpsBeatId(beat.id);
      try {
        const angles = await makeFilmAngles({
          imageUrl,
          moment: (beat.blurb ?? '').split(/(?<=[.!?])\s/)[0] ?? '',
          manLead: leadIsMan(),
          sendComfyUi: actions.sendComfyUi,
          model: shared.model,
          characterId: shared.activeCharacterId,
        });
        if (!angles.length) {
          setError('The close-ups did not finish — check the queue and try again.');
          return;
        }
        const latest =
          storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? beat;
        updateToolSettings({
          story: patchRoleplayStoryBeat(storyRef.current, latest, {
            angles: angles.map(angle => ({ ...angle, for: imageUrl })),
          }),
        });
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Could not make the close-ups.');
      } finally {
        setCloseUpsBeatId(null);
      }
    },
    [actions.sendComfyUi, closeUpsBeatId, setError, shared, storyRef, updateToolSettings]
  );

  return { addStoryCloseUps, closeUpsBeatId };
}
