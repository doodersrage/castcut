'use client';

/**
 * Music by scene, made (temp-music.ts): the cues for a loaded cut and their rendering, one after
 * another — Cut's own button (CutTempMusic) and the episode autopilot (useCutAutopilot) share it.
 */

import type { CutPreviewLoaded } from '@/hooks/useCutPreview';
import { requestFilmScore } from './score';
import { tempMusicCues, type TempCue } from './temp-music';
import type { CutEffect } from '../video/cut-sound';

/** The cues for the cut as the monitor laid it out: a stretch per feeling. */
export function cutTempMusicCues(
  loaded: CutPreviewLoaded,
  feelingOf: (key: string) => string
): TempCue[] {
  return tempMusicCues(
    loaded.timeline.items
      .filter(item => item.shot >= 0)
      .flatMap(item => {
        const key = loaded.keys[item.shot];
        return key
          ? [
              {
                key,
                title: loaded.shots[item.shot]?.title ?? 'Shot',
                feeling: feelingOf(key),
                startSec: item.startSec,
                durSec: item.durSec,
              },
            ]
          : [];
      })
  );
}

/**
 * Render each cue (ACE-Step) and place it as music — it fades in and ducks under the lines, and
 * stops where the next stretch starts. Stops at the first that fails; says which.
 */
export async function makeTempMusic(
  cues: readonly TempCue[],
  onAdd: (id: string, effect: Partial<CutEffect>) => void,
  onProgress?: (label: string) => void
): Promise<{ made: number; error?: string }> {
  let made = 0;
  for (const [index, cue] of cues.entries()) {
    onProgress?.(`Cue ${index + 1} of ${cues.length}: ${cue.tone}…`);
    try {
      const score = await requestFilmScore({ brief: { tone: cue.tone }, cutSeconds: cue.seconds });
      onAdd(`fx-cue-${Date.now().toString(36)}${index}`, {
        url: score.url,
        name: `Music · ${cue.tone}`,
        atSec: cue.atSec,
        level: 0.6,
        // Music, not a sound: it joins the bed and ducks under the lines.
        duck: true,
        // Stops where the next stretch starts (a score renders a few seconds long).
        lengthSec: cue.seconds,
      });
      made += 1;
    } catch (error) {
      return { made, error: error instanceof Error ? error.message : 'Could not make that cue.' };
    }
  }
  return { made };
}
