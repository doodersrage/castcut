'use client';

import { useEffect, useRef, useState } from 'react';
import type { UseRoleplayBeatQueueOptions } from '@/hooks/roleplay/useRoleplayBeatQueueCore';
import { patchRoleplayStoryBeat } from '@/lib/roleplay';
import { nextStoryPoseCheck } from '@/lib/roleplay-pose-check';
import { detectStillPose } from '@/lib/pose-detect-client';
import { isOpenPoseStyle } from '@/lib/pose-guide-prompt';
import { bodyIsUsable, savePoseLibraryEntry, type NormalizedBody } from '@/lib/pose-library';
import { DEFAULT_MIN_POSE_MATCH, POSE_LIBRARY_MIN_SCORE, scorePoseMatch } from '@/lib/pose-score';
import { poseLayoutFromKey, recordFaceMatchScore, recordPoseMatchScore } from '@/lib/play-metrics';
import { comfyInputViewUrl, measureStillFaceMatch } from '@/lib/face-match-client';
import { DEFAULT_MIN_FACE_MATCH } from '@/lib/face-match';
import { buildPoseMissView } from '@/lib/pose-coaching';

/**
 * Story pose check: when a still that was queued with an Image 3 guide lands, read its pose
 * back (ComfyUI DWPose), store the match on the beat, log it per guide style, and add
 * well-matched poses to the pose library. One check at a time; switches itself off for the
 * session when the DWPose node pack is missing. Never retries on its own — the beat card shows
 * the score and the player decides.
 */
export function useStoryPoseCheck(options: UseRoleplayBeatQueueOptions): {
  poseCheckOff: string | null;
} {
  const { storyRef, toolSettings, updateToolSettings, referenceImageUrl, referenceImageFilename } =
    options;
  const faceOffRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  const skippedRef = useRef(new Set<string>());
  const offRef = useRef<string | null>(null);
  const [poseCheckOff, setPoseCheckOff] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (runningRef.current || offRef.current) {
      return;
    }
    const beat = nextStoryPoseCheck(toolSettings.story ?? [], skippedRef.current);
    const expect = beat?.poseGuideExpect;
    const imageUrl = beat?.imageUrl?.trim();
    if (!beat || !expect || !imageUrl) {
      return;
    }
    runningRef.current = true;
    void (async () => {
      try {
        const detected = await detectStillPose(imageUrl);
        if (!detected.available) {
          offRef.current = detected.reason;
          setPoseCheckOff(detected.reason);
          return;
        }
        const match = scorePoseMatch({
          guide: expect.keypoints,
          guideAspect: expect.aspect,
          detected: detected.pose,
        });
        const miss = match.score < DEFAULT_MIN_POSE_MATCH;
        recordPoseMatchScore(expect.style, match.score, miss, poseLayoutFromKey(expect.poseKey), {
          cued: expect.cued === true,
        });
        const ordered = match.assignment.map(index => detected.pose.people[index]);
        const { width, height } = detected.pose.canvas;
        const missView = miss
          ? buildPoseMissView({
              imageUrl,
              score: match.score,
              guide: expect.keypoints,
              guideAspect: expect.aspect,
              still: ordered,
              stillAspect: width > 0 && height > 0 ? width / height : expect.aspect,
            })
          : null;
        if (
          !expect.poseKey.startsWith('photo:') &&
          isOpenPoseStyle(expect.style) &&
          match.score >= POSE_LIBRARY_MIN_SCORE &&
          ordered.every(body => body && bodyIsUsable(body))
        ) {
          savePoseLibraryEntry({
            id: `${expect.poseKey}-${Date.now().toString(36)}`,
            key: expect.poseKey,
            aspect: width > 0 && height > 0 ? width / height : expect.aspect,
            people: ordered as NormalizedBody[],
            score: match.score,
            createdAt: Date.now(),
          });
        }
        // Solo beats: also measure whether the face is still the Cast (reference photo).
        let faceMatch: { imageUrl: string; similarity: number } | undefined;
        const faceReference =
          expect.keypoints.length === 1 && !faceOffRef.current
            ? referenceImageUrl?.includes('/api/comfyui/view?')
              ? referenceImageUrl
              : comfyInputViewUrl(referenceImageFilename)
            : null;
        if (faceReference) {
          try {
            const measured = await measureStillFaceMatch({ referenceUrl: faceReference, imageUrl });
            if (measured?.available) {
              faceMatch = { imageUrl, similarity: measured.similarity };
              recordFaceMatchScore(
                options.shared.model,
                measured.similarity,
                measured.similarity < DEFAULT_MIN_FACE_MATCH
              );
            } else if (measured && !measured.available) {
              faceOffRef.current = measured.reason;
            }
          } catch (error) {
            console.warn('Story face check skipped:', error);
          }
        }
        const latest =
          storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? beat;
        updateToolSettings({
          story: patchRoleplayStoryBeat(storyRef.current, latest, {
            poseMatch: {
              imageUrl,
              score: match.score,
              expectedPeople: match.expectedPeople,
              detectedPeople: match.detectedPeople,
              ...(missView ? { missView } : {}),
            },
            ...(faceMatch ? { faceMatch } : {}),
          }),
        });
      } catch (error) {
        // One bad still (timeout, missing file) shouldn't stop the others.
        skippedRef.current.add(imageUrl);
        console.warn('Story pose check skipped:', error);
      } finally {
        runningRef.current = false;
        setTick(value => value + 1);
      }
    })();
  }, [
    options.shared.model,
    referenceImageFilename,
    referenceImageUrl,
    storyRef,
    tick,
    toolSettings.story,
    updateToolSettings,
  ]);

  return { poseCheckOff };
}
