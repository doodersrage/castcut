/**
 * Story stills stay photographable (pure). The realism check (still-realism.ts) found 11 of 24
 * recent Story stills computer-made against 1–6% for Day / Outfit, and the cause was the writer:
 * a local model asked for a "weird, specific" beat invents effects no camera can take — drones
 * coiling round a wrist, steam curling into a question mark, roots glowing under bare feet — and
 * Rapid renders them as CGI. Realism LoRAs, photo cues and plate backgrounds did not help.
 *
 * Two parts, both only for stories that are not fantasy or sci-fi by their own setup (a built-in
 * Part — they are all talking animals, sentient objects and creatures — or a Part, bible, setting
 * or notes that names the genre keeps its effects):
 *  - {@link STORY_PHOTOGRAPHABLE_RULE}, a writer line for the bible, the scene cards and the still;
 *  - {@link photographableStoryPrompt}, which drops the impossible clauses from a written still
 *    prompt ("as violet drones spiral around her wrist") and turns a few prop phrases into real
 *    ones ("floating cups" → "cups on the table"), leaving the lead's opening action alone.
 */

import { ROLEPLAY_ARCHETYPES } from './roleplay-archetypes';

/** The story's own setup: what decides whether effects belong in it. */
export type StorySetup = {
  personaId?: string | null;
  customPersona?: string | null;
  bio?: { look?: string | null; personality?: string | null } | null;
  setting?: string | null;
  extraHints?: string | null;
};

/**
 * Words that make a setup fantasy or sci-fi. Kept to genre words — not tone, and not words a real
 * person's story uses ("magic hour", "a magic trick", "a local legend").
 */
const FANTASTICAL_GENRE_RE =
  /\b(?:fantasy|fantastical|fairy[ -]?tales?|magic(?:al)?(?![ -](?:hour|tricks?|show|marker))|wizards?|witch(?:es|craft|y)?|warlocks?|sorcer\w*|mages?|enchant\w*|spell[ -]?casters?|dragons?|elf|elves|elven|fae|fairy|fairies|pixies?|mermaids?|mermen|vampires?|werewol\w*|ghosts?|haunted|spirit (?:world|realm)|demons?|angels?|mytholog\w*|mythical|sci-?fi|science[ -]fiction|space ?ships?|starships?|spacecraft|space stations?|outer space|galaxy|galactic|alien|aliens|extraterrestrial|cyborgs?|androids?|robots?|mechs?|cyberpunk|steampunk|dystopi\w*|post-?apocalyp\w*|time[ -]travel\w*|superhero\w*|super ?powers?|golems?|gargoyles?|sentient|talking (?:animals?|cats?|dogs?|raccoons?|birds?)|undead|zombies?|necromancers?|alchem\w*|shape-?shift\w*|portals?|otherworld\w*|surreal)\b/i;

/** Whether the story is fantasy or sci-fi by its own setup, so effects in its stills are wanted. */
export function storySetupIsFantastical(setup: StorySetup): boolean {
  const personaId = setup.personaId?.trim();
  // Every built-in Part is a creature, a talking animal or a sentient object.
  if (personaId && ROLEPLAY_ARCHETYPES.some(entry => entry.id === personaId)) return true;
  const text = [
    setup.customPersona,
    setup.bio?.look,
    setup.bio?.personality,
    setup.setting,
    setup.extraHints,
  ]
    .filter(Boolean)
    .join(' \n ');
  return FANTASTICAL_GENRE_RE.test(text);
}

/** The writer line for a story that is not fantasy or sci-fi. */
export const STORY_PHOTOGRAPHABLE_RULE =
  '- Photographable: every still must be something a camera could take — real people in a real place, real objects, real light, ordinary physics. No magic, no floating, hovering or levitating objects, nothing glowing that is not a lamp, screen, fire or the sky, no steam, smoke or clouds forming shapes or letters, no invented gadgets or creatures. Quirks and mood live in what the person does, holds and wears, and in faces and light — not in effects.';

/** The writer line when the story is not fantastical; empty when its setup asks for effects. */
export function storyPhotographableLine(setup: StorySetup): string {
  return storySetupIsFantastical(setup) ? '' : STORY_PHOTOGRAPHABLE_RULE;
}

const TABLEWARE = String.raw`(?:tea)?cups?|mugs?|saucers?|plates?|bowls?|glasses|spoons?|forks?|teapots?|kettles?`;

/** Phrase rewrites: impossible props that have a real counterpart. */
const PROP_REWRITES: Array<[RegExp, string]> = [
  // "floating cups" → "cups on the table"
  [
    new RegExp(String.raw`\b(?:floating|levitating|hovering|flying)\s+(${TABLEWARE})\b`, 'gi'),
    '$1 on the table',
  ],
  // "levitating books" → "books" ("floating" only before props: a floating dock, floating
  // shelves and floating lanterns on a river are real)
  [
    /\b(?:levitating|hovering)\s+(?=[a-z])(?!on\b|in\b|over\b|above\b|near\b|by\b|beside\b|at\b)/gi,
    '',
  ],
  [
    /\b(?:floating)\s+(?=(?:books?|candles?|orbs?|keys?|cards?|caps?|hats?|drones?|crystals?|gems?|stones?|rocks?|clocks?|chairs?|furniture|objects?|letters?)\b)/gi,
    '',
  ],
  // "glowing roots" → "roots" (never a lamp, a screen or the sky — see LIGHT_SOURCE)
  [
    /\b(?:glowing|luminous|luminescent|bioluminescent|phosphorescent)\s+(?=(?:roots?|vines?|veins?|runes?|symbols?|eyes|hands?|fingers?|fingertips|palms?|tattoos?|stones?|rocks?|moss|mushrooms?|caps?|petals?|flowers?|leaves|threads?|orbs?|drones?|wings?|butterfl\w+|moths?)\b)/gi,
    '',
  ],
];

/** A clause is never dropped for a motion word when its subject is something that really moves. */
const REAL_MOVER =
  /\b(?:she|he|leaves|snow\w*|petals?|rain\w*|dust|sand|confetti|bubbles?|hair|skirt|dress|scarf|ribbons?|smoke|steam|breath|birds?|butterfl\w+|moths?|bees|insects|pigeons|gulls?|seagulls?|dancers?|people|crowd|kids|children|dogs?|cats?|water|waves?|pool|lake|sea|ocean|river|bath|tub|surf|raft|kite|balloons?|feathers?|sparks from the fire)\b/i;

const IMPOSSIBLE_MOTION =
  /\b(?:float(?:s|ing)?|hover(?:s|ing)?|orbit(?:s|ing)?|spiral(?:s|ing|led)?|coil(?:s|ing|ed)?|swirl(?:s|ing)?|drift(?:s|ing)?|circl(?:e|es|ing))\b/i;

const MAGIC_PLACE =
  /\b(?:in mid-?air|midair|around (?:her|his|their) (?:wrists?|hands?|fingers?|head|palms?|arms?|body|shoulders?|waist)|above (?:her|his|their) (?:palms?|hands?|fingers?|fingertips)|from (?:her|his|their) (?:fingertips|fingers|palms?)|between (?:her|his|their) fingers|(?:from branch )?to (?:her |his |their )?(?:hand|palm)s?|like (?:pollen|fireflies|stars|snowflakes))\b/i;

const LIGHT_SOURCE =
  /\b(?:lamps?|lanterns?|candles?|candlelight|fire|fireplace|hearth|embers|coals|screens?|phones?|laptops?|monitors?|tv|neon|signs?|windows?|sun\w*|moon\w*|dawn|dusk|sky|skyline|lights?|bulbs?|city|street ?lights?|headlights|torch(?:es)?|flashlights?|stove|jukebox|led|cigarettes?|sparklers?)\b/i;

const GLOW =
  /\b(?:glow(?:s|ed|ing)?|luminous|luminescent|bioluminescent|phosphorescent|blaz(?:e|es|ing)|flar(?:e|es|ed|ing))\b/i;

const GLOW_TARGET =
  /\b(?:roots?|vines?|veins?|runes?|symbols?|eyes|hands?|fingers?|fingertips|palms?|tattoos?|stones?|rocks?|moss|mushrooms?|caps?|petals?|flowers?|leaves|threads?|orbs?|\w*-?drones?|wings?|aura)\b/i;

/** Clause tests: any one true and the clause shows something no camera could take. */
const IMPOSSIBLE_CLAUSE: Array<(clause: string) => boolean> = [
  clause =>
    /\b(?:levitat\w*|weightless(?:ly)?|defy(?:ing)? gravity|anti-?gravity|telekine\w*)\b/i.test(
      clause
    ),
  // Steam, smoke or light forming a shape: "steam curling into a question mark".
  clause =>
    /\b(?:smoke|steam|mist|fog|vapou?r|clouds?|flames?|sparks?|light)\b[^.;]*?\b(?:into|forming|forms?|shaped (?:like|as|into)|in the shape of|spell(?:s|ing)? out)\s+(?:a |an |the )?(?:[a-z-]+ ){0,2}(?:question marks?|hearts?|letters?|words?|faces?|symbols?|runes?|figures?|silhouettes?|shapes?|crowns?|wings?|names?|numbers?|arrows?)\b/i.test(
      clause
    ),
  // A shape drawn in the air: "letting it form a question mark in midair".
  clause =>
    /\b(?:question marks?|hearts?|letters?|words?|symbols?|runes?|shapes?)\b/i.test(clause) &&
    /\b(?:in mid-?air|midair|in the air)\b/i.test(clause),
  // Things circling a hand or hanging in midair: "drones spiral around her wrist".
  clause => IMPOSSIBLE_MOTION.test(clause) && MAGIC_PLACE.test(clause) && !REAL_MOVER.test(clause),
  // Drones that act like a swarm of sprites: "cap-drones shimmer silver", "drones coil around
  // her". A drone that films or flies over a beach is left alone.
  clause =>
    /\b(?:\w+-)?drones?\b/i.test(clause) &&
    /\b(?:swirl|spiral|coil|drift|hum|shimmer|glimmer|flare|blaz|glow|danc|flutter|flit|dissolv|vanish|circl|orbit|pulse|twinkl)\w*/i.test(
      clause
    ),
  // Glow on what does not glow: "cap-drones blazing gold", "roots glowing".
  clause => GLOW.test(clause) && GLOW_TARGET.test(clause) && !LIGHT_SOURCE.test(clause),
  clause =>
    /\b(?:magic(?:al)?(?![ -](?:hour|tricks?|show|marker))|spells?(?! out)|enchant\w*|conjur\w*|sorcer\w*|incantations?|auras?|portals?|runes?|ethereal|spectral|otherworldly|mystical|arcane|fairy dust|pixie dust|summon\w*)\b/i.test(
      clause
    ),
  // Roots and vines that move on a body: "roots coil around her wrists".
  clause =>
    /\b(?:roots?|vines?|tendrils?|ivy)\b/i.test(clause) &&
    /\b(?:coil\w*|wrap\w*|snak\w*|lash\w*|burst\w*|whisper\w*|breath\w*|crawl\w*|curl\w*|twin\w*|fus\w*|pulse\w*)\b/i.test(
      clause
    ) &&
    /\b(?:wrists?|hands?|arms?|hips?|ankles?|spine|legs?|waist|body|fingers|shoulders?|ears?|neck|feet)\b/i.test(
      clause
    ),
  clause =>
    /\b(?:dissolv\w*|vanish\w*|disappear\w*|melt\w*|transform\w*|morph\w*|turn(?:s|ed|ing)?) into (?:pollen|light|mist|smoke|sparks?|dust|stars|petals|butterflies|birds|nothing)\b/i.test(
      clause
    ),
];

/** Whether one clause of a still prompt shows something impossible. */
export function storyClauseIsImpossible(clause: string): boolean {
  return IMPOSSIBLE_CLAUSE.some(test => test(clause));
}

/**
 * Cuts a sentence into clauses, keeping each clause's lead-in (the separator before it): a dash,
 * a semicolon, a comma, or "as / while / where / with" — "she lifts the kettle | as drones
 * spiral around her wrist | , steam curling into a question mark".
 */
function splitClauses(sentence: string): Array<{ lead: string; text: string }> {
  const parts = sentence.split(
    /(\s*[—–]\s*|\s+-\s+|\s*;\s*|\s*,\s*|\s+(?:as|while|where|with)\s+)/i
  );
  const clauses: Array<{ lead: string; text: string }> = [{ lead: '', text: parts[0] ?? '' }];
  for (let i = 1; i < parts.length; i += 2) {
    clauses.push({ lead: parts[i], text: parts[i + 1] ?? '' });
  }
  return clauses;
}

function tidy(text: string): string {
  return text
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/([,;—–])\s*(?=[.!?]|$)/g, '')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * A still prompt for a story that is not fantasy or sci-fi: impossible clauses dropped, impossible
 * props turned into real ones. The opening clause (the lead's action and place) is never dropped,
 * only rewritten; a sentence that is impossible as a whole goes. Ordinary words are untouched:
 * "floats on her back in the pool", "magic hour", "a neon sign glows pink", "steam rises from her
 * mug".
 */
export function photographableStoryPrompt(prompt: string): string {
  if (!prompt.trim()) return prompt;
  let text = prompt;
  for (const [pattern, replacement] of PROP_REWRITES) {
    text = text.replace(pattern, replacement);
  }
  if (/^[A-Z]/.test(prompt.trim())) text = text.charAt(0).toUpperCase() + text.slice(1);
  const sentences = text.match(/[^.!?]+(?:[.!?]+|$)\s*/g) ?? [text];
  const kept: string[] = [];
  sentences.forEach((sentence, sentenceIndex) => {
    const end = sentence.match(/[.!?]+\s*$/)?.[0] ?? '';
    const body = end ? sentence.slice(0, sentence.length - end.length) : sentence;
    const clauses = splitClauses(body);
    const keep = clauses.filter(
      (clause, index) =>
        (sentenceIndex === 0 && index === 0) || !storyClauseIsImpossible(clause.text)
    );
    if (keep.length === 0) return;
    // The first kept clause loses a lead-in that hung off a dropped one.
    const rebuilt = keep
      .map((clause, index) =>
        index === 0 && clause !== clauses[0] ? clause.text : `${clause.lead}${clause.text}`
      )
      .join('');
    const sentenceText = tidy(rebuilt);
    if (!sentenceText) return;
    const capped =
      keep[0] !== clauses[0]
        ? sentenceText.charAt(0).toUpperCase() + sentenceText.slice(1)
        : sentenceText;
    kept.push(`${capped}${end.trim() || ''}`);
  });
  return tidy(kept.join(' ')) || prompt.trim();
}

/** The still prompt for this story: sanitized unless its setup is fantasy or sci-fi. */
export function storyStillPromptForSetup(prompt: string, setup: StorySetup): string {
  return storySetupIsFantastical(setup) ? prompt : photographableStoryPrompt(prompt);
}
