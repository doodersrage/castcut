'use client';

import { useEffect, useRef, useState } from 'react';
import { comfyInputViewUrl, measureStillFaceMatch } from '@/lib/face-match-client';
import { STILL_MIN_FACE_MATCH } from '@/lib/face-match';
import type { FittingCompareTryOn } from '@/lib/fitting-room';
import { decideTryOnReview, type TryOnReview } from '@/lib/fitting-tryon-review';
import type { PhotoPose } from '@/lib/day-pose-guide';
import { recordFaceMatchScore } from '@/lib/play-metrics';
import { detectStillPose } from '@/lib/pose-detect-client';
import { scorePoseMatch } from '@/lib/pose-score';
import { reviewOutfitLabel, type SlotQualityReport } from '@/lib/play-slot-quality';
import { reviewDaySlotStill } from '@/lib/play-slot-review-client';
import type { SharedToolSettings } from '@/lib/settings-cache';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import { comfyViewUrlForStill } from '@/lib/still-comfy-url';
import { picturesLookTheSame } from '@/lib/image-similarity-client';

/**
 * Outfit Auto-review: once a try-on lands in Compare, measure its face against the plate
 * (ComfyUI_FaceAnalysis), its pose against the custom pose when one is set (DWPose), and have
 * the vision model read the outfit, face and hands. One try-on
 * at a time; scores only — Keep stays the player's call. Either check switches itself off for
 * the session when its node pack / vision model is missing.
 */
export function useFittingTryOnReview(input: {
  enabled: boolean;
  /**
   * Auto-review's face, pose and vision checks. Without them only the cheap check runs: a
   * try-on that came back as the plate is flagged whatever the setting.
   */
  fullChecks?: boolean;
  compareTryOns: FittingCompareTryOn[];
  plateUrl: string;
  plateFilename: string;
  customGarmentDescription?: string;
  /** The custom pose try-ons are queued in (Outfit → Pose → Custom pose), if any. */
  customPose?: PhotoPose | null;
  shared: SharedToolSettings;
}) {
  const {
    enabled,
    fullChecks = true,
    compareTryOns,
    plateUrl,
    plateFilename,
    customGarmentDescription,
    customPose,
    shared,
  } = input;
  const [reviews, setReviews] = useState<Record<string, TryOnReview>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [checksOff, setChecksOff] = useState<string[]>([]);
  const reviewedRef = useRef<Record<string, string>>({});
  const runningRef = useRef(false);
  const faceOffRef = useRef(false);
  const visionOffRef = useRef(false);
  const poseOffRef = useRef(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled || runningRef.current) {
      return;
    }
    const target = compareTryOns.find(tryOn => {
      const url = tryOn.imageUrl?.trim();
      return Boolean(url) && reviewedRef.current[tryOn.promptId] !== url;
    });
    const imageUrl = target?.imageUrl?.trim();
    if (!target || !imageUrl) {
      return;
    }
    reviewedRef.current[target.promptId] = imageUrl;
    runningRef.current = true;
    // Same rule as Day: a ComfyUI view URL is readable as is, else the queued input filename.
    const referenceUrl = plateUrl.includes('/api/comfyui/view?')
      ? plateUrl
      : comfyInputViewUrl(plateFilename);
    const outfit = reviewOutfitLabel({
      customDescription: customGarmentDescription,
      wardrobeId: target.wardrobeId,
      wardrobeLabel: target.wardrobeLabel,
    });

    void (async () => {
      setReviewingId(target.promptId);
      try {
        // The model can ignore the clothing and hand back the plate (one seed in four live on
        // Qwen-Image 2.1). Nothing else is worth measuring then.
        const unchanged = referenceUrl
          ? await picturesLookTheSame(
              referenceUrl,
              comfyViewUrlForStill(target, loadComfyGallery()) ?? imageUrl
            )
          : null;
        if (unchanged) {
          setReviews(previous => ({
            ...previous,
            [target.promptId]: decideTryOnReview({ imageUrl, unchanged: true }),
          }));
          return;
        }
        if (!fullChecks) {
          return;
        }
        let faceMatch: number | null = null;
        if (referenceUrl && !faceOffRef.current) {
          try {
            const measured = await measureStillFaceMatch({
              referenceUrl,
              imageUrl: comfyViewUrlForStill(target, loadComfyGallery()) ?? imageUrl,
            });
            if (measured?.available) {
              faceMatch = measured.similarity;
              recordFaceMatchScore(
                shared.model,
                measured.similarity,
                measured.similarity < STILL_MIN_FACE_MATCH
              );
            } else if (measured && !measured.available) {
              faceOffRef.current = true;
              setChecksOff(previous => [...previous, `Face check off — ${measured.reason}`]);
            }
          } catch (error) {
            console.warn('Try-on face check skipped:', error);
          }
        }
        // Custom pose: did the try-on take it? (The words-first line can still lose to the plate.)
        let poseMatch: number | null = null;
        const guide = customPose?.people[0];
        if (guide && customPose && !poseOffRef.current) {
          try {
            const detected = await detectStillPose(
              comfyViewUrlForStill(target, loadComfyGallery()) ?? imageUrl
            );
            if (detected.available) {
              if (detected.pose.people.length > 0) {
                poseMatch = scorePoseMatch({
                  guide: [guide],
                  guideAspect: customPose.aspect,
                  detected: detected.pose,
                }).score;
              }
            } else {
              poseOffRef.current = true;
              setChecksOff(previous => [...previous, `Pose check off — ${detected.reason}`]);
            }
          } catch (error) {
            console.warn('Try-on pose check skipped:', error);
          }
        }
        let report: SlotQualityReport | null = null;
        if (!visionOffRef.current) {
          try {
            report = await reviewDaySlotStill({
              imageUrl,
              context: {
                beat: 'Outfit try-on: the Cast lead wearing the new clothes, full body.',
                outfit,
                expectedPeople: 1,
              },
              shared,
            });
          } catch (error) {
            // No vision model (or it keeps failing): stop asking for the rest of the session.
            visionOffRef.current = true;
            const message = error instanceof Error ? error.message : 'vision review failed';
            setChecksOff(previous => [...previous, `Outfit check off — ${message}`]);
          }
        }
        if (faceMatch === null && !report && poseMatch === null) {
          return;
        }
        const review = decideTryOnReview({ imageUrl, faceMatch, report, poseMatch });
        setReviews(previous => ({ ...previous, [target.promptId]: review }));
      } finally {
        runningRef.current = false;
        setReviewingId(null);
        setTick(value => value + 1);
      }
    })();
  }, [
    compareTryOns,
    customGarmentDescription,
    customPose,
    enabled,
    fullChecks,
    plateFilename,
    plateUrl,
    shared,
    tick,
  ]);

  // Keep only reviews of the image each try-on shows now (a requeue replaces it).
  const liveReviews: Record<string, TryOnReview> = {};
  for (const tryOn of compareTryOns) {
    const review = reviews[tryOn.promptId];
    if (review && review.imageUrl === tryOn.imageUrl?.trim()) {
      liveReviews[tryOn.promptId] = review;
    }
  }
  return {
    reviews: enabled ? liveReviews : {},
    reviewingId: enabled ? reviewingId : null,
    checksOff: enabled ? checksOff : [],
  };
}
