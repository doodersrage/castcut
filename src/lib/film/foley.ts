/**
 * Foley suggestions (Part 18 R4): the sounds a film's shots say happen — a door, rain, footsteps,
 * a phone, the sea, a café's murmur — read from each shot's beat and place, each with the words
 * Cut's "Make a sound" (LTX-2.5) is given and where it goes in the film. A sound already on the
 * effects track near that moment is not suggested again. Deterministic word rules, no model.
 * Pure.
 */

export type FoleyShot = {
  key: string;
  title: string;
  /** The beat and the place, in words. */
  text: string;
  /** Where the shot starts in the film and how long it runs (seconds). */
  startSec: number;
  durSec: number;
};

export type FoleySuggestion = {
  id: string;
  shotKey: string;
  shotTitle: string;
  /** What "Make a sound" is asked for. */
  words: string;
  /** Film seconds it goes at, and how long to make it. */
  atSec: number;
  seconds: number;
  /** Room tone / weather under the whole shot, not a single hit. */
  bed: boolean;
};

type Rule = { re: RegExp; words: string; seconds: number; bed?: boolean; at?: 'start' | 'middle' };

/** Most specific first; one suggestion per rule per shot. */
const RULES: readonly Rule[] = [
  {
    re: /\b(door|doorway)s?\b.*\b(clos|shut|slam|open)|\b(open|clos|shut|slam)\w*\b.*\bdoors?\b/i,
    words: 'a door opens and closes',
    seconds: 2,
  },
  { re: /\bknock(s|ing)?\b/i, words: 'a knock on a wooden door', seconds: 2 },
  {
    re: /\b(rain|raining|downpour|drizzle)\b/i,
    words: 'steady rain falling outside',
    seconds: 6,
    bed: true,
  },
  { re: /\b(thunder|storm)\b/i, words: 'distant thunder rumbling', seconds: 5, bed: true },
  {
    re: /\b(wind|windy|breeze|gust)\b/i,
    words: 'wind blowing through the trees',
    seconds: 6,
    bed: true,
  },
  {
    re: /\b(beach|ocean|sea|waves|shore|surf)\b/i,
    words: 'ocean waves on a beach',
    seconds: 8,
    bed: true,
  },
  {
    re: /\b(café|cafe|coffee shop|restaurant|bar|pub|crowd|party|club)\b/i,
    words: 'a busy café murmur, cups and quiet voices',
    seconds: 8,
    bed: true,
  },
  {
    re: /\b(street|city|traffic|sidewalk|crosswalk)\b/i,
    words: 'city street traffic and footsteps',
    seconds: 8,
    bed: true,
  },
  {
    re: /\b(park|garden|forest|woods|meadow|birds?)\b/i,
    words: 'birds singing in a park',
    seconds: 8,
    bed: true,
  },
  { re: /\b(fire(place)?|campfire|bonfire)\b/i, words: 'a crackling fire', seconds: 6, bed: true },
  {
    re: /\b(walk|walks|walking|steps|stairs|runs|running|jog)\b/i,
    words: 'footsteps on a hard floor',
    seconds: 3,
    at: 'middle',
  },
  {
    re: /\b(pours?|pouring)\b.*\b(coffee|tea|wine|water|drink)|\b(coffee|tea|wine)\b.*\bpour/i,
    words: 'a drink being poured into a cup',
    seconds: 2,
  },
  { re: /\b(toast|clink|cheers|glasses)\b/i, words: 'two glasses clinking', seconds: 1.5 },
  { re: /\b(phone|text|message|calls?)\b/i, words: 'a phone buzzing on a table', seconds: 2 },
  { re: /\b(keys|unlocks?|lock)\b/i, words: 'keys jingling and a lock turning', seconds: 2 },
  {
    re: /\b(car|drives?|driving|engine)\b/i,
    words: 'a car engine starting and pulling away',
    seconds: 4,
  },
  { re: /\b(dog|puppy|barks?)\b/i, words: 'a dog barking twice', seconds: 2 },
  {
    re: /\b(type|types|typing|keyboard|laptop)\b/i,
    words: 'typing on a laptop keyboard',
    seconds: 3,
    at: 'middle',
  },
  {
    re: /\b(cook|cooking|frying|sizzl|stirs?|kitchen)\b/i,
    words: 'food sizzling in a pan',
    seconds: 4,
    bed: true,
  },
  { re: /\b(shower|bath|tap|faucet|sink)\b/i, words: 'running water from a tap', seconds: 4 },
  {
    re: /\b(page|pages|book|reads?|newspaper)\b/i,
    words: 'a page turning',
    seconds: 1.5,
    at: 'middle',
  },
  {
    re: /\b(train|station|platform)\b/i,
    words: 'a train arriving at a station',
    seconds: 5,
    bed: true,
  },
];

/** How near (seconds) a sound already placed counts as "that one is there". */
const NEAR_SEC = 1.5;

/**
 * The suggestions for a film's shots, in film order: per shot, the rules its words meet (a bed
 * for the place or weather, hits for what is done), minus any sound already placed near there.
 */
export function foleySuggestions(
  shots: readonly FoleyShot[],
  placed: ReadonlyArray<{ atSec: number; name?: string }> = []
): FoleySuggestion[] {
  const out: FoleySuggestion[] = [];
  for (const shot of shots) {
    const text = shot.text.trim();
    if (!text || shot.durSec <= 0) continue;
    let beds = 0;
    for (const rule of RULES) {
      if (!rule.re.test(text)) continue;
      // One bed per shot (the place's sound); hits as many as the beat names.
      if (rule.bed && beds++ > 0) continue;
      const atSec =
        Math.round(
          (rule.at === 'middle' ? shot.startSec + shot.durSec / 3 : shot.startSec + 0.1) * 10
        ) / 10;
      const seconds = Math.min(
        8,
        rule.bed ? Math.max(rule.seconds, Math.min(8, shot.durSec)) : rule.seconds
      );
      const already = placed.some(
        effect =>
          Math.abs(effect.atSec - atSec) < NEAR_SEC ||
          (effect.name?.toLowerCase().includes(rule.words.split(' ').slice(-1)[0]!) &&
            Math.abs(effect.atSec - atSec) < shot.durSec)
      );
      if (already) continue;
      out.push({
        id: `${shot.key}:${rule.words}`,
        shotKey: shot.key,
        shotTitle: shot.title,
        words: rule.words,
        atSec,
        seconds,
        bed: rule.bed === true,
      });
    }
  }
  return out;
}
