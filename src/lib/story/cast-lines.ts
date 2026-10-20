/**
 * The Cast's own details in Story (2026-10-14): marks, props and the people in their life were
 * Day-only — Story stills never said the lead's glasses or tattoo, and Story's writer, the one
 * place Casts actually pair up, never knew that another Cast is her sister. Here:
 *
 * - storyCastLines: the marks and props lines Day's stills carry, for a Story still.
 * - storyPeopleLine: who the lead's people are, for the writer (family never romantic).
 * - storyFamilyRomance: a scene that puts family in a romantic or sexual part — never queued.
 */

import { castMarksLine } from '../cast/marks';
import { placeRoomOfSetting, resolveCastPlace } from '../cast/places';
import { castPropsLine } from '../cast/props';
import { castRelationInfo, normalizeCastRelationships } from '../cast/relationships';
import { activeLook, looksOf, type CastRelationKind, type CharacterRecord } from '../character/os';

type CastLike =
  | (Pick<CharacterRecord, 'marks' | 'props' | 'relationships' | 'places'> & { id?: string })
  | null
  | undefined;

/**
 * Her home or office as the Cast home sets it, when the scene is in a room of either (as Day's
 * room Settings get it, cast-places.ts) — '' elsewhere. Story's writer already gets the place in
 * the Setting it is sent; a scene's own words ("back in her kitchen") never did.
 */
/** Story is anywhere (a castle bedroom, a ship's galley): only a room the scene says is theirs. */
const OWN_PLACE_RE =
  /\b(?:at home|back home|home from|(?:her|his) (?:own )?(?:apartment|flat|place|home|kitchen|bedroom|bathroom|living room|hallway|balcony|office|desk)|at (?:the|her|his) office|at work)\b/i;

export function storyPlaceLine(cast: CastLike, scene: string, man = false): string {
  if (!OWN_PLACE_RE.test(scene)) return '';
  const where = placeRoomOfSetting(scene);
  if (!where) return '';
  const place = resolveCastPlace(cast, where.kind);
  if (!place) return '';
  const pronoun = man ? 'his' : 'her';
  const head = where.kind === 'home' ? `${pronoun} apartment` : `${pronoun} office`;
  const room = place.rooms[where.room];
  return `The place is ${head}, the same every time: ${place.style}${room ? `; ${room}` : ''}.`;
}

/** Day's lines are written for a woman; a man lead's are swapped word by word. */
function forMan(line: string): string {
  return line
    .replace(/\bShe\b/g, 'He')
    .replace(/\bshe\b/g, 'he')
    .replace(/\bHer\b/g, 'His')
    .replace(/\bher\b/g, 'his');
}

/** Marks that show in this scene, and the props it mentions — '' when neither. */
export function storyCastLines(
  cast: CastLike,
  input: {
    scene: string;
    outfit?: string | null;
    setting?: string | null;
    undressed?: boolean;
    man?: boolean;
  }
): string {
  const lines = [
    castMarksLine(cast?.marks, {
      outfit: input.outfit,
      beat: input.scene,
      undressed: input.undressed,
    }),
    castPropsLine(cast?.props, { beat: input.scene, setting: input.setting }),
  ].filter(Boolean);
  const text = lines.join('\n');
  // Adult stills pick their own room (as on Day); clothed ones are set in her place.
  const place = input.undressed ? '' : storyPlaceLine(cast, input.scene, input.man);
  return [input.man ? forMan(text) : text, place].filter(Boolean).join('\n');
}

/** Words for "Sam is her ___" (gender-free on purpose, like Day's pair words). */
const KIND_WORDS: Record<CastRelationKind, string> = {
  partner: 'partner',
  spouse: 'spouse',
  ex: 'ex',
  'best-friend': 'best friend',
  friend: 'friend',
  roommate: 'roommate',
  coworker: 'coworker',
  rival: 'rival',
  sibling: 'sibling',
  cousin: 'cousin',
  parent: 'parent',
  child: 'grown child',
};

export type StoryPerson = { name: string; kind: CastRelationKind; family: boolean };

/** The lead's people that are Casts with a name. */
export function storyPeople(
  cast: CastLike,
  lookup: (castId: string) => { name?: string } | null | undefined
): StoryPerson[] {
  return (normalizeCastRelationships(cast?.relationships) ?? []).flatMap(item => {
    const name = lookup(item.castId)?.name?.trim();
    return name ? [{ name, kind: item.kind, family: castRelationInfo(item.kind).family }] : [];
  });
}

/**
 * For the writer: "People in her life: Sam is her sibling (family — never romantic or sexual);
 * Tomas is her partner." '' when the lead has none.
 */
export function storyPeopleLine(people: StoryPerson[], man = false): string {
  if (!people.length) return '';
  const pronoun = man ? 'his' : 'her';
  const parts = people.map(
    person =>
      `${person.name} is ${pronoun} ${KIND_WORDS[person.kind]}${
        person.family
          ? ' (family — never romantic or sexual)'
          : castRelationInfo(person.kind).romantic
            ? ''
            : ' (not romantic)'
      }`
  );
  return `People in ${pronoun} life, if they appear: ${parts.join('; ')}.`;
}

const ROMANTIC_RE =
  /\b(?:kiss(?:es|ed|ing)?|date|dating|romantic|romance|lovers?|making love|make love|sex|sexual|naked|nude|undress(?:es|ed|ing)?|in bed together|seduc\w*|aroused|caress\w*|intimate|intimacy|straddl\w*|thrust\w*|oral)\b/i;

/**
 * A family member of the lead named in a romantic or sexual scene (or any scene of an adult
 * Story): the family member's name, else null.
 */
export function storyFamilyRomance(
  sceneText: string,
  people: StoryPerson[],
  adultStory: boolean
): string | null {
  const text = sceneText ?? '';
  if (!adultStory && !ROMANTIC_RE.test(text)) return null;
  for (const person of people) {
    if (!person.family) continue;
    const escaped = person.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) return person.name;
  }
  return null;
}

/**
 * Story's hints with the active look's Look notes (CharacterLook.lookNotes): hints that are one
 * of this Cast's looks' notes (left by "Story from this look") are swapped for the active look's,
 * so switching looks switches the mood, light and palette the writer is given; the player's own
 * hints are kept, with the active look's notes after them.
 */
export function storyHintsWithLook(
  hints: string | null | undefined,
  cast: CharacterRecord | null | undefined
): string | undefined {
  const own = hints?.trim() ?? '';
  const notes = cast ? activeLook(cast).lookNotes?.trim() : '';
  if (!cast || !notes) return own || undefined;
  const lookNotes = new Set(
    looksOf(cast)
      .map(look => look.lookNotes?.trim())
      .filter(Boolean)
  );
  if (!own || lookNotes.has(own)) return notes;
  return own.includes(notes) ? own : `${own}\n${notes}`;
}
