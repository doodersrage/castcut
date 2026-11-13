/**
 * Who a script's two-shot shows besides the lead, and where a film keeps that person's stand-in
 * face — pure (the take's plan reads them, on the page and the server); the stand-in itself is
 * rendered in partner-stand-in.ts.
 */

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

/** Where a film keeps a stand-in: the script for its partner, `script|who` for anyone else. */
export function filmStandInKey(scriptId: string, other: ScriptShotOther | null): string {
  return other?.who ? `${scriptId}|${other.who.replace(/\|/g, ' ')}` : scriptId;
}
