/**
 * The camera a player picks for a still, in four plain choices — how high it is, which way it
 * looks at her (relative to where she faces), how much of her is in frame, and the lens — and
 * the one prompt line it becomes ("Camera: a low angle looking up at her, three-quarter view,
 * waist-up shot, wide-angle lens.").
 *
 * One system for every place a camera is picked: the 3D pose editor's Camera panel (saved on the
 * rig, pose/rig3d.ts), the Camera row of a Day slot or Story beat (`poseCamera`), and the older
 * single camera pick ('front' | 'side' | 'overhead' | 'low'), which still reads as one of these.
 *
 * Shared (not Play): the queue's engine wrappers recognise the line, so they do not contradict it.
 */

export type CameraHeight = 'low' | 'eye' | 'high' | 'overhead';
export type CameraDirection = 'front' | 'three-quarter' | 'side' | 'back';
export type CameraShot = 'full' | 'knees' | 'waist' | 'head';
export type CameraLens = 'wide' | 'normal' | 'long';

/** A camera pick; an unset field is "auto" (the still keeps what it would have done). */
export type PoseCameraChoice = {
  height?: CameraHeight;
  direction?: CameraDirection;
  shot?: CameraShot;
  lens?: CameraLens;
};

/** Every field set: what the 3D editor's camera is (picked, or read from the numbers). */
export type FullCameraChoice = Required<PoseCameraChoice>;

export const CAMERA_HEIGHTS: readonly CameraHeight[] = ['low', 'eye', 'high', 'overhead'];
export const CAMERA_DIRECTIONS: readonly CameraDirection[] = [
  'front',
  'three-quarter',
  'side',
  'back',
];
export const CAMERA_SHOTS: readonly CameraShot[] = ['full', 'knees', 'waist', 'head'];
export const CAMERA_LENSES: readonly CameraLens[] = ['wide', 'normal', 'long'];

/** The editor's camera before anything is picked: today's front, eye-level, full-body view. */
export const DEFAULT_CAMERA_CHOICE: FullCameraChoice = {
  height: 'eye',
  direction: 'front',
  shot: 'full',
  lens: 'normal',
};

export const CAMERA_HEIGHT_LABELS: Record<CameraHeight, string> = {
  low: 'Low',
  eye: 'Eye level',
  high: 'High',
  overhead: 'Overhead',
};
export const CAMERA_DIRECTION_LABELS: Record<CameraDirection, string> = {
  front: 'Front',
  'three-quarter': 'Three-quarter',
  side: 'Side',
  back: 'Back',
};
export const CAMERA_SHOT_LABELS: Record<CameraShot, string> = {
  full: 'Full body',
  knees: 'Knees up',
  waist: 'Waist up',
  head: 'Head & shoulders',
};
export const CAMERA_LENS_LABELS: Record<CameraLens, string> = {
  wide: 'Wide',
  normal: 'Normal',
  long: 'Long',
};

/** The single picks before the four-part camera, as what they meant. */
const LEGACY_CHOICES: Record<string, PoseCameraChoice> = {
  front: { height: 'eye', direction: 'front' },
  side: { height: 'eye', direction: 'side' },
  overhead: { height: 'overhead' },
  low: { height: 'low' },
};

function pick<T extends string>(raw: unknown, allowed: readonly T[]): T | undefined {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : undefined;
}

/**
 * A stored camera pick, checked field by field: the four-part object, or one of the older single
 * picks ('front', 'side', 'overhead', 'low'). Undefined when nothing in it is a pick.
 */
export function normalizePoseCameraChoice(raw: unknown): PoseCameraChoice | undefined {
  if (typeof raw === 'string') {
    const legacy = LEGACY_CHOICES[raw];
    return legacy ? { ...legacy } : undefined;
  }
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  const height = pick(record.height, CAMERA_HEIGHTS);
  const direction = pick(record.direction, CAMERA_DIRECTIONS);
  const shot = pick(record.shot, CAMERA_SHOTS);
  const lens = pick(record.lens, CAMERA_LENSES);
  const choice: PoseCameraChoice = {
    ...(height ? { height } : {}),
    ...(direction ? { direction } : {}),
    ...(shot ? { shot } : {}),
    ...(lens ? { lens } : {}),
  };
  return cameraChoiceIsSet(choice) ? choice : undefined;
}

/** A complete pick (the 3D editor's), or undefined. */
export function normalizeFullCameraChoice(raw: unknown): FullCameraChoice | undefined {
  const choice = typeof raw === 'object' ? normalizePoseCameraChoice(raw) : undefined;
  return choice?.height && choice.direction && choice.shot && choice.lens
    ? (choice as FullCameraChoice)
    : undefined;
}

export function cameraChoiceIsSet(choice: PoseCameraChoice | null | undefined): boolean {
  return Boolean(choice && (choice.height || choice.direction || choice.shot || choice.lens));
}

/** The pick says where the camera stands (not only the shot size or lens). */
export function cameraChoiceSetsAngle(choice: PoseCameraChoice | null | undefined): boolean {
  return Boolean(choice && (choice.height || choice.direction));
}

export function sameCameraChoice(
  a: PoseCameraChoice | null | undefined,
  b: PoseCameraChoice | null | undefined
): boolean {
  return (
    (a?.height ?? null) === (b?.height ?? null) &&
    (a?.direction ?? null) === (b?.direction ?? null) &&
    (a?.shot ?? null) === (b?.shot ?? null) &&
    (a?.lens ?? null) === (b?.lens ?? null)
  );
}

// ── Words ─────────────────────────────────────────────────────────────────────────────────

type Pronoun = 'her' | 'him' | 'them';
const POSSESSIVE: Record<Pronoun, string> = { her: 'her', him: 'his', them: 'their' };

function heightWords(height: CameraHeight, shot: CameraShot | undefined, who: Pronoun): string {
  switch (height) {
    case 'low':
      // From knee height only reads as low when the whole body is in frame.
      return shot === 'full' || !shot
        ? `a low angle from about knee height looking up at ${who}`
        : `a low angle looking up at ${who}`;
    case 'eye':
      return 'at eye level';
    case 'high':
      return `a high angle from above looking down at ${who}`;
    case 'overhead':
      return `from directly overhead looking straight down at ${who}`;
  }
}

function directionWords(direction: CameraDirection, who: Pronoun): string {
  switch (direction) {
    case 'front':
      return 'front view';
    case 'three-quarter':
      return 'three-quarter view';
    case 'side':
      return 'side view, in profile';
    case 'back':
      return `from behind, ${POSSESSIVE[who]} back to the camera`;
  }
}

function shotWords(shot: CameraShot, who: Pronoun): string {
  switch (shot) {
    case 'full':
      return `full-body shot, ${POSSESSIVE[who]} whole body in frame`;
    case 'knees':
      return 'knees-up shot, cut off just below the knees';
    case 'waist':
      return 'waist-up shot, legs out of frame';
    case 'head':
      return 'head-and-shoulders close-up';
  }
}

const LENS_WORDS: Record<CameraLens, string> = {
  wide: 'wide-angle lens',
  normal: 'normal lens',
  long: 'long telephoto lens',
};

/** The camera pick as one prompt line, or '' when nothing is picked. */
export function cameraChoiceLine(
  choice: PoseCameraChoice | null | undefined,
  options: { who?: Pronoun } = {}
): string {
  const parts = cameraChoicePhrases(choice, options.who ?? 'her');
  return parts.length ? `Camera: ${parts.join(', ')}.` : '';
}

/** The pick in words, without the "Camera:" (for a label: "low angle, waist-up shot"). */
export function cameraChoiceSummary(choice: PoseCameraChoice | null | undefined): string {
  if (!choice) return '';
  return [
    choice.height ? CAMERA_HEIGHT_LABELS[choice.height] : '',
    choice.direction ? CAMERA_DIRECTION_LABELS[choice.direction] : '',
    choice.shot ? CAMERA_SHOT_LABELS[choice.shot] : '',
    choice.lens ? `${CAMERA_LENS_LABELS[choice.lens]} lens` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function cameraChoicePhrases(choice: PoseCameraChoice | null | undefined, who: Pronoun): string[] {
  if (!choice) return [];
  return [
    choice.height ? heightWords(choice.height, choice.shot, who) : '',
    // Straight down there is no front or side to speak of.
    choice.direction && choice.height !== 'overhead' ? directionWords(choice.direction, who) : '',
    choice.shot ? shotWords(choice.shot, who) : '',
    choice.lens ? LENS_WORDS[choice.lens] : '',
  ].filter(Boolean);
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every phrase the line can hold, for any pronoun (a man lead's prompt is swapped later). */
const PICKED_CAMERA_LINE_RE = (() => {
  const phrases = new Set<string>();
  for (const who of ['her', 'him', 'them'] as const) {
    for (const height of CAMERA_HEIGHTS) {
      for (const shot of [undefined, ...CAMERA_SHOTS]) phrases.add(heightWords(height, shot, who));
    }
    for (const direction of CAMERA_DIRECTIONS) phrases.add(directionWords(direction, who));
    for (const shot of CAMERA_SHOTS) phrases.add(shotWords(shot, who));
  }
  for (const lens of CAMERA_LENSES) phrases.add(LENS_WORDS[lens]);
  // A swap may turn "her" into "his" where "him" was meant: accept any of the pronouns.
  const alternation = [...phrases]
    .sort((a, b) => b.length - a.length)
    .map(phrase =>
      escapeRe(phrase).replace(/\b(?:her|him|his|them|their)\b/g, '(?:her|him|his|them|their)')
    )
    .join('|');
  // Ends at its full stop, or where a brief's camera line goes on (" — never …"), or where the
  // queue's appended cues follow it once its stop was taken (prompt-prep's appendUniqueCsv turns
  // "…legs out of frame." at the end of a Story prompt into "…legs out of frame, clean …").
  return new RegExp(
    `Camera: (?:${alternation})(?:, (?:${alternation}))*(?:\\.|(?= —|;|, |\\n|$))`,
    'i'
  );
})();

/** The prompt carries a picked camera line (cameraChoiceLine): nothing else may set the camera. */
export function promptHasPickedCamera(prompt: string | null | undefined): boolean {
  return PICKED_CAMERA_LINE_RE.test(prompt ?? '');
}

/** The picked camera line in a prompt, or null. */
export function pickedCameraLineIn(prompt: string | null | undefined): string | null {
  return PICKED_CAMERA_LINE_RE.exec(prompt ?? '')?.[0] ?? null;
}

/**
 * Framing words elsewhere in a prompt that would fight a picked camera: "full body in frame" on a
 * waist-up shot, "her whole body in frame" in a stock camera line, "full or three-quarter
 * framing", "never a mid-thigh portrait crop". Taken out (or said neutrally) when the pick sets
 * the shot to anything but full body; the picked line itself is left alone.
 */
export function withoutConflictingFraming(
  prompt: string,
  choice: PoseCameraChoice | null | undefined
): string {
  if (!choice?.shot || choice.shot === 'full') return prompt;
  const line = pickedCameraLineIn(prompt);
  const at = line ? prompt.indexOf(line) : -1;
  const scrub = (text: string) =>
    text
      .replace(/,? (?:her|his|their) (?:whole|full) body in frame\b/gi, '')
      .replace(/\s+— (?:her|his|their) whole body in frame\b/gi, '')
      .replace(/,? full body in frame\b/gi, '')
      .replace(/,? both fully in frame\b/gi, '')
      .replace(/\bfull or three-quarter (framing|body)\b/gi, 'framing as the Camera line says')
      .replace(/\s*(?:—|;|,)\s*never a mid-thigh portrait crop\b/gi, '')
      .replace(/\bshow FULL BODY walking with both feet visible\b/g, 'show her walking');
  if (!line || at < 0) return scrub(prompt);
  return `${scrub(prompt.slice(0, at))}${line}${scrub(prompt.slice(at + line.length))}`;
}
