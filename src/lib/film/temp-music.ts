/**
 * Temp music by scene (Part 18 R4): the film's feeling shot by shot — the story state's emotion,
 * else the beat's words — read as a score style ("melancholy", "romantic", "noir"…), and runs of
 * shots that feel the same made one cue each (ACE-Step, film/score.ts), placed at the run's start.
 * A run shorter than MIN_CUE_SEC joins the one before. One feeling for the whole film: none
 * (Score this film does that). Pure.
 */

export type TempMusicShot = {
  key: string;
  title: string;
  feeling: string;
  startSec: number;
  durSec: number;
};
export type TempCue = { tone: string; atSec: number; seconds: number; shots: string[] };

/** Words → a score style (film/score.ts STYLES), most telling first. */
const TONES: ReadonlyArray<[RegExp, string]> = [
  [
    /\b(sad|grief|griev|lonely|alone|tears?|cries|crying|loss|miss(es|ing)?|melanchol)/i,
    'melancholy',
  ],
  [/\b(scared|afraid|fear|terrif|danger|threat|hunted|horror|dread)/i, 'horror'],
  [/\b(tense|suspic|secret|nervous|anxious|uneasy|sneak|spy|mystery)/i, 'noir'],
  [/\b(angry|furious|fight|argu|rage|storms? off)/i, 'gritty'],
  [/\b(love|romantic|kiss|tender|flirt|date|longing|close to)/i, 'romantic'],
  [/\b(dream|hazy|float|memory|remember|nostalg)/i, 'dreamy'],
  [/\b(triumph|victor|wins?|hero|epic|soar)/i, 'epic'],
  [/\b(party|dance|celebrat|festival|excited|thrill)/i, 'festival'],
  [/\b(silly|goofy|laughs?|laughing|funny|clumsy|prank)/i, 'silly'],
  [/\b(calm|cozy|relax|quiet|peaceful|sleepy|tea|blanket|content)/i, 'cozy'],
  [/\b(happy|joy|cheer|smil|sunny|bright)/i, 'everyday'],
];

export const MIN_CUE_SEC = 8;

/** The score style a shot's feeling reads as ('' when it names none). */
export function feelingTone(feeling: string): string {
  for (const [re, tone] of TONES) if (re.test(feeling)) return tone;
  return '';
}

/** The cues for a film: one per run of shots that feel the same (none for one feeling only). */
export function tempMusicCues(shots: readonly TempMusicShot[]): TempCue[] {
  const runs: TempCue[] = [];
  let last = '';
  for (const shot of shots) {
    // A shot that names no feeling carries the one before it.
    const tone = feelingTone(shot.feeling) || last || 'everyday';
    const end = shot.startSec + shot.durSec;
    const current = runs[runs.length - 1];
    if (current && current.tone === tone) {
      current.seconds = Math.round((end - current.atSec) * 10) / 10;
      current.shots.push(shot.title);
    } else {
      runs.push({ tone, atSec: shot.startSec, seconds: shot.durSec, shots: [shot.title] });
    }
    last = tone;
  }
  // Short runs join the run before (the first one joins the next).
  const merged: TempCue[] = [];
  for (const run of runs) {
    const previous = merged[merged.length - 1];
    if (previous && run.seconds < MIN_CUE_SEC) {
      previous.seconds = Math.round((run.atSec + run.seconds - previous.atSec) * 10) / 10;
      previous.shots.push(...run.shots);
    } else {
      merged.push({ ...run, shots: [...run.shots] });
    }
  }
  if (merged.length > 1 && merged[0]!.seconds < MIN_CUE_SEC) {
    const [first, second] = merged;
    merged.splice(0, 2, {
      tone: second!.tone,
      atSec: first!.atSec,
      seconds: Math.round((second!.atSec + second!.seconds - first!.atSec) * 10) / 10,
      shots: [...first!.shots, ...second!.shots],
    });
  }
  return merged.length > 1 ? merged : [];
}
