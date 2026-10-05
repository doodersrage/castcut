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
  traits?: { sex?: string } | null;
}): boolean {
  const fromCast = dayPartnerNoun({
    descriptor: input.descriptor,
    hints: input.hints,
    traits: input.traits,
  });
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
  return scene.blurb ? { ...scene, blurb: swapDayPromptGender(scene.blurb) } : scene;
}

/** Shortest quoted run worth protecting: a few words, not a stray "his". */
const MIN_QUOTED_CHARS = 16;

/**
 * Where `text` quotes the start of one of `quoted` (whole, or cut short — the built-in "Next room"
 * card quotes the last beat's first 140 characters). Longest match first, never overlapping.
 */
function quotedSpans(text: string, quoted: readonly string[]): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const source of quoted) {
    const q = source.trim();
    for (let len = q.length; len >= MIN_QUOTED_CHARS; len -= 1) {
      const at = text.indexOf(q.slice(0, len));
      if (at < 0) continue;
      const end = at + len;
      if (!spans.some(([s, e]) => at < e && end > s)) spans.push([at, end]);
      break;
    }
  }
  return spans.sort((a, b) => a[0] - b[0]);
}

/**
 * The built-in scenes reworded for a man lead, leaving alone what they quote — the earlier beats
 * (already written for him: "Tomas sprints …, tossing his hat" came out "tossing her hat"), the
 * custom Part and his name. The swap goes both ways, so quoted text that was right got flipped.
 */
export function storyScenesForManLead<T extends { title: string; blurb: string }>(
  scenes: readonly T[],
  quoted: readonly (string | null | undefined)[]
): T[] {
  const keep = quoted.filter((entry): entry is string => Boolean(entry?.trim()));
  return scenes.map(scene => {
    if (!scene.blurb) return scene;
    const spans = quotedSpans(scene.blurb, keep);
    if (spans.length === 0) return storySceneForManLead(scene);
    // Swap the template's own words only: each quoted run sits out the swap as a placeholder
    // with no letters in it, and goes back afterwards.
    let masked = '';
    let cursor = 0;
    spans.forEach(([start, end], index) => {
      masked += `${scene.blurb.slice(cursor, start)}\u0000${index}\u0000`;
      cursor = end;
    });
    masked += scene.blurb.slice(cursor);
    const swapped = swapDayPromptGender(masked).replace(/\u0000(\d+)\u0000/g, (_, index) => {
      const [start, end] = spans[Number(index)]!;
      return scene.blurb.slice(start, end);
    });
    return { ...scene, blurb: swapped };
  });
}
