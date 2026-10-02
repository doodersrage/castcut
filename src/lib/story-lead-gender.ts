/**
 * A man as the Story lead. The scenes an LLM writes follow the bible, so they already say "he";
 * what Story itself writes was worded for a woman: the built-in scenes, and a few fixed lines
 * added at queue time ("she wears exactly the outfit…", "One woman alone"). Those are reworded
 * here. The whole prompt is not swapped, as Day does, because the written scene is already right
 * and a swap would turn its "he" into "she".
 */
import { dayPartnerNoun } from './day-partner';
import { swapDayPromptGender } from './day-lead-gender';

/** Whether the lead reads as a man, from the bible's look and the Cast record. */
export function storyLeadIsMan(input: {
  look?: string | null;
  descriptor?: string | null;
  hints?: string | null;
}): boolean {
  const fromCast = dayPartnerNoun({ descriptor: input.descriptor, hints: input.hints });
  if (fromCast !== 'person') return fromCast === 'man';
  return dayPartnerNoun({ descriptor: input.look }) === 'man';
}

/** The fixed lines Story adds to a still's prompt, each worded for a woman. */
const QUEUE_LINES: Array<[RegExp, string]> = [
  [/\bshe wears\b/g, 'he wears'],
  [/\bShe wears\b/g, 'He wears'],
  [/\bshe has on\b/g, 'he has on'],
  [/\bOne woman alone\b/g, 'One man alone'],
  [/\bone woman alone\b/g, 'one man alone'],
  [/\bthe SAME woman\b/g, 'the SAME man'],
  [/\bher (own outfit|outfit|own clothes|shoes)\b/g, 'his $1'],
];

/** Reword Story's own fixed lines for a man lead; the written scene is left as it is. */
export function storyPromptForManLead(prompt: string): string {
  let out = prompt;
  for (const [re, replacement] of QUEUE_LINES) {
    out = out.replace(re, replacement);
  }
  return out;
}

/** A built-in scene (written for a woman) reworded for a man lead. */
export function storySceneForManLead<T extends { title: string; blurb: string }>(scene: T): T {
  return { ...scene, blurb: swapDayPromptGender(scene.blurb) };
}
