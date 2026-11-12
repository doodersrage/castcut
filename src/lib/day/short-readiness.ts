/**
 * What a short's run needs, said before it starts (UI audit 2026-11-12): her plate, her outfit,
 * a face for each other person the script puts on screen, a room for each scene. Only the plate
 * blocks; stand-ins and rooms the run makes itself at the start — said, so a two-hour run never
 * starts with something you expected to be there missing. Pure.
 */

import { parseScript } from '../script/parse';
import { filmStandInKey } from './partner-stand-in';
import { cueAsName } from './script-shots';

export type ShortReadinessState = 'ready' | 'at-start' | 'missing';

export type ShortReadinessItem = {
  id: string;
  label: string;
  state: ShortReadinessState;
  /** The longer line, for a title. */
  detail: string;
};

/** Voices that are never on screen (a narrator, a voice-over). */
const OFFSCREEN_CUE = /\b(NARRATOR|V\.?O\.?|O\.?S\.?)\b/i;

export function shortReadiness(input: {
  leadName: string;
  hasPlate: boolean;
  /** The outfit set for the short (a kit or photo); unset: each scene picks one. */
  outfit: { set: boolean; summary: string };
  script: { id: string; source: string; castMap?: Record<string, string | null> } | null;
  castId: string;
  castNames?: Readonly<Record<string, string>>;
  scriptPartners?: Readonly<Record<string, unknown>>;
  scriptRooms?: Readonly<Record<string, string>>;
}): ShortReadinessItem[] {
  const lead = input.leadName.trim() || 'Her';
  const items: ShortReadinessItem[] = [
    input.hasPlate
      ? {
          id: 'plate',
          label: `${lead}'s plate`,
          state: 'ready',
          detail: `Every shot starts from ${lead}'s plate.`,
        }
      : {
          id: 'plate',
          label: `${lead}'s plate`,
          state: 'missing',
          detail: `No plate yet — every shot would describe ${lead} in words, so her face can change.`,
        },
    input.outfit.set
      ? {
          id: 'outfit',
          label: `Outfit: ${input.outfit.summary}`,
          state: 'ready',
          detail: 'Every shot wears it, unless a moment picks its own.',
        }
      : {
          id: 'outfit',
          label: 'Outfit: one a scene',
          state: 'at-start',
          detail: 'Each scene picks an outfit for its beat; every shot of that scene wears it.',
        },
  ];
  const script = input.script;
  if (!script) return items;
  const scenes = parseScript(script.source).scenes;
  const castMap = script.castMap ?? {};
  const others = [...new Set(scenes.flatMap(scene => scene.speakers))].filter(
    speaker => castMap[speaker] !== input.castId && !OFFSCREEN_CUE.test(speaker)
  );
  for (const speaker of others) {
    const name = cueAsName(speaker);
    const castMember = castMap[speaker];
    if (castMember) {
      items.push({
        id: `partner-${speaker}`,
        label: `${input.castNames?.[castMember] ?? name}: Cast`,
        state: 'ready',
        detail: `${name} is played by a Cast member, with their own plate.`,
      });
      continue;
    }
    const key = filmStandInKey(script.id, { who: name.toLowerCase() } as never);
    const has = Boolean(input.scriptPartners?.[key] ?? input.scriptPartners?.[script.id]);
    items.push({
      id: `partner-${speaker}`,
      label: has ? `${name}: stand-in` : `${name}: stand-in at the start`,
      state: has ? 'ready' : 'at-start',
      detail: has
        ? `${name} has a stand-in face, the same in every shot.`
        : `${name} gets a stand-in face when the run starts, then the same one in every shot.`,
    });
  }
  if (scenes.length) {
    const roomed = scenes.filter(scene => input.scriptRooms?.[`${script.id}|${scene.id}`]).length;
    items.push({
      id: 'rooms',
      label: `Rooms: ${roomed} of ${scenes.length}`,
      state: roomed === scenes.length ? 'ready' : 'at-start',
      detail:
        roomed === scenes.length
          ? 'Every scene has its room photo: its shots share one room.'
          : 'The rest get a room photo when their first shot renders; the scene’s other shots reuse it.',
    });
  }
  return items;
}
