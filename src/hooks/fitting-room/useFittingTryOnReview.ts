'use client';

import { useEffect, useRef, useState } from 'react';
import { comfyInputViewUrl, measureStillFaceMatch } from '@/lib/face-match-client';
import { DEFAULT_MIN_FACE_MATCH } from '@/lib/face-match';
import type { FittingCompareTryOn } from '@/lib/fitting-room';
import { decideTryOnReview, type TryOnReview } from '@/lib/fitting-tryon-review';
import { recordFaceMatchScore } from '@/lib/play-metrics';
import { reviewOutfitLabel, type SlotQualityReport } from '@/lib/play-slot-quality';
import { reviewDaySlotStill } from '@/lib/play-slot-review-client';
import type { SharedToolSettings } from '@/lib/settings-cache';

/**
 * Outfit Auto-review: once a try-on lands in Compare, measure its face against the plate
 * (ComfyUI_FaceAnalysis) and have the vision model read the outfit, face and hands. One try-on
 * at a time; scores only — Keep stays the player's call. Either check switches itself off for
 * the session when its node pack / vision model is missing.
 */
export function useFittingTryOnReview(input: {
  enabled: boolean;
  compareTryOns: FittingCompareTryOn[];
  plateUrl: string;
  plateFilename: string;
  customGarmentDescription?: string;
  shared: SharedToolSettings;
}) {
  const { enabled, compareTryOns, plateUrl, plateFilename, customGarmentDescription, shared } =
    input;
  const [reviews, setReviews] = useState<Record<string, TryOnReview>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [checksOff, setChecksOff] = useState<string[]>([]);
  const reviewedRef = useRef<Record<string, string>>({});
  const runningRef = useRef(false);
  const faceOffRef = useRef(false);
  const visionOffRef = useRef(false);
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
        let faceMatch: number | null = null;
        if (referenceUrl && !faceOffRef.current) {
          try {
            const measured = await measureStillFaceMatch({ referenceUrl, imageUrl });
            if (measured?.available) {
              faceMatch = measured.similarity;
              recordFaceMatchScore(
                shared.model,
                measured.similarity,
                measured.similarity < DEFAULT_MIN_FACE_MATCH
              );
            } else if (measured && !measured.available) {
              faceOffRef.current = true;
              setChecksOff(previous => [...previous, `Face check off — ${measured.reason}`]);
            }
          } catch (error) {
            console.warn('Try-on face check skipped:', error);
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
        if (faceMatch === null && !report) {
          return;
        }
        const review = decideTryOnReview({ imageUrl, faceMatch, report });
        setReviews(previous => ({ ...previous, [target.promptId]: review }));
      } finally {
        runningRef.current = false;
        setReviewingId(null);
        setTick(value => value + 1);
      }
    })();
  }, [compareTryOns, customGarmentDescription, enabled, plateFilename, plateUrl, shared, tick]);

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
