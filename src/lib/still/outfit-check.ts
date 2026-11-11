/**
 * Is she wearing the planned outfit? (2026-11-11.) Every still a Scene run makes is checked,
 * Auto-review on or not: an overnight Short kept 4 of its kitchen's 11 stills with her topless in
 * the plate's fitting underwear, on an Everyday day dressed in a slip dress — Auto-review was off,
 * and nothing else looked at the clothes.
 *
 * Two questions, as the Auto-review second look was calibrated (OUTFIT_DESCRIBE_PROMPT): the
 * vision model describes the clothes without being told the plan (told it, the 8B tagged three of
 * those stills "slip dress"), then judges that loosely against the plan. The judge, too, said yes
 * to "naked" and "white underwear" for a slip dress — so bare skin or underwear the plan doesn't
 * name is a miss before it is asked. Over that run's 26 kept stills: the 4 topless caught, one
 * bookshop still in a brown patterned dress and cardigan caught, the other 21 passed. Pure.
 */

/** Whose clothes: the lead, by the word the stills use for her or him. */
export type OutfitWearer = 'woman' | 'man';

/** The describe question, for the woman or the man in the still. */
export function outfitDescribePrompt(wearer: OutfitWearer): string {
  return (
    `Describe only the clothing the ${wearer} in this photo is wearing, in one short line: each ` +
    'garment and its main colour (for example "red strapless mini dress, black heels"). If ' +
    `${wearer === 'woman' ? 'she is' : 'he is'} naked, topless or in underwear, say so. No other words.`
  );
}

/** The judge question (the Auto-review second look's, for the man too). */
export function outfitCheckJudgePrompt(planned: string, seen: string, wearer: OutfitWearer) {
  const prompt = outfitJudgePrompt(planned, seen);
  return wearer === 'woman'
    ? prompt
    : prompt.replace(/\ba woman\b/, 'a man').replace(/\bshe wears\b/, 'he wears');
}

/** The judge question, calibrated for Auto-review's outfit second look (play/slot-quality.ts). */
export function outfitJudgePrompt(planned: string, seen: string): string {
  return (
    `A photo was meant to show a woman wearing: "${planned}".\nA description of what she wears: "${seen}".\n` +
    'Could the description be that outfit, loosely read? Count it as the same when it is the same ' +
    "general kind of clothing in a similar colour: any athletic wear fits a sport's sportswear " +
    '(a wetsuit fits surfing), a costume fits its pieces (armour, robe, kimono), a suit or tuxedo ' +
    'fits a blazer with trousers, and close colours count (burgundy/maroon, sand/gold, taupe/silver, and cream, ivory, champagne, gold and silver satin are one family). ' +
    'Shoes and accessories do not matter. Answer no only when it is clearly a different kind of ' +
    'clothing (a dress instead of a suit, jeans instead of a uniform, a nightie instead of swimwear) ' +
    'or a clearly different colour. Answer only yes or no.'
  );
}

/** Bare skin or underwear, in a description of what someone wears (outfit-check.ts). */
const BARE_RE =
  /\b(naked|nude|topless|bare[- ]chested|no (?:top|shirt|clothes|clothing)|nothing on|underwear|lingerie|bra|panties|knickers|thong|briefs|boxers|bikini|swimsuit)\b/i;

/**
 * Bare skin or underwear seen that the plan doesn't name (a planned bikini is a bikini): the
 * words for it, else null.
 */
export function outfitBareSeen(planned: string, seen: string): string | null {
  const match = BARE_RE.exec(seen);
  if (!match) return null;
  const word = match[1]!.toLowerCase();
  return new RegExp(`\\b${word.split(/[- ]/)[0]}`, 'i').test(planned) ? null : word;
}

export type OutfitCheckVerdict = {
  /** The planned outfit was worn (loosely), or false with what was seen instead. */
  match: boolean;
  /** What she was seen wearing, in the model's words. */
  seen: string;
};

/** The verdict from the description and the judge's answer; null when neither can be read. */
export function outfitCheckVerdict(
  planned: string,
  seen: string,
  answer: string | null
): OutfitCheckVerdict | null {
  const words = seen.trim().replace(/^"|"$/g, '').replace(/\s+/g, ' ').slice(0, 160);
  if (!words) return null;
  if (outfitBareSeen(planned, words)) return { match: false, seen: words };
  const said = answer?.trim().toLowerCase() ?? '';
  if (said.startsWith('yes')) return { match: true, seen: words };
  if (said.startsWith('no')) return { match: false, seen: words };
  return null;
}

/**
 * Whose clothes to ask about in a still: the lead alone, or the lead beside someone of the other
 * sex (the still's words name "a … man" beside her, or "a … woman" beside him). Null when two of
 * the same sex share the frame — the question couldn't say which one is the lead.
 */
export function outfitWearerFor(input: {
  lead: string | null | undefined;
  solo: boolean;
  prompt?: string | null;
}): OutfitWearer | null {
  const lead = input.lead === 'man' ? 'man' : input.lead === 'woman' ? 'woman' : null;
  if (!lead) return null;
  if (input.solo) return lead;
  const other = lead === 'woman' ? 'man' : 'woman';
  return new RegExp(`\\b(?:a|an|the|her|his)\\s+(?:[\\w'-]+\\s+){0,3}${other}\\b`, 'i').test(
    input.prompt ?? ''
  )
    ? lead
    : null;
}
