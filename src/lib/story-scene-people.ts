/**
 * How many people a Story scene's pose map should draw, when the words settle it. The pose
 * counter (countPoseGuidePeople) reads pair words ("together", "the two", a hug) but not a
 * second person named by a plain noun: "a man in a velvet vest offers her a seat", "the barista
 * hands him a pastry". Day passes its own planned headcount; Story has only the words, and one
 * recorded writer scene in ten named someone the counter missed, so it was drawn alone.
 */
import { countPoseGuidePeople } from './day-pose-guide';

const PERSON_NOUNS =
  '(?:man|woman|men|women|guy|girl|boy|stranger|friend|brother|sister|mother|father|mom|dad|partner|lover|boyfriend|girlfriend|husband|wife|neighbou?r|florist|barista|waiter|waitress|bartender|vendor|clerk|driver|officer|doctor|nurse|teacher|customer|child|kid|companion|colleague|co-?worker|boss|grand(?:mother|father|ma|pa)|aunt|uncle|cousin|son|daughter|figure|passenger|conductor|librarian|musician|dancer|chef|fisherman|sailor|guard|shopkeeper|baker|postman|courier|tourist)';

/** "a man in a velvet vest", "the barista", "her brother" — not "the man's coat". */
const SECOND_PERSON_RE = new RegExp(
  `\\b(?:a|an|the|her|his|their|another|one|some)\\s+(?:[a-z’'-]+\\s+){0,2}${PERSON_NOUNS}\\b(?![’']s\\b)`,
  'i'
);

/** The scene says she is alone. */
const ALONE_RE =
  /\b(?:alone|by (?:her|him|them)sel(?:f|ves)|on (?:her|his) own|no one else|nobody else|empty (?:room|street|station|platform|carriage))\b/i;

/** True when the scene names a second person the pose counter does not count. */
export function storySceneNamesSecondPerson(text: string | null | undefined): boolean {
  // Older saved scenes can have a title and no description.
  const scene = text?.trim() || '';
  if (!scene || ALONE_RE.test(scene)) return false;
  return countPoseGuidePeople(scene, { sexVocabulary: false }) < 2 && SECOND_PERSON_RE.test(scene);
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
