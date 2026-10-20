/**
 * A Day slot's clip prompt from its direction — the plain words of what happens in the clip
 * (by default the slot's beat). Shared by Animate and the Animate sheet, so the sheet shows the
 * same prompt the queue sends, and a direction the player types is formatted the same way the
 * default is: the fixed intimate-clip template on adult moods (the LLM writer drifted there),
 * the still-clip template on clothed clips — whichever engine runs it (LTX-2.5 converts the
 * same prompt at queue time). Talking clips use their own prompt (talkingClipPrompt).
 */

import { adultAgeLineIn } from '../adult-age-safeguard';
import { swapDayPromptGender } from './lead-gender';
import { buildDaySlotMotionSubject, isDayAdultMood, type DaySlot } from './planner';
import { buildIntimateClipPrompt } from '../play/intimate-clip-prompt';
import { RAPID_DUO_RECIPE_MARK } from '../prompt-recipe-mark';
import { buildStillClipPrompt, stillPromptPeople } from '../still-clip-prompt';

/** The direction Animate uses when the player gives none. */
export function defaultDayClipDirection(slot: DaySlot, characterName?: string): string {
  return slot.sceneHints?.trim() || buildDaySlotMotionSubject(slot, characterName);
}

export function buildDaySlotClipPrompt(input: {
  slot: DaySlot;
  /** What happens in the clip (unset / empty: the slot's beat). */
  direction?: string;
  characterName?: string;
  dayMood?: string | null;
  /** The still's own prompt (its people, ages, duo recipe). */
  stillPrompt?: string;
  /** A man lead: Day's text is written for a woman and is swapped. */
  manLead?: boolean;
  /** End pose words, when the clip lands on an end pose. */
  endPoseWords?: string;
  /** Clip length the prompt names (default 4; the Animate sheet's Length adds to it). */
  durationSec?: number;
}): string {
  const { slot } = input;
  const durationSec = input.durationSec && input.durationSec > 0 ? input.durationSec : 4;
  const direction = input.direction?.trim() || '';
  const beat = direction || slot.sceneHints?.trim() || '';
  const stillPrompt = input.stillPrompt ?? '';
  if (isDayAdultMood(input.dayMood)) {
    const subject = input.manLead
      ? swapDayPromptGender(buildDaySlotMotionSubject(slot, input.characterName))
      : buildDaySlotMotionSubject(slot, input.characterName);
    const twoWomen = /\bher girlfriend has (?:the face from|her own face)/.test(stillPrompt);
    const twoMen = /\bhis boyfriend has (?:the face from|his own face)/.test(stillPrompt);
    let prompt = buildIntimateClipPrompt(beat || subject, durationSec, {
      twoWomen,
      twoMen,
      ageLine: adultAgeLineIn(stillPrompt),
    });
    if (input.manLead && !stillPrompt.includes(RAPID_DUO_RECIPE_MARK)) {
      prompt = swapDayPromptGender(prompt, { solo: true });
    }
    return prompt;
  }
  const clip = buildStillClipPrompt(beat || buildDaySlotMotionSubject(slot, input.characterName), {
    durationSec,
    people: stillPromptPeople(stillPrompt),
    ...(input.endPoseWords ? { endPoseWords: input.endPoseWords } : {}),
  });
  return input.manLead ? swapDayPromptGender(clip) : clip;
}
