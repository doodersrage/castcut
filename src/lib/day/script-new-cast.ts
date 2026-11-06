/**
 * A script's recurring parts as new Cast members (2026-11-06): an episode's minor characters —
 * Tommy, Mrs. Gable — spoke 15 parts' lines over Lena's face, because only Cast members have a
 * face to render. A part that comes back (lines in two scenes, or three lines) and isn't in the
 * Cast can be made one: your LLM reads their lines and picks how they look (sex, age, build,
 * hair; the rest is rolled as on Cast's own create), the Cast member is made, their plate is
 * rendered from that, and Who's who points the part at them — their shots then show them.
 *
 * Never a child: a part named as one (a little girl, a teenager) stays a stranger. Nor a numbered
 * extra ("CUSTOMER #2") or a bare role ("WOMAN") — a different person each time. Pure.
 */

import type { ParsedScript } from '../script/parse';
import type {
  CharacterAgeBand,
  CharacterAppearanceFormDraft,
  CharacterBodyBuild,
  CharacterHairColor,
  CharacterHairLength,
} from '../character/appearance';
import { speakerKey, type SpeakerResolution } from './script-cast';

/** Parts never made Cast: anyone the script names as a child. */
const CHILD_PART =
  /\b(?:girl|boy|kid|kids|child|children|teen|teens|teenager|teenagers|baby|toddler|minor|schoolgirl|schoolboy|youngster|son|daughter)\b/i;
/** A role alone or a numbered extra: a different person each time, not a character. */
const ROLE_ONLY =
  /^(?:A |AN |THE )?(?:MAN|WOMAN|PERSON|CUSTOMER|TOURIST|WAITER|WAITRESS|BARISTA|VOICE|CROWD|STRANGER|NEIGHBOU?R|GUEST|CLERK|DRIVER|OFFICER|LOCAL|REPORTER|NURSE|DOCTOR|ALL|EVERYONE|OTHERS?)(?: ?#?\d+)?$/;

export type RecurringPart = { speaker: string; lines: number; scenes: number };

/** A part with this many lines, or lines in this many scenes, comes back. */
export const RECURRING_LINES = 3;
export const RECURRING_SCENES = 2;

/** Whether a part may become a Cast member at all (an adult character, named). */
export function partCanBeCast(speaker: string): boolean {
  const key = speakerKey(speaker);
  return Boolean(key) && !CHILD_PART.test(key) && !ROLE_ONLY.test(key) && !/#\s*\d+$/.test(key);
}

/**
 * The parts worth a Cast member: not in the Cast yet (not known, or only suggested — never one
 * you set to "Not in the Cast"), a character, and coming back. Most lines first.
 */
export function recurringScriptParts(
  parsed: Pick<ParsedScript, 'scenes'>,
  resolved: readonly SpeakerResolution[]
): RecurringPart[] {
  const open = new Set(
    resolved.filter(part => part.status === 'unknown').map(part => part.speaker)
  );
  const counts = new Map<string, { lines: number; scenes: Set<string> }>();
  for (const scene of parsed.scenes) {
    for (const element of scene.elements) {
      if (element.kind !== 'dialogue' || !element.speaker) continue;
      const key = speakerKey(element.speaker);
      if (!open.has(key) || !partCanBeCast(key)) continue;
      const entry = counts.get(key) ?? { lines: 0, scenes: new Set<string>() };
      entry.lines += 1;
      entry.scenes.add(scene.id);
      counts.set(key, entry);
    }
  }
  return [...counts]
    .map(([speaker, entry]) => ({ speaker, lines: entry.lines, scenes: entry.scenes.size }))
    .filter(part => part.lines >= RECURRING_LINES || part.scenes >= RECURRING_SCENES)
    .sort((a, b) => b.lines - a.lines || a.speaker.localeCompare(b.speaker));
}

/** What the LLM reads about a part: where they speak and a few of their lines and stage words. */
export function scriptPartExcerpt(parsed: Pick<ParsedScript, 'scenes'>, speaker: string): string {
  const key = speakerKey(speaker);
  const name = key.split(' ')[0]!.toLowerCase();
  const out: string[] = [];
  for (const scene of parsed.scenes) {
    if (!scene.speakers.some(entry => speakerKey(entry) === key)) continue;
    out.push(scene.heading);
    for (const element of scene.elements) {
      if (element.kind === 'dialogue' && element.speaker && speakerKey(element.speaker) === key) {
        out.push(`${key}: ${element.text}`);
      } else if (element.kind === 'action' && element.text.toLowerCase().includes(name)) {
        out.push(element.text);
      }
    }
    if (out.join('\n').length > 1600) break;
  }
  return out.join('\n').slice(0, 1800);
}

const AGE_BANDS: readonly CharacterAgeBand[] = [
  'early-20s',
  'late-20s',
  '30s',
  '40s',
  '50s',
  '60s',
];
const BUILDS: readonly CharacterBodyBuild[] = [
  'petite',
  'slender',
  'average',
  'athletic',
  'curvy',
  'muscular',
  'stocky',
  'heavyset',
];
const HAIR_COLORS: readonly CharacterHairColor[] = [
  'black',
  'dark-brown',
  'brown',
  'light-brown',
  'auburn',
  'red',
  'strawberry-blonde',
  'blonde',
  'platinum-blonde',
  'grey',
  'white',
];
const HAIR_LENGTHS: readonly CharacterHairLength[] = [
  'bald',
  'buzzed',
  'short',
  'chin-length',
  'shoulder-length',
  'long',
  'very-long',
];

type ChatMessage = { role: 'system' | 'user'; content: string };

export function newCastPartMessages(input: {
  speaker: string;
  excerpt: string;
  title?: string;
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'You are a casting director. From a character’s lines, say how they look. Reply with JSON only: ' +
        `{"sex": "woman" | "man", "age": ${AGE_BANDS.map(band => `"${band}"`).join(' | ')}, ` +
        `"build": ${BUILDS.map(build => `"${build}"`).join(' | ')}, ` +
        `"hairColor": ${HAIR_COLORS.map(color => `"${color}"`).join(' | ')}, ` +
        `"hairLength": ${HAIR_LENGTHS.map(length => `"${length}"`).join(' | ')}}. ` +
        'Every character is an adult (at least in their early twenties). When the lines don’t say, pick what suits the part.',
    },
    {
      role: 'user',
      content: [
        input.title ? `The screenplay: “${input.title}”.` : '',
        `The character: ${speakerKey(input.speaker)}.`,
        `Where they appear and what they say:\n${input.excerpt}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
}

const pick = <T extends string>(list: readonly T[], value: unknown): T | 'random' =>
  typeof value === 'string' && (list as readonly string[]).includes(value.trim().toLowerCase())
    ? (value.trim().toLowerCase() as T)
    : 'random';

/** The LLM's casting note as a create-form draft: unknown or missing traits are rolled. */
export function parseNewCastPart(
  reply: string | null | undefined
): Partial<CharacterAppearanceFormDraft> | null {
  const text = (reply ?? '').replace(/```(?:json)?/gi, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const sex = json.sex === 'man' || json.sex === 'woman' ? json.sex : null;
  if (!sex) return null;
  return {
    sex,
    ageBand: pick(AGE_BANDS, json.age),
    bodyBuild: pick(BUILDS, json.build),
    hairColor: pick(HAIR_COLORS, json.hairColor),
    hairLength: pick(HAIR_LENGTHS, json.hairLength),
    ethnicity: 'random',
    height: 'random',
  };
}

/** "MRS. GABLE" → "Mrs. Gable", "TOMMY" → "Tommy". */
export function partDisplayName(speaker: string): string {
  return speakerKey(speaker)
    .toLowerCase()
    .replace(
      /(^|[\s.'’-])(\p{L})/gu,
      (_, gap: string, letter: string) => gap + letter.toUpperCase()
    );
}
