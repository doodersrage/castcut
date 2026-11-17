'use client';

/** Room tone by scene, made (room-tone.ts): each bed's sound, looped under its scene. */

import type { CutPreviewLoaded } from '@/hooks/useCutPreview';
import { makeSoundEffectForCut } from '../clip/sound-effect-client';
import type { CutEffect } from '../video/cut-sound';
import {
  ROOM_TONE_LEVEL,
  ROOM_TONE_PREFIX,
  ROOM_TONE_SOURCE_SEC,
  roomToneBeds,
  type RoomToneBed,
} from './room-tone';

/** The beds for the cut as the monitor laid it out: one per script scene. */
export function cutRoomToneBeds(loaded: CutPreviewLoaded): RoomToneBed[] {
  return roomToneBeds(
    loaded.timeline.items
      .filter(item => item.shot >= 0)
      .flatMap(item => {
        const shot = loaded.shots[item.shot];
        return shot
          ? [
              {
                title: shot.title ?? 'Shot',
                sceneGroup: shot.sceneGroup,
                startSec: item.startSec,
                durSec: item.durSec,
              },
            ]
          : [];
      })
  );
}

/**
 * Make each bed (one sound a place, reused by every scene there) and place it looped under its
 * scene. Stops at the first that fails; says which.
 */
export async function makeRoomTones(
  beds: readonly RoomToneBed[],
  onAdd: (id: string, effect: Partial<CutEffect>) => void,
  onProgress?: (text: string | null) => void,
  onReplace?: () => void
): Promise<{ made: number; error?: string }> {
  const sounds = new Map<string, string>();
  let made = 0;
  for (const [index, bed] of beds.entries()) {
    onProgress?.(`Room tone ${index + 1} of ${beds.length}: ${bed.place}…`);
    try {
      let url = sounds.get(bed.words);
      if (!url) {
        url = (await makeSoundEffectForCut({ words: bed.words, seconds: ROOM_TONE_SOURCE_SEC }))
          .url;
        sounds.set(bed.words, url);
      }
      if (made === 0) onReplace?.();
      onAdd(`${ROOM_TONE_PREFIX}${Date.now().toString(36)}${index}`, {
        url,
        name: `Room · ${bed.place}`,
        atSec: bed.atSec,
        level: ROOM_TONE_LEVEL,
        lengthSec: bed.seconds,
        loop: true,
      });
      made += 1;
    } catch (error) {
      return { made, error: error instanceof Error ? error.message : 'Could not make that sound.' };
    }
  }
  return { made };
}
