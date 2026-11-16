/**
 * A Day slot's clip prompt from its direction — the plain words of what happens in the clip
 * (by default the slot's beat). Shared by Animate and the Animate sheet, so the sheet shows the
 * same prompt the queue sends, and a direction the player types is formatted the same way the
 * default is: the fixed intimate-clip template on adult moods (the LLM writer drifted there),
 * the still-clip template on clothed clips — whichever engine runs it (LTX-2.5 converts the
 * same prompt at queue time). Talking clips use their own prompt (talkingClipPrompt).
 */

import { adultAgeLineIn } from '../adult/adult-age-safeguard';
import { swapDayPromptGender } from './lead-gender';
import { buildDaySlotMotionSubject, isDayAdultMood, type DaySlot } from './planner';
import { buildIntimateClipPrompt } from '../play/intimate-clip-prompt';
import { RAPID_DUO_RECIPE_MARK } from '../prompt/recipe-mark';
import { buildStillClipPrompt, stillPromptPeople } from '../still/clip-prompt';

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
  /** The still of a shot framed "head" came out wider: not told it is a close-up. */
  stillNotCloseUp?: boolean;
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
  // A head-and-shoulders shot with no direction typed: only what a close-up holds. Its beat's
  // action ("Slyne pours the coffee") had MiniMax-H3 fly the camera to her hands or put a second
  // her behind her to do it (the flagship, 2026-11-15).
  const people = stillPromptPeople(stillPrompt);
  const closeUp =
    !direction && slot.poseCamera?.shot === 'head' && people <= 1 && !input.stillNotCloseUp;
  const who = input.characterName?.trim() || 'She';
  const closeBeat = `${who} in a close shot of her face and shoulders: she listens and reacts with small, natural expressions and head movements. Nothing else happens, nobody else appears and nothing is picked up, poured or carried.`;
  const clip = buildStillClipPrompt(
    closeUp ? closeBeat : beat || buildDaySlotMotionSubject(slot, input.characterName),
    {
      durationSec,
      people,
      ...(input.endPoseWords ? { endPoseWords: input.endPoseWords } : {}),
    }
  );
  return input.manLead ? swapDayPromptGender(clip) : clip;
}

/**
 * A script shot that is someone's reaction (script-shots.ts ends its text "Jason reacts."): who
 * reacts, else null. Its clip reacts without words — a smile, a laugh — out loud (the flagship,
 * 2026-11-16: muted, its made-up words left mouths going with no voice; told to react without
 * words, 5 of 6 laughed and none spoke).
 */
export function slotReactor(
  slot: Pick<DaySlot, 'sceneHints' | 'line' | 'partnerLine'>
): string | null {
  if (slot.line?.trim() || slot.partnerLine?.trim()) return null;
  const match = /(?:^|[.!?]\s+)([A-Z][\w'’-]*(?: [A-Z][\w'’-]*)?) reacts\.\s*$/.exec(
    slot.sceneHints?.trim() ?? ''
  );
  return match?.[1] ?? null;
}

/** How a reaction shot's clip reacts, out loud and without words (H3's sound line). */
export function reactionSoundLine(
  slot: Pick<DaySlot, 'sceneHints'>,
  reactor: string,
  who: 'She' | 'He'
): string {
  const he = who === 'He' ? 'he' : 'she';
  const laughs = /\blaugh/i.test(slot.sceneHints ?? '');
  return laughs
    ? `${reactor} reacts without words: real, happy laughter — no words at all.`
    : `${reactor} reacts without words: ${he} smiles and gives a short, quiet laugh — a laugh and a breath are the only sounds ${he} makes, never a word.`;
}
