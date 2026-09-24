'use client';

import { useEffect, useRef, useState } from 'react';
import type { DayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import { isDayAdultMood, normalizeDayIntimateMix, normalizeDayMood } from '@/lib/day-planner';
import { decideClipQuality, type ClipCheck } from '@/lib/clip-quality';
import { sampleClipFrames } from '@/lib/clip-frame-sample';
import { uploadComfyInputImage } from '@/lib/comfyui-image-upload';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { comfyInputViewUrl, measureStillFaceMatch } from '@/lib/face-match-client';
import { DEFAULT_MIN_FACE_MATCH } from '@/lib/face-match';
import { recordFaceMatchScore } from '@/lib/play-metrics';

/**
 * Animate clip checks (with Auto-review on): once a slot's clip lands, sample frames in the
 * browser and flag clips that barely move, went blank, or whose face drifted from the Cast by
 * the last frame (solo slots, needs ComfyUI_FaceAnalysis). Flags only — never re-animates.
 */
export function useDayClipQualityCheck(ctx: DayPlannerToolOrchestrationCore) {
  const { autoReviewStills, busy, mounted, plate, slots, stills, toolSettings } = ctx;
  const [clipChecks, setClipChecks] = useState<Record<string, ClipCheck>>({});
  const checkedRef = useRef<Record<string, string>>({});
  const runningRef = useRef(false);
  const faceOffRef = useRef(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!autoReviewStills || !mounted || busy || runningRef.current) {
      return;
    }
    const target = slots.find(slot => {
      const still = stills.find(entry => entry.slotId === slot.id);
      const clipUrl = still?.clipUrl?.trim();
      return (
        still?.clipStatus === 'completed' &&
        Boolean(clipUrl) &&
        checkedRef.current[slot.id] !== clipUrl
      );
    });
    const clipUrl = target
      ? stills.find(entry => entry.slotId === target.id)?.clipUrl?.trim()
      : undefined;
    if (!target || !clipUrl) {
      return;
    }
    checkedRef.current[target.id] = clipUrl;
    runningRef.current = true;

    const mood = normalizeDayMood(toolSettings.dayMood);
    const solo =
      toolSettings.allowCompanions !== true &&
      !(isDayAdultMood(mood) && normalizeDayIntimateMix(toolSettings.intimateMix) !== 'solo');
    const plateUrl = plate?.imageUrl?.trim() || '';
    const referenceUrl = solo
      ? plateUrl.includes('/api/comfyui/view?')
        ? plateUrl
        : comfyInputViewUrl(plate?.filename)
      : null;

    void (async () => {
      try {
        const { frames, lastFrame } = await sampleClipFrames(clipUrl);
        let faceMatch: number | null = null;
        if (referenceUrl && lastFrame && !faceOffRef.current) {
          const uploaded = await uploadComfyInputImage({
            file: lastFrame,
            comfyUrl: loadComfyUiSettings().apiUrl?.trim() || undefined,
          });
          const frameUrl = comfyInputViewUrl(
            uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name
          );
          const measured = frameUrl
            ? await measureStillFaceMatch({ referenceUrl, imageUrl: frameUrl })
            : null;
          if (measured?.available) {
            faceMatch = measured.similarity;
            recordFaceMatchScore(
              'Animate clips',
              measured.similarity,
              measured.similarity < DEFAULT_MIN_FACE_MATCH
            );
          } else if (measured && !measured.available) {
            faceOffRef.current = true;
          }
        }
        if (frames.length === 0 && faceMatch === null) {
          return;
        }
        const check = decideClipQuality({ clipUrl, frames, faceMatch });
        setClipChecks(previous => ({ ...previous, [target.id]: check }));
      } catch (error) {
        console.warn('Day clip check skipped:', error);
      } finally {
        runningRef.current = false;
        setTick(value => value + 1);
      }
    })();
  }, [
    autoReviewStills,
    busy,
    mounted,
    plate,
    slots,
    stills,
    tick,
    toolSettings.allowCompanions,
    toolSettings.dayMood,
    toolSettings.intimateMix,
  ]);

  // Drop results for clips that were replaced (re-animated) or cleared with a new Day.
  const liveChecks: Record<string, ClipCheck> = {};
  for (const [slotId, check] of Object.entries(clipChecks)) {
    const current = stills.find(entry => entry.slotId === slotId)?.clipUrl?.trim();
    if (current && current === check.clipUrl) {
      liveChecks[slotId] = check;
    }
  }
  return { clipChecks: autoReviewStills ? liveChecks : {} };
}
