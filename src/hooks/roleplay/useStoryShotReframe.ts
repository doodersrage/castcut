'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UseRoleplayBeatQueueOptions } from '@/hooks/roleplay/useRoleplayBeatQueueCore';
import {
  patchRoleplayStoryBeat,
  roleplayStillTakeIndex,
  roleplayStillTakes,
  shownRoleplayStillTake,
  type RoleplayStoryBeat,
} from '@/lib/story/roleplay';
import {
  reframeTakeToShot,
  shotReframeDoneWords,
  takeWantsShotReframe,
} from '@/lib/pose/shot-reframe-client';

type BeatStill = Pick<RoleplayStoryBeat, 'promptId' | 'imageUrl' | 'stillStatus' | 'stillTakes'> &
  Partial<RoleplayStoryBeat>;

/** The shown take landed, has a picture and was not cut yet. */
function shownTakeToCut(beat: BeatStill): string | null {
  const promptId = beat.promptId?.trim();
  if (beat.stillStatus !== 'completed' || !beat.imageUrl?.trim() || !promptId) return null;
  const take = shownRoleplayStillTake(beat as RoleplayStoryBeat);
  if (take?.framedUrl?.trim() || take?.adultHold) return null;
  return promptId;
}

/**
 * Story's shot cut (as Day's useDayShotReframe): a scene whose Camera row picked Waist up or
 * Head & shoulders is drawn thigh-up at best on Qwen-Image 2.1, so once its take lands it is cut
 * to the shot around her face (pose/shot-reframe.ts) and the cut becomes the take's picture
 * (`framedUrl`, kept over the gallery's still). The pose check waits for it (`holdsBeat`), and
 * the marks check follows the pose check. No face, a lying pose, two people or already close: the
 * take is kept as rendered and the card says why. One scene at a time.
 */
export function useStoryShotReframe(options: UseRoleplayBeatQueueOptions) {
  const { storyRef, toolSettings, updateToolSettings } = options;
  const [tick, setTick] = useState(0);
  const handledRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<Set<string>>(new Set());
  const baselinedRef = useRef(false);
  const runningRef = useRef(false);

  useEffect(() => {
    const story = toolSettings.story ?? [];
    if (baselinedRef.current || story.length === 0) {
      if (story.length === 0) baselinedRef.current = true;
      return;
    }
    // Takes already finished when Story opened belong to an earlier session — leave them.
    baselinedRef.current = true;
    for (const beat of story) {
      for (const take of roleplayStillTakes(beat)) {
        const id = take.promptId?.trim();
        if (id && take.stillStatus === 'completed') handledRef.current.add(id);
      }
    }
  }, [toolSettings.story]);

  useEffect(() => {
    if (runningRef.current || !baselinedRef.current) return;
    let target: { beat: RoleplayStoryBeat; promptId: string } | null = null;
    for (const beat of toolSettings.story ?? []) {
      const promptId = shownTakeToCut(beat);
      if (promptId && !handledRef.current.has(promptId) && takeWantsShotReframe({ promptId })) {
        target = { beat, promptId };
        break;
      }
    }
    if (!target) return;
    const { beat, promptId } = target;
    const label = beat.title || 'The scene';
    handledRef.current.add(promptId);
    pendingRef.current.add(promptId);
    runningRef.current = true;
    const record = (patch: (latest: RoleplayStoryBeat) => Partial<RoleplayStoryBeat> | null) => {
      const latest = storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at);
      // Re-rolled or switched meanwhile: the cut belongs to a take no longer shown.
      if (!latest || latest.promptId?.trim() !== promptId) return;
      const next = patch(latest);
      if (!next) return;
      const story = patchRoleplayStoryBeat(storyRef.current, latest, next);
      storyRef.current = story;
      updateToolSettings({ story });
    };
    void (async () => {
      try {
        const result = await reframeTakeToShot({ imageUrl: beat.imageUrl, promptId });
        if (!result.available) {
          record(() => ({ shotCut: { promptId, note: `Kept as rendered — ${result.reason}` } }));
          return;
        }
        const cutUrl = result.imageUrl;
        record(latest => {
          const takes = roleplayStillTakes(latest);
          const index = roleplayStillTakeIndex(latest);
          if (takes[index]?.promptId?.trim() !== promptId) return null;
          return {
            stillTakes: takes.map((take, takeIndex) =>
              takeIndex === index ? { ...take, imageUrl: cutUrl, framedUrl: cutUrl } : take
            ),
            stillTakeIndex: index,
            imageUrl: cutUrl,
            shotCut: {
              promptId,
              note: `Framed ${shotReframeDoneWords(result.shot)} from the take (Camera pick).`,
            },
          };
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'the cut failed.';
        console.warn(`${label}: shot cut skipped:`, reason);
        record(() => ({ shotCut: { promptId, note: `Kept as rendered — ${reason}` } }));
      } finally {
        pendingRef.current.delete(promptId);
        runningRef.current = false;
        setTick(value => value + 1);
      }
    })();
  }, [storyRef, tick, toolSettings.story, updateToolSettings]);

  /** The pose check waits for this: the scene's still is about to be cut to its shot. */
  const holdsBeat = useCallback((beat: BeatStill) => {
    const promptId = shownTakeToCut(beat);
    if (!promptId) return false;
    if (pendingRef.current.has(promptId)) return true;
    return (
      baselinedRef.current &&
      !handledRef.current.has(promptId) &&
      takeWantsShotReframe({ promptId })
    );
  }, []);

  return { holdsBeatForReframe: holdsBeat, shotReframeTick: tick };
}
