'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import { waitForGalleryPromptIds } from '@/lib/best-of-n-vision-queue';
import { resolveCastPlatePrepareModel } from '@/lib/cast-plate-prepare';
import { fetchComfyObjectInfoNodeTypesCached } from '@/lib/comfyui-object-info-cache';
import { galleryEntryPrimaryViewUrl, loadComfyGallery } from '@/lib/comfyui-gallery';
import {
  activeDayEndPose,
  buildDayEndPoseEditPrompt,
  DAY_END_POSE_EDIT_NEGATIVE,
  dayEndPoseSupported,
  type DayEndPose,
} from '@/lib/day-end-pose';
import { dayPartnerNoun } from '@/lib/day-partner';
import {
  dayStillsCachePatch,
  isDayAdultMood,
  upsertDaySlotStill,
  type DaySlotId,
} from '@/lib/day-planner';
import { clipEngineForShot } from '@/lib/ltx25-renderer';
import { resolvePreferredVideoModel } from '@/lib/queue-tool-model';
import { RAPID_DUO_RECIPE_MARK } from '@/lib/prompt-recipe-mark';
import { isAdultContentPrompt } from '@/lib/adult-age-safeguard';
import { stillPromptPeople } from '@/lib/still-clip-prompt';
import { DEFAULT_VIDEO_TOOL_CACHE, loadToolSettings } from '@/lib/settings-cache';

/**
 * The engine a Day slot's clip queues on: the Video tool's pick, except two-person adult
 * stills, which stay on WAN (clipEngineForShot).
 */
export function resolveDayClipEngine(input: {
  stillPromptId?: string;
  dayMood?: string | null;
  sharedModel?: string;
  /** The slot has a spoken line — a talking clip, LTX-2.5 unless two-person adult. */
  speaking?: boolean;
}): string {
  const parentEntry = input.stillPromptId
    ? loadComfyGallery().find(entry => entry.promptId === input.stillPromptId)
    : undefined;
  const picked = resolvePreferredVideoModel({
    toolModel: loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).model,
    sharedModel: input.sharedModel,
  });
  const stillPrompt = parentEntry?.prompt ?? '';
  return clipEngineForShot(picked, {
    adultDuo: isDayAdultMood(input.dayMood) && stillPrompt.includes(RAPID_DUO_RECIPE_MARK),
    clothedSolo:
      !isDayAdultMood(input.dayMood) &&
      stillPromptPeople(stillPrompt) === 1 &&
      !isAdultContentPrompt(stillPrompt),
    keepLtxForClothedSolo:
      loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).ltxClothedSolo === true,
    speaking: input.speaking === true,
  });
}

/**
 * Day "End pose" (day-end-pose.ts): pick another finished still as the frame the slot's clip
 * lands on, or re-pose the start still with a short same-camera edit; Animate then queues a
 * first+last-frame clip. Hidden when this ComfyUI lacks the node for the clip's engine.
 */
export function useDayEndPose(ctx: DayPlannerToolOrchestrationCore) {
  const { actions, character, shared, stills, stillsRef, toolSettings, updateToolSettings } = ctx;
  const [nodeTypes, setNodeTypes] = useState<ReadonlySet<string> | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [reposingSlotId, setReposingSlotId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchComfyObjectInfoNodeTypesCached()
      .then(types => {
        if (!cancelled) setNodeTypes(types);
      })
      .catch(() => {
        /* no ComfyUI — End pose stays hidden */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(
    (slotId: DaySlotId, endPose: DayEndPose | undefined) => {
      const next = upsertDaySlotStill(stillsRef.current, { slotId, endPose });
      stillsRef.current = next;
      updateToolSettings(dayStillsCachePatch(next, shared.activeCharacterId));
    },
    [shared.activeCharacterId, stillsRef, updateToolSettings]
  );

  const endPoseSupportedFor = useCallback(
    (slotId: string) => {
      const still = stills.find(entry => entry.slotId === slotId);
      const engine = resolveDayClipEngine({
        stillPromptId: still?.promptId,
        dayMood: toolSettings.dayMood,
        sharedModel: shared.model,
      });
      return dayEndPoseSupported(engine, nodeTypes);
    },
    [nodeTypes, shared.model, stills, toolSettings.dayMood]
  );

  const pickEndPoseStill = useCallback(
    (slotId: DaySlotId, fromSlotId: DaySlotId) => {
      const start = stillsRef.current.find(entry => entry.slotId === slotId);
      const from = stillsRef.current.find(entry => entry.slotId === fromSlotId);
      const imageUrl = from?.status === 'completed' ? from.imageUrl?.trim() : '';
      if (!imageUrl) return;
      setStatus(null);
      save(slotId, {
        imageUrl,
        source: 'still',
        fromSlotId,
        ...(start?.promptId ? { forTake: start.promptId } : {}),
      });
    },
    [save, stillsRef]
  );

  const clearEndPose = useCallback(
    (slotId: DaySlotId) => {
      setStatus(null);
      save(slotId, undefined);
    },
    [save]
  );

  const reposeEndPose = useCallback(
    async (slotId: DaySlotId, poseWords: string) => {
      const words = poseWords.trim();
      const start = stillsRef.current.find(entry => entry.slotId === slotId);
      const imageUrl = start?.status === 'completed' ? start.imageUrl?.trim() : '';
      if (!words || !imageUrl) {
        setStatus(
          words ? 'That still isn’t ready yet.' : 'Say the pose to end on, e.g. “arms raised”.'
        );
        return;
      }
      const forTake = start?.promptId;
      setReposingSlotId(slotId);
      setStatus('Re-posing the still…');
      try {
        const noun = dayPartnerNoun(character ?? {});
        const parentEntry = forTake
          ? loadComfyGallery().find(entry => entry.promptId === forTake)
          : undefined;
        // The Prepare plate edit's settings: Edit 2511, keep framing, no face lock re-inject.
        const promptId = await actions.sendComfyUi(
          buildDayEndPoseEditPrompt(words, noun),
          undefined,
          undefined,
          {
            inputImageUrl: imageUrl,
            identityLock: false,
            queueModel: resolveCastPlatePrepareModel(shared.model),
            queueTool: 'fitting',
            turboEditStrength: 'balanced',
            preserveInputAspect: true,
            explicitNegative: DAY_END_POSE_EDIT_NEGATIVE,
            queueHints: '',
            parentGalleryEntryId: parentEntry?.id,
            characterId: shared.activeCharacterId,
            lookId: shared.activeLookId ?? character?.activeLookId,
            sourceImageUrl: imageUrl,
          }
        );
        const id = typeof promptId === 'string' ? promptId.trim() : '';
        if (!id) {
          setStatus('ComfyUI did not accept the re-pose edit — is it running?');
          return;
        }
        const [entry] = await waitForGalleryPromptIds([id], {
          timeoutMs: 5 * 60_000,
          pollMs: 2_500,
        });
        const resultUrl = entry ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
        if (!resultUrl) {
          setStatus('The re-pose edit did not finish — no end pose set.');
          return;
        }
        // The slot was requeued meanwhile: this edit belongs to the old take.
        const current = stillsRef.current.find(entry => entry.slotId === slotId);
        if (forTake && current?.promptId !== forTake) {
          setStatus('Re-pose discarded — the still changed meanwhile.');
          return;
        }
        save(slotId, {
          imageUrl: resultUrl,
          source: 'edit',
          poseWords: words,
          ...(forTake ? { forTake } : {}),
        });
        setStatus('End pose ready — Animate to move into it.');
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Could not re-pose that still.');
      } finally {
        setReposingSlotId(null);
      }
    },
    [actions, character, save, shared, stillsRef]
  );

  const activeEndPoseFor = useCallback(
    (slotId: string) => activeDayEndPose(stills.find(entry => entry.slotId === slotId)),
    [stills]
  );

  return {
    endPoseStatus: status,
    endPoseReposingSlotId: reposingSlotId,
    endPoseSupportedFor,
    activeEndPoseFor,
    pickEndPoseStill,
    clearEndPose,
    reposeEndPose,
  };
}
