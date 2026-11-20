/**
 * Who a script's two-shot shows besides the lead, and where a film keeps that person's stand-in
 * face — pure (the take's plan reads them, on the page and the server); the stand-in itself is
 * rendered in partner-stand-in.ts.
 */

import { oneSlipApart } from './name-slip';

/**
 * The other person a script's two-shot shows, from its opening ("Slyne and Elderly man, the two
 * of them together." — script-shots.ts). The partner (PARTNER, a husband, a date…) is the film's
 * one stand-in; anyone else gets a face of their own, so the bookstore's elderly man is not the
 * partner's face (live 2026-11-11: he was, in his late thirties). `noun` when the words say it.
 */
export type ScriptShotOther = {
  /** Lower-case, as the shot names them ("elderly man"); '' for the partner. */
  who: string;
  noun: 'man' | 'woman' | null;
  elderly: boolean;
};

const PARTNER_ROLE_RE =
  /\b(?:partner|boyfriend|girlfriend|husband|wife|fianc[eé]e?|date|lover|spouse)$/i;

export function scriptShotOther(hints: string | null | undefined): ScriptShotOther | null {
  // Shots written before 2026-11-11 kept "Mr. Harris", whose full stop hid him.
  const pair = /^\s*([^,.!?]{1,60}?)\s+and\s+([^,.!?]{1,100}?),\s+the two of them together\b/.exec(
    (hints ?? '').replace(/\b(Mr|Mrs|Ms|Mx|Dr|Prof|St)\.(?=\s)/gi, '$1')
  );
  const named = pair?.[2]?.trim();
  if (!named) return null;
  // "Mr Harris (an elderly man)": the script's introduction of them, from script-shots.
  const intro = /\(([^)]*)\)/.exec(named)?.[1]?.toLowerCase() ?? '';
  const other = named.replace(/\s*\([^)]*\)/g, '').trim();
  if (!other) return null;
  const who = other.toLowerCase().replace(/^.*[’']s\s+/, '');
  const words = `${who} ${intro}`.trim();
  if (PARTNER_ROLE_RE.test(who)) return { who: '', noun: null, elderly: false };
  const noun =
    /\b(?:woman|lady|girl|mother|mom|mum|grandma|grandmother|granny|aunt|sister|daughter|wife|girlfriend|waitress|actress|nun|queen)\b/.test(
      words
    )
      ? 'woman'
      : /\b(?:man|gentleman|guy|boy|father|dad|grandpa|grandfather|uncle|brother|son|husband|boyfriend|waiter|priest|king)\b/.test(
            words
          )
        ? 'man'
        : null;
  const elderly =
    /\b(?:elderly|old|older|aged|senior|retired|grand(?:pa|ma|father|mother)|granny)\b/.test(words);
  return { who: who.slice(0, 60), noun, elderly };
}

/**
 * A shot that pairs the lead with herself ("Loose Lana and Lana, the two of them together."):
 * written before a cue that was a word of her name (LANA) or a slip of one (LANNA) was read as
 * her, 23 of one film's Scenes did, and each drew a stranger in for her partner (2026-11-20).
 * The second name becomes the partner's, or the pairing goes when there is none. Read at render
 * time: the stored Scene keeps its words.
 */
export function withoutSelfPair(
  hints: string | null | undefined,
  leadName: string | null | undefined,
  partnerName: string | null | undefined
): string | undefined {
  const text = hints ?? undefined;
  const lead = leadName?.trim();
  if (!text || !lead) return text;
  const pair =
    /^(\s*)([^,.!?]{1,60}?)\s+and\s+([^,.!?(]{1,60}?)(\s*\([^)]*\))?,\s+the two of them together\.?\s*/.exec(
      text
    );
  if (!pair || pair[2]!.trim().toLowerCase() !== lead.toLowerCase()) return text;
  const other = pair[3]!.trim().toLowerCase();
  const words = lead
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length >= 3);
  const isHer =
    other === lead.toLowerCase() ||
    words.includes(other) ||
    (other.length >= 4 && words.some(word => word.length >= 4 && oneSlipApart(other, word)));
  if (!isHer) return text;
  const rest = text.slice(pair[0].length);
  const partner = partnerName?.trim();
  return partner
    ? `${pair[1]}${lead} and ${partner}, the two of them together. ${rest}`.trimEnd()
    : `${pair[1]}${rest}`;
}

/** Where a film keeps a stand-in: the script for its partner, `script|who` for anyone else. */
export function filmStandInKey(scriptId: string, other: ScriptShotOther | null): string {
  return other?.who ? `${scriptId}|${other.who.replace(/\|/g, ' ')}` : scriptId;
}
