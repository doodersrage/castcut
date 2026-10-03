/**
 * The four offered Story scenes, checked before the player picks one. The queue-time prompt
 * check (still-prompt-audit) repairs the still's prompt, but by then the card the player chose
 * already said it: "they lower their cup" (image models read "they" as more people), a partner
 * in a Solo story, sexual words on a clean one. Here a card is fixed where the fix is certain
 * (the lead's pronoun) and flagged where it is not, so the writer can be asked again.
 */
import { countPoseGuidePeople } from './day-pose-guide';

export type StorySceneIssueCode = 'lead-they' | 'solo-names-partner' | 'sexual-on-clean';

export type StorySceneIssue = { code: StorySceneIssueCode; message: string };

export type StorySceneCheckContext = {
  /** Adult rating. */
  adult: boolean;
  /** Adult story with People → Solo. */
  solo?: boolean;
  /** The lead reads as a man (story-lead-gender). */
  manLead?: boolean;
};

const THEY_RE =
  /\b(?:they|their|theirs|them|themselves|themself|they're|they've|they'll|they'd)\b/i;

/** Words a clean scene never needs; on a clean story they mean the writer ignored the rating. */
const SEXUAL_RE =
  /\b(?:sex|sexual|penetrat\w*|cock|penis|pussy|vagina|clit\w*|nipples?|naked|nude|orgasm\w*|masturbat\w*|blowjob|handjob|cum(?:s|ming)?|erection|aroused|arousal)\b/i;

/** Words that put a second person in the scene even when the pose counter would not. */
const OTHER_PERSON_RE =
  /\b(?:figure|stranger|someone|somebody|anyone|other[’']s|each other|both|together|partner|lover|friend|man|woman|guy|girl|boy|he|him|his)\b/i;

/**
 * Someone besides the lead, named in the scene. Sex words alone do not count: in a Solo story
 * "straddles the ledge" or touching herself is one person (the writer's real Solo scenes were
 * flagged one in fifteen for exactly that).
 */
function namesSomeoneElse(text: string, manLead = false): boolean {
  // "they" is the question being asked, so it does not count as a second person here.
  const withoutThey = text.replace(new RegExp(THEY_RE.source, 'gi'), 'she');
  if (countPoseGuidePeople(withoutThey, { sexVocabulary: false }) >= 2) return true;
  // A man lead's own "he / his" is not someone else.
  const other = manLead
    ? new RegExp(OTHER_PERSON_RE.source.replace('|he|him|his', ''), 'i')
    : OTHER_PERSON_RE;
  return other.test(withoutThey);
}

export function checkStoryScene(
  scene: { title: string; blurb: string },
  context: StorySceneCheckContext
): StorySceneIssue[] {
  const issues: StorySceneIssue[] = [];
  const blurb = scene.blurb ?? '';
  const text = `${scene.title ?? ''}. ${blurb}`;
  if (THEY_RE.test(blurb) && !namesSomeoneElse(blurb, context.manLead)) {
    issues.push({
      code: 'lead-they',
      message: 'The lead is called "they", which an image model reads as more people.',
    });
  }
  if (context.adult && context.solo && namesSomeoneElse(blurb, context.manLead)) {
    issues.push({ code: 'solo-names-partner', message: 'A Solo story scene names a partner.' });
  }
  if (!context.adult && SEXUAL_RE.test(text)) {
    issues.push({ code: 'sexual-on-clean', message: 'A clean story scene has sexual wording.' });
  }
  return issues;
}

const IRREGULAR_VERBS: Record<string, string> = {
  are: 'is',
  were: 'was',
  have: 'has',
  do: 'does',
  go: 'goes',
  "aren't": "isn't",
  "weren't": "wasn't",
  "don't": "doesn't",
  "haven't": "hasn't",
};
/** Words after "they" that stay as they are ("they slowly turn", "they can", "they turned"). */
const KEEP_AFTER_SUBJECT =
  /^(?:can|could|will|would|shall|should|may|might|must|\w+ed|\w+ly|also|still|just|never|always|both|all)$/i;

/** Third person singular of a present-tense verb: lower → lowers, watch → watches, cry → cries. */
function singularVerb(verb: string): string {
  const lower = verb.toLowerCase();
  const irregular = IRREGULAR_VERBS[lower];
  if (irregular) return verb[0] === verb[0]!.toUpperCase() ? capitalise(irregular) : irregular;
  if (KEEP_AFTER_SUBJECT.test(verb) || /s$/i.test(verb)) return verb;
  if (/(?:x|ch|sh|z|o)$/i.test(verb)) return `${verb}es`;
  if (/[^aeiou]y$/i.test(verb)) return `${verb.slice(0, -1)}ies`;
  return `${verb}s`;
}

function capitalise(word: string): string {
  return word[0]!.toUpperCase() + word.slice(1);
}

/** "they lower their cup" → "she lowers her cup" (one person only; see checkStoryScene). */
export function leadPronounsInScene(text: string, manLead = false): string {
  const [subject, object, possessive, reflexive] = manLead
    ? ['he', 'him', 'his', 'himself']
    : ['she', 'her', 'her', 'herself'];
  const keepCase = (source: string, next: string) =>
    source[0] === source[0]!.toUpperCase() ? capitalise(next) : next;
  return (
    text
      .replace(/\b(they)(?:'re)\b/gi, (_m, w: string) => `${keepCase(w, subject)}'s`)
      .replace(/\b(they)(?:'ve)\b/gi, (_m, w: string) => `${keepCase(w, subject)}'s`)
      .replace(
        /\b(they)('ll|'d)\b/gi,
        (_m, w: string, tail: string) => `${keepCase(w, subject)}${tail}`
      )
      // "they slowly turn" → "she slowly turns": the verb after one adverb.
      .replace(
        /\b(they)\s+((?:[a-z]+ly\s+)?)([A-Za-z']+)/gi,
        (_m, w: string, adverb: string, verb: string) =>
          `${keepCase(w, subject)} ${adverb}${singularVerb(verb)}`
      )
      .replace(/\bthey\b/gi, w => keepCase(w, subject))
      .replace(/\b(?:themselves|themself)\b/gi, w => keepCase(w, reflexive))
      .replace(/\btheirs\b/gi, w => keepCase(w, manLead ? 'his' : 'hers'))
      .replace(/\btheir\b/gi, w => keepCase(w, possessive))
      .replace(/\bthem\b/gi, w => keepCase(w, object))
  );
}

/** Fix what is certain; return what still needs the writer. */
export function repairStoryScene<T extends { title: string; blurb: string }>(
  scene: T,
  context: StorySceneCheckContext
): { scene: T; repaired: StorySceneIssueCode[]; remaining: StorySceneIssue[] } {
  const issues = checkStoryScene(scene, context);
  if (issues.length === 0) return { scene, repaired: [], remaining: [] };
  let next = scene;
  if (issues.some(issue => issue.code === 'lead-they')) {
    next = { ...next, blurb: leadPronounsInScene(next.blurb, context.manLead) };
  }
  const remaining = checkStoryScene(next, context);
  const left = new Set(remaining.map(issue => issue.code));
  return {
    scene: next,
    repaired: issues.map(issue => issue.code).filter(code => !left.has(code)),
    remaining,
  };
}
