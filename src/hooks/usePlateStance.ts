'use client';

import { useEffect } from 'react';
import { setLookPlateStance, type CharacterLook } from '@/lib/character-os';
import type { FittingPlate } from '@/lib/fitting-room';
import { detectStillPoseShared, plateDetectUrl } from '@/lib/pose-detect-client';
import {
  currentPlateStance,
  plateStanceKey,
  readPlateStance,
  type PlateStance,
} from '@/lib/plate-stance';

/**
 * The active look plate's stance (seated, lying, feet cut off…). Read once per plate with the
 * DWPose run the plate check already makes, and stored on the look so it isn't read again.
 * Quietly nothing when DWPose or ComfyUI isn't there.
 */
export function usePlateStance(input: {
  characterId: string | undefined;
  look: CharacterLook | undefined;
  plate: FittingPlate | null;
  /** Hold off while the plate is being replaced. */
  paused?: boolean;
}): PlateStance | null {
  const { characterId, look, plate, paused } = input;
  const key = plateStanceKey(plate);
  const stance = currentPlateStance(look?.plateStance, plate);
  const detectUrl = plateDetectUrl(plate);
  const lookId = look?.id ?? '';

  useEffect(() => {
    if (!characterId || !lookId || !key || !detectUrl || stance || paused) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const detected = await detectStillPoseShared(detectUrl);
        if (cancelled || !detected.available) {
          return;
        }
        const read = readPlateStance({
          people: detected.pose.people,
          width: detected.pose.canvas.width,
          height: detected.pose.canvas.height,
        });
        setLookPlateStance(characterId, lookId, { ...read, checkedAt: Date.now(), plate: key });
      } catch {
        /* ComfyUI down or busy — no stance, no note */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, lookId, key, detectUrl, stance, paused]);

  return stance;
}
