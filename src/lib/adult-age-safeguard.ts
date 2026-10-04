/**
 * Adult content safeguards in the prompt text: every person on an adult, sexual or nude still
 * (and clip) is given an explicit, mature age in the positive wording, and youth-coded words are
 * taken out of the text before it is queued.
 *
 * Why the positive wording: Rapid AIO and the Lightning stacks run at CFG 1, where the negative
 * prompt has no effect at all — "adult" said once, generically, was the only age a Rapid duo
 * still ever got, and a reviewer flagged two explicit duo stills where the people could read as
 * young. The age sentence is one short sentence, placed after the pose sentence on the compact
 * recipes (long briefs killed Rapid poses), and early on the long briefs. Where the engine does
 * use a negative (CFG > 1), youth terms are added to it too (see `adultYouthNegative`).
 *
 * The vision gate on the finished picture lives in adult-appearance-gate.ts.
 */

import type { CharacterAgeBand } from '@/lib/character-appearance';
import { stripNegatedClauses } from '@/lib/negated-clauses';

export type AgePersonNoun = 'woman' | 'man' | 'person';

/** One person on the still: who they are and, when known, the age their Cast was given. */
export type AgePerson = {
  noun: AgePersonNoun;
  /** The Cast's picked age trait. */
  ageBand?: CharacterAgeBand | null;
  /** Their description — read for an age ("in her 40s") when no trait was picked. */
  descriptor?: string | null;
};

/** The decades the wording uses — never below the late twenties. */
type AgeDecade = 'late twenties' | 'thirties' | 'late thirties' | 'forties' | 'fifties' | 'sixties';

const DECADE_ORDER: readonly AgeDecade[] = [
  'late twenties',
  'thirties',
  'late thirties',
  'forties',
  'fifties',
  'sixties',
];

/** No trait and nothing in the description: a mature default. */
export const DEFAULT_ADULT_DECADE: AgeDecade = 'thirties';

const BAND_DECADE: Record<CharacterAgeBand, AgeDecade> = {
  // "twenties" is said as "late twenties" — never younger in the wording.
  'early-20s': 'late twenties',
  'late-20s': 'late twenties',
  '30s': 'thirties',
  '40s': 'forties',
  '50s': 'fifties',
  '60s': 'sixties',
};

function decadeFromDescriptor(descriptor: string | null | undefined): AgeDecade | null {
  const text = descriptor ?? '';
  if (!text.trim()) return null;
  const word =
    /\b(?:in\s+(?:her|his|their)\s+)?(?:early\s+|mid[- ]|late\s+)?(twenties|thirties|forties|fifties|sixties|seventies|20s|30s|40s|50s|60s|70s)\b/i.exec(
      text
    )?.[1];
  if (word) {
    const key = word.toLowerCase();
    if (key === 'twenties' || key === '20s') return 'late twenties';
    if (key === 'thirties' || key === '30s') return 'thirties';
    if (key === 'forties' || key === '40s') return 'forties';
    if (key === 'fifties' || key === '50s') return 'fifties';
    return 'sixties';
  }
  const years = /\b(\d{2})[- ]?(?:years?[- ]old|yo\b|y\/o\b)/i.exec(text)?.[1];
  if (years) {
    const age = Number(years);
    if (age >= 60) return 'sixties';
    if (age >= 50) return 'fifties';
    if (age >= 40) return 'forties';
    if (age >= 35) return 'late thirties';
    if (age >= 30) return 'thirties';
    // Anything younger is said as the late twenties (the youth filter rewrites the number).
    return 'late twenties';
  }
  return null;
}

/** The decade a person is given in the age sentence. */
export function adultDecadeFor(person: AgePerson | null | undefined, strong = false): AgeDecade {
  const base =
    (person?.ageBand ? BAND_DECADE[person.ageBand] : null) ??
    decadeFromDescriptor(person?.descriptor) ??
    DEFAULT_ADULT_DECADE;
  if (!strong) return base;
  // The stronger line (after the gate withheld a take) moves the youngest wording up a step.
  const index = DECADE_ORDER.indexOf(base);
  return index < 2 ? DECADE_ORDER[index + 1]! : base;
}

function possessive(noun: AgePersonNoun): string {
  return noun === 'woman' ? 'her' : noun === 'man' ? 'his' : 'their';
}

/**
 * The age sentence: one sentence, everyone on the still named as an adult with a decade.
 * `people` 0 / undefined with no partner: the count is unknown — "everyone" wording.
 */
export function adultAgeLine(input: {
  lead: AgePerson;
  partner?: AgePerson | null;
  /** How many people the still shows (1, 2, or more); unknown → generic wording. */
  people?: number | null;
  /** The stronger wording a requeue uses after the vision gate withheld a take. */
  strong?: boolean;
}): string {
  const strong = input.strong === true;
  const people = input.people ?? (input.partner ? 2 : 0);
  const faces = strong
    ? 'mature grown-up faces, adult proportions and fully adult bodies'
    : 'mature adult faces and bodies';
  const leadDecade = adultDecadeFor(input.lead, strong);
  if (people === 1) {
    const noun = input.lead.noun;
    const pronoun = noun === 'woman' ? 'She' : noun === 'man' ? 'He' : 'They';
    const verb = noun === 'person' ? 'are' : 'is';
    const who = noun === 'person' ? 'an adult' : `an adult ${noun}`;
    const face = strong
      ? 'a mature grown-up face, adult proportions and a fully adult body'
      : 'a mature adult face and body';
    return `${pronoun} ${verb} ${strong ? 'clearly ' : ''}${who} in ${possessive(noun)} ${leadDecade}, with ${face}.`;
  }
  if (people === 2) {
    const partner = input.partner ?? { noun: 'person' as const };
    const partnerDecade = adultDecadeFor(partner, strong);
    if (partnerDecade === leadDecade) {
      return `Both are ${strong ? 'clearly ' : ''}adults in their ${leadDecade}, with ${faces}.`;
    }
    // Two women / two men / unknown: "one … the other"; a woman and a man by their nouns.
    const named =
      input.lead.noun !== 'person' && partner.noun !== 'person' && partner.noun !== input.lead.noun;
    const lead = named ? `the ${input.lead.noun}` : 'one';
    const other = named ? `the ${partner.noun}` : 'the other';
    return `Both are ${strong ? 'clearly ' : ''}adults — ${lead} in ${possessive(input.lead.noun)} ${leadDecade}, ${other} in ${possessive(partner.noun)} ${partnerDecade} — with ${faces}.`;
  }
  return `Everyone in the picture is ${strong ? 'clearly ' : ''}an adult in their ${leadDecade}, with ${faces}.`;
}

/** An age sentence this module wrote (or one like it) is already in the text. */
const AGE_LINE_RE =
  /\b(?:(?:She|He|They) (?:is|are) (?:clearly )?an adult(?: woman| man)? in (?:her|his|their)|Both are (?:clearly )?adults\b|Everyone in the picture is (?:clearly )?an adult)\b/;

export function hasAdultAgeLine(text: string | null | undefined): boolean {
  return AGE_LINE_RE.test(text ?? '');
}

/** The age sentence in a prompt (for a clip made from an explicit still), or null. */
export function adultAgeLineIn(text: string | null | undefined): string | null {
  const source = text ?? '';
  const match = AGE_LINE_RE.exec(source);
  if (!match) return null;
  const end = source.indexOf('.', match.index);
  return end > match.index ? source.slice(match.index, end + 1) : null;
}

/** Marks that lead the compact recipes (rapid-duo-recipe-mark.ts). */
const RECIPE_MARK_RE =
  /(?:Explicit sex photo:|Explicit solo photo:|Suggestive photo:|Vacation photo:|Day photo:)/;

/** The end of the first sentence at or after `from` (index just after its full stop), or -1. */
function sentenceEnd(text: string, from: number): number {
  const re = /[.!?](?=\s+[A-Z"(])/g;
  re.lastIndex = from;
  const match = re.exec(text);
  return match ? match.index + 1 : -1;
}

/**
 * Put the age sentence into a prompt. Compact recipes: right after the pose sentences (before
 * "Moment:"), never before the pose. A multi-line brief: as its second line. One paragraph:
 * after its first sentence. A prompt that already has an age sentence is returned as it is.
 */
export function withAdultAgeLine(prompt: string, line: string): string {
  const text = prompt ?? '';
  const sentence = line.trim();
  if (!sentence || hasAdultAgeLine(text)) return text;
  if (!text.trim()) return sentence;
  const lines = text.split('\n');
  const recipeIndex = lines.findIndex(entry => RECIPE_MARK_RE.test(entry));
  if (recipeIndex >= 0) {
    const recipe = lines[recipeIndex]!;
    const moment = recipe.search(/\sMoment:/);
    let at = moment;
    if (at < 0) {
      // No "Moment:" — after the sentence that follows the mark (the pose sentence).
      const mark = RECIPE_MARK_RE.exec(recipe)!;
      const afterMark = mark.index + mark[0].length;
      const end = sentenceEnd(recipe, afterMark);
      at = end > 0 ? end : -1;
    }
    lines[recipeIndex] =
      at >= 0
        ? `${recipe.slice(0, at).trimEnd()} ${sentence} ${recipe.slice(at).trimStart()}`.trimEnd()
        : `${recipe.trimEnd()} ${sentence}`;
    return lines.join('\n');
  }
  const nonEmpty = lines.filter(entry => entry.trim()).length;
  if (nonEmpty > 1) {
    const first = lines.findIndex(entry => entry.trim());
    lines.splice(first + 1, 0, sentence);
    return lines.join('\n');
  }
  const end = sentenceEnd(text, 0);
  return end > 0
    ? `${text.slice(0, end)} ${sentence} ${text.slice(end).trimStart()}`.trimEnd()
    : `${text.trimEnd().replace(/([^.!?])$/, '$1.')} ${sentence}`;
}

/** Youth terms for the negative prompt — only where the engine runs at CFG > 1. */
export const ADULT_YOUTH_NEGATIVE =
  'child, minor, teen, teenager, childlike, young-looking, schoolgirl, schoolboy, petite youthful body, baby face';

/**
 * Sexual, nude or otherwise adult wording — the prompts the age safeguards apply to. Generous on
 * purpose: a false hit only adds an age sentence.
 */
const EXPLICIT_RE =
  /\b(?:nude|naked|nudity|topless|bottomless|sex|sexual|sexy|explicit|erotic|porn\w*|penis|cock|vulva|vagina\w*|pussy|clit\w*|labia|nipples?|genitals?|masturbat\w*|orgasm\w*|penetrat\w*|cowgirl|missionary|doggy\w*|blowjob|fellatio|cunnilingus|handjob|oral sex|69|sixty[- ]nine|cum\w*|semen|dildo|vibrator|sex toy|strap-on|lingerie|bdsm|bondage|fetish|seductive|seduct\w*|sultry|lustful|aroused|arousal|foreplay|undress\w*|striptease|stripper|strip(?:s|ping|ped)?\s+(?:off|down|naked|nude|bare))\b|MOOD:\s*(?:intimate|raunchy|suggestive)\b/i;

/**
 * Locks and conditions are not the scene: "never a topless look", "zero fabric when the beat is
 * nude" (Sport's stock lines) say nothing about this still.
 */
function sceneWords(text: string): string {
  return stripNegatedClauses(text.replace(/\b(?:never|without)\b[^.;:\n]*/gi, ' ')).replace(
    /\b(?:when|if|unless)\b[^.,;:—\n]*/gi,
    ' '
  );
}

/** The adult word a prompt's scene uses ("nude", "mid-sex" …), or null. */
export function adultContentWord(text: string | null | undefined): string | null {
  return EXPLICIT_RE.exec(sceneWords(text ?? ''))?.[0] ?? null;
}

export function isAdultContentPrompt(text: string | null | undefined): boolean {
  return adultContentWord(text) !== null;
}

// ── Youth-coded words ─────────────────────────────────────────────────────────────────────

type YouthRule = { re: RegExp; to: string | ((match: string, ...groups: string[]) => string) };

/** Keep the first letter's case of what was replaced. */
function cased(original: string, replacement: string): string {
  if (!replacement) return replacement;
  return /^[A-Z]/.test(original)
    ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
    : replacement;
}

const YOUTH_RULES: YouthRule[] = [
  // Ages under 25 said as a number ("18-year-old", "19 yo", "aged 18").
  {
    re: /\b(?:1\d|2[0-4])[- ]?(?:years?[- ]old|yrs?[- ]old|yo|y\/o)\b/gi,
    to: 'adult',
  },
  { re: /\baged\s+(?:1\d|2[0-4])\b/gi, to: 'aged 28' },
  // Twenties are said as the late twenties.
  {
    re: /\b(her|his|their)\s+(?:early|mid[- ])\s*(?:twenties|20s|20's)\b/gi,
    to: (_m, who: string) => `${who} late twenties`,
  },
  {
    re: /\b(in\s+(?:her|his|their))\s+(?:twenties|20s|20's)\b/gi,
    to: (_m, lead: string) => `${lead} late twenties`,
  },
  { re: /\bearly\s+(?:twenties|20s)\b/gi, to: 'late twenties' },
  { re: /\bbarely[- ]legal\b/gi, to: 'adult' },
  { re: /\b(?:jailbait|lolita|loli|shotacon|shota|lolicon)\b/gi, to: 'adult' },
  { re: /\bunder[- ]?age(?:d)?\b/gi, to: 'adult' },
  // "a minor" as a person — not "a minor detail".
  { re: /\bminors\b/gi, to: 'adults' },
  {
    re: /\b(a|the)\s+minor\b(?=\s*(?:[,.;:!?)]|$|(?:girl|boy|woman|man|who|with|in|on)\b))/gi,
    to: (_m, article: string) => `${article} adult`,
  },
  { re: /\bbaby[- ]faced\b/gi, to: 'mature-faced' },
  { re: /\bbaby[- ]?face\b/gi, to: 'mature face' },
  { re: /\bchildlike\b/gi, to: 'grown' },
  { re: /\bchildren\b/gi, to: 'adults' },
  // Not the yoga pose.
  { re: /\bchild\b(?!['’]?s?\s+pose)/gi, to: 'adult' },
  { re: /\bkids\b/gi, to: 'adults' },
  { re: /\bkid\b(?!\s+gloves)/gi, to: 'adult' },
  { re: /\bpre-?teens?\b/gi, to: 'adult' },
  { re: /\bteen(?:agers|s)\b/gi, to: 'adults' },
  { re: /\bteen(?:age(?:d|r)?)?\b/gi, to: 'adult' },
  { re: /\badolescents\b/gi, to: 'adults' },
  { re: /\badolescent\b/gi, to: 'adult' },
  { re: /\bpubescent\b/gi, to: 'adult' },
  // School themes.
  {
    re: /\bschool[- ]?(?:girl|boy)\s+(?:outfits?|costumes?|uniforms?|looks?|skirts?)\b/gi,
    to: 'office outfit',
  },
  { re: /\bschool[- ]?girls?\b/gi, to: 'woman' },
  { re: /\bschool[- ]?boys?\b/gi, to: 'man' },
  { re: /\bschool[- ]uniforms?\b/gi, to: 'office outfit' },
  { re: /\b(?:high|middle|elementary|primary|grade|junior high)\s+school\b/gi, to: 'office' },
  { re: /\bclassroom\b/gi, to: 'office' },
  { re: /\bhomework\b/gi, to: 'paperwork' },
  // "old-school" keeps its meaning; any other "school" becomes the office.
  { re: /(?<![-\w])(?<!old-)school\b/gi, to: 'office' },
  { re: /\bpigtails\b/gi, to: 'low braids' },
  // Girl / boy → woman / man (never "girlfriend" / "boyfriend").
  {
    re: /\blittle\s+(girl|boy)s?\b/gi,
    to: (_m, w: string) => (w.toLowerCase() === 'girl' ? 'woman' : 'man'),
  },
  { re: /\bgirls\b/gi, to: 'women' },
  { re: /\bgirl\b/gi, to: 'woman' },
  { re: /\bgirly\b/gi, to: 'feminine' },
  { re: /\bboys\b/gi, to: 'men' },
  { re: /\bboy\b/gi, to: 'man' },
  // Body words that read young.
  { re: /\bpetite\b/gi, to: 'slim' },
  { re: /\btiny\b/gi, to: 'small' },
  { re: /\byouthful(?:ly)?\b/gi, to: 'radiant' },
  // "young" before a person or a body word goes; "young" elsewhere ("the night is young") stays.
  {
    re: /\byoung(?:er|ish)?[- ]?(?:looking\s+)?\s*((?:adult\s+)?(?:woman|women|man|men|lady|ladies|guy|guys|couple|wife|husband|lovers?|girlfriend|boyfriend|body|bodies|face|faces|people|person|blonde|brunette|redhead|students?|model|bride|mom|dad|female|male|thing|one|adults?)\b)/gi,
    to: (_m, word: string) => word,
  },
  { re: /\byoung[- ]looking\b/gi, to: 'adult' },
  {
    re: /\bstudents?\b/gi,
    to: (m: string) => (m.toLowerCase().endsWith('s') ? 'graduate students' : 'graduate student'),
  },
];

/**
 * Youth-coded words out of explicit text: girl / boy → woman / man, ages under 25 and "early
 * twenties" → the late twenties, school themes → the office, "petite", "tiny", "young" … taken
 * out. Ordinary words are left alone ("girlfriend", "boyfriend", "old-school", "the night is
 * young", "baby blue", "a little smile").
 */
export function neutralizeYouthWords(text: string | null | undefined): string {
  let next = text ?? '';
  if (!next) return next;
  for (const rule of YOUTH_RULES) {
    next = next.replace(rule.re, (match: string, ...rest: unknown[]) => {
      const groups = rest.filter((value): value is string => typeof value === 'string');
      const replacement = typeof rule.to === 'function' ? rule.to(match, ...groups) : rule.to;
      return cased(match, replacement);
    });
  }
  if (next === text) return next;
  // "a teen woman" → "a adult woman", "an 18-year-old" → "an adult": fix the article.
  return next
    .replace(/\b([Aa])(\s+)(?=(?:adult|office|aged)\b)/g, '$1n$2')
    .replace(/\b([Aa])n(\s+)(?=(?:woman|women|man|men|slim|small|graduate|low|mature)\b)/g, '$1$2')
    .replace(/\badult(\s+)adults?\b/gi, 'adult')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.;:])/g, '$1');
}

/** The youth words still in a text (for tests and the audit). */
export function youthWordsIn(text: string | null | undefined): string[] {
  const source = text ?? '';
  const found = new Set<string>();
  for (const rule of YOUTH_RULES) {
    rule.re.lastIndex = 0;
    for (const match of source.matchAll(new RegExp(rule.re.source, rule.re.flags))) {
      if (match[0].trim()) found.add(match[0].trim().toLowerCase());
    }
  }
  return [...found];
}

/**
 * Both safeguards on a prompt that will be queued: youth words neutralised and the age sentence
 * put in. Used wherever a builder knows the people (Day, Story, clips); the queue's own pass
 * (`ensureAdultAgeSafeguards`) covers every other path with the default wording.
 */
export function applyAdultAgeSafeguards(
  prompt: string,
  people: Parameters<typeof adultAgeLine>[0]
): string {
  return withAdultAgeLine(neutralizeYouthWords(prompt), adultAgeLine(people));
}

/**
 * The queue's pass over every prompt it sends: when the positive is adult content, youth words
 * are neutralised and — when no builder added one — the generic age sentence goes in; when the
 * engine reads a negative, the youth terms join it. Prompts that are not adult content pass
 * through untouched.
 */
export function ensureAdultAgeSafeguards(input: {
  positive: string;
  negative?: string;
  /** The engine runs at CFG > 1 (the negative prompt is read). */
  usesNegative: boolean;
}): { positive: string; negative?: string; applied: boolean } {
  if (!isAdultContentPrompt(input.positive)) {
    return { positive: input.positive, negative: input.negative, applied: false };
  }
  const positive = withAdultAgeLine(
    neutralizeYouthWords(input.positive),
    adultAgeLine({ lead: { noun: 'person' } })
  );
  return {
    positive,
    negative: input.usesNegative ? appendYouthNegative(input.negative) : input.negative,
    applied: true,
  };
}

/** The youth terms added to a negative prompt (missing ones only). */
export function appendYouthNegative(negative: string | undefined): string {
  const existing = negative?.trim() ?? '';
  const lower = existing.toLowerCase();
  const missing = ADULT_YOUTH_NEGATIVE.split(',')
    .map(term => term.trim())
    .filter(
      term => !new RegExp(`(?:^|,)\\s*${term.replace(/[-]/g, '\\-')}\\s*(?:,|$)`, 'i').test(lower)
    );
  if (missing.length === 0) return existing;
  return existing
    ? `${existing.replace(/[,\s]+$/, '')}, ${missing.join(', ')}`
    : missing.join(', ');
}
