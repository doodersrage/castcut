'use client';

import { useEffect, useState } from 'react';
import { checkLookPlate, type PlateCheck } from '@/lib/plate-check';
import { detectStillPoseShared, plateDetectUrl } from '@/lib/pose-detect-client';

export type PlateCheckOutcome =
  | { state: 'done'; check: PlateCheck }
  /** DWPose (comfyui_controlnet_aux) missing, or the plate isn't a ComfyUI image. */
  | { state: 'off'; reason: string };

// One check per plate — the plate rarely changes and DWPose is a ComfyUI run. Finished checks are
// also kept in this browser: every load of a Cast page used to queue the DWPose job again (and
// wait behind whatever ComfyUI was rendering).
const sessionResults = new Map<string, PlateCheckOutcome>();
const STORED_KEY = 'plate-check-v1';
const STORED_MAX = 80;

function readStored(key: string): PlateCheckOutcome | null {
  try {
    const all = JSON.parse(window.localStorage.getItem(STORED_KEY) || '{}') as Record<
      string,
      PlateCheck
    >;
    const check = all[key];
    return check ? { state: 'done', check } : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, check: PlateCheck): void {
  try {
    const all = JSON.parse(window.localStorage.getItem(STORED_KEY) || '{}') as Record<
      string,
      PlateCheck
    >;
    delete all[key];
    all[key] = check;
    const keys = Object.keys(all);
    for (const stale of keys.slice(0, Math.max(0, keys.length - STORED_MAX))) {
      delete all[stale];
    }
    window.localStorage.setItem(STORED_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable — the session cache still applies */
  }
}

function imageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = url;
  });
}

/**
 * Check the Cast's look plate once it's set: people and face keypoints from DWPose, pixel size
 * from the image. Returns null while there is no plate, `checking` while it runs.
 */
export function usePlateCheck(plate: { imageUrl?: string; filename?: string } | null): {
  outcome: PlateCheckOutcome | null;
  checking: boolean;
} {
  const imageUrl = plate?.imageUrl?.trim() || '';
  const filename = plate?.filename?.trim() || '';
  const key = filename || imageUrl;
  const [results, setResults] = useState<Record<string, PlateCheckOutcome>>({});

  useEffect(() => {
    if (!key || results[key]) {
      return;
    }
    const cached = sessionResults.get(key) ?? readStored(key);
    let cancelled = false;
    void (async () => {
      let outcome: PlateCheckOutcome;
      if (cached) {
        outcome = cached;
      } else {
        const comfyUrl = plateDetectUrl({ imageUrl, filename });
        if (!comfyUrl) {
          outcome = { state: 'off', reason: 'Plate check needs the plate in ComfyUI.' };
        } else {
          try {
            const [detected, size] = await Promise.all([
              detectStillPoseShared(comfyUrl),
              imageSize(imageUrl || comfyUrl),
            ]);
            outcome = detected.available
              ? {
                  state: 'done',
                  check: checkLookPlate({
                    people: detected.pose.people,
                    width: size.width || detected.pose.canvas.width,
                    height: size.height || detected.pose.canvas.height,
                  }),
                }
              : { state: 'off', reason: detected.reason };
            sessionResults.set(key, outcome);
            if (outcome.state === 'done') {
              writeStored(key, outcome.check);
            }
          } catch (error) {
            // Not cached: a network blip shouldn't switch the check off for the session.
            outcome = {
              state: 'off',
              reason: error instanceof Error ? error.message : 'Plate check failed.',
            };
          }
        }
      }
      if (!cancelled) {
        setResults(previous => ({ ...previous, [key]: outcome }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filename, imageUrl, key, results]);

  const outcome = key ? (results[key] ?? null) : null;
  return { outcome, checking: Boolean(key) && !outcome };
}
