/**
 * How many people a Story scene's pose map should draw, when the words settle it. The pose
 * counter (countPoseGuidePeople) reads pair words ("together", "the two", a hug) but not a
 * second person named by a plain noun: "a man in a velvet vest offers her a seat", "the barista
 * hands him a pastry". Day passes its own planned headcount; Story has only the words, and one
 * recorded writer scene in ten named someone the counter missed, so it was drawn alone.
 */
import { countPoseGuidePeople } from './day-pose-guide';

/** Words that are always a person. */
const PERSON_NOUNS =
  '(?:man|woman|men|women|person|guy|girl|boy|stranger|visitor|newcomer|passer-?by|friend|brother|sister|mother|father|mom|dad|partner|lover|boyfriend|girlfriend|husband|wife|neighbou?r|child|kid|companion|colleague|co-?worker|boss|grand(?:mother|father|ma|pa)|aunt|uncle|cousin|son|daughter|figure)';

/**
 * Jobs and roles, which also name places and things ("outside the florist", "the passenger
 * seat", "a vendor tray"): a person only while doing something — "the barista hands him a
 * pastry", "a vendor who waves".
 */
const ROLE_NOUNS =
  '(?:florist|barista|waiter|waitress|bartender|vendor|clerk|driver|officer|doctor|nurse|teacher|customer|passenger|conductor|librarian|musician|dancer|chef|fisherman|sailor|guard|shopkeeper|baker|postman|courier|tourist)';

/** A role followed by what the person does: "who …" or a present-tense verb. */
const ROLE_ACTING_RE = new RegExp(
  `\\b(?:a|an|the|her|his|their|another|one|some)\\s+(?:[a-z’'-]+\\s+){0,2}${ROLE_NOUNS}\\s+(?:who\\b|(?!is\\b|was\\b|has\\b)[a-z]+(?:s|es)\\b)`,
  'i'
);

/**
 * A role placed beside the lead, ending its phrase or doing something: "slips past a startled
 * security guard, leaving…", "toward a guard still clutching his radio". Not "outside the
 * florist" or "the passenger seat": only the prepositions that put a person next to her, and the
 * role must end the phrase or go on with an -ing verb. Live 2026-10-05, the guard was missed, the
 * guide drew one body and the still drew the lead twice beside him.
 */
const ROLE_PLACED_RE = new RegExp(
  `\\b(?:past|beside|alongside|next to|behind|toward|towards|facing|near|with)\\s+(?:a|an|the|her|his|their|another|one|some)\\s+(?:[a-z’'-]+\\s+){0,2}${ROLE_NOUNS}(?:\\s*(?:[,.;:!?—–]|$)|\\s+(?:still\\s+)?[a-z]+ing\\b)`,
  'i'
);

/** "a man in a velvet vest", "the barista", "her brother" — not "the man's coat". */
const SECOND_PERSON_RE = new RegExp(
  `\\b(?:a|an|the|her|his|their|another|one|some)\\s+(?:[a-z’'-]+\\s+){0,2}${PERSON_NOUNS}\\b(?![’']s\\b)`,
  'i'
);

/** The scene says she is alone. */
const ALONE_RE =
  /\b(?:alone|by (?:her|him|them)sel(?:f|ves)|on (?:her|his) own|no one else|nobody else|empty (?:room|street|station|platform|carriage))\b/i;

/**
 * Someone named but not in the picture: "waiting for a friend", "waving down a friend across the
 * plaza", "texting her sister". Day's own solo beats read like this.
 */
const ABSENT_PERSON_RE = new RegExp(
  `\\b(?:waiting (?:for|on)|waits for|waving(?: down| to| at| goodbye to)?|waves(?: down| to| at)?|looking for|searching for|text(?:ing|s)?|call(?:ing|s)?|messag(?:ing|es)|thinking (?:about|of)|miss(?:ing|es)|writ(?:ing|es) to|on the phone (?:with|to)|a photo of|a picture of)\\s+(?:a|an|the|her|his|their|another|one|some)\\s+(?:[a-z’'-]+\\s+){0,2}(?:${PERSON_NOUNS}|${ROLE_NOUNS})\\b`,
  'gi'
);

/** True when the scene names a second person the pose counter does not count. */
export function storySceneNamesSecondPerson(text: string | null | undefined): boolean {
  // Older saved scenes can have a title and no description.
  const scene = text?.trim() || '';
  if (!scene || ALONE_RE.test(scene)) return false;
  if (countPoseGuidePeople(scene, { sexVocabulary: false }) >= 2) return false;
  const present = scene.replace(ABSENT_PERSON_RE, ' ');
  return (
    SECOND_PERSON_RE.test(present) || ROLE_ACTING_RE.test(present) || ROLE_PLACED_RE.test(present)
  );
}

/**
 * The headcount Story passes to the pose guide: one on an adult story set to Solo, two when the
 * scene names someone the counter misses, otherwise left to the counter. A pose the player
 * picked is drawn as picked.
 */
export function storyPoseForcePeople(input: {
  text: string | null | undefined;
  adult: boolean;
  solo: boolean;
  playerPosed: boolean;
}): 1 | 2 | undefined {
  if (input.playerPosed) return undefined;
  if (input.adult && input.solo) return 1;
  return storySceneNamesSecondPerson(input.text) ? 2 : undefined;
}
