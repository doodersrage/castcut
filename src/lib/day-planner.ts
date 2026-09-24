import {
  clampStillHoldSec,
  DEFAULT_STILL_HOLD_SEC,
  type FilmPlaylistShot,
} from '@/lib/character-film';
import { QWEN_POSE_UNLOCK_MODIFY_PREFIX } from '@/lib/compose-prompt';
import { countPoseGuidePeople } from '@/lib/day-pose-guide';
import {
  POSE_GUIDE_ACTION_LOCK,
  normalizePoseGuideStylePreference,
  poseGuidePromptBlock,
  type PoseGuideStylePreference,
} from '@/lib/pose-guide-prompt';
import { describePoseLeadPosition, type PoseLeadPosition } from '@/lib/pose-guide-openpose';
import { resolveRoleplaySetting, storyBeatOmitsGarmentPackshot } from '@/lib/roleplay';
import {
  DEFAULT_RENDER_REALISM_MODE,
  normalizeRenderRealismMode,
  type RenderRealismMode,
} from '@/lib/render-realism';
import { buildSinglePersonUserDirective } from '@/lib/single-person';
import {
  DAY_SLOT_SPORT_BEAT_PRESETS,
  DAY_SLOT_SPORT_SETTING_PRESETS,
  buildDaySportPromptLocks,
  pickDaySportScenePair,
  DAY_SPORT_STALE_SETTING_RE,
} from '@/lib/day-sport';
import {
  DAY_SLOT_VACATION_BEAT_PRESETS,
  DAY_SLOT_VACATION_SETTING_PRESETS,
  buildDayVacationClothedFaceBreakLeads,
  buildDayVacationPromptLocks,
  pickDayVacationScenePair,
  vacationPoseClassFromBeat,
  vacationStanceDirective,
  clothedHeatUnlockPoseClass,
  DAY_VACATION_BEAT_CUE_RE,
  DAY_VACATION_SETTING_CUE_RE,
  DAY_VACATION_STALE_SETTING_RE,
} from '@/lib/day-vacation';
import {
  buildQwenRapidNudeEditLead,
  SOLO_DILDO_INSERTION_CUE,
  SOLO_DILDO_NO_EXTERNAL_HOLD_CUE,
} from '@/lib/qwen-rapid-nude-edit';
import { isDayVacationFaceRestorePrompt } from '@/lib/day-vacation-face-restore';

export type DaySlotId = 'morning' | 'afternoon' | 'evening' | 'night';

/** Session heat for Day stills — everyday by default; intimate/raunchy are NSFW-gated. */
export type DayMood = 'everyday' | 'suggestive' | 'sport' | 'vacation' | 'intimate' | 'raunchy';

export const DAY_MOOD_OPTIONS: Array<{ id: DayMood; label: string; hint: string }> = [
  { id: 'everyday', label: 'Everyday', hint: 'Normal day-in-the-life stills' },
  { id: 'suggestive', label: 'Suggestive', hint: 'Clothed heat — lingerie, unzip, charged poses' },
  {
    id: 'sport',
    label: 'Sport',
    hint: 'Random sport + mid-action pose for this time of day',
  },
  {
    id: 'vacation',
    label: 'Vacation',
    hint: 'Travel-day poses — hotel, pool, market, balcony',
  },
  { id: 'intimate', label: 'Intimate', hint: 'Adult sex beats — NSFW flag required' },
  {
    id: 'raunchy',
    label: 'Raunchy',
    hint: 'Crude sexual comedy — wardrobe fails & slapstick — NSFW flag required',
  },
];

export function normalizeDayMood(value: unknown): DayMood {
  const id = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (
    id === 'suggestive' ||
    id === 'sport' ||
    id === 'vacation' ||
    id === 'intimate' ||
    id === 'raunchy'
  ) {
    return id;
  }
  return 'everyday';
}

/** Intimate + raunchy need the NSFW generator env flag. */
export function isDayAdultMood(mood: DayMood | string | null | undefined): boolean {
  const id = normalizeDayMood(mood);
  return id === 'intimate' || id === 'raunchy';
}

/** Suggestive / sport / vacation / adult — beat owns stance; everyday grocery/walk baselines must not win. */
export function isDayHeatMood(mood: DayMood | string | null | undefined): boolean {
  const id = normalizeDayMood(mood);
  return id === 'suggestive' || id === 'sport' || id === 'vacation' || isDayAdultMood(id);
}

export function isDaySportMood(mood: DayMood | string | null | undefined): boolean {
  return normalizeDayMood(mood) === 'sport';
}

export function isDayVacationMood(mood: DayMood | string | null | undefined): boolean {
  return normalizeDayMood(mood) === 'vacation';
}

export type DayIntimateMix = 'mixed' | 'solo' | 'duo';

export const DAY_INTIMATE_MIX_OPTIONS = [
  { id: 'mixed', label: 'Mixed', hint: 'Solo and duo adult beats' },
  { id: 'solo', label: 'Solo', hint: 'One adult only' },
  { id: 'duo', label: 'Duo', hint: 'Partner scenes only' },
] as const;

export function normalizeDayIntimateMix(value: unknown): DayIntimateMix {
  const id = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (id === 'solo' || id === 'duo') {
    return id;
  }
  return 'mixed';
}

const DAY_INTIMATE_SOLO_BEAT_RE =
  /\b(solo|alone|masturbat|self[- ]pleasur|self[- ]touch|touch(?:ing)?\s+(?:herself|himself|themselves)|finger(?:ing)?\s+(?:herself|himself|themselves)|hands on her own|hands on his own)\b/i;

/** True when an intimate beat preset is solo / one-adult only. */
export function isDayIntimateSoloBeat(text: string): boolean {
  return DAY_INTIMATE_SOLO_BEAT_RE.test(text.trim());
}

/** Intimate beat presets for a slot filtered by solo / duo / mixed mix. */
export function intimateBeatsForMix(slotId: DaySlotId, mix: DayIntimateMix): string[] {
  const pool = DAY_SLOT_INTIMATE_BEAT_PRESETS[slotId] ?? [];
  if (mix === 'mixed') {
    return pool;
  }
  if (mix === 'solo') {
    return pool.filter(isDayIntimateSoloBeat);
  }
  return pool.filter(beat => !isDayIntimateSoloBeat(beat));
}

const DAY_RAUNCHY_SELF_TOUCH_RE =
  /\b(masturbat|self[- ]touch|self[- ]pleasur|finger(?:ing)?|hand on her vulva|rides? her own hand|grinding(?:\s+on\s+her\s+own)?|between her thighs|both hands between|fingers?\s+(?:inside|on|rubbing)|clit|dildo|vibrator|sex\s*toy|toy\s+play)\b/i;

/** Solo adult beat that explicitly calls for a held sex toy (dildo / vibrator). */
const DAY_SOLO_SEX_TOY_RE =
  /\b(dildo|vibrator|wand\s+vibrator|magic\s*wand|rabbit\s+vibe|sex\s*toy|toy\s+play)\b/i;

export function dayBeatUsesSoloSexToy(text: string | null | undefined): boolean {
  return DAY_SOLO_SEX_TOY_RE.test(String(text ?? '').trim());
}

const DAY_RAUNCHY_SOLO_BEAT_RE = /\b(solo|alone|caught\s+naked)\b/i;

const DAY_RAUNCHY_PARTNER_BEAT_RE =
  /\b(partner|roommate|lover|second\s+adult|both of them|two adults|mid-sex|mid-thrust|cowgirl|straddl|doggy|missionary|oral\s+sex)\b/i;

/** True when a raunchy beat preset is solo / one-adult gag (not a partner comedy). */
export function isDayRaunchySoloBeat(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  // "never invent a partner / second adult" is a solo lock phrase — strip first.
  const withoutNegatedPartner = trimmed
    .replace(/\bnever\s+invent\s+(?:a\s+)?(?:man\s+or\s+)?partner\b/gi, ' ')
    .replace(/\bnever\s+invent\s+(?:a\s+)?(?:man\s+or\s+)?second\s+adult\b/gi, ' ')
    .replace(/\bnever\s+invent\s+(?:a\s+)?man\b/gi, ' ');
  // Partner / roommate / mid-sex comedy is duo even if it also says "flash".
  if (DAY_RAUNCHY_PARTNER_BEAT_RE.test(withoutNegatedPartner)) {
    return false;
  }
  // Solo chip = nude self-touch comedy — clothed flash softcore is Mixed-only.
  if (DAY_RAUNCHY_SELF_TOUCH_RE.test(trimmed)) {
    return true;
  }
  return DAY_RAUNCHY_SOLO_BEAT_RE.test(trimmed) && /\b(naked|nude|fully nude)\b/i.test(trimmed);
}

/** Filter raunchy comedy presets by Solo / Duo / Mixed (same chips as Intimate). */
export function raunchyBeatsForMix(slotId: DaySlotId, mix: DayIntimateMix): string[] {
  const pool = DAY_SLOT_RAUNCHY_BEAT_PRESETS[slotId] ?? [];
  if (mix === 'mixed') {
    return pool;
  }
  if (mix === 'solo') {
    return pool.filter(isDayRaunchySoloBeat);
  }
  return pool.filter(beat => !isDayRaunchySoloBeat(beat));
}

export type DaySlot = {
  id: DaySlotId;
  label: string;
  wardrobeId?: string;
  location?: string;
  sceneHints?: string;
};

export type DaySlotStillStatus = 'queued' | 'running' | 'completed' | 'error';

export type DaySlotClipStatus = 'queued' | 'running' | 'completed' | 'error';

/** Per-slot still tracked for the day-in-the-life reel / Cut film. */
export type DaySlotStill = {
  slotId: DaySlotId;
  promptId?: string;
  imageUrl?: string;
  status?: DaySlotStillStatus;
  /** Optional I2V clip for this slot (motion reel). */
  clipPromptId?: string;
  clipUrl?: string;
  clipStatus?: DaySlotClipStatus;
};

export const DEFAULT_DAY_SLOTS: DaySlot[] = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
  { id: 'night', label: 'Night' },
];

const SLOT_IDS = new Set<DaySlotId>(['morning', 'afternoon', 'evening', 'night']);

/**
 * Lightbox slides for completed Day progress stills (slot order).
 * `openSlotId` selects the starting slide when that still has an image.
 */
export function buildDayProgressLightboxState(
  slots: DaySlot[],
  stills: DaySlotStill[],
  openSlotId: DaySlotId | string
): {
  images: string[];
  titles: string[];
  slotIds: DaySlotId[];
  index: number;
  title: string;
} | null {
  const bySlot = new Map(
    stills
      .filter(still => still.status === 'completed' && Boolean(still.imageUrl?.trim()))
      .map(still => [still.slotId, still] as const)
  );
  const slides = slots
    .map(slot => {
      const url = bySlot.get(slot.id)?.imageUrl?.trim();
      if (!url) {
        return null;
      }
      const scene = daySlotSceneSummary(slot, 120);
      const title = scene
        ? `${slot.label.trim() || slot.id} — ${scene}`
        : slot.label.trim() || slot.id;
      return { slotId: slot.id, url, title };
    })
    .filter((slide): slide is { slotId: DaySlotId; url: string; title: string } => slide != null);
  if (slides.length === 0) {
    return null;
  }
  const openId = typeof openSlotId === 'string' ? openSlotId.trim() : '';
  const index = Math.max(
    0,
    slides.findIndex(slide => slide.slotId === openId)
  );
  return {
    images: slides.map(slide => slide.url),
    titles: slides.map(slide => slide.title),
    slotIds: slides.map(slide => slide.slotId),
    index,
    title: slides[index]?.title ?? 'Day still',
  };
}

/**
 * After a slot finishes, pick the next morning→night slot that still needs work
 * (not completed). Returns null when the day is fully done.
 */
export function nextDaySlotToEdit(
  slots: DaySlot[],
  stills: DaySlotStill[],
  fromSlotId: DaySlotId | string
): DaySlotId | null {
  const order = slots.map(slot => slot.id);
  if (order.length === 0) {
    return null;
  }
  const fromId = typeof fromSlotId === 'string' ? fromSlotId.trim() : '';
  const fromIndex = Math.max(0, order.indexOf(fromId as DaySlotId));
  for (let step = 1; step <= order.length; step += 1) {
    const id = order[(fromIndex + step) % order.length]!;
    const still = stills.find(entry => entry.slotId === id);
    if (still?.status !== 'completed') {
      return id;
    }
  }
  return null;
}

export function daySlotProgressState(
  still: DaySlotStill | undefined
): 'done' | 'failed' | 'queued' | 'idle' {
  if (still?.status === 'completed') {
    return 'done';
  }
  if (still?.status === 'error') {
    return 'failed';
  }
  if (still?.status === 'queued' || still?.status === 'running') {
    return 'queued';
  }
  return 'idle';
}

export function daySlotProgressLabel(state: ReturnType<typeof daySlotProgressState>): string {
  if (state === 'done') {
    return 'Done';
  }
  if (state === 'failed') {
    return 'Failed';
  }
  if (state === 'queued') {
    return 'Queueing…';
  }
  return 'Waiting';
}

/** Clip (i2v) progress for a Day slot — independent of still status. */
export function daySlotClipProgressState(
  still: DaySlotStill | undefined
): 'done' | 'failed' | 'queued' | 'idle' {
  if (still?.clipStatus === 'completed' && Boolean(still.clipUrl?.trim())) {
    return 'done';
  }
  if (still?.clipStatus === 'error') {
    return 'failed';
  }
  if (still?.clipStatus === 'queued' || still?.clipStatus === 'running') {
    return 'queued';
  }
  return 'idle';
}

export function daySlotClipProgressLabel(
  state: ReturnType<typeof daySlotClipProgressState>
): string {
  if (state === 'done') {
    return 'Clip ready';
  }
  if (state === 'failed') {
    return 'Clip failed';
  }
  if (state === 'queued') {
    return 'Animating…';
  }
  return '';
}

/** Combined board caption: still state + optional clip line. */
export function daySlotBoardCaption(still: DaySlotStill | undefined): string {
  const stillLabel = daySlotProgressLabel(daySlotProgressState(still));
  const clipLabel = daySlotClipProgressLabel(daySlotClipProgressState(still));
  if (!clipLabel) {
    return stillLabel;
  }
  if (daySlotProgressState(still) === 'done') {
    return clipLabel;
  }
  return `${stillLabel} · ${clipLabel}`;
}

function truncateDaySlotLabel(text: string, maxChars: number): string {
  const limit = Math.max(24, Math.floor(maxChars));
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

/**
 * Board plan label for a Day slot — includes empty-state hints when setting or beat
 * is missing; both filled uses the same Setting · Beat summary as lightbox.
 */
export function daySlotPlanLabel(
  slot: Pick<DaySlot, 'location' | 'sceneHints'> | null | undefined,
  maxChars = 96
): string {
  const setting = slot?.location?.trim() || '';
  const beat = slot?.sceneHints?.trim() || '';
  if (!setting && !beat) {
    return 'Tap to set setting & beat';
  }
  if (setting && !beat) {
    return truncateDaySlotLabel(`${setting} · Add a beat`, maxChars);
  }
  if (!setting && beat) {
    return truncateDaySlotLabel(`Add a setting · ${beat}`, maxChars);
  }
  return truncateDaySlotLabel(`${setting} · ${beat}`, maxChars);
}

/**
 * Short human-readable scene line for Day slot cards / lightbox
 * (Setting · Beat), truncated for the board. Empty when both fields are blank.
 */
export function daySlotSceneSummary(
  slot: Pick<DaySlot, 'location' | 'sceneHints'> | null | undefined,
  maxChars = 96
): string {
  const setting = slot?.location?.trim() || '';
  const beat = slot?.sceneHints?.trim() || '';
  if (!setting || !beat) {
    return '';
  }
  return truncateDaySlotLabel(`${setting} · ${beat}`, maxChars);
}

function readText(value: unknown, max = 240): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Cap length without trimming — used for in-progress Setting / Beat typing. */
function readEditableText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/** True when cached Day stills belong to the active Cast character. */
export function dayStillsBelongToCharacter(
  stillsCharacterId: string | undefined | null,
  activeCharacterId: string | undefined | null
): boolean {
  return (stillsCharacterId?.trim() || '') === (activeCharacterId?.trim() || '');
}

/** Persist Day stills with Cast ownership so off-page character changes can invalidate them. */
export function dayStillsCachePatch(
  stills: DaySlotStill[],
  characterId?: string | null
): { stills: DaySlotStill[]; stillsCharacterId: string | undefined } {
  if (!stills.length) {
    return { stills: [], stillsCharacterId: undefined };
  }
  const id = characterId?.trim() || undefined;
  return { stills, stillsCharacterId: id };
}

/** Merge persisted slots with defaults so all four day parts always exist. */
export function normalizeDaySlots(input?: DaySlot[] | null): DaySlot[] {
  const byId = new Map<DaySlotId, DaySlot>();
  for (const slot of input ?? []) {
    if (!slot?.id || !SLOT_IDS.has(slot.id)) {
      continue;
    }
    byId.set(slot.id, {
      id: slot.id,
      label:
        readText(slot.label, 40) || DEFAULT_DAY_SLOTS.find(entry => entry.id === slot.id)!.label,
      wardrobeId: readText(slot.wardrobeId, 120) || undefined,
      // Do not trim location/sceneHints here — updateSlot runs on every keystroke.
      location: readEditableText(slot.location, 160) || undefined,
      sceneHints: readEditableText(slot.sceneHints, 320) || undefined,
    });
  }
  return DEFAULT_DAY_SLOTS.map(defaultSlot => ({
    ...defaultSlot,
    ...byId.get(defaultSlot.id),
    id: defaultSlot.id,
    label: byId.get(defaultSlot.id)?.label || defaultSlot.label,
  }));
}

/** Soft img2img denoise for Day+plate — high enough to restage, not polish the plate. */
export const DAY_PLATE_SCENE_DENOISE = 0.82;

/** Cap IP-Adapter strength so pose/environment can change when a plate is locked. */
export const DAY_PLATE_IDENTITY_LOCK_CAP = 0.4;

/**
 * Vacation / Suggestive + Image 3: Keep standing plates + high IP lock freeze every
 * upright beat as a fashion stand (only horizontal RELAXING was winning). Soft-cap
 * face lock hard so Edit can follow Image 3 mid-stride / sit / dance.
 */
export const DAY_VACATION_POSE_IDENTITY_LOCK_CAP = 0.12;

/**
 * Identity lock for an everyday pose unlock. A high IP-Adapter lock carries composition, not
 * just the face, so 0.4 on a standing Keep plate is a large part of why Edit-2511 freezes the
 * stance. Vacation pairs 0.12 with a face-cropped Image 1; everyday keeps the whole plate as
 * Image 1, so it sits between the two: loose enough for the body to move, tight enough to hold
 * the face without cropping.
 */
export const DAY_EVERYDAY_POSE_IDENTITY_LOCK_CAP = 0.22;

/**
 * Everyday keeps the full Keep body as Image 1, so pose change needs more denoise
 * than Vacation face-break (0.78). 0.78 was copying the plate stand.
 */
export const DAY_EVERYDAY_POSE_DENOISE = 0.92;

/**
 * Soft sit/lounge face-break — Edit-2511 needs a firm face pin or every slot invents
 * a new beauty face. Pose still unlocks via face-only Image 1 + Image 3.
 */
export const DAY_VACATION_FACE_BREAK_IDENTITY_LOCK_CAP = 0.62;

/**
 * Hard upright pose breaks (MID-STRIDE / WAVING / DANCING) with face-only Image 1.
 * Still below full Day plate lock so Image 3 stance can win.
 */
export const DAY_VACATION_UPRIGHT_FACE_IDENTITY_LOCK_CAP = 0.55;

/** Denoise floor when Vacation/Suggestive attaches Image 3 — soft denoise keeps Keep stand. */
export const DAY_VACATION_POSE_DENOISE = 0.78;

/** Denoise when upright vacation poses use face-only Image 1. */
export const DAY_VACATION_UPRIGHT_FACE_DENOISE = 0.8;

/**
 * Face-crop Image 1 + white Image 2/3: pose unlocks but SETTING must still fill the frame.
 * Blank / missing background is a failed edit — not an optional backdrop tip.
 */
export const DAY_FACE_BREAK_SETTING_FILL =
  'BACKGROUND CRITICAL: fill the entire frame behind her with the SETTING venue (depth, props, lighting) — a blank white, seamless studio, missing background, mid-gray void, charcoal diagram void, or ecommerce cutout means the edit FAILED. Image 3 is a thin gray outline on white paper only — never the scene, never a dark color overlay. Invent the SETTING behind her.';

/** Adult duo + Image 3: lower face lock so Edit can separate bodies / drop Keep lingerie. */
export const DAY_ADULT_DUO_IDENTITY_LOCK_CAP = 0.22;

/**
 * Adult Solo nude beats: Cast underwear body plates + high IP lock = beige lingerie
 * softcore. Cap face lock hard so bare-skin + Image 3 self-touch can win
 * (naming lingerie in the positive summons it — keep bans in negatives only).
 */
export const DAY_ADULT_SOLO_NUDE_IDENTITY_LOCK_CAP = 0.04;

/** Day Keep→scene: hold face + worn kit from Image 1; unlock pose/camera/background. */
export const DAY_KEEP_OUTFIT_POSE_UNLOCK_PREFIX =
  'Edit Image 1. Keep facial likeness AND the worn outfit, garments, colors, fabric, and clothing silhouette from Image 1. Do not preserve body pose, standing/sitting stance, arm or hand positions, camera angle, or background — aggressively refactor into a new pose and scene as described. Keep facial likeness only for who they are; keep the clothing; replace everything else.';

/**
 * Suggestive Keep unlock — Outfit try-ons are standing plates; without an explicit
 * anti-standing lead, CFG-1 freezes every clothed-heat beat as a square-on stand.
 */
export const DAY_SUGGESTIVE_KEEP_POSE_UNLOCK_PREFIX =
  'Edit Image 1. Keep facial likeness AND the worn outfit, garments, colors, fabric, and clothing silhouette from Image 1. Image 1 is a standing try-on plate — discard that standing fashion stance entirely. Do not preserve body pose, standing stance, arm or hand positions, camera angle, or background — aggressively refactor into the beat pose matching Image 3 (dancing with both arms raised and one knee lifted mid-kick, leaning, seated, stretching, hip cocked, looking back, or unzipping as written). Keep facial likeness only for who they are; keep the clothing; replace everything else.';

/** Beat-aware Suggestive Keep unlock — DANCING gets a CRITICAL fail line like Vacation. */
export function buildDaySuggestiveKeepPoseUnlock(beat: string | null | undefined): string {
  const hay = beat?.trim() || '';
  if (/\b(danc(?:e|es|ing)|hips?\s+mid-?sway|mid-?sway)\b/i.test(hay)) {
    return (
      'Edit Image 1. Keep facial likeness AND the worn outfit, garments, colors, fabric, and clothing silhouette from Image 1. ' +
      'CRITICAL: Image 1 is a standing fashion plate — the output MUST show her DANCING instead: both arms raised overhead, one knee lifted mid-kick, hips swaying. If she is standing square-on with arms at her sides or hands on her waist the edit FAILED. ' +
      'Do not preserve body pose, standing stance, arm or hand positions, camera angle, or background — aggressively refactor into the mid-dance pose matching Image 3. ' +
      'Keep facial likeness only for who they are; keep the clothing; replace everything else.'
    );
  }
  return DAY_SUGGESTIVE_KEEP_POSE_UNLOCK_PREFIX;
}

/** Fallback when beat class is unknown — prefer buildDayVacationPromptLocks().keepUnlock. */
export const DAY_VACATION_KEEP_POSE_UNLOCK_PREFIX =
  'Edit Image 1. IDENTITY CRITICAL: keep the SAME woman as Image 1 — same face, bone structure, eyes, nose, mouth, and exact hair color and length. Inventing a different beauty face or restyling her hair means the edit FAILED. Keep the worn outfit, garments, colors, fabric, and clothing silhouette from Image 1. Image 1 is a standing try-on plate — discard that standing fashion stance entirely. Do not preserve body pose, standing stance, arm or hand positions, camera angle, or background — aggressively refactor into the beat pose. Keep who she is and what she is wearing from Image 1; replace pose and scene only.';

/** Beat-aware suggestive stance lock — names dance/sway so Keep cannot freeze arms-at-sides. */
export function buildDaySuggestivePoseLock(beat: string | null | undefined): string {
  const hay = beat?.trim() || '';
  let stance =
    'match Image 3 and the beat — lean, sit, stretch, hip-cocked asymmetry, or charged upright as written';
  if (/\b(danc(?:e|es|ing)|hips?\s+mid-?sway|mid-?sway)\b/i.test(hay)) {
    stance =
      'DANCING alone — BOTH arms raised overhead, one knee lifted mid-kick or mid-step, hips mid-sway, three-quarter torso twist — NEVER both arms hanging at her sides or hands parked on her waist like a catalog stand, NEVER both feet planted parallel facing the lens';
  } else if (
    /\b(twist(?:ing|s)?|zip(?:ping|s|ped)?|unzip(?:ping|s|ped)?|back\s+arch|over\s+(?:an?\s+|the\s+)?shoulder)\b/i.test(
      hay
    )
  ) {
    stance =
      'ZIP/TWIST look-back — torso twisted toward a mirror, back arched, both hands on her own dress zipper behind her back, looking over a shoulder — NEVER square-on facing the lens with arms hanging at her sides';
  } else if (/\b(sit(?:ting|s)?|seated|perch(?:ed|ing)?|couch\s+arm|bed\s+edge)\b/i.test(hay)) {
    stance =
      'SEATED/PERCHED — hips on the seat with knees bent or legs crossed — never standing square-on with arms at her sides';
  } else if (/\b(lean(?:ing|s)?|doorway|jamb|rail)\b/i.test(hay)) {
    stance =
      'LEANING — weight into the doorway/rail with hip cocked and asymmetric arms — never a planted catalog stand';
  } else if (/\b(stretch(?:es|ing)?|look(?:ing)?\s+back)\b/i.test(hay)) {
    stance =
      'asymmetric charged upright from the beat (stretch or look-back) — never square-on standing with arms at her sides';
  }
  return (
    `CLOTHING LOCK: wear the exact Keep/Image 2 outfit (same dress/lingerie/robe cut, colors, print, fabric coverage) — never invent a bikini, swimsuit, nude, bare midriff, or a different garment; bottoms or panties stay on; charged pin-up heat only. ` +
    `POSE LOCK: ${stance}. Image 1 Keep is a standing try-on — discard that standing fashion stance; never freeze as a square-on standing catalog model with arms at her sides; never strip to nude; never remove bottoms; never invent a second adult or muscular man.`
  );
}

/**
 * Beat-specific adult pose lock — Rapid NSFW collapses all-fours / doggy / wall
 * into softcore kneel / cowgirl / peace-sign pin-ups without an explicit stance ban.
 */
export function buildDayAdultBeatPoseLock(
  beat: string | null | undefined,
  mode: 'solo' | 'duo'
): string | null {
  const hay = beat?.trim() || '';
  if (!hay) {
    return null;
  }
  if (/\ball\s+fours\b|\bhands\s+and\s+knees\b/i.test(hay)) {
    return mode === 'solo'
      ? 'POSE LOCK: ALL FOURS looking back — hips high, weight on knees and hands/forearms, face turned over one shoulder (or looking down at her hands); never kneeling upright facing the lens, never a front softcore pin-up with hands covering the crotch, never peace/rock-on/V-sign gestures.'
      : 'POSE LOCK: ALL FOURS / DOGGY — Cast on hands and knees hips high, partner behind mid-sex; never kneeling upright facing the lens together, never peace signs, never cowgirl astride facing the camera.';
  }
  if (
    /\bdoggy\b|\bdoggystyle\b|\bfrom\s+behind\b|\bpartner\s+behind\b|\brear[- ]entry\b/i.test(hay)
  ) {
    return 'POSE LOCK: DOGGY / REAR-ENTRY — Cast bent or on all fours, partner behind mid-thrust; both adults mid-sex; never cowgirl astride facing the lens, never peace-sign softcore kneel, never both staring at camera posing.';
  }
  if (
    /\b(?:against|pressed\s+against)\s+(?:the\s+)?(?:bedroom\s+)?wall\b|\bwall\s+(?:sex|press|fuck)\b|\bwindow\s+wall\b|\bpressed\s+against\b/i.test(
      hay
    )
  ) {
    return 'POSE LOCK: STANDING WALL PRESS — both adults STANDING upright mid-sex with Casts back flat against a solid bedroom WALL (not the bed, not kneeling on sheets); partner behind or chest-to-back; feet on the floor; never cowgirl on the bed, never front softcore kneel facing the lens, never seated astride on the mattress.';
  }
  return null;
}

/** Isolate-on-white plates must not survive as ecommerce cutouts. */
export const DAY_ISOLATE_WHITE_REPLACE =
  'Image 1 is the subject isolated on a blank white backdrop. Replace every white/studio void with the SETTING below — never leave a white background, ecommerce void, or cutout plate.';

/**
 * Face-break / Keep packshot / Image 3 pose-guide are often on white even when
 * Image 1 is a face crop. Ban those voids AFTER pose unlock — never as a
 * "fill the entire frame" lead that steals CFG-1 from Image 3 stance.
 */
export const DAY_REFERENCE_WHITE_VOID_FILL =
  'Never leave Image 2 or Image 3 white as the scene background — keep the SETTING behind the posed subject (no ecommerce void, seamless studio sweep, cutout plate, or missing background).';

/**
 * Qwen Image Edit 2511 (incl. Lightning) anchors body pose from Image 1, so a standing Keep
 * try-on plate freezes the stance unless the prompt explicitly discards it. Heat moods already
 * face-break Image 1 for this; everyday keeps the whole plate, so it needs the ban in words.
 */
export const DAY_EVERYDAY_POSE_STICKY_UNLOCK =
  'Image 1 is a standing try-on plate — discard that standing catalog stance completely: the body pose comes from the beat (and Image 3 when attached), never from Image 1; never freeze square-on with both feet planted and arms hanging at the sides. One woman only — never paint a second person, mannequin, or lingerie ghost from Image 1 beside her.';

/** Beat-class stance so everyday sit/walk/lie cannot collapse to the Keep stand. */
export function everydayStanceDirective(poseClass: string | null | undefined): string {
  switch ((poseClass ?? '').toUpperCase()) {
    case 'SEATED':
      return 'SEATED = hips ON a chair/bench/stool/couch with knees bent — never standing square-on beside the seat';
    case 'LYING':
      return 'LYING = body stretched ON the bed/couch/floor, hips and back down — never standing beside it';
    case 'WALKING':
      return 'WALKING = full-body mid-stride, one foot clearly ahead, opposite arm swing — never both feet planted parallel';
    case 'LEANING':
      return 'LEANING = weight into a wall/door/rail with hip cocked and asymmetric arms — never a planted catalog stand';
    case 'CROUCH':
      return 'CROUCHING = knees deeply bent, hips low, reaching down — never standing upright';
    case 'KNEEL':
      return 'KNEELING = one or both knees on the ground — never standing on both feet';
    case 'DANCING':
      return 'DANCING = both arms in motion, weight on one leg or a step — never arms hanging at her sides';
    case 'GESTURE':
      return 'GESTURE = the beat action in the arms/hands with a clear weight shift — never the Image 1 arms-at-sides catalog stand';
    default:
      return 'new beat stance — never a square-on standing catalog pose with both feet planted and arms at her sides';
  }
}

export function buildDayEverydayKeepPoseUnlock(beat: string | null | undefined): string {
  const cls = dayEverydayPoseClass(beat);
  const stance = everydayStanceDirective(cls);
  return (
    `Edit Image 1. IDENTITY CRITICAL: keep the SAME woman as Image 1 — same face, bone structure, eyes, nose, mouth, and exact hair color and length. ` +
    `Keep the worn outfit from Image 1. Image 1 is a standing try-on plate — discard that stance. ${stance}. ` +
    `If she is standing square-on with arms at her sides copying Image 1, the edit FAILED. ` +
    `One finished photograph of this one woman only — never a second body, beige-lingerie ghost, mannequin, or speckle/snow overlay from Image 3. ` +
    `Replace pose, camera, lighting, and background; keep who she is and what she is wearing.`
  );
}

/** Edit-2511 family (incl. Lightning 4/8-step) — Image 1 pose sticks without an explicit ban. */
export function isDayPoseStickyEditModel(model?: string | null): boolean {
  return /qwen-image-edit-2511/i.test(String(model ?? '').trim());
}

/**
 * True when an everyday beat asks for a body the standing Keep plate cannot supply. A standing
 * gesture (waving, sipping, pockets) is fine on the plate's own stance and must not pay the
 * identity cost of an unlock.
 */
export function dayEverydayPoseNeedsBodyUnlock(beat: string | null | undefined): boolean {
  const cls = dayEverydayPoseClass(beat);
  return cls !== 'STILL' && cls !== 'GESTURE';
}

/**
 * Posture of an everyday beat, used to spread stances across the four dayparts.
 * Keywords mirror the Image 3 guide's own scene matcher so the classification and the drawn
 * mannequin agree. Order matters: lying beats mention couches, seated beats mention leaning.
 */
export function dayEverydayPoseClass(beat: string | null | undefined): string {
  const hay = String(beat ?? '').toLowerCase();
  if (!hay.trim()) {
    return 'STILL';
  }
  if (
    /\b(lie|lies|lying|sprawl(?:ed|ing)?|reclin(?:e|es|ed|ing)|stretched out|flat on)\b/.test(hay)
  ) {
    return 'LYING';
  }
  if (
    /\b(crouch(?:ing|es)?|squat(?:ting|s)?|hunker(?:ed|ing)?|duck(?:ing|s)?|bend(?:s|ing)? (?:down|over|to pick)|pick(?:s|ing)? up|scoop(?:s|ing)? up|stoop(?:s|ing)?)\b/.test(
      hay
    )
  ) {
    return 'CROUCH';
  }
  if (/\b(kneel(?:ing|s)?|on one knee)\b/.test(hay)) {
    return 'KNEEL';
  }
  if (
    /\b(sit(?:ting|s)?|seated|curled|cross-legged|bench|booth|couch|sofa|stool|perch(?:ed|ing)?|knees drawn|armchair)\b/.test(
      hay
    )
  ) {
    return 'SEATED';
  }
  if (
    /\b(lean(?:ing|s)?|propped|elbows (?:on|lightly)|doorway|jamb|door frame|foot up on|against the wall|rail(?:ing)?)\b/.test(
      hay
    )
  ) {
    return 'LEANING';
  }
  if (
    /\b(mid-stride|stride|walk(?:ing|s)?|heading out|pacing|climbing the (?:stairs|steps)|up the (?:stairs|steps))\b/.test(
      hay
    )
  ) {
    return 'WALKING';
  }
  if (/\b(danc(?:e|es|ing)|spin(?:s|ning)?|twirl(?:s|ing)?)\b/.test(hay)) {
    return 'DANCING';
  }
  // Standing, but the arms are doing something — distinct enough from a still plate stance that
  // one of each in a day does not read as the same pose twice.
  if (
    /\b(wav(?:e|es|ing)|point(?:s|ing)?|reach(?:es|ing)?|stretch(?:es|ing)?|yawn|sip(?:s|ping)?|drink(?:s|ing)?|mug in hand|coffee in|pouring|look(?:s|ing)? back|over (?:one|the) shoulder|tuck(?:s|ing)?|adjust(?:s|ing)?|fixes|shrug(?:s|ging)?|palms up|hands on hips|hand on a hip|carry(?:ing)?|tote|bag over|read(?:s|ing)?|browsing|menu|surveying|squinting)\b/.test(
      hay
    )
  ) {
    return 'GESTURE';
  }
  return 'STILL';
}

/**
 * Default activity poses when the slot beat is empty — and always as a body-stance
 * baseline when a beat is present (vague mood beats alone leave Keep standing).
 */
export const DEFAULT_DAY_SLOT_POSES: Record<DaySlotId, string> = {
  morning:
    'standing at a kitchen counter, arms stretching overhead mid-yawn or pouring coffee, casual weight shift toward morning light',
  afternoon:
    'walking outdoors mid-stride with a bag over one shoulder, natural arm swing, glancing ahead',
  evening:
    'seated or standing at a rail with a drink in hand, torso angled slightly, soft end-of-day pause',
  night:
    'leaning in a doorway or under a streetlamp with hands in pockets, weight on one leg, quiet look down the block',
};

/** Rotating pose baselines per daypart — picked from Setting·Beat so Queue day varies stance. */
export const DAY_SLOT_POSE_PRESETS: Record<DaySlotId, string[]> = {
  morning: [
    DEFAULT_DAY_SLOT_POSES.morning,
    'checking a phone by the window, one elbow on the sill, soft morning light',
    'reaching up into a cupboard on tiptoe, other hand on the counter edge',
    'sitting on a stool tying a shoe, torso folded forward',
    'leaning on the balcony rail looking out, coffee mug steaming',
    'mid-yawn stretch with arms wide, weight on one hip',
  ],
  afternoon: [
    DEFAULT_DAY_SLOT_POSES.afternoon,
    'pausing mid-stride to check a phone, bag strap on one shoulder',
    'sitting cross-legged on a park bench with a book open',
    'pointing toward a storefront across the street, other hand in a pocket',
    'carrying two grocery bags, slight lean from the weight',
    'looking back over one shoulder while walking, hair catching wind',
  ],
  evening: [
    DEFAULT_DAY_SLOT_POSES.evening,
    'elbows on a bar rail, glass raised halfway, soft smile',
    'seated sideways on a couch arm, phone in one hand',
    'standing at a rooftop railing watching golden hour, wind in hair',
    'waving from a patio with one arm high, drink in the other',
    'leaning back in a chair, menu held open at chest height',
  ],
  night: [
    DEFAULT_DAY_SLOT_POSES.night,
    'walking under neon mid-stride, coat open, glance toward headlights',
    'pausing in a doorway with one shoulder on the frame, soft night light',
    'sitting in a diner booth, elbows on the table, looking out the window',
    'phone glow under neon, weight on one hip, chin slightly down',
    'looking back over the shoulder on wet asphalt, streetlamp rim light',
  ],
};
/** Camera / framing cues — rotated per slot so stills do not share one angle. */
export const DAY_SLOT_CAMERA_PRESETS: string[] = [
  'eye-level documentary framing with natural depth',
  'slight low angle that shows more environment',
  'candid three-quarter medium shot, shallow depth of field',
  'interior candid with background lights soft and readable',
  'over-the-shoulder into the setting, lead faces the scene',
  'mid-stride street framing with leading lines',
  'tight medium close-up with background bokeh',
];

/**
 * Extra Day still cue when Image 3 is attached — blocks flesh-blob / incomplete
 * companion leaks that Read as pose-guide bleed (esp. night window scenes).
 */
export const DAY_POSE_GUIDE_ANTI_LEAK =
  'Never paint Image 3 into the photo as a flesh-colored blob, featureless nude torso, incomplete second body, window-reflection doppelganger, detached hand, stick overlay, neon outline, white speckle rain, film-grain snow, dither dots, or pose diagram — only one finished clothed adult matching Image 1; never a second woman in beige lingerie standing beside her.';

/** OpenPose Image 3 variant of DAY_POSE_GUIDE_ANTI_LEAK — a keypoint map has no fills to bleed. */
export const DAY_OPENPOSE_ANTI_LEAK =
  'Image 3 is only a pose map — never draw its lines, dots, or black background into the photo, and never add a second body the beat does not name.';

/** Daypart motion cues for Animate / I2V (beyond generic “subtle motion”). */
export const DAY_SLOT_MOTION_CUES: Record<DaySlotId, string> = {
  morning: 'soft stretch or pour motion, steam drift, morning light shift',
  afternoon: 'natural walk cycle or gesture, breeze in hair/clothes, passing traffic blur',
  evening: 'slow glass tilt or glance, warm lamp flicker, golden-hour drift',
  night: 'neon pulse reflection, coat sway mid-step, quiet night ambience',
};

/**
 * Optional duo / selfie-companion beats — mixed in only when allowCompanions is on.
 * Magenta = Cast; companion must read as a different adult.
 */
export const DAY_SLOT_COMPANION_BEAT_PRESETS: Record<DaySlotId, string[]> = {
  morning: [
    'mirror selfie with a friend leaning into frame over one shoulder',
    'arm-in-arm with a roommate on the balcony, both facing morning light',
    'phone selfie with a friend crowding into the shot, laughing',
  ],
  afternoon: [
    'selfie with a friend on a park bench, heads close, different faces',
    'walking side by side with a companion, mid-conversation gesture',
    'hugging a friend hello on the sidewalk, both smiling',
  ],
  evening: [
    'selfie double at a bar rail with a friend leaning in, different faces',
    'seated knee-to-knee with a companion sharing a menu',
    'arm around a friend on a rooftop at golden hour',
  ],
  night: [
    'neon selfie with a friend pressed close, Cast face on the lead only',
    'walking home arm-in-arm under streetlights with a companion',
    'diner booth across from a friend, leaning into conversation',
  ],
};

function hashStringSeed(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable pick from a pool using Setting·Beat salt (same scene → same stance/camera). */
export function pickDayPresetFromSalt(pool: readonly string[], salt: string): string {
  if (pool.length === 0) {
    return '';
  }
  return pool[hashStringSeed(salt) % pool.length]!;
}

/** Pose baseline for a slot — rotates with Setting/Beat so Queue day varies stance. */
export function resolveDaySlotPoseBaseline(
  slot: Pick<DaySlot, 'id' | 'location' | 'sceneHints'>
): string {
  const pool = DAY_SLOT_POSE_PRESETS[slot.id] ?? [DEFAULT_DAY_SLOT_POSES[slot.id]];
  const salt = `${slot.id}|${slot.location?.trim() ?? ''}|${slot.sceneHints?.trim() ?? ''}`;
  return pickDayPresetFromSalt(pool, salt) || DEFAULT_DAY_SLOT_POSES[slot.id];
}

/** Camera cue tied to the same salt as pose baseline. */
export function resolveDaySlotCameraCue(
  slot: Pick<DaySlot, 'id' | 'location' | 'sceneHints'>
): string {
  const salt = `cam|${slot.id}|${slot.location?.trim() ?? ''}|${slot.sceneHints?.trim() ?? ''}`;
  return pickDayPresetFromSalt(DAY_SLOT_CAMERA_PRESETS, salt);
}

/**
 * Time-of-day setting pools for Queue day diversification.
 * Empty slot locations pick a unique entry so morning→night do not share one backdrop.
 */
export const DAY_SLOT_SETTING_PRESETS: Record<DaySlotId, string[]> = {
  morning: [
    'sunlit kitchen window with breakfast clutter on the counters',
    'quiet neighborhood sidewalk at sunrise with long soft shadows',
    'steamy bathroom after a shower, towel over one shoulder',
    'corner café counter with a fresh pour-over and morning newspapers',
    'apartment balcony overlooking quiet residential streets at dawn',
    'grocery store produce aisle under cool fluorescent light',
    'empty train platform in early light with a takeaway coffee cup',
    'yoga studio with mats rolled and east-facing windows',
  ],
  afternoon: [
    'busy sidewalk café terrace with chalkboard menus and passing traffic',
    'leafy city park path with benches and distant playground noise',
    'open-air farmers market with produce stalls and striped awnings',
    'independent bookstore aisle with warm lamps and crowded shelves',
    'open-plan office corner desk with monitors and afternoon window light',
    'bright neighborhood gym floor with rubber mats and free weights',
    'sunlit museum lobby with a large colorful mural, ticket desk, and skylight shadows',
    'riverside boardwalk with bikes and midday glare on the water',
  ],
  evening: [
    'golden-hour rooftop garden overlooking a sprawling city',
    'cozy living-room couch edge with warm lamp light',
    'neighborhood wine bar booth with candlelight and low chatter',
    'rain-damp sidewalk outside a lit restaurant window',
    'sunset pier railing with long shadows and cool wind',
    'kitchen table set for dinner with steam rising from plates',
    'bookstore reading nook as daylight fades to warm lamps',
    'park bench under amber streetlights at blue hour',
  ],
  night: [
    'city street at night with neon reflections on wet asphalt',
    'chrome late-night diner booth with neon sign glow through the window',
    'underground subway platform with tiled walls and approaching train lights',
    'quiet apartment hallway with a single warm wall sconce',
    'rooftop edge overlooking a glittering skyline after dark',
    'corner convenience store exterior under harsh sodium light',
    'rain-slick bridge walkway with car headlights streaking past',
    'hotel lobby lounge with low music and polished marble floors',
  ],
};

/**
 * Beat seeds for Queue day — must name a concrete stance/activity, not mood alone.
 * Vague lines ("quiet start") let Keep's standing fashion pose win.
 */
export const DAY_SLOT_BEAT_PRESETS: Record<DaySlotId, string[]> = {
  // Each daypart spans the drawable stances: lying, seated, crouch/bend, kneel, lean, stairs,
  // walk, gesture and still. diversifyDaySlotScenes spreads these across the four slots, so a
  // pool that is mostly "standing near something" is what makes a whole Day read as one pose.
  morning: [
    'lying across the bed scrolling a phone, ankles crossed',
    'lying on the rug mid-stretch before the day starts',
    'sitting on the edge of the bed lacing boots, elbows on knees',
    'curled cross-legged on the couch with a mug in both hands',
    'perched on a stool waiting for the kettle, ankles hooked on the rung',
    'crouching at a low cupboard reaching for a pan, one knee bent',
    'bending to pick up the mail just inside the door',
    'kneeling on the rug to zip a bag by the door',
    'tying a lace with one foot up on the step',
    'leaning against the door frame with a mug, shoulder on the jamb',
    'checking the phone while leaning on the sill, one elbow propped',
    'climbing the stairs with a mug, one hand on the banister',
    'heading out the door mid-stride with a tote, keys in the other hand',
    'stretching arms overhead mid-yawn before heading out',
    'pouring coffee by the window, mug in hand, torso turned toward the light',
    'reaching for a mug at the counter, weight on one hip',
    'waving hello from the balcony, other hand on the rail',
    'tucking hair behind an ear at the hall mirror',
    'hands on hips surveying the kitchen counter',
  ],
  afternoon: [
    'lying back on the grass, arms behind the head',
    'sitting on a park bench reading a book, one leg crossed',
    'sitting cross-legged on the grass with a sandwich',
    'crouching to tie a lace at the curb, bag set down beside her',
    'bending to pick up a dropped receipt on the sidewalk',
    'kneeling on the path to pet a dog, both hands out',
    'foot up on a bench retying a lace',
    'leaning against a brick wall waiting for a friend',
    'leaning on a railing overlooking the park, elbows soft',
    'climbing the steps to the library entrance',
    'mid-stride on the sidewalk, coffee in one hand, glancing sideways',
    'walking with purpose, natural arm swing, looking ahead',
    'looking back over one shoulder mid-walk, slight smile',
    'carrying a tote bag over one shoulder between errands',
    'browsing a shelf, looking down at a page, weight shifted forward',
    'pointing toward a storefront across the street',
    'pausing to drink from a bottle, other hand on a hip',
    'shrugging mid-conversation on the corner, palms up',
    'adjusting a bag strap on the shoulder at the crossing',
    'hands on hips squinting up at a street sign',
  ],
  evening: [
    'reclining on the couch with feet up on the cushion',
    'leaning back on a couch, torso angled toward the lamp, phone in hand',
    'seated at a table edge reading a menu, soft end-of-day pause',
    'sitting on the stairs with a drink, elbows on knees',
    'crouching by a record crate, flipping through the sleeves',
    'bending to pick up a jacket from the back of the chair',
    'kneeling to light a candle on the low table',
    'foot up on a chair rung retying a boot',
    'leaning against the balcony door frame with a glass',
    'holding a glass at a bar rail, elbows lightly propped',
    'standing at a railing watching the light change, hands on the rail',
    'climbing the stairs to the rooftop, one hand on the rail',
    'dancing alone for a beat on the patio, arms loose',
    'stretching after a long day, hands behind the head',
    'waving from across the patio, other hand on the rail',
    'checking a phone at golden hour, chin slightly tilted toward the screen',
    'arms crossed on a rooftop, looking out at golden hour',
    'tucking hair back while looking in the hall mirror',
    'hands on hips at the stove deciding what to cook',
  ],
  night: [
    'lying back on the bed still in the coat, phone held overhead',
    'sprawled sideways in an armchair still in the coat',
    'sitting in a diner booth after dark, elbows on the table',
    'sitting on the curb under the streetlight, knees drawn up',
    'crouching to lock a bike at the rack, keys in hand',
    'bending to pick up keys dropped on the mat',
    'kneeling to unlace boots by the door',
    'leaning in a doorway before sleep, one shoulder on the frame',
    'leaning against the wall by the elevator, coat over one arm',
    'climbing the stairs to the flat, phone lighting the steps',
    'walking home mid-stride under neon, coat shifting with the step',
    'pausing mid-stride to look up at a lit sign',
    'looking back over the shoulder on a wet sidewalk',
    'twirling once under a streetlight, coat flaring',
    'shrugging off a coat onto the back of a chair',
    'pausing under a streetlamp, hands in pockets, looking down the block',
    'checking a phone under neon, weight on one hip',
    'holding a phone at chest height under neon, looking at the screen',
    'tucking hair under a collar against the cold',
  ],
};

/** Suggestive beats — clothed heat / innuendo (no named sex). */
export const DAY_SLOT_SUGGESTIVE_BEAT_PRESETS: Record<DaySlotId, string[]> = {
  morning: [
    'stretching in thin sleepwear by the window — one arm overhead, hip cocked, fabric catching light on bare thighs, looking back over a shoulder',
    'pouring coffee barefoot in a silk robe loosely tied — leaning on the counter, cleavage and skin, charged quiet, not facing the lens square-on',
    'leaning on the sill in lingerie under an open shirt, soft morning glow, looking back over a shoulder with weight on one hip',
    'looking back over one shoulder while dressing, lingerie straps and unfinished buttons, one knee on the bed edge, charged pause',
    'kneeling upright on the rumpled bed in a sleep shirt and panties — back arched, hands in hair, morning light, clothes stay on',
    'sitting on the windowsill in a short robe, one foot planted on the sill, robe falling open over lingerie, eyes half-lidded not a standing fashion plate',
  ],
  afternoon: [
    'adjusting a low neckline in a shop window reflection — body angled three-quarter to the glass, slow smile, never square to camera',
    'reclining on a sunlit couch, short hem riding up, one leg hooked over the backrest, warm look over one shoulder',
    'leaning on a balcony railing with a breeze lifting a short hem — hips back, bare legs, looking back flirtatiously',
    'biting a lip while checking a flirtatious text — weight on one hip, dress strap slipping, hand on the doorframe',
    'perched on a couch arm in a short dress, legs crossed high, leaning forward with charged eye contact, never a stiff standing catalog pose',
    'twisting to zip a dress in a mirror — torso twisted, back arched, both hands on the zipper behind her back, looking over a shoulder, lingerie straps visible, afternoon light — never square-on facing the lens',
  ],
  evening: [
    'holding a glass at a dim bar — seated on a stool, dress strap slipping, body angled, slow eye contact, never standing square-on',
    'DANCING alone on the patio in evening wear — both arms raised overhead, one knee lifted mid-kick, hips mid-sway, three-quarter turn — never arms-at-sides catalog stand',
    'seated on a couch arm in evening wear, legs crossed high, leaning back on one hand, charged pause',
    'leaning in a doorway in lingerie and an open robe — one shoulder against the jamb, looking down the hall, inviting, not a fashion plate',
    'sitting on the hotel bed edge unzipping a dress halfway — lingerie visible, one heel half-off, looking up into the lamp',
    'kneeling on the bed in evening lingerie facing the headboard — looking back over a shoulder, soft lamp, clothes stay on',
  ],
  night: [
    'pausing under neon in a short dress, coat open — looking back over a shoulder mid-stride, charged heat, never a static front pose',
    'sitting on the edge of a hotel bed, unzipping a dress halfway, lingerie visible underneath — body twisted, eyes not locked on the lens',
    'leaning in a bedroom doorway in lingerie — hip cocked against the frame, soft lamp, inviting body language',
    'walking barefoot to bed in lingerie — mid-step toward the sheets, looking back, soft lamp, clothes stay on, never a polite standing portrait',
    'lying on her side on the hotel bed in lingerie — propped on one elbow, knees drawn up, charged quiet, never nude',
    'perched on a chair backwards in a short dress after dark — arms on the chair back, looking over a shoulder, bottoms on',
  ],
};

/**
 * Intimate beats — stance keywords Image 3 already maps (bent, wall, missionary…).
 * Duo lines imply a partner; solo lines stay one adult (masturbation / self-touch / undress).
 */
export const DAY_SLOT_INTIMATE_BEAT_PRESETS: Record<DaySlotId, string[]> = {
  morning: [
    'bent over the kitchen counter mid-sex with a partner behind',
    'missionary on the rumpled bed with morning light through blinds',
    'pressed against the bathroom wall mid-sex, steam in the air',
    'bent over the bathroom sink mid-sex with a partner behind',
    'solo masturbation straddling a bathroom sink edge, fogged mirror, back arched, one hand between her thighs — Cast alone',
    'alone on her back in rumpled morning sheets, knees pulled up and spread, both hands between her thighs, head tipped back — never invent a partner',
    'solo kneeling upright on the bed masturbating at sunrise — hand on her vulva, chest forward, head tipped back eyes half-lidded not at the lens — one adult only fully nude',
    'alone standing in the shower masturbating under the spray, one foot on the ledge, fogged glass — Cast alone',
  ],
  afternoon: [
    'missionary on a rumpled bed with afternoon light through blinds',
    'bent over a desk from behind with a partner gripping her hips',
    'spooning sex on the couch, afternoon light',
    'against the wall mid-sex in a quiet apartment hallway',
    'solo masturbation reclining on the couch, one leg hooked over the backrest, clothes half off — Cast alone',
    'alone on all fours on the bed masturbating, hips high, looking back over her shoulder — afternoon light',
    'solo masturbation on her side on the couch, top knee raised, hand between her thighs — one adult only',
    'alone sitting on the windowsill masturbating fully nude, blinds half-drawn, thighs open, one hand on her vulva — never both hands flat on the sill, Cast alone',
  ],
  evening: [
    'missionary on the couch at golden hour',
    'spooning sex in bed as the light fades',
    'pressed against a hotel window wall mid-sex at dusk',
    'oral sex: partner kneeling between her thighs, mouth on her vulva, both hands on her thighs — never hand in own mouth',
    'solo masturbation on the hotel bed edge, leaning back on one elbow, legs spread toward the lamp — Cast alone, empty sheets',
    'alone face-down on the bed masturbating, hips grinding into the mattress, fist in the sheets — warm lamp',
    'solo masturbation standing against the hotel wall at dusk, one knee bent, hand between her thighs — one adult only',
    'alone kneeling at the foot of the bed masturbating, back arched, looking up into the lamp — Cast alone',
  ],
  night: [
    'missionary under warm lamp light through the blinds',
    'bent over the foot of the bed from behind after dark',
    'solo masturbation on her back under a lamp, ankles near her shoulders, both hands between her thighs — Cast alone, empty sheets',
    'against the bedroom wall mid-sex, night city glow',
    'alone bent over the foot of the bed masturbating after dark, chest on the mattress, hand reaching back — Cast alone',
    'solo kneeling on the sheets masturbating after dark, riding her own hand, soft lamp — one adult only',
    'solo masturbation on her side under a lamp, bottom leg straight, top knee high, biting a pillow — empty sheets',
    'alone sitting astride a pillow on the bed masturbating after dark, grinding, head tipped back — Cast alone, never invent a partner',
  ],
};

/**
 * Crude sexual comedy for Day Raunchy mood — gag props are the setup,
 * naked mid-self-touch / slapstick sex is the punchline (NSFW-gated).
 * Solo lines lead with nude act — naming a worn dress/swimsuit lets Keep win.
 */
export const DAY_SLOT_RAUNCHY_BEAT_PRESETS: Record<DaySlotId, string[]> = {
  morning: [
    'solo fingering naked against the kitchen sink — back arched hard, one knee hooked on the counter, both hands between her thighs with two fingers buried in her vulva, Cast alone fully nude, eyes half-lidded down at her hands',
    'alone on the kitchen floor naked with knees pulled to her chest fingering herself when the toaster pops — laughing mid-act, both hands spreading and fingering her vulva, towel in a heap, one adult only',
    'solo straddling a kitchen stool fully nude riding her own hands — fogged window, head tipped all the way back, hips grinding, both hands working her vulva, Cast alone',
    'alone on her back naked in rumpled morning sheets with ankles near her shoulders masturbating — both hands between her thighs circling her clit then pushing fingers inside, Cast alone fully nude, mouth open',
    'alone on her back naked with a realistic penis-shaped silicone dildo — the tip of the penis pushed deep into her vaginal opening, shaft entering her vagina, both hands on the base thrusting deeper, knees spread, Cast alone fully nude, never invent a man or second adult, eyes half-lidded looking down',
    'partner mid-sex in the kitchen after a wardrobe fail — Cast and partner both fully visible mid-kiss turning into sex against the counter, never Cast alone',
    'bent over searching a lower cabinet when a partner pulls her shorts down into slapstick doggy-style — both adults mid-sex fully visible',
    'bent over the kitchen counter mid-slapstick sex with a partner when the coffee cup tips — two adults mid-contact',
    'pressed against the fridge mid-sex with a partner when the ice maker dumps cubes on both of them — two heads in frame',
  ],
  afternoon: [
    'solo on the couch naked with one ankle on the backrest — thighs wide, both hands between her thighs rubbing her clit hard, lamp-only comedy, Cast alone fully nude, eyes not at the lens',
    'alone pressed to the hallway wall fully nude one leg hiked — both hands buried between her thighs fingering, laughing mid-act, clothes in a pile, Cast alone',
    'solo reclining naked on the couch knees flopped open — remote slips, both hands between her thighs spreading and fingering, Cast alone, head tipped',
    'alone on all fours naked on the bed looking back over a shoulder — hips high, both hands reaching under between her thighs fingering her vulva hard, afternoon light, one adult only, fully nude',
    'alone on all fours naked looking back — one hand bracing the sheets, other hand pushing a realistic penis-shaped silicone dildo with the tip of the penis deep into her vaginal opening from behind, shaft entering her vagina, afternoon light, Cast alone fully nude, never invent a man or second adult',
    'partner mid-sex against the hallway wall after an accidental flash — roommate and Cast both fully visible, slapstick contact, never Cast alone',
    'bent over a desk mid-sex with a partner gripping her hips when the chair rolls away — both scramble laughing, two adults in frame',
    'partner yanking her pants down mid-argument into slapstick doggy-style — both adults mid-sex fully visible',
    'against the wall mid-sex with a partner when the lamp tip-over startles them mid-thrust — both freeze laughing, two heads in frame',
  ],
  evening: [
    'solo naked on the windowsill at dusk — heels planted, knees out, both hands between her thighs with two fingers deep in her vulva, head tipped back eyes half-lidded not at the lens, Cast alone fully nude',
    'alone riding her own hands naked against the minibar — lamp tip-over gag, head tipped back, both hands grinding her clit, one adult only, fully nude',
    'solo on the hotel bed edge naked leaning back — legs spread toward the lamp, both hands between her thighs working her vulva hard with fingers inside, laughing, Cast alone fully nude',
    'alone face-down naked grinding into the mattress — both hands under her between her thighs fingering deep, hips rocking, warm lamp, fully nude',
    'alone sitting on the hotel bed edge naked — thighs open toward the lamp, both hands on a realistic penis-shaped silicone dildo with the tip of the penis pushed deep into her vaginal opening thrusting in and out of her vagina, Cast alone fully nude, never invent a man or second adult, eyes half-lidded on the toy',
    'missionary on a partner when the couch cushion slides and they tumble mid-sex — both adults fully visible mid-contact',
    'oral sex: partner kneeling between her thighs mid-gag, mouth on her vulva, both hands on her thighs — lamp tip-over comedy, never hand in own mouth, never Cast alone',
    'pressed against a hotel window mid-sex with a partner when curtains stick open — both adults mid-contact comedy',
  ],
  night: [
    'solo naked tangled in sheets when the phone light turns on — knees open wide, both hands between her thighs with fingers sliding in and out of her vulva, Cast alone fully nude, eyes half-lidded on her hands',
    'alone caught mid-fingering naked when the phone camera light turns on — she keeps going harder, both hands between her thighs spreading herself and fingering, one adult only, bare skin only',
    'solo kneeling upright naked on the sheets after dark — thighs parted, both hands riding two fingers into her vulva, head tipped back eyes half-lidded not at the lens, soft lamp, Cast alone fully nude',
    'alone sitting astride a pillow naked after dark — grinding down while both hands work her clit underneath, head tipped back, bed frame squeaks comedy, never invent a partner, fully nude',
    'solo kneeling upright naked after dark — thighs parted, a realistic penis-shaped silicone dildo with the tip of the penis deep into her vaginal opening as she rides it, both hands on the base thrusting deeper into her vagina, soft lamp, Cast alone fully nude, never invent a man or second adult',
    'partner laughing as her nightshirt rides up climbing into bed — comedy undress that turns into missionary mid-laugh with both adults fully visible mid-sex',
    'missionary under neon when the bed frame collapses mid-thrust — slapstick pile-up of two adults, both heads in frame',
    'bent over the foot of the bed from behind when a partner slips and face-plants laughing — partner still in frame mid-doggy',
    'against the bedroom wall mid-sex with a partner when the smoke alarm goes off mid-climax comedy — two adults mid-contact',
  ],
};

/** Soft bedroom / hotel settings mixed in when mood is suggestive, intimate, or raunchy. */
export const DAY_SLOT_HEAT_SETTING_PRESETS: Record<DaySlotId, string[]> = {
  morning: [
    'sunlit bedroom with rumpled sheets and closed blinds — opaque walls only',
    'steamy bathroom with fogged glass and warm tile — indoor only',
    'bedroom doorway with warm lamp light — rumpled sheets visible behind, blinds closed',
  ],
  afternoon: [
    'apartment bedroom with blinds fully drawn and warm lamp light — opaque walls only',
    'hotel room with white sheets and drawn curtains — lamp only, opaque walls',
    'quiet bedroom couch with soft lamp light — blinds closed, no kitchen clutter',
  ],
  evening: [
    'dim hotel suite with warm lamp light and drawn curtains — opaque walls only',
    'bedroom with warm lamp light and unmade bed — curtains closed',
    'candlelit bedroom corner at blue hour — bare nightstand only, blinds closed',
  ],
  night: [
    'dark bedroom with a single warm lamp — bare nightstand only, curtains closed',
    'hotel room after dark with a single lamp — curtains closed, opaque walls',
    'bedroom after dark with warm lamp on bare nightstand — curtains closed',
  ],
};

/** Kitchen/counter/neon settings that collapse adult Duo into solo portraits or gel-light leaks. */
const DAY_DUO_UNSAFE_SETTING_RE =
  /\b(kitchen|cutting board|countertop|marble counter|office clutter|bookstore|coffee shop|neon\s+spill|neon\s+gel|magenta|cyan)\b/i;

/**
 * Outdoor / softcore pin-up settings — Intimate/Raunchy NSFW Rapid invents beach
 * when these nouns appear in the positive SETTING line.
 */
export const DAY_ADULT_UNSAFE_OUTDOOR_SETTING_RE =
  /\b(beach|shore(?:line)?|ocean|sea(?:side)?|harbor|harbour|waterfront|pier|boardwalk|marina|coast(?:al)?|wet\s+sand|\bsand\b|night\s+beach|city\s+lights?\s+on\s+(?:the\s+)?horizon|rooftop\s+edge|glittering\s+skyline|riverside\s+boardwalk|sunset\s+pier|ocean\s+vista|coastal\s+vista|water\s+outside|ocean\s+(?:view|visible)|sea\s+(?:view|visible)|balcony\s+(?:rail|railing|door)|glass\s+(?:balcony|sliding)\s+door|sliding\s+glass|outdoor\s+railing)\b/i;

/** Softcore prior: open/vista windows invent ocean/city-horizon pin-ups on Rapid NSFW. */
const DAY_ADULT_UNSAFE_WINDOW_VISTA_RE =
  /\b(open\s+windows?|afternoon\s+sun|city\s+(?:lights?|glow)|(?:ocean|sea|harbor|harbour|coast|water|horizon)\s+(?:through|outside|beyond|visible)|(?:through|beyond)\s+(?:an?\s+|the\s+)?(?:open\s+)?windows?\b.*\b(?:ocean|sea|water|coast|harbor|harbour|horizon|city)|vista\s+through|glass\s+(?:balcony|sliding)|sliding\s+glass|balcony\s+(?:rail|railing))\b/i;

/**
 * Rewrite open/vista windows to closed blinds so adult SETTING never invites
 * ocean-through-window softcore (Rapid NSFW LoRA prior).
 */
export function sanitizeDayAdultIndoorSetting(setting: string): string {
  let next = setting.trim();
  if (!next) {
    return next;
  }
  next = next.replace(/\bopen\s+windows?\b/gi, 'closed blinds');
  next = next.replace(/\bafternoon\s+sun\b/gi, 'drawn curtains and lamp light');
  next = next.replace(
    /\bcity\s+(?:lights?|glow)(?:\s+through\s+(?:sheer\s+)?curtains?)?\b/gi,
    'warm lamp light'
  );
  next = next.replace(
    /\b(?:ocean|sea|harbor|harbour|coast(?:al)?|water)\s+(?:view|visible|outside|through\s+(?:an?\s+|the\s+)?windows?)\b/gi,
    'closed curtains'
  );
  next = next.replace(/\b(?:glass\s+)?(?:balcony|sliding)\s+doors?\b/gi, 'closed blinds');
  next = next.replace(/\bsliding\s+glass\b/gi, 'closed blinds');
  next = next.replace(/\bbalcony\s+(?:rail|railing)s?\b/gi, 'bare wall');
  if (
    /\bwindows?\b/i.test(next) &&
    !/\b(blinds|curtains|closed|drawn|sheer|fogged)\b/i.test(next)
  ) {
    next = next.replace(/\bwindows?\b/gi, 'closed blinds');
  }
  return next;
}

/**
 * Indoor Setting for adult nude Day stills — never pass raw pier/beach/boardwalk
 * into the positive (Rapid NSFW LoRAs lock onto outdoor softcore).
 */
export function resolveDayAdultIndoorSetting(input: {
  setting?: string | null;
  slotId?: DaySlotId | null;
}): string {
  const slotId = input.slotId ?? 'night';
  const heat = DAY_SLOT_HEAT_SETTING_PRESETS[slotId] ?? DAY_SLOT_HEAT_SETTING_PRESETS.night!;
  const fallback = heat[0] ?? 'dark bedroom with a single warm lamp — bare nightstand only';
  const raw = input.setting?.trim() || '';
  if (!raw) {
    return fallback;
  }
  if (DAY_ADULT_UNSAFE_OUTDOOR_SETTING_RE.test(raw) || DAY_STALE_EVERYDAY_PROP_RE.test(raw)) {
    return fallback;
  }
  // Softcore prior: open window / city lights / ocean vista → night-beach invent.
  if (DAY_ADULT_UNSAFE_WINDOW_VISTA_RE.test(raw) || /city\s+lights?/i.test(raw)) {
    return fallback;
  }
  const sanitized = sanitizeDayAdultIndoorSetting(raw);
  if (heat.includes(sanitized) || heat.includes(raw)) {
    return sanitized;
  }
  if (
    /\b(bedroom|hotel|bathroom|apartment|sheets|lamp|nightstand|blinds|curtains|suite)\b/i.test(
      sanitized
    )
  ) {
    return sanitized;
  }
  return fallback;
}

function pickUnusedPreset(
  pool: string[],
  used: Set<string>,
  random: () => number
): string | undefined {
  const available = pool.filter(entry => !used.has(entry.trim().toLowerCase()));
  const pickFrom = available.length > 0 ? available : pool;
  if (pickFrom.length === 0) {
    return undefined;
  }
  return pickFrom[Math.floor(random() * pickFrom.length)]!;
}

/**
 * Like {@link pickUnusedPreset}, but also avoids stances already used by earlier slots — four
 * distinct beat strings that are all "standing by a window" still read as one pose.
 */
function pickUnusedBeatWithFreshPose(
  pool: string[],
  usedBeats: Set<string>,
  usedPoseClasses: Set<string>,
  random: () => number
): string | undefined {
  const unused = pool.filter(entry => !usedBeats.has(entry.trim().toLowerCase()));
  const pickFrom = unused.length > 0 ? unused : pool;
  const fresh = pickFrom.filter(entry => !usedPoseClasses.has(dayEverydayPoseClass(entry)));
  const finalPool = fresh.length > 0 ? fresh : pickFrom;
  if (finalPool.length === 0) {
    return undefined;
  }
  return finalPool[Math.floor(random() * finalPool.length)]!;
}

function beatPoolForDayMood(
  slotId: DaySlotId,
  mood: DayMood,
  allowCompanions: boolean,
  intimateMix: DayIntimateMix = 'mixed'
): string[] {
  const solo = DAY_SLOT_BEAT_PRESETS[slotId] ?? [];
  const companion = allowCompanions ? (DAY_SLOT_COMPANION_BEAT_PRESETS[slotId] ?? []) : [];
  if (mood === 'suggestive') {
    // Heat-only — everyday coffee/walk beats flatten suggestive into polite portraits.
    return DAY_SLOT_SUGGESTIVE_BEAT_PRESETS[slotId] ?? [];
  }
  if (mood === 'sport') {
    return DAY_SLOT_SPORT_BEAT_PRESETS[slotId] ?? [];
  }
  if (mood === 'vacation') {
    return DAY_SLOT_VACATION_BEAT_PRESETS[slotId] ?? [];
  }
  if (mood === 'intimate') {
    const heat = intimateBeatsForMix(slotId, intimateMix);
    // Solo/Duo mix must stay inside the adult pool — no everyday coffee/walk fallback.
    if (intimateMix !== 'mixed') {
      return heat;
    }
    return [...heat, ...solo, ...companion];
  }
  if (mood === 'raunchy') {
    const heat = raunchyBeatsForMix(slotId, intimateMix);
    if (intimateMix !== 'mixed') {
      return heat;
    }
    return [...heat, ...solo, ...companion];
  }
  return [...solo, ...companion];
}

function heatBeatPoolForDayMood(
  slotId: DaySlotId,
  mood: DayMood,
  intimateMix: DayIntimateMix
): string[] {
  if (mood === 'suggestive') {
    return DAY_SLOT_SUGGESTIVE_BEAT_PRESETS[slotId] ?? [];
  }
  if (mood === 'sport') {
    return DAY_SLOT_SPORT_BEAT_PRESETS[slotId] ?? [];
  }
  if (mood === 'vacation') {
    return DAY_SLOT_VACATION_BEAT_PRESETS[slotId] ?? [];
  }
  if (mood === 'intimate') {
    return intimateBeatsForMix(slotId, intimateMix);
  }
  if (mood === 'raunchy') {
    return raunchyBeatsForMix(slotId, intimateMix);
  }
  return [];
}

function preferHeatChance(mood: DayMood): number {
  if (isDayAdultMood(mood)) {
    return 0.75;
  }
  if (mood === 'suggestive' || mood === 'sport' || mood === 'vacation') {
    return 0.95;
  }
  return 0;
}

/** Everyday / bookstore / office props that must not survive under adult moods. */
const DAY_STALE_EVERYDAY_PROP_RE =
  /\b(notebooks?|clipboards?|spreadsheet|ledgers?|journals?|planners?|open book|holding (?:a )?(?:book|paper|pen)|reading (?:a )?(?:book|menu|page)|grocery|tote bag|park bench|bookstore|office desk|coffee shop)\b/i;

/**
 * Primary beat pool for Suggest/Reroll. Solo/Duo adult mix always picks from heat
 * (never everyday solo). Mixed/suggestive keep probabilistic heat preference.
 */
function scrubAdultUnsafeBeats(pool: readonly string[]): string[] {
  return pool.filter(beat => !DAY_STALE_EVERYDAY_PROP_RE.test(beat));
}

function pickDayBeatPools(
  slotId: DaySlotId,
  dayMood: DayMood,
  intimateMix: DayIntimateMix,
  allowCompanions: boolean,
  random: () => number
): { primary: string[]; fallback: string[] } {
  const heatPool = heatBeatPoolForDayMood(slotId, dayMood, intimateMix);
  const fallback = beatPoolForDayMood(slotId, dayMood, allowCompanions, intimateMix);
  // Suggestive + sport + adult Solo/Duo: always pick from heat — everyday baselines flatten the mood.
  if (
    (dayMood === 'suggestive' || dayMood === 'sport' || dayMood === 'vacation') &&
    heatPool.length > 0
  ) {
    return { primary: heatPool, fallback: heatPool };
  }
  if (isDayAdultMood(dayMood) && intimateMix !== 'mixed' && heatPool.length > 0) {
    return { primary: heatPool, fallback: heatPool };
  }
  const companionPool = allowCompanions ? (DAY_SLOT_COMPANION_BEAT_PRESETS[slotId] ?? []) : [];
  const soloPool = DAY_SLOT_BEAT_PRESETS[slotId] ?? [];
  const preferHeat = heatPool.length > 0 && random() < preferHeatChance(dayMood);
  const preferCompanion =
    !preferHeat && allowCompanions && companionPool.length > 0 && random() < 0.4;
  const primary = preferHeat ? heatPool : preferCompanion ? companionPool : soloPool;
  // Adult Mixed can still roll everyday pools — drop book/reading beats.
  if (isDayAdultMood(dayMood)) {
    const scrubbedPrimary = scrubAdultUnsafeBeats(primary);
    const scrubbedFallback = scrubAdultUnsafeBeats(fallback);
    return {
      primary:
        scrubbedPrimary.length > 0
          ? scrubbedPrimary
          : heatPool.length > 0
            ? heatPool
            : scrubbedPrimary,
      fallback:
        scrubbedFallback.length > 0
          ? scrubbedFallback
          : heatPool.length > 0
            ? heatPool
            : scrubbedFallback,
    };
  }
  return { primary, fallback };
}

function settingPoolForDayMood(
  slotId: DaySlotId,
  mood: DayMood,
  intimateMix: DayIntimateMix = 'mixed'
): string[] {
  const base = DAY_SLOT_SETTING_PRESETS[slotId] ?? [];
  if (mood === 'everyday') {
    return base;
  }
  if (mood === 'sport') {
    const sportSettings = DAY_SLOT_SPORT_SETTING_PRESETS[slotId] ?? [];
    return sportSettings.length > 0 ? sportSettings : base;
  }
  if (mood === 'vacation') {
    const vacationSettings = DAY_SLOT_VACATION_SETTING_PRESETS[slotId] ?? [];
    return vacationSettings.length > 0 ? vacationSettings : base;
  }
  const heat = DAY_SLOT_HEAT_SETTING_PRESETS[slotId] ?? [];
  // Intimate/raunchy: stay in bedroom/hotel heat — public piers fight oral/sex beats.
  if (isDayAdultMood(mood) && heat.length > 0) {
    // Duo: drop kitchen/counter still-life settings that win over the sex act.
    if (intimateMix === 'duo') {
      const safe = heat.filter(entry => !DAY_DUO_UNSAFE_SETTING_RE.test(entry));
      return safe.length > 0 ? safe : heat;
    }
    return heat;
  }
  // Suggestive: heat settings only — everyday cafés/parks fight lingerie/doorway beats.
  if (mood === 'suggestive' && heat.length > 0) {
    return heat;
  }
  return [...heat, ...base];
}

/**
 * Fill empty Day slot settings (and optional beats) with distinct time-of-day presets
 * so Queue day does not repeat one vague backdrop across morning→night.
 */
export function diversifyDaySlotScenes(
  slots: DaySlot[] | null | undefined,
  options?: {
    /** Overwrite existing locations (default: only fill blanks). */
    forceLocations?: boolean;
    /** Also fill empty beat/sceneHints fields. */
    fillBeats?: boolean;
    /** Overwrite existing beats when fillBeats is true. */
    forceBeats?: boolean;
    /** Mix in selfie/friend companion beats (~half the pool). */
    allowCompanions?: boolean;
    /** Everyday / suggestive / intimate / raunchy beat mix. */
    dayMood?: DayMood | string | null;
    /** Solo / duo / mixed filter when dayMood is intimate or raunchy. */
    intimateMix?: DayIntimateMix | string | null;
    random?: () => number;
  }
): { slots: DaySlot[]; changed: boolean } {
  const random = options?.random ?? Math.random;
  const forceLocations = options?.forceLocations === true;
  const fillBeats = options?.fillBeats !== false;
  const forceBeats = options?.forceBeats === true;
  const allowCompanions = options?.allowCompanions === true;
  const dayMood = normalizeDayMood(options?.dayMood);
  const intimateMix = normalizeDayIntimateMix(options?.intimateMix);
  const usedLocations = new Set<string>();
  const usedBeats = new Set<string>();
  const usedVacationPoseClasses = new Set<string>();
  const usedEverydayPoseClasses = new Set<string>();
  let changed = false;

  const normalized = normalizeDaySlots(slots);
  for (const slot of normalized) {
    const location = slot.location?.trim();
    if (location && !forceLocations) {
      usedLocations.add(location.toLowerCase());
    }
    const beat = slot.sceneHints?.trim();
    if (beat && !forceBeats) {
      usedBeats.add(beat.toLowerCase());
      if (dayMood === 'vacation') {
        usedVacationPoseClasses.add(vacationPoseClassFromBeat(beat));
      } else if (!isDayHeatMood(dayMood)) {
        usedEverydayPoseClasses.add(dayEverydayPoseClass(beat));
      }
    }
  }

  const next = normalized.map(slot => {
    let location = slot.location?.trim() || '';
    let sceneHints = slot.sceneHints?.trim() || '';
    let slotChanged = false;

    // Sport: pick one sport then matching beat+venue together (never road pin-up + tennis text).
    if (dayMood === 'sport' && (forceLocations || forceBeats || !location || !sceneHints)) {
      const pair = pickDaySportScenePair(slot.id, {
        usedBeats,
        usedLocations,
        random,
      });
      if (pair) {
        if (forceLocations || !location) {
          location = pair.setting;
          slotChanged = true;
        }
        if (fillBeats && (forceBeats || !sceneHints)) {
          sceneHints = pair.beat;
          slotChanged = true;
        }
        if (location) {
          usedLocations.add(location.toLowerCase());
        }
        if (sceneHints) {
          usedBeats.add(sceneHints.toLowerCase());
        }
        if (slotChanged) {
          changed = true;
          return {
            ...slot,
            location: location || undefined,
            sceneHints: sceneHints || undefined,
          };
        }
      }
    }

    // Vacation: matched travel beat + venue; prefer a fresh pose class each slot.
    if (dayMood === 'vacation' && (forceLocations || forceBeats || !location || !sceneHints)) {
      const pair = pickDayVacationScenePair(slot.id, {
        usedBeats,
        usedLocations,
        usedPoseClasses: usedVacationPoseClasses,
        random,
      });
      if (pair) {
        if (forceLocations || !location) {
          location = pair.setting;
          slotChanged = true;
        }
        if (fillBeats && (forceBeats || !sceneHints)) {
          sceneHints = pair.beat;
          slotChanged = true;
        }
        if (location) {
          usedLocations.add(location.toLowerCase());
        }
        if (sceneHints) {
          usedBeats.add(sceneHints.toLowerCase());
          usedVacationPoseClasses.add(pair.poseClass);
        }
        if (slotChanged) {
          changed = true;
          return {
            ...slot,
            location: location || undefined,
            sceneHints: sceneHints || undefined,
          };
        }
      }
    }

    if (!location || forceLocations) {
      const picked = pickUnusedPreset(
        settingPoolForDayMood(slot.id, dayMood, intimateMix),
        usedLocations,
        random
      );
      if (picked && picked !== location) {
        location = picked;
        slotChanged = true;
      }
    }
    if (location) {
      usedLocations.add(location.toLowerCase());
    }

    if (fillBeats && (!sceneHints || forceBeats)) {
      const { primary, fallback } = pickDayBeatPools(
        slot.id,
        dayMood,
        intimateMix,
        allowCompanions,
        random
      );
      // Heat moods own their own stance spreading; everyday used to dedupe text only, which is
      // how four different beats could all come back as a standing plate pose.
      const picked = isDayHeatMood(dayMood)
        ? pickUnusedPreset(primary, usedBeats, random) ||
          pickUnusedPreset(fallback, usedBeats, random)
        : pickUnusedBeatWithFreshPose(primary, usedBeats, usedEverydayPoseClasses, random) ||
          pickUnusedBeatWithFreshPose(fallback, usedBeats, usedEverydayPoseClasses, random);
      if (picked && picked !== sceneHints) {
        sceneHints = picked;
        slotChanged = true;
      }
    }
    if (sceneHints) {
      usedBeats.add(sceneHints.toLowerCase());
      if (!isDayHeatMood(dayMood)) {
        usedEverydayPoseClasses.add(dayEverydayPoseClass(sceneHints));
      }
    }

    if (!slotChanged) {
      return slot;
    }
    changed = true;
    return {
      ...slot,
      location: location || undefined,
      sceneHints: sceneHints || undefined,
    };
  });

  return { slots: next, changed };
}

/**
 * True when a filled Setting/Beat still matches the active heat mood pools.
 * Stale everyday boards (notebook, grocery, bookstore, bland walk) fail — including Suggestive.
 */
export function daySlotMatchesAdultMix(input: {
  slot: DaySlot;
  dayMood: DayMood | string | null | undefined;
  intimateMix?: DayIntimateMix | string | null;
}): boolean {
  const dayMood = normalizeDayMood(input.dayMood);
  if (!isDayHeatMood(dayMood)) {
    return true;
  }
  const mix = normalizeDayIntimateMix(input.intimateMix);
  const beat = input.slot.sceneHints?.trim() || '';
  const setting = input.slot.location?.trim() || '';
  if (!beat) {
    return false;
  }
  if (DAY_STALE_EVERYDAY_PROP_RE.test(beat) || DAY_STALE_EVERYDAY_PROP_RE.test(setting)) {
    return false;
  }
  // Suggestive: beat must look like clothed heat, not an everyday walk/coffee still
  // and never leftover Intimate/Raunchy mid-sex / partner boards or Vacation travel plans.
  if (dayMood === 'suggestive') {
    if (DAY_CLOTHED_MOOD_SEX_LEAK_RE.test(beat) || DAY_CLOTHED_MOOD_SEX_LEAK_RE.test(setting)) {
      return false;
    }
    // Leftover Vacation boards (pier/scooter/hotel terrace) survive on shared pose
    // words like perched/reclining — force-reroll catalog travel slots.
    const vacationSettings = DAY_SLOT_VACATION_SETTING_PRESETS[input.slot.id] ?? [];
    if (vacationSettings.includes(setting)) {
      return false;
    }
    const vacationBeats = DAY_SLOT_VACATION_BEAT_PRESETS[input.slot.id] ?? [];
    if (vacationBeats.includes(beat)) {
      return false;
    }
    if (DAY_SUGGESTIVE_VACATION_LEAK_SETTING_RE.test(setting)) {
      return false;
    }
    const heat = heatBeatPoolForDayMood(input.slot.id, dayMood, mix);
    if (heat.includes(beat)) {
      return true;
    }
    return DAY_SUGGESTIVE_BEAT_CUE_RE.test(beat);
  }
  // Sport: beat must be athletic mid-action AND setting a sport venue — beach/café/garage fight the mood.
  if (dayMood === 'sport') {
    if (DAY_SPORT_STALE_SETTING_RE.test(setting)) {
      return false;
    }
    const heat = heatBeatPoolForDayMood(input.slot.id, dayMood, mix);
    const beatOk = heat.includes(beat) || DAY_SPORT_BEAT_CUE_RE.test(beat);
    if (!beatOk) {
      return false;
    }
    const sportSettings = DAY_SLOT_SPORT_SETTING_PRESETS[input.slot.id] ?? [];
    if (sportSettings.includes(setting)) {
      return true;
    }
    return DAY_SPORT_SETTING_CUE_RE.test(setting);
  }
  // Vacation: travel beat + resort/hotel/market venue — office/grocery fight the mood;
  // leftover Intimate/Raunchy mid-sex boards also force-reroll.
  if (dayMood === 'vacation') {
    if (DAY_VACATION_STALE_SETTING_RE.test(setting)) {
      return false;
    }
    if (DAY_CLOTHED_MOOD_SEX_LEAK_RE.test(beat) || DAY_CLOTHED_MOOD_SEX_LEAK_RE.test(setting)) {
      return false;
    }
    const heat = heatBeatPoolForDayMood(input.slot.id, dayMood, mix);
    const beatOk = heat.includes(beat) || DAY_VACATION_BEAT_CUE_RE.test(beat);
    if (!beatOk) {
      return false;
    }
    const vacationSettings = DAY_SLOT_VACATION_SETTING_PRESETS[input.slot.id] ?? [];
    if (vacationSettings.includes(setting)) {
      return true;
    }
    return DAY_VACATION_SETTING_CUE_RE.test(setting);
  }
  // Intimate/Raunchy: pier/beach/boardwalk Settings → night-beach softcore on Rapid NSFW.
  if (isDayAdultMood(dayMood) && DAY_ADULT_UNSAFE_OUTDOOR_SETTING_RE.test(setting)) {
    return false;
  }
  // Duo: kitchen/counter still-life settings collapse into tame portraits.
  if (mix === 'duo' && DAY_DUO_UNSAFE_SETTING_RE.test(setting)) {
    return false;
  }
  // Mixed may keep custom heat beats — only prop/empty checks above apply.
  if (mix === 'mixed') {
    return true;
  }
  const heat = heatBeatPoolForDayMood(input.slot.id, dayMood, mix);
  if (heat.length === 0) {
    return true;
  }
  if (!heat.includes(beat)) {
    // Custom / edited beats: still require partner vs solo headcount for Duo/Solo.
    if (mix === 'duo' && countPoseGuidePeople(`${setting} · ${beat}`) < 2) {
      return false;
    }
    if (
      mix === 'solo' &&
      (dayMood === 'raunchy' ? !isDayRaunchySoloBeat(beat) : !isDayIntimateSoloBeat(beat)) &&
      countPoseGuidePeople(`${setting} · ${beat}`) >= 2
    ) {
      return false;
    }
    // Non-preset but looks adult enough — keep.
    if (
      /\b(sex|mid-sex|oral|nude|naked|partner|cowgirl|missionary|doggy|straddl|flash|wardrobe)\b/i.test(
        beat
      )
    ) {
      return mix === 'duo' ? countPoseGuidePeople(`${setting} · ${beat}`) >= 2 : true;
    }
    return false;
  }
  return true;
}

/**
 * Mid-sex / partner leaks that must not survive on Suggestive or Vacation boards
 * (leftover Intimate/Raunchy plans + NSFW Edit invent doggy duo from these).
 */
export const DAY_CLOTHED_MOOD_SEX_LEAK_RE =
  /\b(mid-sex|mid-thrust|doggy|missionary|cowgirl|oral\s+sex|from\s+behind|partner\s+behind|man\s+behind|second\s+adult|fully\s+nude|masturbat|fingering|self[- ]touch|bent\s+over.{0,40}(?:sex|doggy|partner)|pressed\s+against.{0,40}mid-sex)\b/i;

/** Clothed-heat cues — custom Suggestive beats that still read as suggestive. */
const DAY_SUGGESTIVE_BEAT_CUE_RE =
  /\b(lingerie|silk robe|robe loosely|sleepwear|neckline|strap slip|unzip|short (?:hem|dress)|bare (?:thigh|leg|skin)|cleavage|flirt|charged|inviting|fade[- ]to[- ]black|half[- ]shed|coat open|dress strap|weight on one hip|looking back|doorway|bed edge|hip cocked|kneeling|reclining|perched|chair back)\b/i;

/**
 * Vacation travel venues that must not survive under Suggestive (shared pose words
 * like perched/reclining otherwise keep pier/scooter/hotel-terrace boards).
 */
const DAY_SUGGESTIVE_VACATION_LEAK_SETTING_RE =
  /\b(pier|fishing\s+pier|bait\s+shops?|cobblestone|hotel\s+(?:terrace|balcony|lobby|suite|hallway)|resort|boardwalk|harbor|ferry|beach\s+(?:bar|club|umbrella|daybed)|scooter|market\s+stall|ice[- ]?cream|gulls|delivery\s+bikes?|ocean\s+breeze|bright\s+afternoon\s+water)\b/i;

/** Athletic mid-action cues — custom Sport beats that still read as sport. */
const DAY_SPORT_BEAT_CUE_RE =
  /\b(sprint|serve|swing|dunk|tackle|dribble|lunge|parry|vault|hurdle|stride|forehand|backhand|pitch|slide|kick|header|climb|dyno|handstand|tumbling|yoga|pose hold|bike|pedal|stroke|putt|javelin|discus|shot put|martial|fencing|gymnast|ski|carve|slalom|athletic|mid[- ](?:play|stride|action)|court|pitch|piste|dojo|track)\b/i;

/** Sport venue cues — custom Sport settings that still read as athletic venues. */
const DAY_SPORT_SETTING_CUE_RE =
  /\b(court|pitch|field|track|stadium|arena|gym|dojo|piste|rink|pool|course|trail|climbing\s+wall|boulder|velodrome|diamond|gridiron|sideline|baseline|lane|mat)\b/i;

/**
 * Sport mood must discard Outfit Keep / catalog street clothes and dress the
 * beat's athletic kit — Keep sundresses win over SPORT KIT otherwise.
 */
export function dayMoodReplacesKeepOutfit(dayMood: DayMood | string | null | undefined): boolean {
  return isDaySportMood(dayMood);
}

/**
 * Force-reroll Setting/Beat when heat boards still hold everyday scenes or book props.
 * Call on mood/mix change and before Queue when chips disagree with the board.
 */
export function ensureDaySlotsMatchMood(
  slots: DaySlot[] | null | undefined,
  options: {
    dayMood: DayMood | string | null | undefined;
    intimateMix?: DayIntimateMix | string | null;
    allowCompanions?: boolean;
    random?: () => number;
  }
): { slots: DaySlot[]; changed: boolean } {
  const dayMood = normalizeDayMood(options.dayMood);
  if (!isDayHeatMood(dayMood)) {
    return { slots: normalizeDaySlots(slots), changed: false };
  }
  const mix = normalizeDayIntimateMix(options.intimateMix);
  const normalized = normalizeDaySlots(slots);
  const stale = normalized.some(
    slot =>
      !daySlotMatchesAdultMix({
        slot,
        dayMood,
        intimateMix: mix,
      })
  );
  if (!stale) {
    return { slots: normalized, changed: false };
  }
  return diversifyDaySlotScenes(normalized, {
    forceLocations: true,
    forceBeats: true,
    fillBeats: true,
    allowCompanions: options.allowCompanions === true,
    dayMood,
    intimateMix: mix,
    random: options.random,
  });
}

/**
 * Drop Keep kit / Image 2 for Day adult sex beats.
 * Adult Duo always drops the kit (Keep swimsuit fights the act).
 * Raunchy slapstick may name shorts/pants as gag props — still omit the worn kit on sex beats.
 */
export function dayBeatOmitsGarmentPackshot(input: {
  blurb?: string | null;
  prompt?: string | null;
  dayMood?: DayMood | string | null;
  intimateMix?: DayIntimateMix | string | null;
}): boolean {
  const haystack = [input.blurb, input.prompt].filter(Boolean).join(' · ');
  if (
    storyBeatOmitsGarmentPackshot({
      blurb: input.blurb ?? undefined,
      prompt: input.prompt ?? undefined,
    })
  ) {
    return true;
  }
  if (!isDayAdultMood(input.dayMood)) {
    return false;
  }
  // Pure flash / wardrobe-fail gags with no self-touch keep clothes — that is the joke.
  // Raunchy Solo punchlines that name masturbation / fingering still drop Keep kit.
  if (
    /\b(wardrobe\s+malfunction|nip\s*slip|skirt\s+flip|accidental\s+flash|flashing)\b/i.test(
      haystack
    ) &&
    !/\b(mid-sex|mid-thrust|doggy|missionary|cowgirl|straddl|oral\s+sex|from\s+behind|masturbat|finger(?:ing)?|self[- ]touch|hand between her thighs|rides? her own hand|grinding on her own|fingers?\s+(?:inside|on|rubbing)|clit)\b/i.test(
      haystack
    )
  ) {
    return false;
  }
  const mix = normalizeDayIntimateMix(input.intimateMix);
  // Adult Duo: Keep bra/swimsuit + soft prior invents books — always drop kit on partner beats.
  if (mix === 'duo') {
    return true;
  }
  // Intimate / Raunchy Solo self-touch: always drop Keep / Cast underwear plates.
  if (mix === 'solo' && isDayAdultMood(input.dayMood)) {
    return true;
  }
  if (
    normalizeDayMood(input.dayMood) === 'raunchy' &&
    isDayRaunchySoloBeat(haystack) &&
    DAY_RAUNCHY_SELF_TOUCH_RE.test(haystack)
  ) {
    return true;
  }
  if (!haystack.trim()) {
    return false;
  }
  return /\b(mid-sex|mid-thrust|mid-climax|doggy|missionary|cowgirl|straddl|oral\s+sex|from\s+behind|bent\s+over.{0,48}(?:sex|doggy|partner)|pressed\s+against.{0,40}mid-sex|partner|masturbat|self[- ]pleasur|touch(?:ing)?\s+(?:herself|himself|themselves)|alone\s+on|solo\s+kneeling|hands?\s+on\s+(?:her|his|their)\s+own|finger(?:ing)?|fingers?\s+(?:inside|on|rubbing)|clit)\b/i.test(
    haystack
  );
}

/**
 * Reroll setting and/or beat for one Day slot — prefers presets unused by other slots.
 */
export function rerollDaySlotScene(
  slots: DaySlot[] | null | undefined,
  slotId: DaySlotId,
  options?: {
    rerollLocation?: boolean;
    rerollBeat?: boolean;
    allowCompanions?: boolean;
    dayMood?: DayMood | string | null;
    intimateMix?: DayIntimateMix | string | null;
    random?: () => number;
  }
): { slots: DaySlot[]; changed: boolean } {
  const random = options?.random ?? Math.random;
  const rerollLocation = options?.rerollLocation !== false;
  const rerollBeat = options?.rerollBeat !== false;
  const allowCompanions = options?.allowCompanions === true;
  const dayMood = normalizeDayMood(options?.dayMood);
  const intimateMix = normalizeDayIntimateMix(options?.intimateMix);

  const normalized = normalizeDaySlots(slots);
  const target = normalized.find(slot => slot.id === slotId);
  if (!target) {
    return { slots: normalized, changed: false };
  }

  const usedLocations = new Set<string>();
  const usedBeats = new Set<string>();
  for (const slot of normalized) {
    if (slot.id === slotId) {
      continue;
    }
    const location = slot.location?.trim();
    if (location) {
      usedLocations.add(location.toLowerCase());
    }
    const beat = slot.sceneHints?.trim();
    if (beat) {
      usedBeats.add(beat.toLowerCase());
    }
  }

  let location = target.location?.trim() || '';
  let sceneHints = target.sceneHints?.trim() || '';
  let changed = false;

  if (rerollLocation) {
    const picked = pickUnusedPreset(
      settingPoolForDayMood(slotId, dayMood, intimateMix),
      usedLocations,
      random
    );
    if (picked && picked !== location) {
      location = picked;
      changed = true;
    }
  }

  if (rerollBeat) {
    const { primary, fallback } = pickDayBeatPools(
      slotId,
      dayMood,
      intimateMix,
      allowCompanions,
      random
    );
    const picked =
      pickUnusedPreset(primary, usedBeats, random) || pickUnusedPreset(fallback, usedBeats, random);
    if (picked && picked !== sceneHints) {
      sceneHints = picked;
      changed = true;
    }
  }

  if (!changed) {
    return { slots: normalized, changed: false };
  }

  const next = normalized.map(slot =>
    slot.id === slotId
      ? {
          ...slot,
          location: location || undefined,
          sceneHints: sceneHints || undefined,
        }
      : slot
  );
  return { slots: next, changed: true };
}

/** Short user-facing reason Day queue is blocked, or null when ready. */
export function dayQueueBlockReason(input: {
  hasCharacter: boolean;
  hasPlate: boolean;
  isolateSubject?: boolean;
  isolatePending?: boolean;
}): string | null {
  if (!input.hasCharacter) {
    return 'Pick a Cast character in Setup first.';
  }
  if (!input.hasPlate) {
    return 'Add a look plate on Cast (or Keep a try-on in Outfit) before Queue day.';
  }
  if (input.isolateSubject && input.isolatePending) {
    return 'Wait for plate isolate on white to finish.';
  }
  return null;
}

/** Short status line for plate · mood · stills/clips chrome. */
export function daySessionStatusLine(input: {
  hasPlate: boolean;
  dayMood?: DayMood | string | null;
  intimateMix?: DayIntimateMix | string | null;
  completedStills?: number;
  completedClips?: number;
  slotTotal?: number;
  kitLabel?: string | null;
}): string {
  const plate = input.hasPlate ? 'Plate ready' : 'No plate';
  const mood = normalizeDayMood(input.dayMood);
  const mix = normalizeDayIntimateMix(input.intimateMix);
  const moodBit =
    isDayAdultMood(mood) && mix !== 'mixed'
      ? `${mood} · ${mix}`
      : mood === 'everyday'
        ? 'everyday'
        : mood;
  const stills = Math.max(0, input.completedStills ?? 0);
  const clips = Math.max(0, input.completedClips ?? 0);
  const total = Math.max(0, input.slotTotal ?? 4);
  const progress = `${stills}/${total} stills · ${clips} clip${clips === 1 ? '' : 's'}`;
  const kit = input.kitLabel?.trim();
  return kit
    ? `${plate} · ${moodBit} · ${kit} · ${progress}`
    : `${plate} · ${moodBit} · ${progress}`;
}

/** Resolve Image 3 / SOLO SUBJECT headcount for a Day still. */
export function resolveDayPoseHeadcount(input: {
  haystack: string;
  beat?: string | null;
  dayMood: DayMood;
  intimateMix?: DayIntimateMix;
  allowCompanions?: boolean;
}): number {
  const counted = countPoseGuidePeople(input.haystack);
  const allowCompanions = input.allowCompanions === true;
  // Suggestive / Vacation / Sport / Everyday: never invent a partner from
  // furniture "straddle"/sex-vocab false positives unless Duo · companions is on.
  if (!isDayAdultMood(input.dayMood)) {
    if (!allowCompanions) {
      return 1;
    }
    return Math.min(2, Math.max(1, counted));
  }
  const mix = normalizeDayIntimateMix(input.intimateMix);
  if (mix === 'solo') {
    return 1;
  }
  if (mix === 'duo') {
    // Duo chip means exactly two — never let a crowd/threesome cue inflate Image 3.
    return 2;
  }
  const beat = input.beat?.trim() || '';
  if (
    beat &&
    (input.dayMood === 'raunchy' ? isDayRaunchySoloBeat(beat) : isDayIntimateSoloBeat(beat))
  ) {
    return 1;
  }
  // Mixed adult: still cap at 2 unless the beat explicitly names a trio.
  if (counted >= 3 && !/\b(threesome|three[- ]way|mmf|ffm|trio)\b/i.test(input.haystack)) {
    return 2;
  }
  return counted;
}

/** Scene prompt for one time-of-day still. */
export function buildDaySlotPrompt(input: {
  slot: DaySlot;
  wardrobeLabel?: string;
  characterName?: string;
  characterDescriptor?: string;
  lockedLocation?: string;
  notes?: string;
  /** When true, prompt is an img2img edit brief (plate is Image 1). */
  hasPlate?: boolean;
  /** keeper = Image 1 is Outfit Keep (outfit fidelity); cast = face plate only. */
  plateSource?: 'keeper' | 'cast';
  /** Image 1 is isolate-on-white — must fill the void with SETTING. */
  plateIsolated?: boolean;
  /**
   * Keep stays Image 1. Optional wardrobe packshot as Image 2 reinforces garments
   * (Fitting pattern) without swapping Cast onto Image 1.
   */
  garmentReinforce?: boolean;
  /** Vision (or manual) description of a BYO clothing packshot on Image 2. */
  garmentDescription?: string;
  /** Crude stick-figure / wireframe on Image 3 for pose unlock. */
  poseGuide?: boolean;
  /** Which Image 3 art was drawn (OpenPose by default). */
  poseGuideStyle?: PoseGuideStylePreference;
  /** OpenPose multi-figure: where the lead skeleton sits, so the prompt can name it. */
  poseLeadPosition?: PoseLeadPosition | null;
  /** Active model — Rapid AIO uses gray-outline Image 3 cue language. */
  model?: string | null;
  /** Settings realism mode — pose guide locks photoreal unless anime/off. */
  realismMode?: RenderRealismMode;
  /**
   * When true, skip the hard solo lock and allow a friend/selfie companion
   * (different face from Image 1 Cast).
   */
  allowCompanions?: boolean;
  /** Everyday / suggestive / intimate / raunchy heat for this Day session. */
  dayMood?: DayMood | string | null;
  /** Solo / duo / mixed — forces partner vs solo locks on adult moods. */
  intimateMix?: DayIntimateMix | string | null;
  /** Drop Image 2 + outfit continuity when the beat defaults to nude. */
  omitGarment?: boolean;
  /**
   * Image 1 is a face/shoulders crop (Cast face lock or auto top-center crop).
   * Nude: invent bare body from beat + Image 3.
   * Vacation/Suggestive upright breaks: invent body pose from Image 3; outfit from
   * Image 2 Keep/packshot (full-body Keep as Image 1 freezes MID-STRIDE/WAVING).
   */
  faceOnlyIdentity?: boolean;
  /**
   * Sport mood: discard Image 1 Keep / street clothes and dress the athletic kit
   * (face-only identity — not nude omit).
   */
  replaceKeepOutfit?: boolean;
}): string {
  const slot = input.slot;
  const name = input.characterName?.trim();
  const descriptor = input.characterDescriptor?.trim();
  const outfit = input.wardrobeLabel?.trim() || slot.wardrobeId?.trim() || '';
  const rawSetting = resolveRoleplaySetting(slot.location, input.lockedLocation);
  const hints = slot.sceneHints?.trim();
  const notes = input.notes?.trim();
  const garmentDescription = input.garmentDescription?.trim();
  const timeOfDay = slot.label.toLowerCase();
  const defaultPose = resolveDaySlotPoseBaseline(slot);
  const cameraCue = resolveDaySlotCameraCue(slot);
  const allowCompanions = input.allowCompanions === true;
  const dayMood = normalizeDayMood(input.dayMood);
  const intimateMix = normalizeDayIntimateMix(input.intimateMix);
  // Intimate/Raunchy: never feed pier/beach/boardwalk nouns into the positive SETTING.
  const setting = isDayAdultMood(dayMood)
    ? resolveDayAdultIndoorSetting({ setting: rawSetting, slotId: slot.id })
    : rawSetting;
  const omitGarment = input.omitGarment === true;
  const faceOnlyIdentity = input.faceOnlyIdentity === true;
  const clothedFaceBreak =
    faceOnlyIdentity && !omitGarment && (dayMood === 'vacation' || dayMood === 'suggestive');
  const replaceKeepOutfit =
    !omitGarment && (input.replaceKeepOutfit === true || dayMoodReplacesKeepOutfit(dayMood));
  const keepAsImage1 = input.plateSource === 'keeper';
  const plateIsolated = input.plateIsolated === true;
  const garmentReinforce = input.garmentReinforce === true && !omitGarment && !replaceKeepOutfit;
  const poseGuide = input.poseGuide === true;
  const openPoseGuide =
    poseGuide && normalizePoseGuideStylePreference(input.poseGuideStyle) === 'openpose';
  const leadPositionPhrase = input.poseLeadPosition
    ? describePoseLeadPosition(input.poseLeadPosition)
    : null;
  const leadSkeleton = leadPositionPhrase
    ? `the ${leadPositionPhrase} Image 3 skeleton`
    : 'the lead Image 3 skeleton';
  const realismMode = normalizeRenderRealismMode(input.realismMode ?? DEFAULT_RENDER_REALISM_MODE);
  // Heat beats own the stance — setting stays out of the pose haystack (backdrop only).
  const poseHaystack = (isDayHeatMood(dayMood) && hints ? [hints] : [setting, hints, defaultPose])
    .filter(Boolean)
    .join(' · ');
  const poseHeadcount = resolveDayPoseHeadcount({
    haystack: poseHaystack,
    beat: hints,
    dayMood,
    intimateMix,
    allowCompanions,
  });
  // Intimate/raunchy duo chip forces partners; Suggestive stays clothed solo unless companions are on.
  const duoForced = isDayAdultMood(dayMood) && intimateMix === 'duo';
  const partnersAllowed =
    duoForced || allowCompanions || (isDayAdultMood(dayMood) && poseHeadcount >= 2);
  const soloSubject =
    dayMood === 'suggestive'
      ? !allowCompanions
      : !duoForced && !partnersAllowed && poseHeadcount < 2;
  const soloToy = soloSubject && dayBeatUsesSoloSexToy(hints);
  /** Everyday baselines unlock Keep standing plates; heat beats must not fight them. */
  const poseLine = hints
    ? isDayAdultMood(dayMood)
      ? `POSE FIRST: mandatory body pose and sex/action from the beat only (SETTING is backdrop/lighting only — do not invent walking, grocery bags, reading, drinking, or fashion-portrait stances from the scene): ${hints}`
      : dayMood === 'suggestive'
        ? `POSE FIRST: mandatory body pose and suggestive clothed heat from the beat only (SETTING is backdrop/lighting only — do not invent walking, grocery, reading, nude, or polite fashion-portrait stances from the scene): ${hints}`
        : dayMood === 'sport'
          ? `POSE FIRST: mandatory athletic body pose and sport action from the beat only (SETTING is venue/lighting only — do not invent café walks, grocery bags, soft pin-ups, or polite fashion-portrait stances from the scene): ${hints}`
          : dayMood === 'vacation'
            ? `POSE FIRST: ${vacationStanceDirective(vacationPoseClassFromBeat(hints))} Beat (SETTING is venue/lighting only — do not invent office, grocery, bookstore, hands-and-knees, or stiff square-on catalog stances from the scene): ${hints}`
            : `POSE FIRST: ${everydayStanceDirective(dayEverydayPoseClass(hints))} Beat (SETTING is backdrop/lighting only — do not invent a different stance from the scene): ${hints}. Body-stance baseline only if the beat is vague: ${defaultPose}`
    : `mandatory new body pose: ${defaultPose}`;
  const cameraLine =
    isDayAdultMood(dayMood) && poseHeadcount >= 2
      ? 'camera: intimate medium shot — both adults engaged with each other, looking at partner not the lens; empty sheets in the foreground'
      : isDayAdultMood(dayMood)
        ? dayMood === 'raunchy' && soloSubject
          ? soloToy
            ? 'camera: intimate medium / three-quarter on the beat body pose — prioritize that stance over environment; bare sheets in the foreground; eyes closed or half-lidded looking down at the penis-shaped dildo inserted in her vaginal opening — never a soft fashion pin-up staring at the lens; never invent a man or partner; never raised gesture hands; never beach, sand, ocean, shoreline, pier, or night-beach city lights — indoor rumpled sheets only'
            : 'camera: intimate medium / three-quarter on the beat body pose — prioritize that stance over environment; bare sheets in the foreground; eyes closed or half-lidded looking down at her hands — never a soft fashion pin-up staring at the lens; never raised hands or fingers pointing up; nothing held — fingers only; never beach, sand, ocean, shoreline, pier, or night-beach city lights — indoor rumpled sheets only'
          : 'camera: intimate medium / three-quarter on the beat body pose and sex/action — prioritize stance over environment; empty lap and bare sheets in the foreground; eyes half-lidded or looking at her own body/hands — never a soft fashion pin-up staring at the lens with hands flat on the mattress'
        : dayMood === 'suggestive'
          ? 'camera: charged medium / three-quarter on the beat body pose — match Image 3 (dance with both arms raised and one knee lifted, zip-twist look-back with hands on her own zipper, lean, sit, stretch, or recline as written); lingerie or dress stays on (top and bottom); one woman alone; never invent a man; never a stiff square-on standing catalog pose with arms at her sides; never a nude or bottomless framing; never a distant establishing landscape'
          : dayMood === 'sport'
            ? 'camera: athletic action medium / three-quarter on the sport pose — prioritize mid-play stance and limbs over venue; never a soft fashion pin-up or distant empty stadium establishing shot'
            : dayMood === 'vacation'
              ? 'camera: travel medium / three-quarter on the beat vacation pose — if RELAXING/RECLINING show her body ON the towel/lounge (hips down, knees drawn up), not standing beside it; if SEATED/PERCHED show hips ON the seat with knees bent; if DANCING show both arms raised overhead and one knee lifted mid-kick with hips mid-sway; if MID-STRIDE show FULL BODY walking with both feet visible, one foot clearly ahead, opposite arm swing — never a mid-thigh portrait crop; if WAVING show one arm raised high overhead with weight shift full body; if REACHING show one arm high; one woman alone; never invent a man; never hands-and-knees or rear-presenting on a bed; never a stiff square-on standing catalog pose with both feet planted and arms at her sides or empty postcard establishing shot'
              : `camera: ${cameraCue}`;
  const framingLine = soloSubject
    ? isDayAdultMood(dayMood)
      ? 'single-subject framing on the beat sex/self-touch pose — full or three-quarter body; empty sheets around her; never a polite dressed portrait with invented props'
      : input.hasPlate
        ? 'single-subject framing, natural lighting for the time of day — no second person in frame'
        : 'single cinematic still of one person, full or three-quarter framing, natural lighting for the time of day'
    : isDayAdultMood(dayMood) && poseHeadcount >= 2
      ? intimateMix === 'duo' || poseHeadcount === 2
        ? 'exactly TWO adults only — Cast lead + one distinct partner fully visible and interacting; never a third face, never a camera-facing Cast portrait beside the sex act, never a threesome or multi-body pile'
        : 'two-adult framing — both people from the beat fully visible and interacting; never a solo fashion portrait; never crop the partner out'
      : input.hasPlate
        ? 'full or three-quarter framing, natural lighting for the time of day'
        : 'single cinematic still, full or three-quarter framing, natural lighting for the time of day';
  const poseGuideLine = poseGuide
    ? poseGuidePromptBlock(realismMode, {
        headcount: poseHeadcount,
        model: input.model,
        style: openPoseGuide ? 'openpose' : 'legacy',
        leadPosition: leadPositionPhrase,
      })
    : null;
  const soloLock = soloSubject
    ? soloToy
      ? `${buildSinglePersonUserDirective()} SOLO TOY LOCK: exactly one adult woman — never invent a man, male partner, boyfriend, second face, or second body. ${SOLO_DILDO_INSERTION_CUE}. ${SOLO_DILDO_NO_EXTERNAL_HOLD_CUE}`
      : dayMood === 'suggestive' || dayMood === 'vacation'
        ? `${buildSinglePersonUserDirective()} CLOTHED SOLO LOCK: exactly one woman — never invent a man, boyfriend, or second adult; clothes stay on; match the beat stance (relaxing/reclining on a towel or lounge, seated, mid-stride, dancing with arms raised and one knee lifted, reaching, leaning) — never rear-presenting or hands-and-knees; never a square-on standing catalog pose with arms at her sides.`
        : buildSinglePersonUserDirective()
    : null;
  const rapidAio = /^qwen-rapid-aio-/i.test(String(input.model ?? '').trim());
  const companionLock =
    partnersAllowed && poseHeadcount >= 2
      ? openPoseGuide
        ? isDayAdultMood(dayMood)
          ? intimateMix === 'duo' || poseHeadcount === 2
            ? `PARTNERS: Exactly TWO adults — Cast FACE from Image 1 only on ${leadSkeleton} in the beat pose; the other skeleton is one different adult partner with real bare human skin on chest/back/hips/legs, head and shoulders visible. Never a third face; exactly four hands (each on a visible forearm); no ghost hands; no flesh-blob merge, no double genitals, no shared hip mass.`
            : `PARTNERS: Cast face from Image 1 on ${leadSkeleton}; each other skeleton is a different adult partner with real bare skin — never a twin clone of Cast, never a flesh blob or incomplete torso.`
          : `COMPANIONS: Cast face from Image 1 on ${leadSkeleton}; the other skeleton is a different adult friend or selfie companion — never a twin clone of Cast, never a flesh blob or incomplete torso.`
        : rapidAio
          ? isDayAdultMood(dayMood)
            ? intimateMix === 'duo' || poseHeadcount === 2
              ? 'PARTNERS: Exactly TWO adults — thick Image 3 outline = Cast FACE only on the lead body in the beat pose; thinner outline = one different adult partner with real bare human skin on chest/back/hips/legs, head and shoulders visible. Never a black morphsuit, zentai, catsuit, black bodysuit, or latex void partner (never only face and hands uncovered); never a cyan/magenta light blob or smoke stand-in; never paint Image 1 as a third standing/portrait person; never a third face; exactly four hands (each on a visible forearm); no ghost hands; no flesh-blob merge, no black rubber blob between bodies, no double genitals, no shared hip mass.'
              : 'PARTNERS: Thick Image 3 outline = Cast face from Image 1 on the lead; thinner outline = a different adult partner with real bare skin — never a twin clone of Cast, never a black morphsuit/zentai, never a flesh blob or incomplete torso.'
            : 'COMPANIONS: Thick Image 3 outline = Cast face from Image 1 on the lead; thinner outline = a different adult friend or selfie companion — never a twin clone of Cast, never a flesh blob or incomplete torso.'
          : isDayAdultMood(dayMood)
            ? intimateMix === 'duo' || poseHeadcount === 2
              ? 'PARTNERS: Exactly TWO adults — Magenta schematic = Cast FACE only on the lead pose (ignore Magenta/cyan as scene lights); cyan/orange schematic = one different adult partner with real bare human skin on chest/back/hips/legs, head and shoulders visible. Never paint Image 3 colors as neon gels, chest glow, or smoke; never a black morphsuit/zentai/catsuit (never only face and hands uncovered); never a solo Cast portrait; never a third face; exactly four hands (each on a visible forearm); no ghost hands; no flesh-blob merge, no black rubber blob between bodies, no double genitals, no shared hip mass.'
              : 'PARTNERS: Magenta = Cast face from Image 1 on the lead; cyan/orange = a different adult partner with real bare skin — never a twin clone of Cast, never a black morphsuit/zentai, never a flesh blob or incomplete torso.'
            : 'COMPANIONS: Magenta = Cast face from Image 1 on the lead; cyan/orange = a different adult friend or selfie companion — never a twin clone of Cast, never a flesh blob or incomplete torso.'
      : null;
  const duoHeadcountLock =
    isDayAdultMood(dayMood) && (intimateMix === 'duo' || poseHeadcount === 2) && !soloSubject
      ? 'HEADCOUNT LOCK: exactly TWO adults total — Cast identity on one body only; one partner; two heads both in frame; zero third faces, zero extra hands, zero fused multi-body pile, zero double genitals. DUO VISIBLE: partner head and torso share the bed/frame mid-contact with Cast — never collapse to a solo Cast nude portrait staring at the lens with empty sheets beside her; never omit or crop the partner; never a solo nude pin-up with one leg against the wall and nobody else in frame.'
      : null;
  const adultDuoActLock =
    isDayAdultMood(dayMood) && intimateMix === 'duo' && !soloSubject
      ? 'DUO ACT: both adults mid-sex as the beat says (missionary, doggy, oral, cowgirl, wall sex) — partner body fully visible touching Cast; four hands on bodies; never Cast alone masturbating, never solo nude posing on empty sheets, never invent only one person from a duo beat.'
      : null;
  const sportLocks =
    dayMood === 'sport' ? buildDaySportPromptLocks({ beat: hints, setting }) : null;
  const vacationLocks =
    dayMood === 'vacation' ? buildDayVacationPromptLocks({ beat: hints, setting }) : null;
  const moodLine =
    dayMood === 'raunchy'
      ? intimateMix === 'duo'
        ? 'MOOD: raunchy duo sexual comedy — crude slapstick sex with a visible second adult mid-contact in frame; wardrobe fails are the setup, mid-sex / oral / doggy / cowgirl is the punchline; never collapse to a solo Cast nude pin-up on empty sheets (never leg-against-wall solo posing); never a tame softcore portrait staring at camera; both adults bare skin and sheets only in the foreground.'
        : intimateMix === 'solo'
          ? soloToy
            ? `MOOD: raunchy solo sexual comedy — bare skin only (clothes are now gone); follow the beat body stance exactly; wild dildo masturbation is the punchline — ${SOLO_DILDO_INSERTION_CUE}; ${SOLO_DILDO_NO_EXTERNAL_HOLD_CUE}; eyes closed or half-lidded on the toy — never the lens; gag props stay in the background; Cast alone; bare breasts with nipples visible and bare vulva — ZERO fabric on the body; exactly two hands total on the dildo base; never raised hands, rock-on, or peace signs; never beach, sand, ocean, shoreline, pier, or night-beach city lights — indoor rumpled sheets only.`
            : 'MOOD: raunchy solo sexual comedy — bare skin only (clothes are now gone); follow the beat body stance exactly (on her back, kneeling, all fours, side-lying, standing, leaning, or seated as written); wild fingering is the punchline (fingers on her vulva mid-act as the beat says — never claw/splayed/heart/V fingers on thighs; never fingers pointing up or raised middle fingers); eyes closed or half-lidded on her own hands — never the lens; gag props stay in the background; Cast alone; bare breasts with nipples visible and bare vulva — ZERO fabric on the body; nothing held; exactly two hands total; never raised hands, rock-on, or peace signs; never beach, sand, ocean, shoreline, pier, or night-beach city lights — indoor rumpled sheets only.'
          : 'MOOD: raunchy sexual comedy — crude wardrobe fails, slapstick sex, accidental flashes; Cast face on the lead only; never tame soft-core portraits or invented reading props.'
      : dayMood === 'intimate'
        ? intimateMix === 'duo'
          ? 'MOOD: intimate duo sex still — follow the beat sex/stance exactly; both adults mid-sex with readable body contact; looking at each other not the lens; Cast face on the lead only; never a tame softcore portrait; bare sheets and skin only in the foreground.'
          : intimateMix === 'solo'
            ? 'MOOD: intimate solo sex/self-touch still — follow the beat body pose and hand placement exactly; Cast alone mid-act with readable arousal (open thighs, arched back, head tipped, hands on her own vulva/breasts as the beat says); never invent a second adult, partner torso, or thigh under her; never a soft floral-dress pin-up staring politely at the lens; empty rumpled sheets only — SETTING is backdrop only.'
            : 'MOOD: intimate adult still — follow the beat sex/stance exactly; Cast face on the lead only; never a soft fashion pin-up; bare sheets and skin only in the foreground.'
        : dayMood === 'suggestive'
          ? 'MOOD: suggestive heat — clothed flirt only: wear the Keep/Image 2 outfit exactly (lingerie/robe/dress as shown — never invent a bikini or nude); cleavage/straps/unfinished unzip when written; underwear or bottoms stay on; follow the beat body stance exactly (dancing with both arms raised and one knee lifted, twisting to zip a dress looking over a shoulder, leaning, seated, stretching, hip cocked — never a stiff standing fashion plate staring at the lens with arms at her sides); never nude, never bottomless, never invent a man or second adult; never genitals or sex contact; never a polite everyday portrait or grocery/walk still.'
          : (vacationLocks?.moodLine ?? sportLocks?.moodLine ?? null);
  const suggestiveClothingLock =
    dayMood === 'suggestive' ? buildDaySuggestivePoseLock(hints) : null;
  const adultBeatPoseLock = isDayAdultMood(dayMood)
    ? buildDayAdultBeatPoseLock(hints, soloSubject ? 'solo' : 'duo')
    : null;
  const vacationPoseLock = dayMood === 'vacation' ? (vacationLocks?.poseLock ?? null) : null;
  const sportKitLock = sportLocks?.wardrobeLock ?? null;
  /** Lead empty-bed composition first — naming banned props in positives summons them on Rapid AIO. */
  const adultForegroundLock = isDayAdultMood(dayMood)
    ? soloSubject
      ? dayMood === 'raunchy'
        ? soloToy
          ? `FOREGROUND: match the beat pose — rumpled sheets and bare skin; closed blinds on every window (no glass balcony door, no ocean vista); ${SOLO_DILDO_INSERTION_CUE}; bare breasts with nipples visible uncovered; never invent a man; never books or phones on the bed.`
          : 'FOREGROUND: match the beat pose — rumpled sheets and bare skin; closed blinds on every window (no glass balcony door, no ocean vista); fingers on her vulva mid-act as written; bare breasts with nipples visible uncovered; nothing held; never books or phones on the bed.'
        : 'FOREGROUND: empty rumpled sheets only between the knees and in front of the body — bare fabric, empty lap, nothing held, nothing open on the bed; closed blinds (no outdoor vista); both hands on her own skin only (breasts/hips/vulva).'
      : 'FOREGROUND: bare sheets and bodies only — empty bed surface around the couple; closed blinds on every window (no glass balcony door, no ocean or water visible outside); hands on bodies only; nothing open or held in the foreground.'
    : null;
  const adultPropsLock = isDayAdultMood(dayMood)
    ? intimateMix === 'duo' || poseHeadcount >= 2
      ? 'PROPS + FRAME: sex/contact fills the frame — bare skin and sheets only; empty hands on bodies; bare nightstand; nothing open on the bed.'
      : dayMood === 'raunchy' && soloSubject
        ? soloToy
          ? `PROPS + FRAME: beat pose fills the frame — bare breasts and vulva (clothes are now gone); ${SOLO_DILDO_INSERTION_CUE}; bare nightstand; zero fabric on the body; ${SOLO_DILDO_NO_EXTERNAL_HOLD_CUE}; never raised gesture hands; never open books.`
          : 'PROPS + FRAME: beat pose fills the frame — bare breasts and vulva (clothes are now gone); fingers on vulva mid-act as the beat stance requires (never thigh-frame claw hands); bare nightstand; zero fabric on the body; nothing held; never raised gesture hands; never open books.'
        : 'PROPS + FRAME: beat pose and bare skin fill the frame — sheets and skin only; HANDS on own body never on objects; bare nightstand; nothing open on the bed between the knees.'
    : null;
  const adultSoloActLock =
    isDayAdultMood(dayMood) && soloSubject
      ? dayMood === 'raunchy'
        ? soloToy
          ? `SOLO ACT: follow the beat body stance exactly — on her back, kneeling, all fours looking back, side-lying, standing, leaning, or seated as written; wild dildo masturbation comedy — ${SOLO_DILDO_INSERTION_CUE}; ${SOLO_DILDO_NO_EXTERNAL_HOLD_CUE}; exactly two hands total on continuous forearms from her own shoulders; her clothes are now gone — bare breasts with nipples visible uncovered and bare vulva; ZERO fabric on the body; eyes closed or half-lidded looking down at the toy — never the lens; gag is background only; HEADCOUNT: exactly one adult woman — never invent a man, male partner, boyfriend, or second body; ANATOMY: natural female vulva/labia only — the penis-shaped dildo is a separate silicone object she inserts into her vaginal opening, never a penis attached to a man, never a penis growing from her body, never futa; HAND COUNT: exactly two hands, five fingers each — never a third or fourth hand; never clawed; never floating steam/smoke wisps.`
          : 'SOLO ACT: follow the beat body stance exactly — on her back, kneeling, all fours looking back, side-lying, standing at a wall/sink, leaning, straddling a pillow, or seated as written (never collapse every beat into the same kneeling-facing-camera pin-up); wild mid-fingering comedy with fingers on her vulva mid-act; exactly two hands total on continuous forearms from her own shoulders (never claw/splayed/heart/V fingers on thighs; never raised rock-on/peace/jazz gestures; nothing held); her clothes are now gone — bare breasts with nipples visible uncovered and bare vulva; ZERO fabric on the body; eyes closed or half-lidded looking down at her hands — never the lens; gag is background only; ANATOMY: natural female vulva/labia only — never a penis, phallus, futa, or fleshy crotch protrusion; HAND COUNT: exactly two hands, five fingers each — never a third or fourth hand; never clawed; never floating steam/smoke wisps.'
        : 'SOLO ACT: explicit mid-self-touch — match the beat stance with heat (on her back, kneeling, all fours, side-lying, standing, leaning, or seated as written); at least one hand on her vulva or breasts (never both hands flat on a sill/mattress posing); empty sheets between the knees; bare skin only when the beat is nude (clothes are now gone; zero fabric); never a polite clothed pin-up staring at the lens; ANATOMY: natural female vulva only — never a penis/phallus/futa crotch morph.'
      : null;
  const adultBodyLock =
    isDayAdultMood(dayMood) && poseHeadcount >= 2
      ? 'BODIES: exactly two fully separate adults — two heads, two torsos, two pelvises, four legs; clear sex join without a flesh blob or shared hip mass; never double genitals, never crop the partner head off; partner head and shoulders stay in frame. HANDS: exactly four hands — each wrist attached to a visible forearm and shoulder of its owner; never a floating/ghost hand on a hip or thigh; never a fifth hand. SKIN TEXTURE: natural matte pores — never oily plastic wet shine or airbrushed CGI skin. LIGHTING: natural room/lamp light only — never cyan or magenta neon gels, chest glow, schematic smoke, or Image 3 colors painted into the scene.'
      : isDayAdultMood(dayMood) && soloSubject
        ? dayMood === 'raunchy'
          ? soloToy
            ? `HANDS: exactly two hands total on the base of ${SOLO_DILDO_INSERTION_CUE}; each hand on a continuous forearm from her own shoulder; bare breasts uncovered; never raised rock-on/peace/jazz/middle-finger hands at shoulder or chest height; five natural fingers each. ANATOMY: one adult woman alone — natural vulva and labia only; ${SOLO_DILDO_NO_EXTERNAL_HOLD_CUE}; never a penis/phallus/futa growing from her crotch. SKIN TEXTURE: natural matte pores — never oily plastic shine. LIGHTING: natural room/lamp/window light only — never free-floating steam/smoke wisps or schematic vapor; never invent desk clutter on the bed.`
            : 'HANDS: exactly two hands total mid-self-touch as the beat stance requires — fingers on her vulva and/or clit mid-act; each on a continuous forearm from her own shoulder; bare breasts uncovered; never resting flat on inner thighs framing the crotch; never claw/splayed/heart/V fingers on thighs; never raised rock-on/peace/jazz/middle-finger hands at shoulder or chest height; nothing held; five natural fingers each. ANATOMY: one adult woman — natural vulva and labia only between the thighs; never a penis, phallus, futa, hermaphrodite, or extra fleshy protrusion hanging from the crotch. SKIN TEXTURE: natural matte pores — never oily plastic shine. LIGHTING: natural room/lamp/window light only — never free-floating steam/smoke wisps or schematic vapor; never invent desk clutter on the bed.'
          : 'HANDS: at least one hand on her vulva or breasts mid-act — never both hands flat on a sill/ledge/mattress covering the crotch for a soft pin-up. ANATOMY: one adult woman — natural vulva and labia only between the thighs; never a penis, phallus, futa, hermaphrodite, or extra fleshy protrusion hanging from the crotch. SKIN TEXTURE: natural matte pores. LIGHTING: natural room/lamp/window light only — never free-floating steam/smoke wisps or schematic vapor; never invent desk clutter on the bed.'
        : null;
  const poseActionLock = poseGuide ? POSE_GUIDE_ACTION_LOCK : null;
  // Heat moods face-break Image 1 instead; everyday/plate keeps the full standing Keep, which
  // an Edit-2511 model copies unless told not to.
  const everydayPoseStickyLock =
    !isDayHeatMood(dayMood) && input.hasPlate && isDayPoseStickyEditModel(input.model)
      ? buildDayEverydayKeepPoseUnlock(hints)
      : null;
  const poseAntiLeak = poseGuide
    ? openPoseGuide
      ? isDayAdultMood(dayMood)
        ? soloSubject
          ? 'Image 3 is only a pose map — one finished human adult with bare real skin on the whole body and natural lamp light only; Cast face on the posed body.'
          : `Image 3 is only a pose map — finished human adults with bare real skin on the whole body and natural lamp light only; Cast face on ${leadSkeleton}; partner is a different bare-skinned adult fully in frame.`
        : DAY_OPENPOSE_ANTI_LEAK
      : isDayAdultMood(dayMood)
        ? rapidAio
          ? 'Never paint Image 3 as a stick overlay, black morphsuit, zentai, catsuit, black bodysuit, latex void suit, flesh blob, black rubber blob between bodies, cyan/magenta light, smoke stand-in, diagram notebook, or pose diagram — finished human adults with bare real skin on the whole body and natural lamp light only; Cast face on the lead outline; partner is a different bare-skinned adult fully in frame (never only face and hands uncovered on a black suit).'
          : 'Never paint Image 3 as a black morphsuit/zentai/catsuit, flesh blob, black rubber blob between bodies, featureless torso, cyan/magenta gel light, smoke, diagram notebook, or diagram — finished human adults with bare real skin on the whole body and natural lamp light only; Cast face on the magenta lead pose only (not as scene lights); partner is a different bare-skinned adult fully in frame (never only face and hands uncovered on a black suit).'
        : DAY_POSE_GUIDE_ANTI_LEAK
    : null;
  const photorealOutput =
    poseGuide && (realismMode === 'realistic' || realismMode === 'hyper-realistic');
  const keepOutfitLine =
    !omitGarment && !replaceKeepOutfit && keepAsImage1 && !clothedFaceBreak
      ? outfit
        ? `outfit continuity: stay in ${outfit} (same kit as Image 1) in the new pose`
        : 'outfit continuity: same garments and colors as Image 1 in the new pose'
      : null;
  const nudeOutfitLine = omitGarment
    ? 'outfit: bare skin only (clothes are now gone) — bare breasts with nipples visible and bare vulva; zero fabric on the body; Image 1 fabric is invisible and must not be copied'
    : null;
  const sportOutfitLine = replaceKeepOutfit
    ? 'outfit: ATHLETIC KIT ONLY — discard every Image 1 garment including floral dress, mini-dress, sundress, one-piece swimsuit, street clothes, sandals, and barefoot fashion; wear only the SPORT KIT and sport shoes for the beat; mid-play athletic action on a real sport venue — never kneeling on asphalt in a sundress, never a soft fashion pin-up'
    : null;
  const castOutfitLine =
    !omitGarment && !replaceKeepOutfit && !keepAsImage1
      ? garmentReinforce
        ? null // handled below with Image 2
        : outfit
          ? `replace clothing with this slot's outfit: ${outfit}`
          : "replace clothing with this slot's catalog wardrobe kit"
      : null;

  if (input.hasPlate) {
    const settingLine = setting
      ? isDayAdultMood(dayMood)
        ? soloSubject
          ? `SETTING (backdrop only — lighting and empty room; never override the beat body pose${plateIsolated ? '; replace every white/studio void' : ''}): ${setting} — lamp light and closed blinds only behind the beat pose; bare nightstand; opaque walls; nothing on the bed except sheets and the subject; never invent beach, sand, ocean, shoreline, wet sand, pier softcore, night-beach city-light pin-up, glass balcony door, sliding glass, outdoor railing, ocean through a window, coastal vista, or water outside the glass`
          : `SETTING (backdrop only — lighting and room; never override the beat body pose${plateIsolated ? '; replace every white/studio void' : ''}): ${setting} — environment for ${timeOfDay} behind the beat pose; closed blinds / drawn curtains; never invent walking, grocery, reading, drinking, or fashion-pin-up stances from the scene; never invent beach, sand, ocean, shoreline, night-beach softcore, glass balcony door, ocean through a window, or coastal vista`
        : dayMood === 'suggestive'
          ? `SETTING (backdrop only — lighting and room; never override the beat body pose): ${setting} — environment for ${timeOfDay} behind the beat pose; never a blank white backdrop or ecommerce void; never invent walking, grocery, reading, or bland fashion-portrait stances from the scene`
          : dayMood === 'sport'
            ? `SETTING (venue/lighting only — never override the athletic beat pose${plateIsolated ? '; replace every white/studio void' : ''}): ${setting} — sport venue for ${timeOfDay} behind the mid-play pose; never invent café walks, grocery, or soft fashion-portrait stances from the scene`
            : dayMood === 'vacation'
              ? `SETTING (venue/lighting only — never override the vacation beat pose): ${setting} — travel venue for ${timeOfDay} behind the pose; never a blank white backdrop or ecommerce void; never invent office, grocery, bookstore, or stiff catalog stances from the scene`
              : `SETTING (mandatory — replace Image 1 background entirely${plateIsolated ? ', including every white/studio void' : ''}): ${setting} — put them in this real location for ${timeOfDay}, with matching props, depth, and lighting — never a blank white backdrop`
      : isDayAdultMood(dayMood)
        ? soloSubject
          ? `SETTING (backdrop only — lighting and empty room; never override the beat body pose${plateIsolated ? '; replace every white/studio void' : ''}): bedroom sheets and lamp light with closed blinds for ${timeOfDay} — bare nightstand; opaque walls; nothing on the bed except sheets and the subject; never invent beach, sand, ocean, shoreline, night-beach softcore, glass balcony door, ocean through a window, or coastal vista`
          : `SETTING (backdrop only — lighting and room; never override the beat body pose${plateIsolated ? '; replace every white/studio void' : ''}): a coherent indoor location for ${timeOfDay} behind the beat pose — closed blinds; never a blank white backdrop; bare sheets only in the action area; never invent beach, sand, ocean, shoreline, night-beach softcore, glass balcony door, ocean through a window, or coastal vista`
        : dayMood === 'suggestive'
          ? `SETTING (backdrop only — lighting and room; never override the beat body pose): a coherent location for ${timeOfDay} behind the beat pose — never a blank white backdrop or ecommerce void`
          : dayMood === 'sport'
            ? `SETTING (venue/lighting only — never override the athletic beat pose${plateIsolated ? '; replace every white/studio void' : ''}): a coherent sport venue for ${timeOfDay} behind the mid-play pose — never a blank white backdrop`
            : dayMood === 'vacation'
              ? `SETTING (venue/lighting only — never override the vacation beat pose): a coherent travel venue for ${timeOfDay} behind the pose — never a blank white backdrop or ecommerce void`
              : `SETTING (mandatory — replace Image 1 background entirely${plateIsolated ? ', including every white/studio void' : ''}): a coherent real-world location that fits ${timeOfDay}, with matching props and lighting — never a blank white backdrop`;
    // Always name a concrete body stance. Vague mood beats alone freeze Keep's standing plate.
    // Heat moods: beat owns the stance — setting must not fight the pose.
    const isolateLine = plateIsolated ? DAY_ISOLATE_WHITE_REPLACE : null;
    // Face-break Image 1 is a face crop (not isolated), but Image 2 Keep + Image 3
    // pose-guide still sit on white. Keep early isolate tips short; put the clothed
    // white-void ban AFTER pose unlock so CFG-1 does not fill SETTING instead of posing.
    // Any mood: once a white packshot (Image 2) or a white pose guide (Image 3) is attached, the
    // model can copy that white as the scene background. Everyday was left out of this ban, which
    // is why everyday backgrounds dropped to a studio void every few stills.
    const referenceWhiteVoid =
      !plateIsolated && (garmentReinforce || poseGuide || faceOnlyIdentity);
    const earlyWhiteVoidLine = plateIsolated
      ? garmentReinforce
        ? 'Image 2 white is packshot only — do not use Image 2 or Image 3 white as the scene background.'
        : poseGuide
          ? openPoseGuide
            ? 'Image 3 is a pose map on black — fill Image 1 white with the SETTING, not a studio or black void.'
            : 'Image 3 white is pose-guide only — fill Image 1 white with the SETTING, not a studio void.'
          : null
      : null;
    const lateWhiteVoidLine = referenceWhiteVoid
      ? faceOnlyIdentity
        ? DAY_FACE_BREAK_SETTING_FILL
        : DAY_REFERENCE_WHITE_VOID_FILL
      : null;
    const heatPoseBeforeSetting = isDayHeatMood(dayMood) && !omitGarment;
    const nudeEditLead = omitGarment
      ? buildQwenRapidNudeEditLead(setting, {
          soloHands: soloSubject,
          beatPose: hints || defaultPose,
          soloToy,
        })
      : '';
    const nudeEditPreamble = omitGarment
      ? faceOnlyIdentity
        ? soloSubject
          ? soloToy
            ? `${nudeEditLead} Invent the body to match that beat pose and Image 3. Keep ${SOLO_DILDO_INSERTION_CUE}; eyes half-lidded looking down at the toy, not at the lens; ${SOLO_DILDO_NO_EXTERNAL_HOLD_CUE}`
            : `${nudeEditLead} Invent the body to match that beat pose and Image 3. Keep mid-self-touch with fingers on her vulva as the beat says; eyes half-lidded looking down at her hands, not at the lens.`
          : `${nudeEditLead} Invent two bare-skin adult bodies from the beat and Image 3 — Cast face on the lead, one distinct partner mid-sex both fully visible; never collapse to a solo Cast nude pin-up.`
        : soloSubject
          ? soloToy
            ? `${nudeEditLead} Keep body proportions from Image 1 when helpful, but Image 1 clothing is invisible — do not copy fabric. Match the beat pose and Image 3; keep ${SOLO_DILDO_INSERTION_CUE}; eyes half-lidded looking down at the toy, not at the lens; ${SOLO_DILDO_NO_EXTERNAL_HOLD_CUE}`
            : `${nudeEditLead} Keep body proportions from Image 1 when helpful, but Image 1 clothing is invisible — do not copy fabric. Match the beat pose and Image 3; keep mid-self-touch with fingers on her vulva as the beat says; eyes half-lidded looking down at her hands, not at the lens.`
          : `${nudeEditLead} Keep body proportions from Image 1 when helpful, but Image 1 clothing is invisible — do not copy fabric. Match the beat pose and Image 3; invent two bare-skin adults mid-sex — Cast face on the lead plus one distinct partner both fully visible; never a solo Cast nude pin-up.`
      : null;
    const nudeImage1Line = omitGarment
      ? faceOnlyIdentity
        ? soloSubject
          ? soloToy
            ? `Image 1 = face likeness only (cropped head/shoulders) — invent bare-skin body from the beat; her clothes are now gone; zero fabric; ${SOLO_DILDO_INSERTION_CUE}; never invent a man.`
            : 'Image 1 = face likeness only (cropped head/shoulders) — invent bare-skin body from the beat; her clothes are now gone; zero fabric; nothing held between the thighs — fingers only.'
          : 'Image 1 = face likeness only (cropped head/shoulders) — invent bare-skin body from the beat; her clothes are now gone; zero fabric.'
        : soloSubject
          ? soloToy
            ? `Image 1 = face + body shape only — her clothes are now gone; Image 1 fabric is invisible — do not copy it; zero fabric on the body; ${SOLO_DILDO_INSERTION_CUE}; never invent a man.`
            : 'Image 1 = face + body shape only — her clothes are now gone; Image 1 fabric is invisible — do not copy it; zero fabric on the body; nothing held between the thighs — fingers only.'
          : 'Image 1 = face + body shape only — her clothes are now gone; Image 1 fabric is invisible — do not copy it onto a nude/sex beat.'
      : null;
    if (keepAsImage1) {
      const heatUnlockClass =
        dayMood === 'suggestive' || dayMood === 'vacation'
          ? clothedHeatUnlockPoseClass(hints, dayMood)
          : null;
      const faceBreakLeads = clothedFaceBreak
        ? buildDayVacationClothedFaceBreakLeads(
            heatUnlockClass ?? vacationLocks?.poseClass,
            'keep',
            dayMood,
            {
              garmentDescription,
              hasOutfitImage: Boolean(garmentReinforce),
            }
          )
        : null;
      const clothedFaceBreakPreamble = faceBreakLeads?.preamble ?? null;
      const clothedFaceBreakImage1 = faceBreakLeads?.image1 ?? null;
      return [
        nudeEditPreamble ??
          clothedFaceBreakPreamble ??
          (replaceKeepOutfit
            ? 'Edit Image 1. Keep facial likeness only. Discard Image 1 floral dress, sundress, swimsuit, street clothes, and footwear entirely — dress her in the beat SPORT KIT with athletic shoes on a sport venue. Do not preserve body pose, kneeling fashion stance, arm positions, camera angle, or background — aggressively refactor into mid-play athletic action (sprint, swing, dunk, lunge) as described — never a barefoot asphalt pin-up.'
            : dayMood === 'suggestive'
              ? buildDaySuggestiveKeepPoseUnlock(hints)
              : dayMood === 'vacation'
                ? (vacationLocks?.keepUnlock ?? DAY_VACATION_KEEP_POSE_UNLOCK_PREFIX)
                : DAY_KEEP_OUTFIT_POSE_UNLOCK_PREFIX),
        isolateLine,
        `Edit instruction for a Day still — ${timeOfDay}:`,
        nudeImage1Line ??
          clothedFaceBreakImage1 ??
          (replaceKeepOutfit
            ? 'Image 1 is face/body identity only — discard Image 1 garments; dress the SPORT KIT for the athletic beat on a sport venue.'
            : dayMood === 'suggestive'
              ? 'Image 1 is the Outfit Keep try-on (face + worn kit) — a standing plate; match Image 3 and the beat stance (dance with both arms raised and one knee lifted, zip-twist, lean, sit) instead of freezing that stand.'
              : dayMood === 'vacation'
                ? poseGuide
                  ? `Image 1 is the Outfit Keep try-on (face + worn kit) — a standing plate; match Image 3 and the beat stance (${vacationLocks?.poseClass ?? 'travel pose'}) instead of freezing that stand.`
                  : `Image 1 is the Outfit Keep try-on (same woman, same hair color and length, worn kit) — a standing plate; change only pose and SETTING to the beat (${vacationLocks?.poseClass ?? 'travel pose'}) instead of freezing that stand. Inventing a different face or restyling her hair means the edit FAILED.`
                : 'Image 1 is the Outfit Keep try-on (face + worn kit).'),
        nudeOutfitLine,
        sportOutfitLine,
        garmentReinforce
          ? garmentDescription
            ? clothedFaceBreak
              ? dayMood === 'suggestive'
                ? `Image 2 is a clothing-only packshot — copy this EXACT garment (cut, colors, print, fabric, coverage) onto the new Image 3 pose (${garmentDescription}); inventing a bikini, swimsuit, or stripping her means the edit FAILED; ignore Image 2 layout and any white/gray void.`
                : `Image 2 is a clothing-only packshot — copy garment cut, colors, and fabric onto the new Image 3 pose (${garmentDescription}); ignore Image 2 layout and any white/gray void.`
              : `Image 2 is a clothing-only packshot — reinforce garment cut, colors, and fabric from Image 1 using Image 2 (${garmentDescription}); ignore Image 2 layout.`
            : clothedFaceBreak
              ? dayMood === 'suggestive'
                ? 'Image 2 is a clothing-only packshot — copy this EXACT garment onto the new Image 3 pose (same print/cut/coverage); inventing a bikini, swimsuit, or stripping her means the edit FAILED; ignore Image 2 layout and any white/gray void.'
                : 'Image 2 is a clothing-only packshot — copy garment cut, colors, and fabric ONLY onto the new Image 3 pose; ignore Image 2 layout and any white/gray void.'
              : 'Image 2 is a wardrobe packshot — use it only to reinforce garment cut, colors, and fabric from Image 1; ignore Image 2 layout.'
          : clothedFaceBreak && garmentDescription
            ? dayMood === 'suggestive'
              ? `CLOTHING LOCK: wear this EXACT outfit — ${garmentDescription} — inventing a bikini, swimsuit, or stripping her means the edit FAILED.`
              : `Outfit: wear ${garmentDescription} (exact cut, colors, print, fabric).`
            : null,
        earlyWhiteVoidLine,
        adultForegroundLock,
        ...(heatPoseBeforeSetting
          ? [
              poseLine,
              cameraLine,
              moodLine,
              suggestiveClothingLock,
              adultBeatPoseLock,
              vacationPoseLock,
              sportKitLock,
              settingLine,
              lateWhiteVoidLine,
            ]
          : [
              settingLine,
              poseLine,
              cameraLine,
              moodLine,
              suggestiveClothingLock,
              adultBeatPoseLock,
              vacationPoseLock,
              sportKitLock,
              lateWhiteVoidLine,
            ]),
        adultPropsLock,
        adultSoloActLock,
        adultDuoActLock,
        adultBodyLock,
        poseActionLock,
        everydayPoseStickyLock,
        poseGuideLine,
        poseAntiLeak,
        soloLock,
        companionLock,
        duoHeadcountLock,
        omitGarment || replaceKeepOutfit
          ? 'keep facial likeness only for identity; aggressively refactor pose, camera, lighting, environment, and clothing — zero fabric when the beat is nude'
          : clothedFaceBreak
            ? 'keep facial likeness only for identity — Image 1 is face only, invent body and clothes for the beat; aggressively refactor pose, camera, lighting, and environment'
            : dayMood === 'vacation'
              ? 'keep this exact woman from Image 1 (face, bone structure, hair color and length) and the clothing from Image 1; aggressively refactor pose, camera, lighting, and environment'
              : 'keep facial likeness only for identity; keep the clothing from Image 1; aggressively refactor pose, camera, lighting, and environment',
        descriptor
          ? `look (mandatory unique face and body — not a stock beauty face or default slim silhouette): ${descriptor}`
          : null,
        name ? `subject: ${name}` : 'subject: the active Cast character',
        keepOutfitLine,
        hints ? `beat: ${hints}` : null,
        notes ? `notes: ${notes}` : null,
        omitGarment
          ? soloSubject
            ? soloToy
              ? `replace everything else: pose, stance, limbs, ${SOLO_DILDO_INSERTION_CUE}, framing, lighting, and background — never invent a man; never a softcore pin-up staring at the lens`
              : 'replace everything else: pose, stance, limbs, fingers on vulva mid-act, framing, lighting, and background — never a softcore pin-up staring at the lens; nothing held between the thighs'
            : 'replace everything else: pose, stance, limbs, mid-sex contact, framing, lighting, and background — never a softcore pin-up staring at the lens'
          : 'replace everything else: pose, stance, limbs, hands, framing, lighting, and background — not a standing fashion plate in a void',
        photorealOutput
          ? omitGarment
            ? soloSubject
              ? soloToy
                ? `output: a new photorealistic live-action ${timeOfDay} photograph — same face, bare skin only (clothes are now gone), one woman alone with ${SOLO_DILDO_INSERTION_CUE}, new pose and scene — zero fabric, never invent a man, never a mannequin or white-backdrop cutout`
                : `output: a new photorealistic live-action ${timeOfDay} photograph — same face, bare skin only (clothes are now gone), mid-fingering with fingers on her vulva, new pose and scene — zero fabric, nothing held between the thighs, never a mannequin or white-backdrop cutout`
              : `output: a new photorealistic live-action ${timeOfDay} photograph — same face, bare skin only (clothes are now gone), mid-sex as the beat, new pose and scene — zero fabric, never a mannequin or white-backdrop cutout`
            : replaceKeepOutfit
              ? `output: a new photorealistic live-action ${timeOfDay} sport photograph — same face, athletic kit and mid-play pose, different venue — not a fashion pin-up in Image 1 clothes and not a mannequin or white-backdrop cutout`
              : `output: a new photorealistic live-action ${timeOfDay} photograph — same face, same kept outfit, different pose and location — not a cleaned-up copy of Image 1 and not a mannequin, stick-figure, diagram, or white-backdrop cutout`
          : `output: a new cinematic ${timeOfDay} scene — same face, different pose and location — not a cleaned-up copy of Image 1 or a white studio void`,
        framingLine,
      ]
        .filter(Boolean)
        .join('\n');
    }

    const castFaceBreakLeads = clothedFaceBreak
      ? buildDayVacationClothedFaceBreakLeads(
          dayMood === 'suggestive' || dayMood === 'vacation'
            ? clothedHeatUnlockPoseClass(hints, dayMood)
            : vacationLocks?.poseClass,
          'cast',
          dayMood,
          {
            garmentDescription,
            hasOutfitImage: Boolean(garmentReinforce),
          }
        )
      : null;
    return [
      nudeEditPreamble ??
        (clothedFaceBreak
          ? (castFaceBreakLeads?.preamble ??
            'Edit Image 1. Image 1 is a FACE CROP only (head/shoulders) — keep facial likeness only. Invent the full body pose from Image 3 and the beat. CRITICAL: Image 1 has no standing body — do not invent a square-on fashion stand with arms at her sides. Dress her from Image 2 garment colors/cut only; ignore Image 2 standing pose and room. Aggressively match Image 3 stance and the SETTING backdrop.')
          : QWEN_POSE_UNLOCK_MODIFY_PREFIX),
      isolateLine,
      `Edit instruction for a Day still — ${timeOfDay}:`,
      nudeImage1Line ??
        (clothedFaceBreak
          ? (castFaceBreakLeads?.image1 ??
            'Image 1 = face likeness only (cropped head/shoulders) — invent full body matching Image 3; never copy a standing fashion plate; outfit colors from Image 2 only.')
          : 'Image 1 is the Cast identity plate.'),
      nudeOutfitLine,
      sportOutfitLine,
      garmentReinforce
        ? garmentDescription
          ? clothedFaceBreak
            ? dayMood === 'suggestive'
              ? `Image 2 is a clothing-only packshot — copy this EXACT garment (cut, colors, print, fabric, coverage) onto the Image 3 pose (${garmentDescription}); inventing a bikini, swimsuit, or stripping her means the edit FAILED; ignore Image 2 layout and any white/gray void.`
              : `Image 2 is a clothing-only packshot — copy garments onto the Image 3 pose (${garmentDescription}); ignore Image 2 layout and any white/gray void.`
            : `Image 2 is a clothing-only packshot — apply that outfit to the subject (${garmentDescription}).`
          : clothedFaceBreak
            ? dayMood === 'suggestive'
              ? 'Image 2 is a clothing-only packshot — copy this EXACT garment onto the Image 3 pose (same print/cut/coverage); inventing a bikini, swimsuit, or stripping her means the edit FAILED; ignore Image 2 layout and any white/gray void.'
              : 'Image 2 is a clothing-only packshot — copy garments onto the Image 3 pose; ignore Image 2 layout and any white/gray void.'
            : 'Image 2 is a clothing-only packshot — apply that outfit to the subject.'
        : clothedFaceBreak && garmentDescription
          ? dayMood === 'suggestive'
            ? `CLOTHING LOCK: wear this EXACT outfit — ${garmentDescription} — inventing a bikini, swimsuit, or stripping her means the edit FAILED.`
            : `Outfit: wear ${garmentDescription} (exact cut, colors, print, fabric).`
          : null,
      earlyWhiteVoidLine,
      adultForegroundLock,
      ...(heatPoseBeforeSetting
        ? [
            poseLine,
            cameraLine,
            moodLine,
            suggestiveClothingLock,
            adultBeatPoseLock,
            vacationPoseLock,
            sportKitLock,
            settingLine,
            lateWhiteVoidLine,
          ]
        : [
            settingLine,
            poseLine,
            cameraLine,
            moodLine,
            suggestiveClothingLock,
            adultBeatPoseLock,
            vacationPoseLock,
            sportKitLock,
            lateWhiteVoidLine,
          ]),
      adultPropsLock,
      adultSoloActLock,
      adultDuoActLock,
      adultBodyLock,
      poseActionLock,
      everydayPoseStickyLock,
      poseGuideLine,
      poseAntiLeak,
      soloLock,
      companionLock,
      duoHeadcountLock,
      omitGarment || replaceKeepOutfit
        ? 'keep facial likeness only for identity; aggressively refactor pose, camera, lighting, environment, and clothing — zero fabric when the beat is nude'
        : 'keep facial likeness only from Image 1; aggressively refactor pose, camera, lighting, and environment',
      descriptor
        ? `look (mandatory unique face and body — not a stock beauty face or default slim silhouette): ${descriptor}`
        : null,
      name ? `subject: ${name}` : 'subject: the active Cast character',
      garmentReinforce && !omitGarment && !replaceKeepOutfit
        ? 'replace clothing with the garments from Image 2'
        : castOutfitLine,
      hints ? `beat: ${hints}` : null,
      notes ? `notes: ${notes}` : null,
      omitGarment
        ? soloSubject
          ? soloToy
            ? `replace everything else: pose, stance, limbs, ${SOLO_DILDO_INSERTION_CUE}, framing, lighting, and background — never invent a man; never a softcore pin-up staring at the lens`
            : 'replace everything else: pose, stance, limbs, fingers on vulva mid-act, framing, lighting, and background — never a softcore pin-up staring at the lens; nothing held between the thighs'
          : 'replace everything else: pose, stance, limbs, mid-sex contact, framing, lighting, and background — never a softcore pin-up staring at the lens'
        : 'replace everything else: pose, stance, limbs, hands, framing, lighting, and background — not a standing fashion plate in a void',
      photorealOutput
        ? replaceKeepOutfit
          ? `output: a new photorealistic live-action ${timeOfDay} sport photograph — same face from Image 1, athletic kit and mid-play pose — never a fashion pin-up in street clothes, mannequins, stick figures, or a white-backdrop cutout`
          : omitGarment
            ? soloSubject
              ? soloToy
                ? `output: a new photorealistic live-action ${timeOfDay} photograph — same face, bare skin only (clothes are now gone), one woman alone with ${SOLO_DILDO_INSERTION_CUE}, new pose and scene — zero fabric, never invent a man, never a mannequin or white-backdrop cutout`
                : `output: a new photorealistic live-action ${timeOfDay} photograph — same face, bare skin only (clothes are now gone), mid-fingering with fingers on her vulva, new pose and scene — zero fabric, nothing held between the thighs, never a mannequin or white-backdrop cutout`
              : `output: a new photorealistic live-action ${timeOfDay} photograph — same face, bare skin only (clothes are now gone), mid-sex as the beat, new pose and scene — zero fabric, never a mannequin or white-backdrop cutout`
            : `output: a new photorealistic live-action ${timeOfDay} photograph — same face from Image 1, new pose and scene — never mannequins, stick figures, wireframes, diagram art, or a white-backdrop cutout`
        : `output: a new cinematic ${timeOfDay} scene — same face, different pose and location — not a cleaned-up copy of Image 1 or a white studio void`,
      framingLine,
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    `Day still — ${timeOfDay}:`,
    descriptor
      ? `look (mandatory unique face and body — not a stock beauty face or default slim silhouette): ${descriptor}`
      : null,
    name ? `subject: ${name}` : 'subject: the active Cast character',
    nudeOutfitLine ??
      sportOutfitLine ??
      (outfit ? `outfit: ${outfit}` : 'outfit: catalog wardrobe kit for this slot'),
    setting ? `setting: ${setting}` : 'setting: a coherent location that fits the time of day',
    hints
      ? isDayHeatMood(dayMood)
        ? `beat (mandatory pose/action): ${hints}`
        : `beat: ${hints}`
      : `pose: ${defaultPose}`,
    cameraLine,
    moodLine,
    suggestiveClothingLock,
    adultBeatPoseLock,
    vacationPoseLock,
    sportKitLock,
    adultForegroundLock,
    adultPropsLock,
    adultSoloActLock,
    adultDuoActLock,
    adultBodyLock,
    notes ? `notes: ${notes}` : null,
    soloLock,
    companionLock,
    duoHeadcountLock,
    poseAntiLeak,
    framingLine,
    'keep the stated face geometry, body proportions, age read, and ancestry consistent; avoid generic model faces and default body types',
  ]
    .filter(Boolean)
    .join('\n');
}

function readStillStatus(value: unknown): DaySlotStillStatus | undefined {
  if (value === 'queued' || value === 'running' || value === 'completed' || value === 'error') {
    return value;
  }
  return undefined;
}

function readClipStatus(value: unknown): DaySlotClipStatus | undefined {
  if (value === 'queued' || value === 'running' || value === 'completed' || value === 'error') {
    return value;
  }
  return undefined;
}

export function normalizeDaySlotStills(input?: DaySlotStill[] | null): DaySlotStill[] {
  const bySlot = new Map<DaySlotId, DaySlotStill>();
  for (const still of input ?? []) {
    if (!still?.slotId || !SLOT_IDS.has(still.slotId)) {
      continue;
    }
    bySlot.set(still.slotId, {
      slotId: still.slotId,
      promptId: readText(still.promptId, 160) || undefined,
      imageUrl: readText(still.imageUrl, 2048) || undefined,
      status: readStillStatus(still.status),
      clipPromptId: readText(still.clipPromptId, 160) || undefined,
      clipUrl: readText(still.clipUrl, 2048) || undefined,
      clipStatus: readClipStatus(still.clipStatus),
    });
  }
  return DEFAULT_DAY_SLOTS.map(slot => bySlot.get(slot.id) ?? { slotId: slot.id });
}

export function upsertDaySlotStill(
  stills: DaySlotStill[] | null | undefined,
  patch: DaySlotStill
): DaySlotStill[] {
  const next = normalizeDaySlotStills(stills).map(still =>
    still.slotId === patch.slotId
      ? {
          ...still,
          ...patch,
          slotId: patch.slotId,
          promptId: 'promptId' in patch ? patch.promptId?.trim() || undefined : still.promptId,
          imageUrl: 'imageUrl' in patch ? patch.imageUrl?.trim() || undefined : still.imageUrl,
          status: patch.status ?? still.status,
          clipPromptId:
            'clipPromptId' in patch ? patch.clipPromptId?.trim() || undefined : still.clipPromptId,
          clipUrl: 'clipUrl' in patch ? patch.clipUrl?.trim() || undefined : still.clipUrl,
          clipStatus: 'clipStatus' in patch ? patch.clipStatus : still.clipStatus,
        }
      : still
  );
  return next;
}

export type DayGalleryEntry = {
  promptId: string;
  status?: string;
  imageUrl?: string | null;
  isClip?: boolean;
};

/** Merge gallery poll results into day slot stills by promptId (stills + clips). */
export function mergeDaySlotStills(
  stills: DaySlotStill[] | null | undefined,
  gallery: DayGalleryEntry[]
): { stills: DaySlotStill[]; changed: boolean } {
  const byPromptId = new Map(
    gallery.map(entry => [entry.promptId.trim(), entry] as const).filter(([id]) => Boolean(id))
  );
  let changed = false;
  const next = normalizeDaySlotStills(stills).map(still => {
    let updated = still;
    const stillId = still.promptId?.trim();
    if (stillId) {
      const match = byPromptId.get(stillId);
      if (match && !match.isClip) {
        const galleryImage = match.imageUrl?.trim() || '';
        const galleryStatus = stillStatusFromGallery(match.status);
        if (galleryStatus === 'completed' && galleryImage) {
          if (still.imageUrl !== galleryImage || still.status !== 'completed') {
            changed = true;
            updated = { ...updated, imageUrl: galleryImage, status: 'completed' };
          }
        } else if (!still.imageUrl?.trim()) {
          // First queue — no preview yet. Soft-pass in flight keeps a prior preview.
          if (still.status !== galleryStatus || (galleryImage && still.imageUrl !== galleryImage)) {
            changed = true;
            updated = {
              ...updated,
              status: galleryStatus,
              ...(galleryImage ? { imageUrl: galleryImage } : {}),
            };
          }
        } else if (galleryStatus === 'error' && still.status !== 'error') {
          changed = true;
          updated = { ...updated, status: 'error' };
        }
      }
    }
    const clipId = still.clipPromptId?.trim();
    if (clipId) {
      const match = byPromptId.get(clipId);
      if (match) {
        const clipUrl = match.imageUrl?.trim() || still.clipUrl;
        const clipStatus = stillStatusFromGallery(match.status);
        if (still.clipUrl !== clipUrl || still.clipStatus !== clipStatus) {
          changed = true;
          updated = { ...updated, clipUrl, clipStatus };
        }
      }
    }
    return updated;
  });
  return { stills: next, changed };
}

/**
 * When auto skin refine queues a soft-pass child, rebind Day slots that still
 * point at the parent still so the board adopts the refine result.
 */
export function promoteDayStillsToSoftPassChildren(
  stills: DaySlotStill[] | null | undefined,
  gallery: Array<{
    id: string;
    promptId: string;
    parentGalleryEntryId?: string;
    derivedKind?: string | null;
    status?: string;
    imageUrl?: string | null;
    queuedAt?: number;
    prompt?: string | null;
  }>
): { stills: DaySlotStill[]; changed: boolean } {
  const byPromptId = new Map(
    gallery.map(entry => [entry.promptId.trim(), entry] as const).filter(([id]) => Boolean(id))
  );
  const childrenByParentId = new Map<string, (typeof gallery)[number][]>();
  for (const entry of gallery) {
    const parentId = entry.parentGalleryEntryId?.trim();
    if (!parentId || entry.derivedKind !== 'soft-pass') {
      continue;
    }
    // Face-restore children wrecked Lightning Day stills — never adopt them.
    if (isDayVacationFaceRestorePrompt(entry.prompt)) {
      continue;
    }
    const list = childrenByParentId.get(parentId) ?? [];
    list.push(entry);
    childrenByParentId.set(parentId, list);
  }
  if (childrenByParentId.size === 0) {
    return { stills: normalizeDaySlotStills(stills), changed: false };
  }

  let changed = false;
  const next = normalizeDaySlotStills(stills).map(still => {
    const pid = still.promptId?.trim();
    if (!pid) {
      return still;
    }
    const self = byPromptId.get(pid);
    if (!self) {
      return still;
    }
    // Already tracking a soft-pass child.
    if (self.derivedKind === 'soft-pass') {
      return still;
    }
    const children = childrenByParentId.get(self.id);
    if (!children?.length) {
      return still;
    }
    const child = [...children].sort((a, b) => (b.queuedAt ?? 0) - (a.queuedAt ?? 0))[0];
    const childPromptId = child?.promptId?.trim();
    if (!childPromptId || childPromptId === pid) {
      return still;
    }
    changed = true;
    const childImage = child.imageUrl?.trim();
    const childDone = child.status === 'completed' && Boolean(childImage);
    return {
      ...still,
      promptId: childPromptId,
      ...(childDone ? { imageUrl: childImage, status: 'completed' as const } : {}),
    };
  });
  return { stills: next, changed };
}

function stillStatusFromGallery(status: string | undefined): DaySlotStillStatus {
  if (status === 'completed') {
    return 'completed';
  }
  if (status === 'error' || status === 'failed' || status === 'cancelled') {
    return 'error';
  }
  if (status === 'running') {
    return 'running';
  }
  return 'queued';
}

/** Watch / Cut film playlist — prefers completed clips, else stills (Morning → Night). */
export function dayWatchPlaylist(
  stills: DaySlotStill[] | null | undefined,
  slots: DaySlot[] = DEFAULT_DAY_SLOTS,
  stillHoldSec = DEFAULT_STILL_HOLD_SEC
): FilmPlaylistShot[] {
  const hold = clampStillHoldSec(stillHoldSec);
  const bySlot = new Map(normalizeDaySlotStills(stills).map(still => [still.slotId, still]));
  const shots: FilmPlaylistShot[] = [];
  for (const slot of normalizeDaySlots(slots)) {
    const still = bySlot.get(slot.id);
    const clipUrl = still?.clipStatus === 'completed' ? still.clipUrl?.trim() : '';
    if (clipUrl) {
      shots.push({
        entryId: still?.clipPromptId?.trim() || `${slot.id}-clip`,
        title: slot.label,
        url: clipUrl,
        kind: 'clip',
      });
      continue;
    }
    const url = still?.status === 'completed' ? still.imageUrl?.trim() : '';
    if (!url) {
      continue;
    }
    shots.push({
      entryId: still?.promptId?.trim() || slot.id,
      title: slot.label,
      url,
      kind: 'still',
      holdSec: hold,
    });
  }
  return shots;
}

/** Motion prompt subject for a day slot I2V clip. */
export function buildDaySlotMotionSubject(slot: DaySlot, characterName?: string): string {
  const name = characterName?.trim() || 'the character';
  const hints = slot.sceneHints?.trim();
  const location = slot.location?.trim();
  const motion = DAY_SLOT_MOTION_CUES[slot.id] || 'subtle natural motion, cinematic';
  return [
    `${name} during ${slot.label.toLowerCase()}`,
    location ? `at ${location}` : null,
    hints ? hints : null,
    motion,
  ]
    .filter(Boolean)
    .join(', ')
    .slice(0, 320);
}

/** Seed slot wardrobe ids from a Fitting / look-pack wardrobe lock. */
export function seedDaySlotsWardrobe(
  slots: DaySlot[] | null | undefined,
  wardrobeId?: string,
  options?: { force?: boolean }
): DaySlot[] {
  const id = wardrobeId?.trim();
  if (!id) {
    return normalizeDaySlots(slots);
  }
  const force = options?.force === true;
  return normalizeDaySlots(slots).map(slot => ({
    ...slot,
    wardrobeId: force ? id : slot.wardrobeId?.trim() || id,
  }));
}

/**
 * Map Fitting keeper kits onto morning→night (overwrites existing slot kits).
 * First N keepers fill slots in order; remaining slots inherit the last keeper.
 */
export function seedDaySlotsFromKeeperWardrobes(
  slots: DaySlot[] | null | undefined,
  wardrobeIds: string[]
): DaySlot[] {
  const ids = [...new Set(wardrobeIds.map(id => id.trim()).filter(Boolean))];
  const normalized = normalizeDaySlots(slots);
  if (ids.length === 0) {
    return normalized;
  }
  if (ids.length === 1) {
    return seedDaySlotsWardrobe(normalized, ids[0], { force: true });
  }
  const last = ids[ids.length - 1]!;
  return normalized.map((slot, index) => ({
    ...slot,
    wardrobeId: ids[index] ?? last,
  }));
}
