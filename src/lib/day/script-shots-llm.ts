/**
 * An LLM's shot list for a script scene (the optional "LLM shot draft"): a director's coverage
 * read from the scene — where a wide, an insert or a reaction tells it best — where the
 * deterministic draft (script-shots.ts) only follows the lines. The reply is held to the scene:
 * purposes and framings from the fixed lists, people from its speakers, each dialogue shot naming
 * a line of the scene by its number (so the line is the script's, word for word), lengths in
 * range. An unusable reply is null — the caller keeps the deterministic draft. Pure, but for the
 * client fetch.
 */
import type { CameraShot } from '../pose/camera-shot';
import type { ScriptScene } from '../script/parse';
import { speakerKey } from './script-cast';
import {
  lineSeconds,
  SHOT_PURPOSES,
  SHOTS_PER_SCENE,
  type PlannedShot,
  type ShotPurpose,
} from './script-shots';

const FRAMINGS: readonly CameraShot[] = ['full', 'knees', 'waist', 'head'];
/** At most this many shots asked for (a scene's coverage, not every possible angle). */
const LLM_SHOTS_MAX = 12;
const TEXT_MAX = 400;

/** The scene's dialogue lines, in order (what a shot's `line` number points at). */
function dialogueLines(scene: ScriptScene) {
  return scene.elements.filter(element => element.kind === 'dialogue' && element.speaker);
}

export function buildShotDraftMessages(scene: ScriptScene) {
  const lines = dialogueLines(scene);
  const body = scene.elements
    .filter(element => element.kind === 'action' || element.kind === 'dialogue')
    .map(element =>
      element.kind === 'dialogue'
        ? `LINE ${lines.indexOf(element) + 1} — ${element.speaker}: ${element.text}`
        : `ACTION: ${element.text}`
    )
    .join('\n')
    .slice(0, 6000);
  const system = [
    'You are a film director planning the coverage of one scene: the shots to film, in order.',
    `Reply with JSON only: {"shots":[{"purpose":"establishing|dialogue|reaction|action|insert","framing":"full|knees|waist|head","who":["NAME"],"action":"what we see","line":1,"seconds":3}]} — at most ${LLM_SHOTS_MAX} shots.`,
    'framing: full = whole body (wide), knees = knees up, waist = waist up, head = close-up.',
    'A dialogue shot names the line it covers by its number ("line": 3) and is on the speaker; every line is covered once, in order. A reaction shot is on a listener, with no line.',
    'who: only the people named in the scene. action: one short sentence of what we see, for shots without a line.',
    'Open on where we are when it helps; use an insert for an object that matters; vary the framing; keep it to what the scene says — no new people, places or events.',
  ].join('\n');
  const user = [
    `Scene: ${scene.heading || scene.place || 'untitled'}`,
    scene.speakers.length ? `People: ${scene.speakers.join(', ')}` : 'Nobody speaks.',
    body,
  ].join('\n');
  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];
}

const clean = (value: unknown, max = TEXT_MAX) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** The shots from the LLM's reply, held to the scene — or null when nothing usable came back. */
export function parseShotDraft(
  reply: string | null | undefined,
  scene: ScriptScene
): PlannedShot[] | null {
  const text = (reply ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '');
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  let raw: unknown;
  try {
    raw = (JSON.parse(json) as { shots?: unknown }).shots;
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;
  const lines = dialogueLines(scene);
  const people = new Set(scene.speakers.map(speakerKey));
  const shots: Omit<PlannedShot, 'id'>[] = [];
  for (const entry of raw.slice(0, LLM_SHOTS_MAX)) {
    if (!entry || typeof entry !== 'object') continue;
    const shot = entry as Record<string, unknown>;
    const purpose = SHOT_PURPOSES.includes(shot.purpose as ShotPurpose)
      ? (shot.purpose as ShotPurpose)
      : null;
    const framing = FRAMINGS.includes(shot.framing as CameraShot)
      ? (shot.framing as CameraShot)
      : 'waist';
    if (!purpose) continue;
    const who = Array.isArray(shot.who)
      ? [
          ...new Set(
            shot.who
              .filter((name): name is string => typeof name === 'string')
              .map(speakerKey)
              .filter(name => people.has(name))
          ),
        ]
      : [];
    const number = typeof shot.line === 'number' ? Math.round(shot.line) : NaN;
    const line = purpose === 'dialogue' ? lines[number - 1] : undefined;
    // A dialogue shot without a real line of the scene isn't one.
    if (purpose === 'dialogue' && !line) continue;
    const asked =
      typeof shot.seconds === 'number' && Number.isFinite(shot.seconds) ? shot.seconds : 3;
    const action = clean(shot.action);
    if (line) {
      const speaker = speakerKey(line.speaker!);
      shots.push({
        sceneId: scene.id,
        purpose,
        framing,
        who: who.includes(speaker) ? who : [speaker, ...who],
        line: clean(line.text),
        speaker,
        seconds: Math.min(12, Math.max(lineSeconds(line.text), Math.round(asked))),
      });
    } else {
      shots.push({
        sceneId: scene.id,
        purpose,
        framing,
        who,
        ...(action ? { action } : {}),
        seconds: Math.min(12, Math.max(1, Math.round(asked))),
      });
    }
  }
  if (!shots.length) return null;
  return shots
    .slice(0, SHOTS_PER_SCENE)
    .map((shot, index) => ({ ...shot, id: `${scene.id}~${index + 1}` }));
}

/** Ask `/api/script-shots` for the scene's LLM draft (client); rejects with the server's message. */
export async function requestShotDraft(
  scene: ScriptScene,
  llmBody?: Record<string, unknown>
): Promise<PlannedShot[]> {
  const response = await fetch('/api/script-shots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ scene, ...llmBody }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    shots?: PlannedShot[];
    error?: string;
  };
  if (!response.ok || !Array.isArray(data.shots)) {
    throw new Error(data.error ?? 'The LLM draft failed.');
  }
  return data.shots;
}
