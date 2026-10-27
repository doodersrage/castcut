/**
 * A script or outline in, Day cards out (roadmap review 2026-10-13: script-to-storyboard, scoped
 * to Day). Fountain — the plain-text screenplay format — gives one card per scene: the heading's
 * place ("INT. KITCHEN - MORNING" → "kitchen", morning), the scene's first action as the beat, and
 * the lead's first line of dialogue as the card's line. Text with no scene headings is an outline:
 * each paragraph (or list item) is a card's beat. No LLM: the player sees the cards before
 * anything renders, and edits them like any typed beat. Client-safe.
 */
import { parseScript } from '../script/parse';
import { DAY_LENGTHS, daySlotsForLength, type DayLength, type DaySlot } from './planner';

export const DAY_SCRIPT_MAX_CARDS = 8;

export type DayScriptScene = {
  /** "kitchen" from "INT. KITCHEN - MORNING"; empty for an outline line. */
  place: string;
  /** "morning" | "afternoon" | "evening" | "night" from the heading, when it says. */
  time?: 'morning' | 'afternoon' | 'evening' | 'night';
  beat: string;
  /** The lead's first line in the scene (or the first line spoken, when no name matched). */
  line?: string;
};

export type DayScript = { format: 'fountain' | 'outline'; scenes: DayScriptScene[] };

function cleanText(text: string, max: number): string {
  return text
    .replace(/\[\[[^\]]*\]\]/g, '') // notes
    .replace(/\/\*[\s\S]*?\*\//g, '') // boneyard
    .replace(/[*_]+/g, '') // emphasis marks
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Read a Fountain screenplay or a plain outline — through the Scene page's reader (script/parse.ts,
 * M6 D4: Day had its own, and the same text read differently in the two), cut down to what a Day
 * card takes: the place, the time of day, the first action as the beat, and who says what.
 */
export function parseDayScript(raw: string): DayScript {
  const parsed = parseScript(raw);
  return {
    format: parsed.format,
    scenes: parsed.scenes
      .map(scene => {
        const action = scene.elements.find(element => element.kind === 'action');
        const dialogue = scene.elements
          .filter(element => element.kind === 'dialogue' && element.speaker)
          .map(element => ({ who: element.speaker!, line: cleanText(element.text, 200) }))
          .filter(entry => entry.line);
        return {
          place: cleanText(scene.place, 120).toLowerCase(),
          ...(scene.dayPart ? { time: scene.dayPart } : {}),
          beat: action ? cleanText(action.text.replace(/^!/, ''), 320) : '',
          ...(dialogue[0] ? { line: dialogue[0].line } : {}),
          ...(dialogue.length ? { dialogue } : {}),
        };
      })
      .filter(scene => scene.beat || scene.dialogue?.length),
  };
}

/** The lead's own words, or the first spoken line when the script names nobody we know. */
function leadLine(
  scene: DayScriptScene & { dialogue?: Array<{ who: string; line: string }> },
  leadName: string
): string | undefined {
  const name = leadName.trim().toUpperCase();
  const own = name ? scene.dialogue?.find(entry => entry.who.toUpperCase() === name) : undefined;
  return (own ?? scene.dialogue?.[0])?.line ?? scene.line;
}

/** Day's beats name nobody: the lead's name becomes she / he (case-insensitive, whole word). */
export function withoutLeadName(text: string, leadName: string, noun: 'woman' | 'man'): string {
  const name = leadName.trim();
  if (!name) return text;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pronoun = noun === 'man' ? 'he' : 'she';
  const possessive = noun === 'man' ? 'his' : 'her';
  return text
    .replace(new RegExp(`\\b${escaped}'s\\b`, 'gi'), possessive)
    .replace(new RegExp(`\\b${escaped}\\b`, 'gi'), pronoun)
    .replace(
      /(^|[.!?]\s+)(she|he|her|his)\b/g,
      (_m, lead: string, word: string) => `${lead}${word[0]!.toUpperCase()}${word.slice(1)}`
    );
}

/** The Day length that holds this many cards (2, 3, 4, 6 or 8). */
export function dayLengthForCards(count: number): DayLength {
  const wanted = Math.min(DAY_SCRIPT_MAX_CARDS, Math.max(1, count));
  return DAY_LENGTHS.find(length => length >= wanted) ?? 8;
}

/**
 * The Day's cards from a script, in script order: place, beat (typed, so used as written) and the
 * lead's line. Cards past the script's scenes are left empty for Suggest day.
 */
export function dayScriptSlots(
  script: DayScript,
  options: { leadName: string; leadNoun: 'woman' | 'man' }
): { length: DayLength; slots: DaySlot[]; used: number; dropped: number } {
  const scenes = script.scenes.slice(0, DAY_SCRIPT_MAX_CARDS);
  const length = dayLengthForCards(scenes.length);
  const slots = daySlotsForLength(length).map((slot, index) => {
    const scene = scenes[index];
    if (!scene) return slot;
    const beat = withoutLeadName(scene.beat, options.leadName, options.leadNoun);
    const line = leadLine(scene, options.leadName);
    return {
      ...slot,
      ...(scene.place ? { location: scene.place } : {}),
      ...(beat ? { sceneHints: beat, sceneHintsTyped: beat } : {}),
      ...(line ? { line } : {}),
    };
  });
  return {
    length,
    slots,
    used: scenes.length,
    dropped: Math.max(0, script.scenes.length - scenes.length),
  };
}
