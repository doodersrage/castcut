/**
 * Group stills: a third person in a clothed two-person Day still — another Cast member, whose
 * face crop rides as Image 3 in place of the pose map (Edit 2511 reads three images; the pose
 * stays in words). Pure.
 *
 * Live (Edit 2511, 2026-10-16, a brunch table, the lead in a satin dress): the wording decides it.
 * Final wording — the three named by their image in the opening line, "all three" in the moment,
 * the third person's clothes in the same sentence as the other two's — three different people,
 * each in their own clothes, 6/6. Before it: "with a woman friend" + "their own everyday clothes"
 * put the lead's dress and heels on the friend 2/4; her clothes in a sentence of their own were
 * ignored 6/6 (2 copied the dress); her clothes in the lead's OUTFIT line dropped her 6/6.
 */

import type { DayPartnerNoun } from './day-partner';

export type DayThirdPerson = {
  noun: DayPartnerNoun;
  /** Their look in words (Cast descriptor), for the face line. */
  descriptor?: string;
  /**
   * Give the three something to do (groupBusyLine) — Qwen-Image 2.1, where they otherwise stood
   * in a row facing the camera.
   */
  busy?: boolean;
};

/**
 * Qwen-Image 2.1 Turbo group stills, 2026-10-17: "cooking lunch together" drew three people
 * standing in a row facing the camera, nobody cooking (2/2). "Each with their hands busy … not
 * lined up" alone turned them a little, still standing (cooking 0/2, baking 0/2). One job per
 * person, named by their image: cooking 2/2, a board game 2/2, baking 2/2. Walking, toasting and
 * the sofa already showed the act; the busy words only turned them toward each other.
 */
const groupBusy = (count: string) =>
  `caught mid-moment, each of the ${count} with their hands busy on it, turned toward the task and each other, not lined up facing the camera`;

/** One job per person (the fourth job only for four-person stills). */
const GROUP_TASKS: Array<{ re: RegExp; jobs: [string, string, string, string] }> = [
  {
    re: /\bbak(?:e|es|ing)\b/i,
    jobs: [
      'rolls out dough with a rolling pin',
      'cracks an egg into a mixing bowl',
      'cuts shapes with a cookie cutter',
      'pipes icing onto a tray of cookies',
    ],
  },
  {
    re: /\b(?:cook(?:s|ing)?|making (?:dinner|lunch|breakfast|brunch|pasta|pizza|a meal)|preparing (?:a |the )?(?:meal|dinner|lunch))\b/i,
    jobs: [
      'stirs a pan at the stove',
      'chops vegetables on a board',
      'leans in tasting from a wooden spoon',
      'sets plates on the counter',
    ],
  },
  {
    re: /\b(?:board game|card game|playing cards|cards|chess|dice)\b/i,
    jobs: [
      'rolls the dice',
      'moves a piece on the board',
      'laughs, holding a card',
      'shuffles a deck of cards',
    ],
  },
];

const ORDINALS = ['first', 'second', 'third', 'fourth'] as const;
const COUNT_WORDS = { 3: 'three', 4: 'four' } as const;

/**
 * "— the woman from the first image stirs …, …, caught mid-moment, …" for the moment: a job for
 * each of the three or four (`nouns`, in image order) when the moment has a task list.
 */
export function groupBusyLine(moment: string, nouns: string[]): string {
  const tasks = GROUP_TASKS.find(entry => entry.re.test(moment));
  const jobs = tasks
    ? `${nouns
        .map((noun, i) => `the ${noun} from the ${ORDINALS[i]} image ${tasks.jobs[i]}`)
        .join(', ')}, `
    : '';
  return ` — ${jobs}${groupBusy(COUNT_WORDS[nouns.length === 4 ? 4 : 3])}`;
}

function thirdOutfit(noun: DayPartnerNoun): string {
  return noun === 'man'
    ? 'a grey crew-neck t-shirt, dark chinos and white sneakers'
    : 'a blue linen shirt, dark jeans and white sneakers';
}

/** The fourth person's clothes — never the third person's, whatever the two nouns. */
function fourthOutfit(noun: DayPartnerNoun): string {
  return noun === 'man'
    ? 'a dark green bomber jacket over a white t-shirt and black jeans'
    : 'a mustard knit cardigan over a white top and a black midi skirt';
}

const TWO_TOGETHER_RE =
  /\b(A (woman|man) and a (woman|man)|Two (women|men)) together, both fully clothed, both fully in frame\./;

const lookOf = (person: DayThirdPerson) =>
  person.descriptor?.trim() ? ` (${person.descriptor.trim().replace(/[.\s]+$/, '')})` : '';

/**
 * The two-person prompt with the third person in it — and a fourth (Qwen-Image 2.1, their face
 * as the fourth image) when given: all of them named by their image, "all three" / "all four" in
 * the moment, each extra person's face and clothes, the pose map (whose slot the third takes) no
 * longer named. Unchanged when the prompt is not a clothed two-person Day still.
 */
export function withThirdPerson(
  prompt: string,
  third: DayThirdPerson,
  fourth?: DayThirdPerson | null
): string {
  const match = TWO_TOGETHER_RE.exec(prompt);
  if (!match) return prompt;
  const pair = match[4] ? (match[4] === 'women' ? 'woman' : 'man') : '';
  const lead = match[2] ?? pair;
  const partner = match[3] ?? pair;
  const noun = third.noun;
  const noun4 = fourth?.noun;
  const count = noun4 ? 'four' : 'three';
  const nouns = noun4 ? [lead, partner, noun, noun4] : [lead, partner, noun];
  const dayStart = prompt.indexOf('Day photo:');
  const head = dayStart >= 0 ? prompt.slice(0, dayStart) : '';
  const body = dayStart >= 0 ? prompt.slice(dayStart) : prompt;
  const everyone = noun4
    ? `the ${lead} from the first image, the ${partner} from the second image, the ${noun} from the third image, and the ${noun4} from the fourth image`
    : `the ${lead} from the first image, the ${partner} from the second image, and the ${noun} from the third image`;
  const extraClothes = noun4
    ? `; the ${noun} from the third image wears ${thirdOutfit(noun)}; the ${noun4} from the fourth image wears ${fourthOutfit(noun4)} — each in their own clothes, not the same clothes as the person from the first image.`
    : `; the ${noun} from the third image wears ${thirdOutfit(noun)}, not the same clothes as the person from the first image.`;
  const faces = `The ${noun} from the third image has that face${lookOf(third)}. ${
    fourth && noun4 ? `The ${noun4} from the fourth image has that face${lookOf(fourth)}. ` : ''
  }`;
  return (
    head
      .replace(
        /\bthe other person wears [^;.\n]*?(?: — never the same pair)?\./,
        'the others wear their own shoes.'
      )
      // The POSE FIRST line: Image 3 is the third face now, not a pose map.
      .replace(/(\bPOSE FIRST: )the two people — /, `$1all ${count} people — `)
      .replace(
        /(\bPOSE FIRST: all (?:three|four) people — )([^\n]*?)\.(?=\n|$)/,
        (line, lead3, moment) =>
          third.busy ? `${lead3}${moment}${groupBusyLine(moment, nouns)}.` : line
      )
      .replace(/,? exactly as the pose map in Image \d shows/g, '') +
    body
      .replace(
        TWO_TOGETHER_RE,
        `${count === 'four' ? 'Four' : 'Three'} people together — exactly ${count}, all fully clothed, all fully in frame, each a different person: ${everyone}.`
      )
      .replace(/(\bMoment: [^.]*?)\bboth\b/, `$1all ${count}`)
      // The extra people's clothes in the same sentence as the other two's.
      .replace(/(\b(?:She|He) wears [^.]*?; (?:he|she) wears [^.]*?)\./, `$1${extraClothes}`)
      .replace(/,? exactly as the pose map in Image \d shows/g, '')
      .replace(
        /\s*Match (?:their two bodies|the two bodies) (?:to|in) the third image \(pose map\)\./g,
        ''
      )
      .replace(/(\bPlace: )/, `${faces}$1`)
  );
}
