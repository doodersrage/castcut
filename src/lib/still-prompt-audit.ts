/**
 * Checks a still's edit prompt for contradictions before it is queued — the kind of mistake that
 * only showed up as a bad render: a one-person still whose pose line talks about "the two
 * people" (she danced with a copy of herself), shoes ordered on a barefoot beat (loose feet and
 * heels in the foreground), a sentence about a third image when two are attached.
 *
 * Pure text rules: no model, no render. Used at queue time (a warning, never a block) and by the
 * tests that walk the planner's beats.
 */

export type StillPromptIssueCode =
  | 'solo-mentions-two'
  | 'duo-says-alone'
  | 'image-not-attached'
  | 'shoes-on-barefoot'
  | 'shoes-in-water'
  | 'repeated-line'
  | 'outfit-two-sources'
  | 'template-leftover'
  | 'empty-slot';

export type StillPromptIssue = {
  code: StillPromptIssueCode;
  /** One plain sentence for the player. */
  message: string;
  /** The words that triggered it. */
  evidence: string;
};

export type StillPromptContext = {
  /** People the still is meant to show (the drawn guide's figures, or the planner's count). */
  people?: number;
  /** Images attached to the job (Image 1..N). Unknown: the image rule is skipped. */
  imageCount?: number;
};

const SOLO_DECLARED_RE =
  /\bOne (?:wo)?man alone\b|\bexactly one person\b|\bonly one person\b|\bSOLO(?: LOCK)?\b/;
const DUO_DECLARED_RE = /\bTWO PEOPLE\b|\bTwo people\b|\bwith (?:her|his) partner\b/;
/** Wording that only makes sense with two people in frame. */
const TWO_PEOPLE_RE =
  /\bthe two people\b|\bTWO PEOPLE\b|\bboth people\b|\bface each other\b|\bfacing each other\b|\bthe two of them\b/i;
/** "no second person", "nobody else", "never two people" are guards, not contradictions. */
const NEGATED_BEFORE_RE = /\b(?:no|not|never|without|nobody|avoid|do not show)\b[^.;\n]{0,40}$/i;

const FOOTWEAR_LINE_RE =
  /FOOTWEAR \(mandatory\):[^\n]*|\bon (?:her|his) feet (?:she|he) wears[^.\n]*/i;
const BAREFOOT_RE = /\bbarefoot\b|\bbare feet\b|\bshoes? (?:kicked )?off\b/i;
/** The dressed plate's own shoes, kept by the outfit line. */
const KEEP_PLATE_SHOES_RE =
  /\b(?:the outfit and (?:the )?shoes (?:she|he) (?:has on|wears) in (?:Image 1|the reference photo)|the exact outfit and shoes (?:she|he) wears in the reference photo)\b/i;
// "swimming pool", "swimming costume" and "wading pool" are places and things, not swimming.
const WATER_SCENE_RE =
  /\b(?:swims\b|swimming\b(?! (?:pool|costume|trunks|suit|cap|goggles|lesson))|float(?:s|ing)? on (?:her|his) back\b|underwater\b(?! lights?)|wading\b(?! pool)|treading water\b)/i;

const ORDINALS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };

function firstUnnegated(text: string, pattern: RegExp): string | null {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  for (const match of text.matchAll(new RegExp(pattern.source, flags))) {
    const before = text.slice(Math.max(0, (match.index ?? 0) - 60), match.index ?? 0);
    if (!NEGATED_BEFORE_RE.test(before)) return match[0];
  }
  return null;
}

/** Highest image number the text refers to ("Image 3", "the third image"). */
export function highestImageReference(prompt: string): number {
  let highest = 0;
  for (const match of prompt.matchAll(/\bImage (\d)\b/g)) {
    highest = Math.max(highest, Number(match[1]));
  }
  for (const match of prompt.matchAll(/\b(first|second|third|fourth|fifth) image\b/gi)) {
    highest = Math.max(highest, ORDINALS[match[1]!.toLowerCase()] ?? 0);
  }
  return highest;
}

export function auditStillPrompt(
  prompt: string | null | undefined,
  context: StillPromptContext = {}
): StillPromptIssue[] {
  const text = String(prompt ?? '');
  if (!text.trim()) return [];
  const issues: StillPromptIssue[] = [];
  const add = (code: StillPromptIssueCode, message: string, evidence: string) => {
    if (!issues.some(issue => issue.code === code)) {
      issues.push({ code, message, evidence: evidence.replace(/\s+/g, ' ').trim().slice(0, 120) });
    }
  };

  // The planner's count wins over wording: "a couple of cocktails", "waving to her partner"
  // on a one-figure still are not a second person.
  const duoDeclared =
    typeof context.people === 'number' ? context.people >= 2 : DUO_DECLARED_RE.test(text);
  const soloDeclared = !duoDeclared && (SOLO_DECLARED_RE.test(text) || context.people === 1);

  if (soloDeclared) {
    const two = firstUnnegated(text, TWO_PEOPLE_RE);
    if (two) {
      add(
        'solo-mentions-two',
        'A one-person still describes two people — it may render her twice.',
        two
      );
    }
  }
  if (duoDeclared) {
    const alone = firstUnnegated(text, /\bone (?:wo)?man alone\b/i);
    if (alone) {
      add('duo-says-alone', 'A two-person still also says she is alone.', alone);
    }
  }

  if (typeof context.imageCount === 'number' && context.imageCount > 0) {
    const highest = highestImageReference(text);
    if (highest > context.imageCount) {
      add(
        'image-not-attached',
        `The prompt refers to image ${highest}, but ${context.imageCount} ${
          context.imageCount === 1 ? 'image is' : 'images are'
        } attached.`,
        `Image ${highest}`
      );
    }
  }

  // Shoes are ordered by a FOOTWEAR line, or by the dressed plate's "the outfit and the shoes
  // she has on in Image 1" (a scene written "beneath her bare feet" got both).
  const footwearLine =
    FOOTWEAR_LINE_RE.exec(text)?.[0] ?? KEEP_PLATE_SHOES_RE.exec(text)?.[0] ?? '';
  const shoesOrdered = Boolean(footwearLine) && !BAREFOOT_RE.test(footwearLine);
  if (shoesOrdered) {
    const rest = text.replace(footwearLine, ' ');
    const barefoot = firstUnnegated(rest, BAREFOOT_RE);
    if (barefoot) {
      add('shoes-on-barefoot', 'Shoes are ordered on a barefoot scene.', barefoot);
    }
    const water = WATER_SCENE_RE.exec(rest)?.[0];
    if (water) {
      add('shoes-in-water', 'Shoes are ordered on a swimming scene.', water);
    }
  }

  for (const label of ['Pose: ', 'FOOTWEAR (mandatory):', 'OUTFIT (mandatory):', 'SCENE:']) {
    if (text.split(label).length - 1 > 1) {
      add('repeated-line', `The prompt has two "${label.trim()}" lines.`, label);
    }
  }

  const outfitSources = new Set(
    [
      ...text.matchAll(
        /\bwears (?:exactly )?the outfit[^.\n]{0,40}?\b(first|second|third) image\b/gi
      ),
    ].map(match => match[1]!.toLowerCase())
  );
  if (outfitSources.size > 1) {
    add(
      'outfit-two-sources',
      'The outfit is said to come from two different images.',
      [...outfitSources].join(' and ')
    );
  }

  const leftover = /\{\{[^}]{1,40}\}\}|\[object Object\]|\bundefined\b|\bNaN\b/.exec(text)?.[0];
  if (leftover) {
    add('template-leftover', 'The prompt contains an unfilled placeholder.', leftover);
  }
  const empty =
    /\b(?:Place|Moment|Pose|SCENE|ACTION|OUTFIT \(mandatory\)|FOOTWEAR \(mandatory\)):[ \t]*(?:\.|$)/.exec(
      text
    )?.[0];
  if (empty) {
    add('empty-slot', 'A line in the prompt is empty.', empty);
  }

  return issues;
}

/**
 * Repair what can be repaired without guessing, so the still goes out right instead of with a
 * warning: shoes ordered where the scene rules them out (the footwear line goes), a two-person
 * still that also says she is alone (that phrase goes), a line that appears twice (the first
 * stays). Everything else — a one-person still describing two people, an image that is not
 * attached — needs the cause fixed and is left for the notice. Returns the prompt to queue, what
 * was repaired, and what is still wrong.
 */
export function repairStillPrompt(
  prompt: string,
  context: StillPromptContext = {}
): { prompt: string; repaired: StillPromptIssue[]; remaining: StillPromptIssue[] } {
  const issues = auditStillPrompt(prompt, context);
  if (issues.length === 0) return { prompt, repaired: [], remaining: [] };
  let next = prompt;
  const has = (code: StillPromptIssueCode) => issues.some(issue => issue.code === code);
  if (has('shoes-on-barefoot') || has('shoes-in-water')) {
    next = next
      .replace(/^[ \t]*FOOTWEAR \(mandatory\):[^\n]*\n?/gm, '')
      .replace(/\s*\b(?:On|on) (?:her|his) feet (?:she|he) wears[^.\n]*\./g, '')
      .replace(/\bthe outfit and the shoes shown in\b/g, 'the outfit shown in')
      // The dressed plate keeps its outfit, not its shoes, on a barefoot or swimming scene.
      .replace(
        /\bthe outfit and (?:the )?shoes ((?:she|he) (?:has on|wears) in)\b/g,
        'the outfit $1'
      )
      .replace(/\bthe exact outfit and shoes ((?:she|he) wears in)\b/g, 'the exact outfit $1');
  }
  if (has('duo-says-alone')) {
    next = next
      .replace(/,\s*one (?:wo)?man alone(?=,|\.|;|$)/gi, '')
      .replace(/\bOne (?:wo)?man alone[.,]?\s*/g, '');
  }
  if (has('repeated-line')) {
    for (const label of ['FOOTWEAR (mandatory):', 'OUTFIT (mandatory):', 'SCENE:']) {
      let seen = false;
      next = next
        .split('\n')
        .filter(line => {
          if (!line.trimStart().startsWith(label)) return true;
          if (seen) return false;
          seen = true;
          return true;
        })
        .join('\n');
    }
  }
  const remaining = auditStillPrompt(next, context);
  const stillWrong = new Set(remaining.map(issue => issue.code));
  return {
    prompt: next,
    repaired: issues.filter(issue => !stillWrong.has(issue.code)),
    remaining,
  };
}

/** One line for a notice: "Prompt check (afternoon): …; …". */
export function stillPromptIssuesLine(issues: StillPromptIssue[], label?: string): string {
  if (issues.length === 0) return '';
  const where = label?.trim() ? ` (${label.trim()})` : '';
  return `Prompt check${where}: ${issues.map(issue => issue.message).join(' ')}`;
}
