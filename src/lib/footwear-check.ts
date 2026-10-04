/**
 * Shoe check: after a try-on or a dressed plate lands with shoes picked, a vision model looks at
 * her feet and says what is on them; this module decides whether the feet pass
 * (buildFittingFeetPassPrompt) is needed.
 *
 * Calibrated 2026-10-04 on 11 of the user's heel try-ons (feet crop, nsfwvision-qwen3-vl-8b):
 * asked "is she wearing <the picked shoes>?" the model echoed the words back — flat sandals read
 * as "stiletto heels", 0 of 4 caught. Asked neutrally what is on her feet, with the match done
 * here, 11 of 11 were judged right. So the prompt never names the picked shoes.
 *
 * Pure: no fetch, no React (the route and the client wrap it).
 */

const BAREFOOT_RE = /^(?:barefoot|bare feet|no shoes|none|nothing)$/i;

/** Asked about the lower part of the still (her legs and feet), never told which shoes to expect. */
export const FOOTWEAR_CHECK_PROMPT = [
  'Look closely at her feet in this photo (the lower part of a full-length picture).',
  'Answer strict JSON only:',
  '{"feetVisible": true|false, "shoesOnFeet": 0|1|2, "heel": "high"|"low"|"flat"|"none", "kind": "<2-5 words naming what is on her feet, e.g. black strappy high-heel sandals, flat sandals, bare feet, white sneakers>", "shoesBesideHer": true|false, "deformed": true|false}',
  '- shoesOnFeet: how many of her feet wear a shoe (bare feet, or socks/tights alone, count 0).',
  '- heel: heel height of the shoes on her feet: high = the heel is raised well above the toes on a tall heel; flat = the sole lies flat on the floor; none when barefoot.',
  '- shoesBesideHer: a pair of shoes stands on the floor near her instead of on her feet.',
  '- deformed: a shoe on her feet is broken: straps melted together or cut off, a heel missing or floating, the two shoes clearly different.',
].join('\n');

/**
 * The share of the still (from the bottom) sent to the vision model. Feet in a full-length
 * try-on are ~3% of the picture; downscaled whole, the model could not tell heels from flats.
 */
export const FOOTWEAR_CHECK_CROP_BOTTOM = 0.45;

export type FootwearHeel = 'high' | 'low' | 'flat' | 'none';

export type FootwearCheckReading = {
  feetVisible: boolean;
  shoesOnFeet: 0 | 1 | 2;
  heel: FootwearHeel;
  kind: string;
  shoesBesideHer: boolean;
  deformed: boolean;
};

export type FootwearCheckReason =
  | 'feet-hidden'
  | 'barefoot'
  | 'one-shoe'
  | 'shoes-beside'
  | 'wrong-heel'
  | 'wrong-kind'
  | 'deformed';

export type FootwearCheckVerdict = {
  ok: boolean;
  reason: FootwearCheckReason | null;
  /** What the model saw on her feet ("black flat sandals", "bare feet"). */
  seen: string;
};

function bool(value: unknown): boolean {
  return value === true || (typeof value === 'string' && /^(?:true|yes)$/i.test(value.trim()));
}

function shoeCount(value: unknown): 0 | 1 | 2 {
  if (typeof value === 'number') return value >= 2 ? 2 : value >= 1 ? 1 : 0;
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  if (/^(?:2|two|both)$/.test(text)) return 2;
  if (/^(?:1|one)$/.test(text)) return 1;
  return 0;
}

/** The model's JSON reply (fenced, with reasoning around it, or bare), or null if unreadable. */
export function parseFootwearCheck(text: string | null | undefined): FootwearCheckReading | null {
  const match = String(text ?? '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  let reply: Record<string, unknown>;
  try {
    reply = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!('shoesOnFeet' in reply) && !('heel' in reply)) return null;
  const heelText = String(reply.heel ?? '')
    .trim()
    .toLowerCase();
  const heel: FootwearHeel =
    heelText === 'high' || heelText === 'low' || heelText === 'flat' ? heelText : 'none';
  return {
    // Absent means the model did not say otherwise; only an explicit false hides the feet.
    feetVisible: reply.feetVisible === undefined ? true : bool(reply.feetVisible),
    shoesOnFeet: shoeCount(reply.shoesOnFeet),
    heel,
    kind: String(reply.kind ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80),
    shoesBesideHer: bool(reply.shoesBesideHer),
    deformed: bool(reply.deformed),
  };
}

/** The heel the picked shoes call for, or null when the words leave it open (boots, "shoes"). */
export function footwearExpectedHeel(words: string): Exclude<FootwearHeel, 'none'> | null {
  const text = words.toLowerCase();
  if (
    /\b(?:flat|flats|ballet|sneakers?|trainers?|loafers?|flip[- ]?flops?|slides?|slippers?|moccasins?)\b/.test(
      text
    )
  ) {
    return 'flat';
  }
  if (/\b(?:kitten[- ]heels?|low[- ]heel(?:ed|s)?)\b/.test(text)) return 'low';
  if (/\b(?:stilettos?|high[- ]heel(?:ed|s)?|heels|heeled|pumps?)\b/.test(text)) return 'high';
  return null;
}

/** Shoe families that never pass for one another (sneakers are not sandals, boots not pumps). */
const STRONG_FAMILIES: Array<[string, RegExp]> = [
  ['sneakers', /\b(?:sneakers?|trainers?|running shoes?|tennis shoes?)\b/],
  ['boots', /\bboots?\b/],
];

function families(text: string): Set<string> {
  const lower = text.toLowerCase();
  return new Set(STRONG_FAMILIES.filter(([, re]) => re.test(lower)).map(([name]) => name));
}

/**
 * Whether the still shows the picked shoes, from a reading. Feet out of frame are not a failure
 * of the shoes (nothing a feet pass can fix) and come back ok with reason 'feet-hidden'.
 */
export function footwearCheckVerdict(
  reading: FootwearCheckReading,
  shoeWords: string
): FootwearCheckVerdict {
  const seen = reading.kind || (reading.shoesOnFeet === 0 ? 'bare feet' : 'shoes');
  const fail = (reason: FootwearCheckReason): FootwearCheckVerdict => ({ ok: false, reason, seen });
  if (!reading.feetVisible) return { ok: true, reason: 'feet-hidden', seen };
  if (reading.shoesBesideHer && reading.shoesOnFeet < 2) return fail('shoes-beside');
  if (reading.shoesOnFeet === 0) return fail('barefoot');
  if (reading.shoesOnFeet === 1) return fail('one-shoe');
  const expected = footwearExpectedHeel(shoeWords);
  if (expected === 'high' && reading.heel !== 'high') return fail('wrong-heel');
  if (expected === 'flat' && reading.heel === 'high') return fail('wrong-heel');
  const want = families(shoeWords);
  const got = families(reading.kind);
  const shared = [...want].some(name => got.has(name));
  if ((want.size > 0 || got.size > 0) && !shared) return fail('wrong-kind');
  if (reading.deformed) return fail('deformed');
  return { ok: true, reason: null, seen };
}

/** Real shoes were picked (words or a picture) — not barefoot, not left to the outfit. */
export function footwearCheckApplies(input: {
  footwear?: string | null;
  hasShoeImage?: boolean;
}): boolean {
  const words = (input.footwear ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.;,\s]+$/, '');
  if (BAREFOOT_RE.test(words)) return false;
  return Boolean(words) || input.hasShoeImage === true;
}

/**
 * Whether to run the feet pass on a landed still. With a verdict: only when it says the shoes are
 * wrong (missing, beside her, the wrong heel or kind, broken). Without one (no vision model, the
 * check failed): only where the shoes are known to go missing — `whenUnchecked`.
 */
export function footwearNeedsFeetPass(
  verdict: FootwearCheckVerdict | null | undefined,
  whenUnchecked: boolean
): boolean {
  if (!verdict) return whenUnchecked;
  return !verdict.ok;
}

/** One short line for the status / tray: what the check saw. */
export function footwearCheckNote(verdict: FootwearCheckVerdict): string {
  switch (verdict.reason) {
    case 'barefoot':
      return 'she came out barefoot';
    case 'one-shoe':
      return 'only one foot has a shoe';
    case 'shoes-beside':
      return 'the shoes are beside her, not on her feet';
    case 'wrong-heel':
    case 'wrong-kind':
      return `she has ${verdict.seen || 'other shoes'} on`;
    case 'deformed':
      return 'the shoes came out misshapen';
    default:
      return 'the shoes look right';
  }
}

/** Edit 2511 first: the feet pass was tested there (other engines draw no shoe picture). */
export const FEET_PASS_MODELS = [
  'qwen-image-edit-2511-lightning-8',
  'qwen-image-edit-2511-lightning-4',
  'qwen-image-edit-2511',
] as const;

/**
 * The engine a feet pass runs on: the try-on's own when it is Edit 2511, else an installed Edit
 * 2511 (a Rapid AIO or Qwen-Image 2.1 try-on gets its shoes put on there), else none — the pass is
 * only known to work on 2511.
 */
export function resolveFeetPassModel(
  model: string | null | undefined,
  installed?: ((modelId: string) => boolean) | null
): string | null {
  const picked = String(model ?? '').trim();
  if (picked.includes('qwen-image-edit-2511')) return picked;
  if (!installed) return null;
  return FEET_PASS_MODELS.find(id => installed(id)) ?? null;
}

/**
 * The feet pass: Image 1 is the finished try-on (or dressed plate), Image 2 the shoe picture when
 * there is one (best alone — under the clothing it is a small strip, and the clothing leaked: a
 * pass added the packshot's tights or swapped the whole outfit), no pose map.
 *
 * A/B 2026-10-04 on the user's barefoot / flat-sandal try-ons and plates (Edit 2511, picked black
 * strappy stilettos): the old "put … on her bare feet, worn on both feet" put the stilettos on
 * 0 of 6 (flat sandals or nothing); naming the heel ("heels lifted on the tall thin heels…") got
 * heels 3 of 6 but zoomed in to the feet 2 of 6; the whole picture first ("the same full picture
 * — her whole body head to feet…") with the heel line and the shoes alone in Image 2: 5 of 5, the
 * framing kept. "In place of whatever is on her feet": tights, socks and flats are not bare feet.
 */
export function buildFeetPassPrompt(input: {
  shoeWords?: string | null;
  imagePlacement?: 'combined' | 'alone' | null;
  subject?: 'she' | 'he';
}): string {
  const words = (input.shoeWords ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.;,\s]+$/, '');
  const he = input.subject === 'he';
  const possessive = he ? 'his' : 'her';
  const pronoun = he ? 'he' : 'she';
  const shown =
    input.imagePlacement === 'combined'
      ? 'the shoes shown at the bottom of Image 2'
      : input.imagePlacement === 'alone'
        ? 'the shoes shown in Image 2'
        : '';
  const shoes = shown ? (words ? `${shown} — ${words} —` : shown) : words || 'the shoes';
  const heel = footwearExpectedHeel(words);
  const shape = [
    heel === 'high'
      ? `High heels: ${possessive} heels lifted on the tall thin heels, each heel post under the heel of ${possessive} foot.`
      : '',
    /\b(?:strap|straps|strappy|sandals?)\b/i.test(words)
      ? 'Keep each strap thin and continuous, both shoes the same.'
      : 'Both shoes the same.',
  ]
    .filter(Boolean)
    .join(' ');
  return [
    `Edit Image 1: the same full picture — ${possessive} whole body head to feet, the same framing, size and position as Image 1 — with only ${possessive} footwear changed: ${pronoun} now wears ${shoes} one on each foot, in place of whatever is on ${possessive} feet.`,
    shape,
    'No other shoes anywhere in the picture.',
    'Change nothing else: the same person, face, outfit, pose, framing, light and background as Image 1, pixel for pixel away from the feet.',
  ].join(' ');
}
