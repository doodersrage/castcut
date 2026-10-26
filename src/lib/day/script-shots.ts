/**
 * A script scene's shot list (M3 S4): a proposed list you edit, kept on the script
 * (`SavedScript.shots`). The draft is deterministic — an establishing wide, then the dialogue
 * covered line by line (a medium for a speaker's first line, close-ups after), a reaction when an
 * exchange ends, or the action in a few shots when nobody speaks. "Make it a Scene" turns a shot
 * into a `SavedScene` with the place, the beat, the line, the camera and the Cast filled in, and
 * links the two both ways (`madeSceneId`; the Scene's `fromScript`). Pure.
 */
import { DAY_PARTS, type DayPart } from './parts';
import type { DaySlot } from './planner';
import type { CameraShot } from '../pose/camera-shot';
import type { ScriptScene } from '../script/parse';
import { resolvePlaces, resolveSpeakers, speakerKey, type ScriptCastMember } from './script-cast';

export type ShotPurpose = 'establishing' | 'dialogue' | 'reaction' | 'action' | 'insert';

export const SHOT_PURPOSES: readonly ShotPurpose[] = [
  'establishing',
  'dialogue',
  'reaction',
  'action',
  'insert',
];

export const SHOT_PURPOSE_LABELS: Record<ShotPurpose, string> = {
  establishing: 'Establishing',
  dialogue: 'Dialogue',
  reaction: 'Reaction',
  action: 'Action',
  insert: 'Insert',
};

/** Framing in the camera row's words (pose/camera-shot.ts). */
export const SHOT_FRAMING_LABELS: Record<CameraShot, string> = {
  full: 'Wide (full body)',
  knees: 'Medium wide (knees up)',
  waist: 'Medium (waist up)',
  head: 'Close-up (head)',
};

export type PlannedShot = {
  id: string;
  /** The script scene it covers (script/parse.ts ids). */
  sceneId: string;
  purpose: ShotPurpose;
  framing: CameraShot;
  /** Speaking parts in it (speaker keys). */
  who: string[];
  /** What happens (the beat). */
  action?: string;
  /** The dialogue it covers, and who says it. */
  line?: string;
  speaker?: string;
  /** About how long, in seconds. */
  seconds: number;
  /** The Scene made from it (unset: not yet, or that Scene is gone). */
  madeSceneId?: string;
};

export const SHOTS_PER_SCENE = 24;
const SHOTS_PER_SCRIPT = 600;
const TEXT_MAX = 400;

const clean = (value: unknown, max = TEXT_MAX) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** About how long a line takes to say: 2.5 words a second, a beat either side. */
export function lineSeconds(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.min(12, Math.max(2, Math.round(words / 2.5 + 1)));
}

/** The deterministic draft for one script scene. */
export function draftShots(scene: ScriptScene): PlannedShot[] {
  const shots: Omit<PlannedShot, 'id'>[] = [];
  const action = scene.elements.filter(element => element.kind === 'action');
  const dialogue = scene.elements.filter(element => element.kind === 'dialogue' && element.speaker);
  const everyone = scene.speakers.map(speakerKey);
  shots.push({
    sceneId: scene.id,
    purpose: 'establishing',
    framing: 'full',
    who: everyone,
    ...(action[0] ? { action: clean(action[0].text) } : {}),
    seconds: 3,
  });
  if (dialogue.length) {
    const spoken = new Set<string>();
    dialogue.forEach((element, index) => {
      const speaker = speakerKey(element.speaker!);
      shots.push({
        sceneId: scene.id,
        purpose: 'dialogue',
        framing: spoken.has(speaker) ? 'head' : 'waist',
        who: [speaker],
        line: clean(element.text),
        speaker,
        seconds: lineSeconds(element.text),
      });
      spoken.add(speaker);
      // An exchange ends (the next line is the same speaker's, or the last): the listener reacts.
      const next = dialogue[index + 1];
      const nextSpeaker = next ? speakerKey(next.speaker!) : null;
      const listener = everyone.find(name => name !== speaker);
      const previous = dialogue[index - 1];
      const inExchange = previous && speakerKey(previous.speaker!) !== speaker;
      if (listener && inExchange && nextSpeaker !== listener) {
        shots.push({
          sceneId: scene.id,
          purpose: 'reaction',
          framing: 'head',
          who: [listener],
          seconds: 2,
        });
      }
    });
  } else {
    for (const element of action.slice(1, 4)) {
      shots.push({
        sceneId: scene.id,
        purpose: 'action',
        framing: 'waist',
        who: everyone,
        action: clean(element.text),
        seconds: 4,
      });
    }
  }
  return shots
    .slice(0, SHOTS_PER_SCENE)
    .map((shot, index) => ({ ...shot, id: `${scene.id}~${index + 1}` }));
}

const FRAMINGS: readonly CameraShot[] = ['full', 'knees', 'waist', 'head'];

export function normalizePlannedShots(value: unknown): PlannedShot[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const out: PlannedShot[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const shot = raw as Partial<PlannedShot>;
    const id = clean(shot.id, 120);
    const sceneId = clean(shot.sceneId, 100);
    if (!id || !sceneId || seen.has(id)) continue;
    seen.add(id);
    const action = clean(shot.action);
    const line = clean(shot.line);
    const speaker = clean(shot.speaker, 80);
    const madeSceneId = clean(shot.madeSceneId, 80);
    const seconds = Number(shot.seconds);
    out.push({
      id,
      sceneId,
      purpose: SHOT_PURPOSES.includes(shot.purpose as ShotPurpose)
        ? (shot.purpose as ShotPurpose)
        : 'action',
      framing: FRAMINGS.includes(shot.framing as CameraShot)
        ? (shot.framing as CameraShot)
        : 'waist',
      who: (Array.isArray(shot.who) ? shot.who : [])
        .map(name => speakerKey(clean(name, 80)))
        .filter(Boolean)
        .slice(0, 8),
      ...(action ? { action } : {}),
      ...(line ? { line } : {}),
      ...(speaker ? { speaker: speakerKey(speaker) } : {}),
      seconds: Number.isFinite(seconds) ? Math.min(120, Math.max(1, Math.round(seconds))) : 3,
      ...(madeSceneId ? { madeSceneId } : {}),
    });
    if (out.length >= SHOTS_PER_SCRIPT) break;
  }
  return out.length ? out : undefined;
}

export function shotsForScene(
  shots: readonly PlannedShot[] | undefined,
  sceneId: string
): PlannedShot[] {
  return (shots ?? []).filter(shot => shot.sceneId === sceneId);
}

/** A script scene's shots replaced (the draft, or after an edit); the others kept in order. */
export function withSceneShots(
  shots: readonly PlannedShot[] | undefined,
  sceneId: string,
  next: readonly PlannedShot[]
): PlannedShot[] {
  const all = shots ?? [];
  const at = all.findIndex(shot => shot.sceneId === sceneId);
  const others = all.filter(shot => shot.sceneId !== sceneId);
  const insert =
    at < 0 ? others.length : all.slice(0, at).filter(s => s.sceneId !== sceneId).length;
  return [...others.slice(0, insert), ...next.slice(0, SHOTS_PER_SCENE), ...others.slice(insert)];
}

/** A new, empty shot at the end of a scene's list (an id no other shot of it has). */
export function addedShot(
  shots: readonly PlannedShot[] | undefined,
  scene: ScriptScene
): PlannedShot {
  const taken = new Set((shots ?? []).map(shot => shot.id));
  let n = shotsForScene(shots, scene.id).length + 1;
  while (taken.has(`${scene.id}~${n}`)) n += 1;
  return {
    id: `${scene.id}~${n}`,
    sceneId: scene.id,
    purpose: 'action',
    framing: 'waist',
    who: scene.speakers.map(speakerKey),
    seconds: 3,
  };
}

/** A short label for a shot in its scene: "1A", "1B" … (scene number, else its place in order). */
export function shotLabel(sceneNumber: string, index: number): string {
  let n = index;
  let letters = '';
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `${sceneNumber}${letters}`;
}

/** Where a script scene is, as a Scene's setting: the Cast's home or office read by Day. */
export function sceneLocationOf(
  scene: Pick<ScriptScene, 'place' | 'setting'>,
  placeMap: Parameters<typeof resolvePlaces>[1]
): string {
  const place = scene.place.trim();
  if (!place) return '';
  const resolved = resolvePlaces([place], placeMap)[0];
  const words = place.toLowerCase();
  if (!resolved) return words;
  if (resolved.choice === 'home') {
    return resolved.room && resolved.room !== words
      ? `${words} (${resolved.room}) at home`
      : `${words} at home`;
  }
  if (resolved.choice === 'work') return `${words} at the office`;
  return scene.setting === 'EXT' ? `${words}, outdoors` : words;
}

export type ShotSceneDraft = {
  name: string;
  slot: DaySlot;
  /** A second Cast member in the shot (a confirmed speaking part). */
  partnerCharacterId?: string;
};

/**
 * What a planned shot becomes as a Scene: its setting from the script scene's place (home or
 * office as you set them), the beat from the shot, the lead's line said on camera (anyone else's
 * written into the beat), the framing on the camera row, the time of day from the heading, and a
 * second confirmed Cast member as the partner. Only confirmed names are used.
 */
export function shotSceneDraft(input: {
  shot: PlannedShot;
  scene: ScriptScene;
  sceneIndex: number;
  shotIndex: number;
  /** The Cast lead the script is for. */
  castId: string;
  cast: readonly ScriptCastMember[];
  castMap: Parameters<typeof resolveSpeakers>[2];
  placeMap: Parameters<typeof resolvePlaces>[1];
}): ShotSceneDraft {
  const { shot, scene, castId, cast } = input;
  const parts = resolveSpeakers(scene.speakers, cast, input.castMap).filter(
    part => part.status === 'confirmed' && part.castId
  );
  const castOf = (speaker: string | undefined) =>
    speaker ? parts.find(part => part.speaker === speakerKey(speaker))?.castId : undefined;
  const nameOf = (speaker: string) => {
    const id = castOf(speaker);
    const member = id ? cast.find(entry => entry.id === id) : undefined;
    return member?.name ?? speaker.charAt(0) + speaker.slice(1).toLowerCase();
  };
  const leadSpeaks = Boolean(shot.line && castOf(shot.speaker) === castId);
  const partner =
    parts.find(part => part.castId !== castId && shot.who.includes(part.speaker)) ??
    parts.find(part => part.castId !== castId);
  const beat = [
    shot.action,
    shot.line && !leadSpeaks && shot.speaker ? `${nameOf(shot.speaker)} says: “${shot.line}”` : '',
    shot.purpose === 'reaction' && shot.who[0] ? `${nameOf(shot.who[0])} reacts.` : '',
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, TEXT_MAX);
  const id: DayPart =
    scene.dayPart && DAY_PARTS.includes(scene.dayPart) ? scene.dayPart : 'afternoon';
  const location = sceneLocationOf(scene, input.placeMap);
  const label = shotLabel(scene.number ?? String(input.sceneIndex + 1), input.shotIndex);
  return {
    name: `${label} ${scene.place || scene.heading || 'Shot'} · ${SHOT_PURPOSE_LABELS[shot.purpose]}`.slice(
      0,
      60
    ),
    slot: {
      id,
      label: label,
      ...(location ? { location } : {}),
      ...(beat ? { sceneHints: beat, sceneHintsTyped: beat } : {}),
      poseCamera: { shot: shot.framing },
      ...(leadSpeaks && shot.line ? { line: shot.line } : {}),
    },
    ...(partner?.castId ? { partnerCharacterId: partner.castId } : {}),
  };
}
