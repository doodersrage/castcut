import { poseProfileForModel } from '@/lib/pose/pose-model-profile';
import { normalizeSpokenLine } from './ltx25-renderer';
import { storySceneNamesSecondPerson } from './story-scene-people';
import { beatOwnsFootwear } from './footwear';
import { intimateBeatIsOffBed } from './intimate-prompt-clarify';
import {
  buildRapidDuoRecipe,
  buildRapidSoloRecipe,
  buildRapidSuggestiveDuoRecipe,
  buildRapidSuggestiveRecipe,
  buildCompactDayDuoRecipe,
  buildCompactDayRecipe,
  buildRapidVacationRecipe,
} from './rapid-duo-recipe';
import { stripNegatedClauses } from './negated-clauses';
import { normalizeDayEndPose, type DayEndPose } from './day-end-pose';
import { normalizeStillPromptCheck, type StillPromptCheck } from './still-prompt-audit';
import {
  clampStillHoldSec,
  DEFAULT_STILL_HOLD_SEC,
  type FilmPlaylistShot,
} from '@/lib/character-film';
import { captionFromBeat } from '@/lib/film-cut-plan';
import { QWEN_POSE_UNLOCK_MODIFY_PREFIX } from '@/lib/compose-prompt';
import {
  countPoseGuidePeople,
  parseIntimateLayout,
  normalizePhotoPose,
  normalizePoseCameraChoice,
  normalizePoseLookChoice,
  parseSocialLayout,
  resolveSoloMasturbationPoseKind,
  type PhotoPose,
  type PoseCameraChoice,
  type PoseLookChoice,
  type ScenePoseSpec,
} from '@/lib/day-pose-guide';
import {
  POSE_GUIDE_ACTION_LOCK,
  isOpenPoseStyle,
  inferPoseGuidePartner,
  KLEIN_MALE_PARTNER_GARMENTS,
  KLEIN_MALE_PARTNER_OUTFIT_LINE,
  poseGuidePromptBlock,
  type PoseGuideStylePreference,
} from '@/lib/pose-guide-prompt';
import { buildKleinSpoonRecipe, kleinSpoonRecipeApplies } from '@/lib/klein-duo-recipe';
import { describePoseLeadPosition, type PoseLeadPosition } from '@/lib/pose-guide-openpose';
import { resolveRoleplaySetting, storyBeatOmitsGarmentPackshot } from '@/lib/roleplay';
import {
  DEFAULT_RENDER_REALISM_MODE,
  normalizeRenderRealismMode,
  type RenderRealismMode,
} from '@/lib/render-realism';
import { buildSinglePersonUserDirective } from '@/lib/single-person';
import { beatFitsSetting, fitBeatToSetting, surfaceWordsForSetting } from '@/lib/scene-surface';
import {
  daySportBeatPresetsForSlot,
  daySportSettingPresetsForSlot,
  buildDaySportPromptLocks,
  pickDaySportScenePair,
  DAY_SPORT_STALE_SETTING_RE,
  daySportFootwear,
  inferDaySportFromScene,
  daySportLabel,
} from '@/lib/day-sport';
import {
  dayVacationBeatPresetsForSlot,
  dayVacationDuoBeatPresetsForSlot,
  isDayVacationDuoBeat,
  isDayVacationDuoSetting,
  dayVacationSettingPresetsForSlot,
  buildDayVacationClothedFaceBreakLeads,
  daySceneLeadLine,
  buildDayVacationPromptLocks,
  pickDayVacationScenePair,
  vacationPoseClassFromBeat,
  vacationStanceDirective,
  clothedHeatUnlockPoseClass,
  daySuggestiveBeatIsSeated,
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

import { DAY_PARTS, dayPartOf, isLateDaySlot, type DayPart } from '@/lib/day-parts';
import {
  DAY_THEMES,
  DAY_THEME_OPTIONS,
  dayThemeOf,
  dayThemeOwns,
  dayThemeSettingForBeat,
  dayThemeSettings,
  pickDayThemeScenePair,
  type DayTheme,
} from '@/lib/day-themes';
import type { DayPartner, DayPartnerNoun } from '@/lib/day-partner';
import { settleDayTwoTakes, twoTakeFromGallery } from '@/lib/day-two-takes';
import { swapDayPromptGender } from '@/lib/day-lead-gender';

export { DAY_PARTS, dayPartOf, isLateDaySlot, type DayPart };

/**
 * A slot on the Day board. Four-slot Days use the bare daypart ids; longer Days add a second
 * slot in a daypart as `<daypart>-2` ("Late morning"), so presets still key off the daypart.
 */
export type DaySlotId = DayPart | `${DayPart}-${number}`;

/** Supported Day lengths (slots on the board). */
export const DAY_LENGTHS = [2, 3, 4, 6, 8] as const;
export type DayLength = (typeof DAY_LENGTHS)[number];
export const DEFAULT_DAY_LENGTH: DayLength = 4;

export function normalizeDayLength(value: unknown): DayLength {
  const n = Math.round(Number(value));
  return (DAY_LENGTHS as readonly number[]).includes(n) ? (n as DayLength) : DEFAULT_DAY_LENGTH;
}

const DAY_PART_LABELS: Record<DayPart, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

/** Slot ids for each Day length, in board (morning → night) order. */
const DAY_LENGTH_SLOT_IDS: Record<DayLength, DaySlotId[]> = {
  2: ['morning', 'night'],
  3: ['morning', 'afternoon', 'night'],
  4: ['morning', 'afternoon', 'evening', 'night'],
  6: ['morning', 'morning-2', 'afternoon', 'evening', 'night', 'night-2'],
  8: [
    'morning',
    'morning-2',
    'afternoon',
    'afternoon-2',
    'evening',
    'evening-2',
    'night',
    'night-2',
  ],
};

/** Board label: "Morning", or "Late morning" for the second slot in a daypart. */
export function daySlotDefaultLabel(slotId: DaySlotId | string): string {
  const part = dayPartOf(slotId);
  const label = DAY_PART_LABELS[part];
  return /-\d+$/.test(String(slotId)) ? `Late ${label.toLowerCase()}` : label;
}

/** Default (empty) slots for a Day of `length` slots. */
export function daySlotsForLength(length: DayLength | number): DaySlot[] {
  return DAY_LENGTH_SLOT_IDS[normalizeDayLength(length)].map(id => ({
    id,
    label: daySlotDefaultLabel(id),
  }));
}

function isDaySlotId(value: unknown): value is DaySlotId {
  return (
    typeof value === 'string' &&
    Object.values(DAY_LENGTH_SLOT_IDS).some(ids => (ids as string[]).includes(value))
  );
}

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

/** Stored Day mood: a base mood or a theme built on Everyday (see day-themes.ts). */
export type DayMoodSetting = DayMood | DayTheme;

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
  /\b(solo|alone|masturbat\w*|self[- ]pleasur\w*|self[- ]touch|touch(?:ing)?\s+(?:herself|himself|themselves)|finger(?:ing)?\s+(?:herself|himself|themselves)|hands on her own|hands on his own)\b/i;

/** True when an intimate beat preset is solo / one-adult only. */
export function isDayIntimateSoloBeat(text: string): boolean {
  // "never Cast alone" is a duo lock, not a solo beat.
  return DAY_INTIMATE_SOLO_BEAT_RE.test(stripNegatedClauses(text.trim()));
}

/** Intimate beat presets for a slot filtered by solo / duo / mixed mix. */
export function intimateBeatsForMix(slotId: DaySlotId, mix: DayIntimateMix): string[] {
  const pool = intimateBeatPresets(slotId);
  if (mix === 'mixed') {
    return pool;
  }
  if (mix === 'solo') {
    return pool.filter(isDayIntimateSoloBeat);
  }
  return pool.filter(beat => !isDayIntimateSoloBeat(beat));
}

const DAY_RAUNCHY_SELF_TOUCH_RE =
  /\b(masturbat\w*|self[- ]touch|self[- ]pleasur\w*|finger(?:ing)?|hand on her vulva|rides? her own hand|grinding(?:\s+on\s+her\s+own)?|between her thighs|both hands between|fingers?\s+(?:inside|on|rubbing)|clit|dildo|vibrator|sex\s*toy|toy\s+play)\b/i;

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
  const affirmative = stripNegatedClauses(trimmed);
  if (DAY_RAUNCHY_SELF_TOUCH_RE.test(affirmative)) {
    return true;
  }
  return (
    DAY_RAUNCHY_SOLO_BEAT_RE.test(affirmative) && /\b(naked|nude|fully nude)\b/i.test(affirmative)
  );
}

/** Filter raunchy comedy presets by Solo / Duo / Mixed (same chips as Intimate). */
export function raunchyBeatsForMix(slotId: DaySlotId, mix: DayIntimateMix): string[] {
  const pool = raunchyBeatPresets(slotId);
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
  /** The kit was auto-picked at queue time (not chosen) — the outfit arc may re-align it. */
  wardrobeAuto?: boolean;
  location?: string;
  sceneHints?: string;
  /**
   * The beat as the player typed it. While it still equals {@link sceneHints}, the beat is the
   * player's words (written for the lead as they are), not one of Day's (written for a woman).
   */
  sceneHintsTyped?: string;
  /** Day's own beat from before the player's first edit — "Use Day's scene" puts it back. */
  sceneHintsDay?: string;
  /**
   * Pose picked in the slot editor — a layout (`cook`, `selfie`, `sport_squat`, …) or a plain
   * posture (`sit`, `lie`, …). Unset = read the pose from the beat.
   */
  poseLayout?: string;
  /** "Try another" count for this slot's pose guide (added to automatic retry variants). */
  poseVariant?: number;
  /** Pose read from the player's own photo — drawn exactly instead of the layout. */
  posePhoto?: PhotoPose;
  /** Camera the player picked for this slot (unset = the angle the pose implies). */
  poseCamera?: PoseCameraChoice;
  /** Two-person poses: which side the Cast lead stands on (unset = as drawn). */
  poseLead?: 'left' | 'right';
  /** Where the Cast looks (unset = as the pose draws it). */
  poseLook?: PoseLookChoice;
  /**
   * One of the Cast's looks this still is made in — its plate, outfit and dressed plate — without
   * changing the active look (day-slot-look.ts). Unset = the active look.
   */
  lookId?: string;
  /**
   * The slot's own look / kit was picked by hand in its sheet: a new Day-wide outfit (Outfit's
   * Keep, Use on Day) leaves it and says so, instead of clearing it (day-outfit-scope.ts).
   */
  outfitByHand?: boolean;
  /** What the lead says in this slot's clip — set, Animate makes a talking clip (LTX-2.5). */
  line?: string;
  /** The talking clip keeps the whole still instead of starting chest-up (talking-clip-framing). */
  lineFullFrame?: boolean;
};

export type DaySlotStillStatus = 'queued' | 'running' | 'completed' | 'error';

export type DaySlotClipStatus = 'queued' | 'running' | 'completed' | 'error';

/** The second of an intimate still's two takes (day-two-takes.ts), tracked like the still. */
export type DayTwoTake = {
  promptId: string;
  imageUrl?: string;
  status?: DaySlotStillStatus;
  /** The adult-appearance gate holds it (see DaySlotStill.adultHold). */
  adultHold?: 'checking' | 'withheld';
  /**
   * Both takes were counted (duo-still-check.ts: faces, hands, bodies, limbs). `likelier` is
   * the take with fewer counted oddities, shown first on the card with `likelierNote`; unset on
   * a tie. `likelierChecked` stops the count running twice.
   */
  likelierChecked?: boolean;
  likelier?: 'first' | 'second';
  likelierNote?: string;
};

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
  /**
   * Face finish (face-finish.ts): the finished image for the take `finishedFor` names. The
   * gallery poll shows it instead of the raw take while `finishedFor` matches `promptId`; a
   * requeue gets a new prompt id, so a stale finish is ignored.
   */
  finishedUrl?: string;
  finishedFor?: string;
  /** What the queue-time prompt check fixed / found on this take (still-prompt-audit). */
  promptCheck?: StillPromptCheck;
  /** The beat this take was rendered for (rerollBeatKey form) — a re-render of it is a re-roll. */
  beatKey?: string;
  /**
   * The take this one replaced when it was redone with the same seed — shown beside it, and
   * "Keep the old take" puts it back. `kind: 'best-of-two'`: the other take of a hard-pose pair
   * (day-best-of-two.ts), with its pose score. `kind: 'two-takes'`: the take the player did not
   * pick of an intimate still's two takes (day-two-takes.ts) — "Use the other take" swaps them.
   * `kind: 'fix-area'`: the picture before "Fix an area" (fix-area.ts) — "Undo the fix" puts it
   * back.
   */
  previousTake?: {
    imageUrl: string;
    promptId?: string;
    kind?: 'best-of-two' | 'two-takes' | 'fix-area';
    poseScore?: number;
  };
  /**
   * Fix an area, more than once on one slot: the pictures before each earlier fix, oldest
   * first (the one before the latest fix is `previousTake`). "Undo the fix" walks back through
   * them; "Keep the fix" lets them go. The Gallery keeps every version regardless.
   */
  fixHistory?: Array<{ imageUrl: string; promptId?: string }>;
  /**
   * Two takes (intimate stills, day-two-takes.ts): the second take, queued right after this one
   * with a new seed. While it is set the player has not picked yet; both side by side on the card.
   */
  twoTakes?: DayTwoTake;
  /** Why this take was queued again: the player said the last one looked wrong (⋯ → Looks wrong). */
  redoReason?: 'looks-wrong';
  /** Best of two for hard poses: both takes landed and this one read closer to the guide. */
  bestOfTwo?: { keptScore: number; otherScore: number };
  /**
   * Queued as Best of two in ONE job (the Castcut node pack, castcut-nodes.ts): when it lands, the
   * job's report fills `previousTake` (the other take) and `bestOfTwo` — no second queue.
   */
  bestOfTwoJob?: boolean;
  /** End pose: the picture this slot's clip lands on (day-end-pose.ts). */
  endPose?: DayEndPose;
  /**
   * The adult-appearance gate holds this take (adult-appearance-gate.ts): `checking` while the
   * vision model is asked (no image is shown), `withheld` when it did not read as clearly adult
   * (no image, ever — the card says so).
   */
  adultHold?: 'checking' | 'withheld';
  /** What a withheld take failed on: the age read, or bare skin on a Suggestive still. */
  adultHoldCause?: 'age' | 'bare';
  /** Queued as an adult still: the gate checks it, and no live preview is shown while it renders. */
  adultGated?: boolean;
  /**
   * "Pick the best engine per pose": this take rendered on another engine than the picked one,
   * and why ("Rendered on Edit 2511 — it holds this pose better"; pose-engine-report.ts).
   */
  engineNote?: string;
  /**
   * The queue-time reference check (reference-check.ts) found a picture that is not what its
   * slot expects — "Nora's face picture doesn't show a face — check Cast → Nora." — and what the
   * still did about it (the partner invented, the face cropped from the plate).
   */
  referenceNote?: string;
};

export const DEFAULT_DAY_SLOTS: DaySlot[] = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
  { id: 'night', label: 'Night' },
];

/**
 * Lightbox slides for completed Day progress stills (slot order).
 * `openSlotId` selects the starting slide when that still has an image.
 */
export function buildDayProgressLightboxState(
  slots: DaySlot[],
  stills: DaySlotStill[],
  openSlotId: DaySlotId | string,
  /** Whether a finished clip plays as a video (clip-media-kind.ts); default: by its URL. */
  clipIsVideo: (url: string, still: DaySlotStill) => boolean = url =>
    /\.(mp4|webm|mov)(?:[?&#]|$)|format=video/i.test(url)
): {
  images: string[];
  titles: string[];
  slotIds: DaySlotId[];
  /** Per slide: 'video' for an mp4/webm clip; animated WebP clips play as images. */
  mediaKinds: ('image' | 'video')[];
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
      const still = bySlot.get(slot.id);
      const imageUrl = still?.imageUrl?.trim();
      if (!imageUrl) {
        return null;
      }
      // A finished clip replaces its still (as on Story beat cards).
      const clipUrl = still?.clipStatus === 'completed' ? still.clipUrl?.trim() : '';
      const url = clipUrl || imageUrl;
      const scene = daySlotSceneSummary(slot, 120);
      const title = scene
        ? `${slot.label.trim() || slot.id} — ${scene}`
        : slot.label.trim() || slot.id;
      return {
        slotId: slot.id,
        url,
        title,
        video: Boolean(clipUrl && still && clipIsVideo(clipUrl, still)),
      };
    })
    .filter(
      (slide): slide is { slotId: DaySlotId; url: string; title: string; video: boolean } =>
        slide != null
    );
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
    mediaKinds: slides.map(slide => (slide.video ? 'video' : 'image')),
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
  if (still?.adultHold === 'withheld') return 'Withheld';
  if (still?.adultHold === 'checking') return 'Checking…';
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
/**
 * Board slots for a Day of `length` (default: the length the saved slots imply, else four).
 * Slot content is kept by id, so growing 4 → 6 keeps Morning…Night and adds the late slots.
 */
export function normalizeDaySlots(input?: DaySlot[] | null, length?: number | null): DaySlot[] {
  const byId = new Map<DaySlotId, DaySlot>();
  for (const slot of input ?? []) {
    if (!slot?.id || !isDaySlotId(slot.id)) {
      continue;
    }
    byId.set(slot.id, {
      id: slot.id,
      label: readText(slot.label, 40) || daySlotDefaultLabel(slot.id),
      wardrobeId: readText(slot.wardrobeId, 120) || undefined,
      wardrobeAuto:
        (slot.wardrobeAuto === true && Boolean(readText(slot.wardrobeId, 120))) || undefined,
      // Do not trim location/sceneHints here — updateSlot runs on every keystroke.
      location: readEditableText(slot.location, 160) || undefined,
      sceneHints: readEditableText(slot.sceneHints, 320) || undefined,
      sceneHintsTyped: readEditableText(slot.sceneHintsTyped, 320) || undefined,
      sceneHintsDay: readEditableText(slot.sceneHintsDay, 320) || undefined,
      poseLayout: readText(slot.poseLayout, 40) || undefined,
      line: normalizeSpokenLine(slot.line) || undefined,
      ...(slot.lineFullFrame === true ? { lineFullFrame: true } : {}),
      poseVariant:
        typeof slot.poseVariant === 'number' && slot.poseVariant > 0
          ? Math.min(99, Math.floor(slot.poseVariant))
          : undefined,
      posePhoto: normalizePhotoPose(slot.posePhoto),
      poseCamera: normalizePoseCameraChoice(slot.poseCamera),
      poseLead: slot.poseLead === 'left' || slot.poseLead === 'right' ? slot.poseLead : undefined,
      poseLook: normalizePoseLookChoice(slot.poseLook),
      lookId: readText(slot.lookId, 120) || undefined,
      outfitByHand: slot.outfitByHand === true || undefined,
    });
  }
  const resolvedLength =
    length != null ? normalizeDayLength(length) : inferDayLength([...byId.keys()]);
  return daySlotsForLength(resolvedLength).map(defaultSlot => ({
    ...defaultSlot,
    ...byId.get(defaultSlot.id),
    id: defaultSlot.id,
    label: byId.get(defaultSlot.id)?.label || defaultSlot.label,
  }));
}

/** Smallest Day length whose slots cover every saved slot id (legacy saves → four). */
export function inferDayLength(ids: Array<DaySlotId | string>): DayLength {
  const present = ids.filter(isDaySlotId);
  if (present.length === 0) return DEFAULT_DAY_LENGTH;
  const fits = DAY_LENGTHS.filter(length =>
    present.every(id => (DAY_LENGTH_SLOT_IDS[length] as string[]).includes(id))
  );
  // Prefer four when it fits (every legacy save), else the smallest length that holds them all.
  if (fits.includes(DEFAULT_DAY_LENGTH)) return DEFAULT_DAY_LENGTH;
  return fits[0] ?? 8;
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

/** Same fill for an OpenPose guide — it's a skeleton on black, not a gray outline on white. */
export const DAY_FACE_BREAK_SETTING_FILL_OPENPOSE =
  'BACKGROUND CRITICAL: fill the entire frame behind her with the SETTING venue (depth, props, lighting) — a blank white, seamless studio, missing background, mid-gray void, black void, or ecommerce cutout means the edit FAILED. Image 3 is a pose map on black only — never the scene, never a dark color overlay. Invent the SETTING behind her.';

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
export function buildDaySuggestivePoseLock(
  beat: string | null | undefined,
  options?: { couple?: boolean }
): string {
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
    `CLOTHING LOCK: wear the exact Keep/Image 2 outfit (same dress/lingerie/robe cut, colors, print, fabric coverage) — never swap in a different garment or strip her; bottoms or panties stay on; charged pin-up heat only. ` +
    `POSE LOCK: ${stance}. Image 1 Keep is a standing try-on — discard that standing fashion stance; never freeze as a square-on standing catalog model with arms at her sides; never strip to nude; never remove bottoms; ${options?.couple ? 'her partner stays fully clothed.' : 'never invent a second adult or muscular man.'}`
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

/**
 * Beat-class stance so everyday sit/walk/lie cannot collapse to the Keep stand. With the Setting,
 * the seats and beds it lists are only ones that place has ("ON the bed/couch/floor" on a park
 * lawn is "on the grass").
 */
export function everydayStanceDirective(
  poseClass: string | null | undefined,
  setting?: string | null
): string {
  switch ((poseClass ?? '').toUpperCase()) {
    case 'SEATED': {
      const seats = surfaceWordsForSetting(['chair', 'bench', 'stool', 'couch'], 'sit', setting);
      return `SEATED = hips ${seats} with knees bent — never standing square-on beside the seat`;
    }
    case 'LYING': {
      const beds = surfaceWordsForSetting(['bed', 'couch', 'floor'], 'lie', setting);
      return `LYING = body stretched ${beds}, hips and back down — never standing beside it`;
    }
    case 'WALKING':
      return 'WALKING = full-body mid-stride, one foot clearly ahead, opposite arm swing — never both feet planted parallel';
    case 'LEANING':
      return 'LEANING = weight into a wall/door/rail with hip cocked and asymmetric arms — never a planted catalog stand';
    case 'CROUCH':
      return 'CROUCHING = knees deeply bent, hips low, reaching down — never standing upright';
    case 'KNEEL':
      return 'KNEELING = one or both knees on the ground — never standing on both feet';
    case 'CLIMB':
      return 'CLIMBING = going UP the stairs, seen from the side or from below — one foot on a higher step with the knee bent, body leaning into the climb, a hand on the rail — never standing still on the stairs facing the lens, never walking down';
    case 'FOOT_UP':
      return 'FOOT UP = one foot raised onto the step, bench, or rung at knee height with the knee bent, torso bent over it and both hands at the laces, the other foot on the ground — never both feet on the floor, never sitting';
    case 'STANDING':
      return 'STANDING = on her feet in the SETTING, weight on one hip, relaxed and candid — never sitting, never a stiff square-on catalog stand';
    case 'DANCING':
      return 'DANCING = both arms in motion, weight on one leg or a step — never arms hanging at her sides';
    case 'GESTURE':
      return 'GESTURE = the beat action in the arms/hands with a clear weight shift — never the Image 1 arms-at-sides catalog stand';
    default:
      return 'new beat stance — never a square-on standing catalog pose with both feet planted and arms at her sides';
  }
}

/**
 * Everyday face-break: the stance as the first line of the lead. Rapid follows the first
 * paragraph; with only the generic face-crop lead, crouch and kneel beats stood up.
 */
export function dayEverydayFaceBreakStanceLead(
  beat: string | null | undefined,
  setting?: string | null
): string | null {
  const cls = dayEverydayPoseClass(beat);
  return ['SEATED', 'LYING', 'CROUCH', 'KNEEL', 'LEANING', 'CLIMB', 'FOOT_UP'].includes(cls)
    ? `${everydayStanceDirective(cls, setting)}.`
    : null;
}

export function buildDayEverydayKeepPoseUnlock(
  beat: string | null | undefined,
  setting?: string | null
): string {
  const cls = dayEverydayPoseClass(beat);
  const stance = everydayStanceDirective(cls, setting);
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
  return cls !== 'STILL' && cls !== 'GESTURE' && cls !== 'STANDING';
}

const DAY_POSE_CLASS_BODY: Record<string, ScenePoseSpec['body']> = {
  // Everyday classes
  SEATED: 'sit',
  LYING: 'lie',
  WALKING: 'walk',
  LEANING: 'lean',
  CROUCH: 'crouch',
  KNEEL: 'kneel',
  // Vacation / Suggestive classes
  PERCHED: 'sit',
  'MID-STRIDE': 'walk',
  RECLINING: 'lie',
  RELAXING: 'lie',
  REACHING: 'reach',
  JUMPING: 'jump',
};

/**
 * Structured body pose for a Day beat, from the same posture class the prompt's POSE FIRST
 * directive uses — so the Image 3 guide and the prompt can't disagree about sit vs stand.
 * Adult heat moods draw sex layouts from the beat text instead, so they get none; gesture /
 * dance / still classes leave the body to the guide's own layouts.
 */
export function dayPoseSpecForBeat(
  beat: string | null | undefined,
  dayMood: DayMood | string | null | undefined
): ScenePoseSpec | undefined {
  const mood = normalizeDayMood(dayMood);
  if (isDayAdultMood(mood) || !beat?.trim()) {
    return undefined;
  }
  const poseClass =
    mood === 'vacation' || mood === 'suggestive'
      ? clothedHeatUnlockPoseClass(beat, mood)
      : dayEverydayPoseClass(beat);
  const body = DAY_POSE_CLASS_BODY[poseClass.toUpperCase()];
  return body ? { body } : undefined;
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
  // Checked before WALKING/LEANING/SEATED: as a walk, lean or sit, 4/4 stair climbs came back
  // standing on the stairs facing the lens and 3/3 foot-ups stood or sat (live 2026-09-29).
  if (
    /\b(climb(?:s|ing)? (?:up )?(?:the )?(?:stairs|steps|staircase)|up the (?:stairs|steps))\b/.test(
      hay
    )
  ) {
    return 'CLIMB';
  }
  if (/\b(foot up|one foot up|boot up on)\b/.test(hay)) {
    return 'FOOT_UP';
  }
  // A sprawl in a chair is a sit — as LYING it moved her onto a bed (and drew someone else in
  // the chair).
  if (/\bsprawl(?:ed|ing|s)?\b[^,]*\b(?:armchair|chair)\b/.test(hay)) {
    return 'SEATED';
  }
  if (
    /\b(lie|lies|lying|sprawl(?:ed|ing)?|reclin(?:e|es|ed|ing)|stretched out|flat on|propped back on|on (?:her|his|their) (?:stomach|belly|side))\b/.test(
      hay
    )
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
  // Standing still with a phone or hands in pockets: the no-catalog-stand fallback sat both
  // neon phone beats in a diner booth.
  if (/\b(weight on one hip|(?:checking|holding) (?:a|the|her) phone|phone at chest)\b/.test(hay)) {
    return 'STANDING';
  }
  // Standing, but the arms are doing something — distinct enough from a still plate stance that
  // one of each in a day does not read as the same pose twice.
  if (
    /\b(wav(?:e|es|ing)|point(?:s|ing)?|reach(?:es|ing)?|stretch(?:es|ing)?|yawn|sip(?:s|ping)?|drink(?:s|ing)?|mug in hand|coffee in|pouring|look(?:s|ing)? back|over (?:one|the) shoulder|tuck(?:s|ing)?|adjust(?:s|ing)?|fixes|shrug(?:s|ging)?|palms up|hands on hips|hand on a hip|carry(?:ing)?|tote|bag over|read(?:s|ing)?|browsing|menu|surveying|squinting|cook(?:s|ing)|stir(?:s|ring)|flipping|at the stove|laptop|typing|eat(?:s|ing)|bite|photo(?:s|graph\w*)?|camera|selfie|arms? up|behind (?:her|his|their) head)\b/.test(
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
export const DEFAULT_DAY_SLOT_POSES: Record<DayPart, string> = {
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
export const DAY_SLOT_POSE_PRESETS: Record<DayPart, string[]> = {
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
export const DAY_SLOT_MOTION_CUES: Record<DayPart, string> = {
  morning: 'soft stretch or pour motion, steam drift, morning light shift',
  afternoon: 'natural walk cycle or gesture, breeze in hair/clothes, passing traffic blur',
  evening: 'slow glass tilt or glance, warm lamp flicker, golden-hour drift',
  night: 'neon pulse reflection, coat sway mid-step, quiet night ambience',
};

/**
 * Optional duo / selfie-companion beats — mixed in only when allowCompanions is on.
 * Magenta = Cast; companion must read as a different adult.
 */
export const DAY_SLOT_COMPANION_BEAT_PRESETS: Record<DayPart, string[]> = {
  morning: [
    'mirror selfie with a friend leaning into frame over one shoulder',
    'arm-in-arm with a roommate on the balcony, both facing morning light',
    'phone selfie with a friend crowding into the shot, laughing',
    'walking hand in hand with a friend to the café',
    'clinking mugs with a roommate over breakfast at the counter',
  ],
  afternoon: [
    'selfie with a friend on a park bench, heads close, different faces',
    'walking side by side with a companion, mid-conversation gesture',
    'hugging a friend hello on the sidewalk, both smiling',
    'high-fiving a friend at the top of the hike',
    "piggyback ride on a friend's back across the park, both laughing",
  ],
  evening: [
    'slow dancing with a friend in the living room, one hand on her waist',
    'selfie double at a bar rail with a friend leaning in, different faces',
    'seated knee-to-knee with a companion sharing a menu',
    'arm around a friend on a rooftop at golden hour',
    'clinking glasses with a friend at the rooftop bar',
    'selfie with a friend at golden hour, heads together',
  ],
  night: [
    'neon selfie with a friend pressed close, Cast face on the lead only',
    'walking home arm-in-arm under streetlights with a companion',
    'diner booth across from a friend, leaning into conversation',
    "sitting on the steps, head resting on a friend's shoulder",
    'walking home hand in hand with a friend under the streetlights',
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

/**
 * Pose baseline for a slot — rotates with Setting/Beat so Queue day varies stance. With
 * `fitSetting`, only baselines that place can host ("sitting in a diner booth" is not one for a
 * living room), their furniture fitted to it.
 */
export function resolveDaySlotPoseBaseline(
  slot: Pick<DaySlot, 'id' | 'location' | 'sceneHints'>,
  fitSetting?: string | null
): string {
  const all = DAY_SLOT_POSE_PRESETS[dayPartOf(slot.id)] ?? [
    DEFAULT_DAY_SLOT_POSES[dayPartOf(slot.id)],
  ];
  const fitting = fitSetting ? all.filter(pose => beatFitsSetting(pose, fitSetting)) : all;
  const pool = fitting.length > 0 ? fitting : all;
  const salt = `${slot.id}|${slot.location?.trim() ?? ''}|${slot.sceneHints?.trim() ?? ''}`;
  const pose = pickDayPresetFromSalt(pool, salt) || DEFAULT_DAY_SLOT_POSES[dayPartOf(slot.id)];
  return fitSetting ? fitBeatToSetting(pose, fitSetting) : pose;
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
export const DAY_SLOT_SETTING_PRESETS: Record<DayPart, string[]> = {
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
export const DAY_SLOT_BEAT_PRESETS: Record<DayPart, string[]> = {
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
    'out for a morning run through the park, ponytail swinging',
    'checking the phone while leaning on the sill, one elbow propped',
    'climbing the stairs with a mug, one hand on the banister',
    'heading out the door mid-stride with a tote, keys in the other hand',
    'stretching arms overhead mid-yawn before heading out',
    'pouring coffee by the window, mug in hand, torso turned toward the light',
    'reaching for a mug at the counter, weight on one hip',
    'waving hello from the balcony, other hand on the rail',
    'tucking hair behind an ear at the hall mirror',
    'hands on hips surveying the kitchen counter',
    'lying on her stomach on the bed, feet kicked up behind, scrolling the news',
    'sitting cross-legged on the rug with a mug, blanket around the shoulders',
    'flipping pancakes at the stove, spatula mid-air',
    'perched on the kitchen counter with a bowl of cereal, legs dangling',
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
    'lying on her side on the picnic blanket, head propped on one hand',
    'working on her laptop at a café table, coffee at her elbow',
    'snapping a photo of the street with a film camera',
    'taking a selfie on the bridge with the skyline behind',
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
    'waving hello with one hand raised, other hand on the patio rail',
    'checking a phone at golden hour, chin slightly tilted toward the screen',
    'arms crossed on a rooftop, looking out at golden hour',
    'tucking hair back while looking in the hall mirror',
    'hands on hips at the stove deciding what to cook',
    'propped back on her elbows on the grass watching the sunset',
    'stirring a pot of pasta sauce at the stove, wooden spoon raised',
    'throws both arms up in the air as the fireworks start',
    'sitting at the counter taking a bite of a slice of pizza',
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
    'lying on her stomach on the couch, chin on her hands, laptop open',
    'perched on the edge of the kitchen table, legs dangling, mug of tea',
    'standing at the balcony door, hands behind her head, taking a breath',
    'sitting cross-legged on the bed eating noodles from the carton',
  ],
};

/**
 * Everyday activities for the extra slots on 6- and 8-still Days (`morning-2` = Late morning…).
 * Keyed by daypart but written for the later hours, so a long Day moves on instead of repeating
 * that daypart's pool; each spans the same posture classes as {@link DAY_SLOT_BEAT_PRESETS}.
 */
export const DAY_LATE_SLOT_BEAT_PRESETS: Record<DayPart, string[]> = {
  morning: [
    'lying on the park lawn with sunglasses on, one knee up, phone held overhead',
    'sitting at a brunch table tearing a croissant, elbows on the table',
    'perched on a counter stool at a juice bar, one foot on the rung',
    'crouching at a farmers market crate picking out peaches',
    'kneeling to clip a leash on a friend’s dog outside the bakery',
    'leaning on a bookstore shelf flipping through a paperback',
    'climbing the subway stairs with a pastry bag, one hand on the rail',
    'walking out of the laundromat mid-stride with a folded stack on one hip',
    'carrying a potted plant home mid-stride, arms wrapped around the pot',
    'waving down a friend across the plaza, other hand holding an iced coffee',
    'tucking hair behind an ear while trying on sunglasses at a street stall mirror',
    'standing in line at the post office, parcel under one arm, weight on one hip',
    'photographing brunch on the table with a film camera',
    'lying on her side on the sofa, head propped on one hand, reading',
  ],
  afternoon: [
    'lying on a picnic blanket in golden light, propped on both elbows',
    'sitting on the steps of a museum with a paper cone of fries',
    'curled in a library window seat with knees drawn up and a book',
    'crouching to pet a cat outside a corner shop, one knee near the pavement',
    'kneeling on a gallery bench to photograph a painting',
    'leaning on a bridge railing watching boats pass, chin on one hand',
    'walking home through long golden-hour shadows, shopping bag swinging',
    'riding a city bike with one hand on the bars, hair lifting',
    'climbing a hillside staircase toward the view, one hand on the wall',
    'stretching both arms overhead on a rooftop as the light turns gold',
    'waving at a friend down the street, other hand shading her eyes from the low sun',
    'hands on hips outside the florist, a bunch of flowers tucked under one arm',
    'perched on a low wall with a gelato, legs dangling',
    'taking a selfie in front of the mural',
  ],
  evening: [
    'lying on the couch with feet up on the armrest, takeout container on the chest',
    'sitting at a dinner table twirling pasta, one elbow on the table',
    'perched on a bar stool with a cocktail, legs crossed at the ankle',
    'crouching to pick a record from a crate in a vinyl shop',
    'kneeling on the floor sorting a stack of board games',
    'leaning against a brick wall outside a restaurant waiting for a table',
    'walking a lamplit street after dinner mid-stride, coat over one arm',
    'climbing the stairs up to a cinema with a bucket of popcorn',
    'dancing alone in the kitchen with a wooden spoon as a microphone',
    'raising a glass for a toast at an outdoor table, other hand on the chair back',
    'checking a reflection in a shop window while fixing a collar',
    'standing at a food truck window counting coins into one palm',
    'lying back on the rooftop lounger, hands behind her head',
    'throws both arms up as the fireworks burst over the river',
  ],
  night: [
    'lying on the living-room floor with headphones on, eyes closed',
    'sitting cross-legged on the bed with a laptop glowing, mug beside the knee',
    'perched on a kitchen counter eating cereal straight from the box',
    'crouching at the open fridge in the blue light, one hand on the door',
    'kneeling at the window to look at the rain, forehead near the glass',
    'leaning in a doorway in pajamas, brushing teeth',
    'walking home from a late show mid-stride, hands in coat pockets',
    'climbing the stairs to a rooftop in the dark, phone torch lighting the steps',
    'stretching arms overhead at the end of a long day, eyes closed',
    'pointing up at the stars from the balcony, other hand on the rail',
    'hugging a pillow while standing by the window, looking out at the city',
    'standing at the bathroom mirror taking off earrings, head tilted',
    'lying on her stomach across the hotel bed, feet kicked up behind, texting',
    'cooking a midnight omelette at the stove',
  ],
};

/** Late-hour settings to match {@link DAY_LATE_SLOT_BEAT_PRESETS}. */
export const DAY_LATE_SLOT_SETTING_PRESETS: Record<DayPart, string[]> = {
  morning: [
    'bright brunch café with marble tables and hanging plants',
    'weekend farmers market with striped awnings and fruit crates',
    'leafy city park lawn in late-morning sun',
    'independent bookstore with tall shelves and a rolling ladder',
    'busy plaza with a fountain and café umbrellas',
    'corner laundromat with round windows and a bench along the wall',
    'subway exit stairs into a sunlit street',
  ],
  afternoon: [
    'art museum steps with long golden-hour shadows',
    'riverside promenade with a stone bridge and passing boats',
    'quiet library reading room with tall windows',
    'hillside staircase street with pastel houses',
    'rooftop terrace as the afternoon light turns gold',
    'neighborhood florist with buckets of cut flowers on the sidewalk',
    'tree-lined bike lane in late-afternoon sun',
  ],
  evening: [
    'candlelit trattoria with checkered tablecloths',
    'cocktail bar with a long brass counter and warm pendant lights',
    'lamplit street of restaurants just after dinner',
    'record shop with crates of vinyl and a listening booth',
    'outdoor food truck lot with string lights',
    'cozy apartment kitchen with dinner dishes on the counter',
    'old cinema lobby with a popcorn counter',
  ],
  night: [
    'dim apartment living room lit by a single lamp and the TV',
    'bedroom at midnight with the laptop glow and rain on the window',
    'kitchen lit only by the open fridge',
    'quiet city street after a late show, wet pavement and neon reflections',
    'rooftop in the dark with the city skyline glowing',
    'bathroom mirror with warm vanity lights late at night',
    'balcony at midnight overlooking city lights',
  ],
};

/** Late-hour companion beats (Duo · companions on). */
export const DAY_LATE_SLOT_COMPANION_BEAT_PRESETS: Record<DayPart, string[]> = {
  morning: [
    'seated across a brunch table from a friend, both mid-laugh, different faces',
    'selfie with a friend at the farmers market, fruit bags in hand',
    'high-fiving a friend after the farmers market haul',
  ],
  afternoon: [
    'walking a friend’s bike alongside them on the promenade, mid-conversation',
    'sitting on a picnic blanket with a friend in golden light, heads close',
    "piggyback ride on a friend's back along the boardwalk",
  ],
  evening: [
    'seated across a candlelit dinner table from a friend, clinking glasses',
    'arm-in-arm with a friend walking out of the restaurant',
    'clinking glasses with a friend at the wine bar',
  ],
  night: [
    'sitting on the rooftop ledge with a friend sharing earbuds, city lights behind',
    'selfie with a friend in the late-night diner booth',
    "sitting on the curb, head resting on a friend's shoulder",
  ],
};

/**
 * Heat pools for the extra slots on long Days (Late morning / afternoon / evening / night),
 * written for the later hours and held to the same rules as the daypart pools: Suggestive keeps
 * clothes on, Intimate / Raunchy split cleanly into solo ("Cast alone") and duo (both adults
 * fully visible) for the Solo / Duo chips, and every beat names a layout the pose guide draws.
 */
export const DAY_LATE_SLOT_SUGGESTIVE_BEAT_PRESETS: Record<DayPart, string[]> = {
  morning: [
    'lounging late in bed in an oversized shirt and panties — lying on her side propped on one elbow, bare legs tangled in the sheet, sleepy half-smile over one shoulder, clothes stay on',
    'perched on the kitchen counter in a silk slip eating fruit — ankles crossed, one strap slipping, leaning back on both hands, charged look, clothes stay on',
    'kneeling upright on the bed buttoning a shirt over lingerie — back arched, shirt half open, glancing up through her lashes, never square-on to the lens',
    'leaning in the bathroom doorway in a short robe over lingerie, hip against the frame, one hand in wet hair, looking back over a shoulder',
    'lying on her stomach across the sunlit bed, bare back to the camera, the white sheet over her hips, arms folded under her chest, sleepy smile over one shoulder',
  ],
  afternoon: [
    'reclining on a daybed in a sundress during a lazy siesta — lying back, one knee raised, hem riding up, eyes half-lidded, clothes stay on',
    'sitting on the floor against the bed in lingerie under an open robe — knees up, head tipped back on the mattress, warm golden light',
    'leaning on a sunlit window frame in a slip dress, back arched, one strap off the shoulder, looking back over a shoulder',
    'perched on the arm of a reading chair in a short robe over a slip, legs crossed high, leaning forward with charged eye contact, never a stiff standing catalog pose',
    'sitting on the bed edge after a shower, wrapped in a white towel tucked at her chest, one leg stretched out, smoothing lotion on it, glancing up',
  ],
  evening: [
    'kicking off heels on the bed after dinner — lying back across the mattress in a cocktail dress, one knee raised, arms overhead, clothes stay on',
    'leaning against the hallway wall unzipping a dress halfway — back to the wall, hips cocked, looking back over a shoulder, lingerie straps showing, clothes stay on',
    'sitting on the edge of the bathtub in lingerie and an open satin robe, one leg extended, removing an earring, charged glance',
    'kneeling upright on the rug in a slip dress pouring two glasses of wine, back arched, looking up with a slow smile',
    'standing at the hotel window at dusk wrapped in the white bedsheet, holding it closed at her chest with one hand, bare shoulders, city lights below, looking back over one shoulder',
  ],
  night: [
    'lying on her stomach across the bed in a silk camisole and shorts, ankles crossed in the air, chin on her hands, phone glow on her face, clothes stay on',
    'leaning on the dark windowsill at 3 a.m. in an oversized shirt and sleep shorts, one knee on the sill, city glow on her legs, looking back over a shoulder',
    'sitting cross-legged on the rumpled bed in lingerie hugging a pillow, hair messy, sleepy charged look, clothes stay on',
    'stretching in the doorway in a thin sleep slip — one arm overhead against the frame, hip cocked, bare legs, eyes half-lidded',
    'sitting on the dark windowsill in only an oversized white shirt, knees drawn up to her chest, bare legs, city glow, looking back over one shoulder',
  ],
};

export const DAY_LATE_SLOT_INTIMATE_BEAT_PRESETS: Record<DayPart, string[]> = {
  morning: [
    'lazy late-morning spooning sex in rumpled sheets with a partner behind, sun through the blinds',
    'straddling a partner on the unmade bed at late morning, her hands on his chest — both adults fully visible',
    'bent over the bed edge mid-sex with a partner behind, breakfast tray knocked aside',
    'solo masturbation lying in late-morning sheets, one knee raised, hand between her thighs, eyes closed — Cast alone',
    'alone sitting on the edge of the bathtub masturbating, one foot on the rim, head tipped back — never invent a partner',
    'going down on her in the late-morning sheets, partner between her thighs — both adults fully visible',
    'sitting on his lap facing him in the armchair at late morning mid-sex — both adults fully visible',
  ],
  afternoon: [
    'missionary on the bed during a golden-hour siesta, light striping across both bodies',
    'reverse cowgirl on the couch in warm late-afternoon light, partner lying back — both adults fully visible',
    'pressed against the bedroom wall mid-sex with a partner behind, curtains glowing gold',
    'solo masturbation reclining on a daybed in golden light, clothes half off, hand between her thighs — Cast alone',
    'alone kneeling upright on the bed masturbating in late-afternoon light, head tipped back — one adult only fully nude',
    'sixty-nine on the daybed during a golden-hour siesta — both adults fully visible',
    'lying face-down on the sheets mid-sex with a partner stretched along her back, golden light — both adults fully visible',
  ],
  evening: [
    'straddling a partner on the couch after dinner, dress pushed up, both adults fully visible mid-kiss',
    'bent over the hotel desk mid-sex with a partner behind, cocktail dress around her waist',
    'missionary on the hotel bed after a night out, heels still on, both adults fully visible',
    'solo masturbation lying across the bed in lingerie after dinner, one hand between her thighs — Cast alone',
    'alone in the bath masturbating by candlelight, one knee out of the water, head tipped back — never invent a partner',
    'lifted onto a partner mid-sex just inside the hotel room, legs wrapped around his waist — both adults fully visible',
    'she kneels between his legs going down on him after dinner — oral with a partner, both adults fully visible',
  ],
  night: [
    'slow spooning sex at 3 a.m. in the dark with a partner behind, city glow through closed curtains',
    'straddling a partner on the bed in the middle of the night, lamp low, both adults fully visible',
    'against the dark bedroom wall mid-sex with a partner behind, one leg lifted',
    'solo masturbation lying in the dark with the covers kicked off, knees apart, hand between her thighs — Cast alone',
    'alone on her side masturbating at 3 a.m., one knee drawn up, face pressed into the pillow — never invent a partner',
    'scissoring with a partner in the dark at 3 a.m., legs interlocked — both adults fully visible',
    'kneeling face to face on the bed with a partner mid-sex in the middle of the night — both adults fully visible',
  ],
};

export const DAY_LATE_SLOT_RAUNCHY_BEAT_PRESETS: Record<DayPart, string[]> = {
  morning: [
    'solo naked lying on her back on the unmade bed fingering herself while brunch goes cold on the tray — knees spread, both hands between her thighs, laughing mid-act, Cast alone fully nude',
    'alone naked face-down on a pile of clean laundry grinding into the towels, one hand between her thighs — laughing, one adult only',
    'partner mid-sex bending her over the bed as the delivery buzzer goes off — both adults fully visible, laughing mid-thrust',
    'straddling a partner on the couch mid-sex while the kettle screams — two adults mid-contact, both fully visible',
    'she goes down on her partner on the couch as the brunch timer shrieks — oral, both adults fully visible, laughing',
    'mating press on the unmade bed with a partner as the neighbor’s lawnmower starts — both adults fully visible',
  ],
  afternoon: [
    'solo naked siesta on her side on the couch turning into fingering — top knee drawn up, one hand between her thighs, Cast alone fully nude, eyes half-lidded',
    'alone naked kneeling upright on the bed in golden light riding her own hand, hips grinding, head tipped back — Cast alone',
    'partner mid-sex against the wardrobe when the door swings open and dumps clothes on both of them — two heads in frame',
    'cowgirl on the bed mid-sex in golden light with a partner when the blinds snap up — both adults fully visible',
    'sixty-nine on the daybed with a partner when the ceiling fan wobbles loose — both adults fully visible',
    'sitting on his lap facing him mid-sex on the rocking chair when it tips over — partner and Cast both fully visible',
  ],
  evening: [
    'solo naked on all fours on the bed after a night out, heels still on, looking back over a shoulder, one hand reaching between her thighs — Cast alone fully nude',
    'alone naked in the bath fingering herself as bubbles overflow onto the floor — one knee hooked on the rim, laughing, one adult only',
    'partner mid-sex over the arm of the couch as takeout spills across the floor — doggy-style, both adults fully visible',
    'pressed against the front door mid-sex with a partner just inside the apartment — keys still in hand, two adults mid-contact',
    'face-sitting a partner on the bed after a night out, heels still on — both adults fully visible',
    'picked up and fucked by a partner in the hallway as her shopping bags spill — legs wrapped around him, both adults fully visible',
  ],
  night: [
    'solo naked at 3 a.m. standing at the open fridge fingering herself in its light, one foot up on the crisper drawer — Cast alone fully nude, laughing',
    'alone naked on her back in the dark with ankles near her shoulders masturbating — both hands between her thighs, Cast alone, mouth open',
    'partner mid-sex on the bed when the smoke alarm chirps at 3 a.m. — missionary, both adults fully visible, laughing',
    'straddling a partner on the bedroom floor mid-sex after falling off the bed — two adults mid-contact, both fully visible',
    'lying face-down across the bed mid-sex with a partner stretched along her back when the bed slats give out at 3 a.m. — both adults fully visible',
    'she goes down on her partner in the glow of the open fridge at 3 a.m. — oral, both adults fully visible',
  ],
};

/** Late-hour indoor heat settings (opaque walls, curtains closed — same rules as the daypart pool). */
export const DAY_LATE_SLOT_HEAT_SETTING_PRESETS: Record<DayPart, string[]> = {
  morning: [
    'bright bedroom at late morning with rumpled sheets and blinds half-drawn — opaque walls only',
    'hotel room at late morning with a room-service tray on the bed and curtains drawn — lamp only',
  ],
  afternoon: [
    'bedroom at golden hour with warm light glowing through closed curtains — opaque walls only',
    'quiet apartment living room with a daybed and blinds drawn against the late sun',
  ],
  evening: [
    'hotel suite after dinner with warm lamp light and drawn curtains — opaque walls only',
    'bedroom with a discarded dress on the chair and warm lamp light — curtains closed',
  ],
  night: [
    'dark bedroom at 3 a.m. lit by a bedside lamp — curtains closed, opaque walls only',
    'apartment at midnight lit by the open fridge and a single lamp — blinds closed',
  ],
};

function lateOr(
  late: Record<DayPart, string[]>,
  base: Record<DayPart, string[]>,
  slotId: DaySlotId | string
): string[] {
  const part = dayPartOf(slotId);
  const pool = isLateDaySlot(slotId) ? late[part] : undefined;
  return pool && pool.length > 0 ? pool : (base[part] ?? []);
}

function suggestiveBeatPresets(slotId: DaySlotId | string): string[] {
  return lateOr(DAY_LATE_SLOT_SUGGESTIVE_BEAT_PRESETS, DAY_SLOT_SUGGESTIVE_BEAT_PRESETS, slotId);
}

/**
 * Suggestive with "Duo · companions" on: clothed couple heat — dancing close, a lap, a kiss at a
 * door, a zip at her back. Every beat names "her partner" (so the pose guide counts two) and
 * stays clothed; none may match DAY_CLOTHED_MOOD_SEX_LEAK_RE ("from behind", "second adult" …).
 */
export const DAY_SLOT_SUGGESTIVE_DUO_BEAT_PRESETS: Record<DayPart, string[]> = {
  morning: [
    'slow-dancing barefoot in the kitchen with her partner, both in sleepwear — his hands on her waist, her arms around his neck, foreheads touching',
    "sitting sideways on her partner's lap on the couch in a silk robe over a slip — his arm around her waist, her legs draped over his, about to kiss",
    'lying face to face on the rumpled bed with her partner, both in sleepwear — his hand on her hip, noses almost touching, morning light',
    'perched on the kitchen counter in an oversized shirt with her partner standing between her knees — her arms around his neck, mid-kiss, both clothed',
    'her partner zipping up her dress in the bedroom — he stands close at her back, she tips her head toward him with a slow smile, both dressed',
    'lying in bed with her partner under white sheets — the sheet tucked under her arms across her chest, his bare chest, her head on his shoulder, morning light',
    'sitting up in bed wrapped in the white sheet while her partner kisses her bare shoulder — she holds the sheet at her chest with one hand, eyes closed, smiling',
  ],
  afternoon: [
    'pinned playfully against the hallway wall by her partner, both fully dressed — his hand on the wall beside her head, her fingers in his shirt, about to kiss',
    "lying on a sunlit couch with her head in her partner's lap, in a short sundress — he strokes her hair, she looks up at him smiling",
    'kissing her partner in a doorway, up on her toes in a short dress — his hands on her waist, her hand on his jaw',
    'feeding her partner a strawberry on a picnic blanket in a sundress — she leans in on one hand, he lies propped on an elbow, both laughing',
    "sitting on her partner's lap in an armchair in a short dress, both fully clothed — her arms around his neck, foreheads together",
    'sharing a bubble bath with her partner, foam up to her collarbones — she leans back against his chest, his arms around her, both laughing',
    'standing at a sunlit window with her partner, both wrapped in one white sheet — she leans back against his bare chest, his arms around her holding the sheet closed at her chest',
  ],
  evening: [
    'slow-dancing close with her partner on a dim rooftop in an evening dress — her cheek on his chest, his hand low on her back',
    'leaning back against her partner at a hotel window in an evening dress — his arms around her waist, his lips on her neck, her eyes closed',
    'sitting close with her partner in a candlelit bar booth in a short dress — her legs across his lap, his hand on her knee, leaning in to whisper',
    'her partner unzipping her evening dress halfway at the bedroom door — she looks back at him over her shoulder, lingerie straps showing',
    // "pulled onto the bed … lands on top of him" rendered both sitting upright (3/3).
    'lying on top of her partner on the bed, both still in evening clothes — he lies on his back across the mattress, she lies stretched out on his chest laughing, his hands on her waist',
    'her partner unhooking her bra at the bedroom mirror — she holds it to her chest with one arm, lace panties, watching him in the mirror with a slow smile',
    'lying on the bed with her partner, both in underwear — she lies on her stomach across his chest, his hand on her bare back, both laughing',
  ],
  night: [
    "lying together on the couch under a blanket with her head on her partner's chest, both in sleepwear — his hand in her hair, TV glow",
    'kissing her partner against the apartment door after a night out, in a short dress — his hand on the door by her head, her coat slipping off her shoulders',
    'her partner standing with her lifted in his arms, carrying her to bed — short dress and bare feet, her arms around his neck, both laughing',
    'sitting on the bed edge in lingerie under an open robe with her partner kneeling in front of her, both clothed — he kisses her knee, her hand in his hair',
    'cuddling on top of the covers with her partner, both clothed in sleepwear — she lies on her side, he lies close at her back with his arm over her waist, her hand holding his',
    'lying tangled in white sheets with her partner after midnight — the sheet across her chest and over their hips, her leg over his, foreheads together, lamp glow',
    'standing in the steamy bathroom with her partner, both wrapped in one big white towel after a shower — the towel tucked around her chest, wet hair, his arms around her, laughing',
  ],
};

function suggestiveDuoBeatPresets(slotId: DaySlotId | string): string[] {
  return DAY_SLOT_SUGGESTIVE_DUO_BEAT_PRESETS[dayPartOf(slotId)] ?? [];
}

function intimateBeatPresets(slotId: DaySlotId | string): string[] {
  return lateOr(DAY_LATE_SLOT_INTIMATE_BEAT_PRESETS, DAY_SLOT_INTIMATE_BEAT_PRESETS, slotId);
}

function raunchyBeatPresets(slotId: DaySlotId | string): string[] {
  return lateOr(DAY_LATE_SLOT_RAUNCHY_BEAT_PRESETS, DAY_SLOT_RAUNCHY_BEAT_PRESETS, slotId);
}

function heatSettingPresets(slotId: DaySlotId | string): string[] {
  return lateOr(DAY_LATE_SLOT_HEAT_SETTING_PRESETS, DAY_SLOT_HEAT_SETTING_PRESETS, slotId);
}

/** Everyday pools for a slot: late slots (`morning-2`…) get their own later-hours activities. */
function everydayBeatPresets(slotId: DaySlotId | string): string[] {
  const part = dayPartOf(slotId);
  return isLateDaySlot(slotId)
    ? (DAY_LATE_SLOT_BEAT_PRESETS[part] ?? DAY_SLOT_BEAT_PRESETS[part] ?? [])
    : (DAY_SLOT_BEAT_PRESETS[part] ?? []);
}

let everydayPresetCache: Set<string> | null = null;

/** Every everyday solo and companion beat preset, any slot. */
function allEverydayBeatPresets(): Set<string> {
  everydayPresetCache ??= new Set(
    [
      DAY_SLOT_BEAT_PRESETS,
      DAY_LATE_SLOT_BEAT_PRESETS,
      DAY_SLOT_COMPANION_BEAT_PRESETS,
      DAY_LATE_SLOT_COMPANION_BEAT_PRESETS,
    ].flatMap(table => Object.values(table).flat())
  );
  return everydayPresetCache;
}

function everydayCompanionBeatPresets(slotId: DaySlotId | string): string[] {
  const part = dayPartOf(slotId);
  return isLateDaySlot(slotId)
    ? (DAY_LATE_SLOT_COMPANION_BEAT_PRESETS[part] ?? DAY_SLOT_COMPANION_BEAT_PRESETS[part] ?? [])
    : (DAY_SLOT_COMPANION_BEAT_PRESETS[part] ?? []);
}

function everydaySettingPresets(slotId: DaySlotId | string): string[] {
  const part = dayPartOf(slotId);
  return isLateDaySlot(slotId)
    ? (DAY_LATE_SLOT_SETTING_PRESETS[part] ?? DAY_SLOT_SETTING_PRESETS[part] ?? [])
    : (DAY_SLOT_SETTING_PRESETS[part] ?? []);
}

/** Suggestive beats — clothed heat / innuendo (no named sex). */
export const DAY_SLOT_SUGGESTIVE_BEAT_PRESETS: Record<DayPart, string[]> = {
  morning: [
    // Suggestive stays clothed: a robe has something named under it, nothing "falls open" or is
    // "loosely tied", and no "bare thighs" / "cleavage and skin" — the pose report card
    // (2026-10-03) drew a bare bottom (Qwen-Image 2.1, 2/2) and a bare breast (Rapid and Edit
    // 2511, 1/2 each) from exactly those words.
    'stretching in a camisole and sleep shorts by the window — one arm overhead, hip cocked, looking back over a shoulder, clothes stay on',
    'pouring coffee barefoot in a silk robe over a camisole, belted at the waist — leaning on the counter, a hint of neckline, charged quiet, not facing the lens square-on',
    'leaning on the sill in lingerie under an open shirt, soft morning glow, looking back over a shoulder with weight on one hip',
    'looking back over one shoulder while dressing, lingerie straps and unfinished buttons, one knee on the bed edge, charged pause',
    'kneeling upright on the rumpled bed in a sleep shirt and panties — back arched, hands in hair, morning light, clothes stay on',
    'sitting on the windowsill in a short robe over a bra and panties, one foot planted on the sill, eyes half-lidded, not a standing fashion plate',
    'sitting up in the rumpled white bed, the white sheet held across her chest with one arm, bare shoulders and bare back, messy hair, looking back over one shoulder at the window light',
    'standing at the fogged bathroom mirror wrapped in a white towel tucked at her chest, wet hair over one bare shoulder, wiping the glass with one hand',
    'kneeling on the bed on all fours in a lace bodysuit — back arched, looking back over one shoulder, morning light on the sheets',
  ],
  afternoon: [
    'adjusting a low neckline in a shop window reflection — body angled three-quarter to the glass, slow smile, never square to camera',
    'reclining on a sunlit couch, short hem riding up, one leg hooked over the backrest, warm look over one shoulder',
    'leaning on a balcony railing with a breeze lifting a short hem — hips back, looking back flirtatiously, clothes stay on',
    'biting a lip while checking a flirtatious text — weight on one hip, dress strap slipping, hand on the doorframe',
    'perched on a couch arm in a short dress, legs crossed high, leaning forward with charged eye contact, never a stiff standing catalog pose',
    'twisting to zip a dress in a mirror — torso twisted, back arched, both hands on the zipper behind her back, looking over a shoulder, lingerie straps visible, afternoon light — never square-on facing the lens',
    'standing at a sunlit window in only an oversized white shirt, half-buttoned and slipping off one shoulder, lace panties, bare legs, hip against the frame',
    'lying on her stomach across the bed in lace panties, bare back to the camera, her chest pressed into the mattress, chin on her folded arms, smiling over one shoulder',
    'reclining on a velvet chaise in black lingerie, stockings and a garter belt — one knee raised, arms stretched over her head, eyes half-closed',
  ],
  evening: [
    'holding a glass at a dim bar — seated on a stool, dress strap slipping, body angled, slow eye contact, never standing square-on',
    'DANCING alone on the patio in evening wear — both arms raised overhead, one knee lifted mid-kick, hips mid-sway, three-quarter turn — never arms-at-sides catalog stand',
    'seated on a couch arm in evening wear, legs crossed high, leaning back on one hand, charged pause',
    'leaning in a doorway in lingerie and an open robe — one shoulder against the jamb, looking down the hall, inviting, not a fashion plate',
    'sitting on the hotel bed edge unzipping a dress halfway — lingerie visible, one heel half-off, looking up into the lamp',
    'kneeling on the bed in evening lingerie facing the headboard — looking back over a shoulder, soft lamp, clothes stay on',
    'standing on the bath mat beside the tub after a bubble bath, a white towel held to her chest with both hands, bubbles on her bare shoulders, candlelight',
    'sitting on the bed edge in lace panties, her unhooked bra held to her chest with one arm, looking back over one shoulder, soft lamp',
    'straddling a chair backwards in a black lace bodysuit and stockings — arms folded on the chair back, chin resting on them, slow look',
  ],
  night: [
    'pausing under neon in a short dress, coat open — looking back over a shoulder mid-stride, charged heat, never a static front pose',
    'sitting on the edge of a hotel bed, unzipping a dress halfway, lingerie visible underneath — body twisted, eyes not locked on the lens',
    'leaning in a bedroom doorway in lingerie — hip cocked against the frame, soft lamp, inviting body language',
    'walking barefoot to bed in lingerie — mid-step toward the sheets, looking back, soft lamp, clothes stay on, never a polite standing portrait',
    'lying on her side on the hotel bed in lingerie — propped on one elbow, knees drawn up, charged quiet, never nude',
    'perched on a chair backwards in a short dress after dark — arms on the chair back, looking over a shoulder, bottoms on',
    'lying on her side in bed facing the camera, the white sheet tucked under her arms across her chest and drawn over her hips, bare shoulders, hair spread on the pillow, lamp glow',
    'leaning in a dark doorway in only an oversized white dress shirt, half-buttoned, bare legs, hip against the frame, one hand on the doorframe',
    'lying back across the hotel bed in black lace lingerie and stockings, legs up against the headboard, arms over her head, city glow',
  ],
};

/**
 * Intimate beats — stance keywords Image 3 already maps (bent, wall, missionary…).
 * Duo lines imply a partner; solo lines stay one adult (masturbation / self-touch / undress).
 */
export const DAY_SLOT_INTIMATE_BEAT_PRESETS: Record<DayPart, string[]> = {
  morning: [
    'bent over the kitchen counter mid-sex with a partner behind',
    'missionary on the rumpled bed with morning light through blinds',
    'pressed against the bathroom wall mid-sex, steam in the air',
    'bent over the bathroom sink mid-sex with a partner behind',
    'solo masturbation straddling a bathroom sink edge, back arched, one hand between her thighs — Cast alone',
    'alone on her back in rumpled morning sheets, knees pulled up and spread, both hands between her thighs, head tipped back — never invent a partner',
    'solo kneeling upright on the bed masturbating at sunrise — hand on her vulva, chest forward, head tipped back eyes half-lidded not at the lens — one adult only fully nude',
    'alone standing in the shower masturbating under the spray, one foot on the ledge, fogged glass — Cast alone',
    'going down on her at the edge of the bed in morning light, partner kneeling between her thighs — both adults fully visible',
    'sitting on his lap facing him on a kitchen chair mid-sex, arms around his neck — both adults fully visible',
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
    'sixty-nine on the couch in afternoon light — both adults fully visible',
    'lying face-down on the bed mid-sex with a partner stretched along her back, afternoon light through the blinds',
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
    'lifted onto a partner mid-sex in the hotel room, legs wrapped around his waist — both adults fully visible',
    'reverse cowgirl on the hotel armchair with a partner seated beneath her hips — both adults fully visible',
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
    'scissoring on the bed in the lamp glow, legs interlocked with a partner — both adults fully visible',
    'kneeling face to face on the bed mid-sex with a partner, bodies pressed together, lamp low',
  ],
};

/**
 * Crude sexual comedy for Day Raunchy mood — gag props are the setup,
 * naked mid-self-touch / slapstick sex is the punchline (NSFW-gated).
 * Solo lines lead with nude act — naming a worn dress/swimsuit lets Keep win.
 */
export const DAY_SLOT_RAUNCHY_BEAT_PRESETS: Record<DayPart, string[]> = {
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
    'she kneels on the kitchen floor giving her partner oral sex when the smoke alarm goes off — both adults fully visible, laughing',
    'sitting on his face on the bed as the alarm clock blares — face-sitting a partner, both adults fully visible',
  ],
  afternoon: [
    'solo on the couch naked with one ankle on the backrest — thighs wide, both hands between her thighs rubbing her clit hard, lamp-only comedy, Cast alone fully nude, eyes not at the lens',
    'alone pressed to the hallway wall fully nude one leg hiked — both hands buried between her thighs fingering, laughing mid-act, clothes in a pile, Cast alone',
    'solo reclining naked on the couch knees flopped open — the TV remote fallen on the floor, both hands between her thighs spreading and fingering, Cast alone, head tipped',
    'alone on all fours naked on the bed looking back over a shoulder — hips high, both hands reaching under between her thighs fingering her vulva hard, afternoon light, one adult only, fully nude',
    'alone on all fours naked looking back — one hand bracing the sheets, other hand pushing a realistic penis-shaped silicone dildo with the tip of the penis deep into her vaginal opening from behind, shaft entering her vagina, afternoon light, Cast alone fully nude, never invent a man or second adult',
    'partner mid-sex against the hallway wall after an accidental flash — roommate and Cast both fully visible, slapstick contact, never Cast alone',
    'bent over a desk mid-sex with a partner gripping her hips when the chair rolls away — both scramble laughing, two adults in frame',
    'partner yanking her pants down mid-argument into slapstick doggy-style — both adults mid-sex fully visible',
    'against the wall mid-sex with a partner when the lamp tip-over startles them mid-thrust — both freeze laughing, two heads in frame',
    'mating press on the couch with a partner when the doorbell rings — both adults fully visible, laughing',
    'picked up and fucked by a partner in the laundry room as the dryer buzzes — legs wrapped around him, both adults fully visible',
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
    'sixty-nine on the living-room rug with a partner when the pizza arrives — both adults fully visible',
    'sitting on his lap facing him mid-sex on the office chair when it tips back — partner and Cast both fully visible',
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
    'lying face-down across the bed mid-sex with a partner stretched along her back when the bed frame collapses — both adults fully visible',
    'scissoring with a partner on the couch when the TV turns on at full volume — both adults fully visible',
  ],
};

/** Soft bedroom / hotel settings mixed in when mood is suggestive, intimate, or raunchy. */
export const DAY_SLOT_HEAT_SETTING_PRESETS: Record<DayPart, string[]> = {
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
  const heat = heatSettingPresets(slotId);
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
/**
 * Pose class of a heat-mood beat for spreading a Day: the sex layout the pose guide will draw
 * for partner beats (`bent`, `oral`, `lap`…), `solo:<kind>` for solo beats (`solo:on_back`…),
 * and the everyday posture class for Suggestive (clothed) beats.
 */
export function dayHeatPoseClass(
  beat: string,
  dayMood: DayMood | string | null | undefined
): string {
  if (isDayAdultMood(normalizeDayMood(dayMood))) {
    const layout = parseIntimateLayout(beat) ?? 'generic';
    return layout === 'solo' ? `solo:${resolveSoloMasturbationPoseKind(beat)}` : layout;
  }
  return dayEverydayPoseClass(beat);
}

const NO_BEATS: ReadonlySet<string> = new Set();
let avoidedBeatsSource: () => ReadonlySet<string> = () => NO_BEATS;

/**
 * Beats the player keeps re-rolling (play-metrics chronicRerollBeats, lowercased with single
 * spaces): Suggest day and every slot pick skip them while the pool has others. Set by the Day
 * hook — this module stays free of browser storage.
 */
export function setDayAvoidedBeatsSource(source: () => ReadonlySet<string>): void {
  avoidedBeatsSource = source;
}

function withoutAvoidedBeats(pool: string[]): string[] {
  const avoided = avoidedBeatsSource();
  if (avoided.size === 0) return pool;
  const kept = pool.filter(entry => !avoided.has(entry.trim().toLowerCase().replace(/\s+/g, ' ')));
  return kept.length > 0 ? kept : pool;
}

function pickUnusedBeatWithFreshPose(
  pool: string[],
  usedBeats: Set<string>,
  usedPoseClasses: Set<string>,
  random: () => number,
  classify: (beat: string) => string = dayEverydayPoseClass,
  /** Gesture / action layouts already on the Day (cook, selfie, hug…) — avoided when possible. */
  usedLayouts?: ReadonlySet<string>,
  /** Return nothing rather than repeat a layout (so the caller can try another pool). */
  strictLayouts = false
): string | undefined {
  const usable = withoutAvoidedBeats(pool);
  const unused = usable.filter(entry => !usedBeats.has(entry.trim().toLowerCase()));
  const pickFrom = unused.length > 0 ? unused : usable;
  const fresh = pickFrom.filter(entry => !usedPoseClasses.has(classify(entry)));
  const freshClass = fresh.length > 0 ? fresh : pickFrom;
  // Same posture class is sometimes unavoidable; the same drawn gesture twice rarely is.
  const freshLayout = usedLayouts?.size
    ? freshClass.filter(entry => {
        const layout = parseSocialLayout(entry);
        return !layout || !usedLayouts.has(layout);
      })
    : freshClass;
  if (strictLayouts && freshLayout.length === 0) {
    return undefined;
  }
  const finalPool = freshLayout.length > 0 ? freshLayout : freshClass;
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
  const solo = everydayBeatPresets(slotId);
  const companion = allowCompanions ? everydayCompanionBeatPresets(slotId) : [];
  if (mood === 'suggestive') {
    // Heat-only — everyday coffee/walk beats flatten suggestive into polite portraits.
    return allowCompanions
      ? [...suggestiveBeatPresets(slotId), ...suggestiveDuoBeatPresets(slotId)]
      : suggestiveBeatPresets(slotId);
  }
  if (mood === 'sport') {
    return daySportBeatPresetsForSlot(slotId);
  }
  if (mood === 'vacation') {
    return allowCompanions
      ? [...dayVacationBeatPresetsForSlot(slotId), ...dayVacationDuoBeatPresetsForSlot(slotId)]
      : dayVacationBeatPresetsForSlot(slotId);
  }
  if (mood === 'intimate') {
    // Every mix stays inside the adult pool: "Mixed" is solo + duo adult beats (its chip says
    // so), and everyday coffee / sidewalk beats made a quarter of an Intimate Day non-intimate.
    return intimateBeatsForMix(slotId, intimateMix);
  }
  if (mood === 'raunchy') {
    return raunchyBeatsForMix(slotId, intimateMix);
  }
  return [...solo, ...companion];
}

function heatBeatPoolForDayMood(
  slotId: DaySlotId,
  mood: DayMood,
  intimateMix: DayIntimateMix
): string[] {
  if (mood === 'suggestive') {
    return suggestiveBeatPresets(slotId);
  }
  if (mood === 'sport') {
    return daySportBeatPresetsForSlot(slotId);
  }
  if (mood === 'vacation') {
    return dayVacationBeatPresetsForSlot(slotId);
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
  // Suggestive with companions: about half the slots are a clothed couple.
  // People → Duo: every slot is the couple.
  if (dayMood === 'suggestive' && allowCompanions && (intimateMix === 'duo' || random() < 0.5)) {
    const duo = suggestiveDuoBeatPresets(slotId);
    if (duo.length > 0) {
      return { primary: duo, fallback: heatPool };
    }
  }
  // Vacation with People → Duo (or some Mixed slots): the couple scenes.
  if (dayMood === 'vacation' && allowCompanions && (intimateMix === 'duo' || random() < 0.4)) {
    const duo = dayVacationDuoBeatPresetsForSlot(slotId);
    if (duo.length > 0) {
      return { primary: duo, fallback: heatPool };
    }
  }
  // Suggestive + sport + adult Solo/Duo: always pick from heat — everyday baselines flatten the mood.
  if (
    (dayMood === 'suggestive' || dayMood === 'sport' || dayMood === 'vacation') &&
    heatPool.length > 0
  ) {
    return { primary: heatPool, fallback: heatPool };
  }
  if (isDayAdultMood(dayMood) && heatPool.length > 0) {
    return { primary: heatPool, fallback: heatPool };
  }
  const companionPool = allowCompanions ? everydayCompanionBeatPresets(slotId) : [];
  const soloPool = everydayBeatPresets(slotId);
  // People → Duo on a clothed mood: every slot is a companion beat.
  const clothedDuo =
    !isDayAdultMood(dayMood) &&
    allowCompanions &&
    intimateMix === 'duo' &&
    companionPool.length > 0;
  const preferHeat = !clothedDuo && heatPool.length > 0 && random() < preferHeatChance(dayMood);
  const preferCompanion =
    clothedDuo || (!preferHeat && allowCompanions && companionPool.length > 0 && random() < 0.4);
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
  const base = everydaySettingPresets(slotId);
  if (mood === 'everyday') {
    return base;
  }
  if (mood === 'sport') {
    const sportSettings = daySportSettingPresetsForSlot(slotId);
    return sportSettings.length > 0 ? sportSettings : base;
  }
  if (mood === 'vacation') {
    const vacationSettings = dayVacationSettingPresetsForSlot(slotId);
    return vacationSettings.length > 0 ? vacationSettings : base;
  }
  const heat = heatSettingPresets(slotId);
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
  const theme = dayThemeOf(options?.dayMood);
  const intimateMix = normalizeDayIntimateMix(options?.intimateMix);
  const usedLocations = new Set<string>();
  const usedBeats = new Set<string>();
  const usedVacationPoseClasses = new Set<string>();
  const usedEverydayPoseClasses = new Set<string>();
  const usedHeatPoseClasses = new Set<string>();
  const usedLayouts = new Set<string>();
  const noteLayout = (beat: string) => {
    const layout = parseSocialLayout(beat);
    if (layout) usedLayouts.add(layout);
  };
  const heatClass = (beat: string) => dayHeatPoseClass(beat, dayMood);
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
      noteLayout(beat);
      if (dayMood === 'vacation') {
        usedVacationPoseClasses.add(vacationPoseClassFromBeat(beat));
      } else if (!isDayHeatMood(dayMood)) {
        usedEverydayPoseClasses.add(dayEverydayPoseClass(beat));
      } else {
        usedHeatPoseClasses.add(heatClass(beat));
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
          noteLayout(sceneHints);
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

    // Themes (Date night, Cosplay…): each beat brings its own room, like Sport and Vacation.
    if (theme && (forceLocations || forceBeats || !location || !sceneHints)) {
      const keepBeat = sceneHints && !forceBeats ? dayThemeSettingForBeat(theme, sceneHints) : null;
      const pair = keepBeat
        ? { beat: sceneHints, setting: keepBeat, poseClass: dayEverydayPoseClass(sceneHints) }
        : fillBeats && (forceBeats || !sceneHints)
          ? pickDayThemeScenePair(theme, slot.id, {
              companions: allowCompanions,
              duoOnly: allowCompanions && intimateMix === 'duo',
              usedBeats,
              usedPoseClasses: usedEverydayPoseClasses,
              poseClass: dayEverydayPoseClass,
              random,
            })
          : null;
      if (pair) {
        if (pair.beat !== sceneHints) {
          sceneHints = pair.beat;
          slotChanged = true;
        }
        if ((forceLocations || !location) && pair.setting !== location) {
          location = pair.setting;
          slotChanged = true;
        }
        usedLocations.add(location.toLowerCase());
        usedBeats.add(sceneHints.toLowerCase());
        usedEverydayPoseClasses.add(pair.poseClass);
        noteLayout(sceneHints);
        if (slotChanged) {
          changed = true;
          return {
            ...slot,
            location: location || undefined,
            sceneHints: sceneHints || undefined,
          };
        }
        return slot;
      }
    }

    // Vacation: matched travel beat + venue; prefer a fresh pose class each slot.
    if (dayMood === 'vacation' && (forceLocations || forceBeats || !location || !sceneHints)) {
      const pair = pickDayVacationScenePair(slot.id, {
        usedBeats,
        usedLocations,
        usedPoseClasses: usedVacationPoseClasses,
        random,
        // People → Duo: every slot is the couple; Mixed: some are.
        ...(allowCompanions
          ? { duo: intimateMix === 'duo' ? ('only' as const) : ('mix' as const) }
          : {}),
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
          noteLayout(sceneHints);
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

    // Clothed moods: the beat and the Setting are drawn apart, so each is drawn from those that
    // fit the other — a sofa beat on a busy plaza painted the sofa there (Castcut_02403).
    const keptBeat = fillBeats && (!sceneHints || forceBeats) ? '' : sceneHints;
    const hostsBeat = (pool: string[]) => {
      if (isDayAdultMood(dayMood) || !keptBeat) return pool;
      const fitting = pool.filter(setting => beatFitsSetting(keptBeat, setting));
      return fitting.length > 0 ? fitting : pool;
    };
    if (!location || forceLocations) {
      const picked = pickUnusedPreset(
        hostsBeat(settingPoolForDayMood(slot.id, dayMood, intimateMix)),
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
      const pools = pickDayBeatPools(slot.id, dayMood, intimateMix, allowCompanions, random);
      const fitsPlace = (pool: string[]) => {
        if (isDayAdultMood(dayMood) || !location) return pool;
        const fitting = pool.filter(beat => beatFitsSetting(beat, location));
        return fitting.length > 0 ? fitting : pool;
      };
      const primary = fitsPlace(pools.primary);
      const fallback = fitsPlace(pools.fallback);
      // Spread poses across the Day: everyday by posture class, heat moods by the layout the
      // pose guide draws — text-only dedupe let four different beats all be "bent over".
      const classify = isDayHeatMood(dayMood) ? heatClass : dayEverydayPoseClass;
      const usedClasses = isDayHeatMood(dayMood) ? usedHeatPoseClasses : usedEverydayPoseClasses;
      const pick = (pool: string[], strict: boolean) =>
        pickUnusedBeatWithFreshPose(
          pool,
          usedBeats,
          usedClasses,
          random,
          classify,
          usedLayouts,
          strict
        );
      const picked =
        pick(primary, true) ||
        pick(fallback, true) ||
        pick(primary, false) ||
        pick(fallback, false);
      if (picked && picked !== sceneHints) {
        sceneHints = picked;
        slotChanged = true;
      }
    }
    if (sceneHints) {
      usedBeats.add(sceneHints.toLowerCase());
      noteLayout(sceneHints);
      if (!isDayHeatMood(dayMood)) {
        usedEverydayPoseClasses.add(dayEverydayPoseClass(sceneHints));
      } else {
        usedHeatPoseClasses.add(heatClass(sceneHints));
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
  /** Suggestive couple beats only fit while "Duo · companions" is on. */
  allowCompanions?: boolean;
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
  // The mood's own beats pass: Vacation's "sketching in a travel notebook" is not a stale
  // everyday notebook prop.
  const ownBeat = heatBeatPoolForDayMood(input.slot.id, dayMood, mix).includes(beat);
  if (
    (!ownBeat && DAY_STALE_EVERYDAY_PROP_RE.test(beat)) ||
    DAY_STALE_EVERYDAY_PROP_RE.test(setting)
  ) {
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
    // Any slot's Vacation board is a leftover, not just this slot's.
    const vacation = allDayVacationPresets();
    if (vacation.settings.has(setting) || vacation.beats.has(beat)) {
      return false;
    }
    // Loose venue words for leftovers typed or edited away from the exact presets. Hotel
    // suites and hallways are Suggestive rooms too, so they are not in the list.
    if (
      DAY_SUGGESTIVE_VACATION_LEAK_SETTING_RE.test(setting) &&
      !settingPoolForDayMood(input.slot.id, dayMood, mix).includes(setting)
    ) {
      return false;
    }
    const heat = heatBeatPoolForDayMood(input.slot.id, dayMood, mix);
    if (heat.includes(beat)) {
      return true;
    }
    // Any part of the day: a solo Suggestive beat moved into another slot still fits. The
    // clothed rewrite (2.3) took "lingerie" / "robe loosely" out of beats like the windowsill
    // sit, so the cue words below no longer vouched for them and Queue rerolled the slot.
    if (
      Object.values(DAY_SLOT_SUGGESTIVE_BEAT_PRESETS).flat().includes(beat) ||
      Object.values(DAY_LATE_SLOT_SUGGESTIVE_BEAT_PRESETS).flat().includes(beat)
    ) {
      return true;
    }
    // Any part of the day: a couple beat typed or moved into another slot still fits.
    if (Object.values(DAY_SLOT_SUGGESTIVE_DUO_BEAT_PRESETS).flat().includes(beat)) {
      return input.allowCompanions === true;
    }
    return DAY_SUGGESTIVE_BEAT_CUE_RE.test(beat);
  }
  // Sport: beat must be athletic mid-action AND setting a sport venue — beach/café/garage fight the mood.
  if (dayMood === 'sport') {
    // "beach" is stale (it drew beach pin-ups) — except beach volleyball, a real venue.
    if (
      DAY_SPORT_STALE_SETTING_RE.test(setting.replace(/\bbeach\s+volleyball\b/gi, 'volleyball'))
    ) {
      return false;
    }
    const heat = heatBeatPoolForDayMood(input.slot.id, dayMood, mix);
    const beatOk = heat.includes(beat) || DAY_SPORT_BEAT_CUE_RE.test(beat);
    if (!beatOk) {
      return false;
    }
    const sportSettings = daySportSettingPresetsForSlot(input.slot.id);
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
    // A couple scene only fits while companions are on (People → Mixed / Duo).
    if (isDayVacationDuoBeat(beat)) {
      return input.allowCompanions === true;
    }
    const heat = heatBeatPoolForDayMood(input.slot.id, dayMood, mix);
    const beatOk = heat.includes(beat) || DAY_VACATION_BEAT_CUE_RE.test(beat);
    if (!beatOk) {
      return false;
    }
    if (isDayVacationDuoSetting(setting)) {
      return true;
    }
    const vacationSettings = dayVacationSettingPresetsForSlot(input.slot.id);
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
  // Mixed may keep custom heat beats — but a leftover everyday preset (coffee, sidewalk,
  // noodles) is not one; reroll it into the solo + duo adult pools.
  if (mix === 'mixed') {
    return !allEverydayBeatPresets().has(beat);
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
  /\b(mid-sex|mid-thrust|doggy|missionary|cowgirl|oral\s+sex|from\s+behind|partner\s+behind|man\s+behind|second\s+adult|fully\s+nude|masturbat\w*|fingering|self[- ]touch|bent\s+over.{0,40}(?:sex|doggy|partner)|pressed\s+against.{0,40}mid-sex)\b/i;

/** Clothed-heat cues — custom Suggestive beats that still read as suggestive. */
const DAY_SUGGESTIVE_BEAT_CUE_RE =
  /\b(lingerie|silk robe|robe loosely|sleepwear|neckline|strap slip|unzip|short (?:hem|dress)|bare (?:thigh|leg|skin|shoulders?|back)|cleavage|flirt|charged|inviting|fade[- ]to[- ]black|half[- ]shed|coat open|dress strap|weight on one hip|looking back|doorway|bed edge|hip cocked|kneeling|reclining|perched|chair back|bodysuit|stockings|garter|white sheet|towel|bubble bath)\b/i;

/**
 * Vacation travel venues that must not survive under Suggestive (shared pose words
 * like perched/reclining otherwise keep pier/scooter/hotel-terrace boards).
 */
let vacationPresetCache: { settings: Set<string>; beats: Set<string> } | null = null;

/** Every Vacation setting and beat across all slots (the leftovers Suggestive rerolls). */
function allDayVacationPresets(): { settings: Set<string>; beats: Set<string> } {
  if (!vacationPresetCache) {
    const ids = DAY_SLOT_IDS_FOR_PRESET_SCAN;
    vacationPresetCache = {
      settings: new Set(ids.flatMap(id => dayVacationSettingPresetsForSlot(id))),
      beats: new Set(ids.flatMap(id => dayVacationBeatPresetsForSlot(id))),
    };
  }
  return vacationPresetCache;
}

const DAY_SLOT_IDS_FOR_PRESET_SCAN = [
  'morning',
  'morning-2',
  'afternoon',
  'afternoon-2',
  'evening',
  'evening-2',
  'night',
  'night-2',
] as const;

const DAY_SUGGESTIVE_VACATION_LEAK_SETTING_RE =
  /\b(pier|fishing\s+pier|bait\s+shops?|cobblestone|hotel\s+(?:terrace|balcony|lobby)|resort|boardwalk|harbor|ferry|beach\s+(?:bar|club|umbrella|daybed)|scooter|market\s+stall|ice[- ]?cream|gulls|delivery\s+bikes?|ocean\s+breeze|bright\s+afternoon\s+water)\b/i;

/** Athletic mid-action cues — custom Sport beats that still read as sport. */
const DAY_SPORT_BEAT_CUE_RE =
  /\b(sprint|serve|swing|dunk|tackle|dribble|lunge|parry|vault|hurdle|stride|forehand|backhand|pitch|slide|kick|header|climb|dyno|handstand|tumbling|yoga|pose hold|bike|pedal|stroke|putt|javelin|discus|shot put|martial|fencing|gymnast|ski|carve|slalom|athletic|mid[- ](?:play|stride|action)|court|pitch|piste|dojo|track)\b/i;

/** Sport venue cues — custom Sport settings that still read as athletic venues. */
// Venues for every sport in the pools: a typed "snowy ski slope", "ocean surf break",
// "concrete skatepark", "yoga studio" or "open country road" failed the check and the slot was
// silently rerolled, beat and all (live 2026-09-29).
const DAY_SPORT_SETTING_CUE_RE =
  /\b(court|pitch|field|track|stadium|arena|gym|dojo|piste|rink|pool|course|trail|climbing\s+wall|boulder|velodrome|diamond|gridiron|sideline|baseline|lane|mat|road|slope|skatepark|ramp|halfpipe|surf|reef|point\s+break|(?:yoga|dance|pilates|spin)\s+studio|transition)\b/i;

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
  const theme = dayThemeOf(options.dayMood);
  // Themes (Date night, Cosplay…) are Everyday underneath: their board fits when its beats come
  // from the theme; plain Everyday rerolls a themed board left over from a theme.
  const themed = Boolean(theme) || dayMood === 'everyday';
  if (!isDayHeatMood(dayMood) && !themed) {
    return { slots: normalizeDaySlots(slots), changed: false };
  }
  const mix = normalizeDayIntimateMix(options.intimateMix);
  const normalized = normalizeDaySlots(slots);
  const stale = normalized.map(slot => {
    const beat = slot.sceneHints?.trim() || '';
    const setting = slot.location?.trim() || '';
    if (theme) {
      return !beat || !dayThemeOwns(theme, beat, setting);
    }
    if (dayMood === 'everyday') {
      return (
        Boolean(beat) &&
        DAY_THEME_OPTIONS.some(option => dayThemeOwns(DAY_THEMES[option.id], beat, ''))
      );
    }
    return !daySlotMatchesAdultMix({
      slot,
      dayMood,
      intimateMix: mix,
      allowCompanions: options.allowCompanions === true,
    });
  });
  if (!stale.includes(true)) {
    return { slots: normalized, changed: false };
  }
  // Reroll only the slots that no longer fit: one stale slot used to reroll the whole board,
  // throwing away every beat and setting the player had typed into the others.
  const cleared = normalized.map((slot, index) =>
    stale[index] ? { ...slot, location: undefined, sceneHints: undefined } : slot
  );
  const rerolled = diversifyDaySlotScenes(cleared, {
    fillBeats: true,
    allowCompanions: options.allowCompanions === true,
    dayMood: theme ? theme.id : dayMood,
    intimateMix: mix,
    random: options.random,
  });
  return { slots: rerolled.slots, changed: true };
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
  // Clothed moods never undress. The Story sex-layout reader ran first and read an Everyday
  // "spooning with her boyfriend in bed" as the spoon sex layout — a nude sex brief on an
  // Everyday still (live, 2026-09-28).
  if (!isDayAdultMood(input.dayMood)) {
    return false;
  }
  if (
    storyBeatOmitsGarmentPackshot({
      blurb: input.blurb ?? undefined,
      prompt: input.prompt ?? undefined,
    })
  ) {
    return true;
  }
  // Pure flash / wardrobe-fail gags with no self-touch keep clothes — that is the joke.
  // Raunchy Solo punchlines that name masturbation / fingering still drop Keep kit.
  if (
    /\b(wardrobe\s+malfunction|nip\s*slip|skirt\s+flip|accidental\s+flash|flashing)\b/i.test(
      haystack
    ) &&
    !/\b(mid-sex|mid-thrust|doggy|missionary|cowgirl|straddl|oral\s+sex|from\s+behind|masturbat\w*|finger(?:ing)?|self[- ]touch|hand between her thighs|rides? her own hand|grinding on her own|fingers?\s+(?:inside|on|rubbing)|clit)\b/i.test(
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
  return /\b(mid-sex|mid-thrust|mid-climax|doggy|missionary|cowgirl|straddl|oral\s+sex|from\s+behind|bent\s+over.{0,48}(?:sex|doggy|partner)|pressed\s+against.{0,40}mid-sex|partner|masturbat\w*|self[- ]pleasur\w*|touch(?:ing)?\s+(?:herself|himself|themselves)|alone\s+on|solo\s+kneeling|hands?\s+on\s+(?:her|his|their)\s+own|finger(?:ing)?|fingers?\s+(?:inside|on|rubbing)|clit)\b/i.test(
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
  const theme = dayThemeOf(options?.dayMood);
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

  // Themes: a new beat brings its own room; a room-only reroll keeps the beat's room.
  if (theme) {
    const usedPoseClasses = new Set(
      normalized
        .filter(slot => slot.id !== slotId && slot.sceneHints?.trim())
        .map(slot => dayEverydayPoseClass(slot.sceneHints!.trim()))
    );
    const pair = rerollBeat
      ? pickDayThemeScenePair(theme, slotId, {
          companions: allowCompanions,
          duoOnly: allowCompanions && intimateMix === 'duo',
          usedBeats: new Set([...usedBeats, sceneHints.toLowerCase()]),
          usedPoseClasses,
          poseClass: dayEverydayPoseClass,
          random,
        })
      : null;
    const beat = pair?.beat ?? sceneHints;
    const setting =
      pair?.setting ??
      (rerollLocation
        ? pickUnusedPreset(dayThemeSettings(theme, slotId), usedLocations, random)
        : location);
    if (beat === sceneHints && (setting ?? '') === location) {
      return { slots: normalized, changed: false };
    }
    return {
      slots: normalized.map(slot =>
        slot.id === slotId
          ? { ...slot, location: setting || undefined, sceneHints: beat || undefined }
          : slot
      ),
      changed: true,
    };
  }

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

/**
 * People (Solo / Mixed / Duo) on a clothed mood: reroll the slots whose beat no longer fits —
 * two-person beats on Solo, one-person beats on Duo. Mixed keeps the board. Adult moods realign
 * through `ensureDaySlotsMatchMood`.
 */
export function alignDaySlotsToPeople(
  slots: DaySlot[] | null | undefined,
  options: {
    dayMood: DayMood | string | null | undefined;
    people: DayIntimateMix;
    random?: () => number;
  }
): { slots: DaySlot[]; changed: boolean } {
  const normalized = normalizeDaySlots(slots);
  const dayMood = normalizeDayMood(options.dayMood);
  if (isDayAdultMood(dayMood) || options.people === 'mixed') {
    return { slots: normalized, changed: false };
  }
  const allowCompanions = options.people === 'duo';
  const wantTwo = options.people === 'duo';
  const theme = dayThemeOf(options.dayMood);
  let stale = false;
  const cleared = normalized.map(slot => {
    const beat = slot.sceneHints?.trim();
    if (!beat) return slot;
    const two =
      resolveDayPoseHeadcount({ haystack: beat, beat, dayMood, allowCompanions: true }) >= 2;
    if (two === wantTwo) return slot;
    stale = true;
    return { ...slot, sceneHints: undefined, ...(theme ? { location: undefined } : {}) };
  });
  if (!stale) {
    return { slots: normalized, changed: false };
  }
  const filled = diversifyDaySlotScenes(cleared, {
    fillBeats: true,
    allowCompanions,
    dayMood: options.dayMood,
    intimateMix: options.people,
    random: options.random,
  });
  return { slots: filled.slots, changed: true };
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
  const adult = isDayAdultMood(input.dayMood);
  // Clothed moods count the people the beat names: a Setting adds nobody ("sunset pier railing
  // with long shadows" made every solo beat a pair), and sex verbs are not a partner there.
  const counted = countPoseGuidePeople(!adult && input.beat?.trim() ? input.beat : input.haystack, {
    sexVocabulary: adult,
  });
  const allowCompanions = input.allowCompanions === true;
  // Suggestive / Vacation / Sport / Everyday: one person unless Duo · companions is on — and
  // then only a partner the beat names (see `counted`).
  if (!isDayAdultMood(input.dayMood)) {
    if (!allowCompanions) {
      return 1;
    }
    // "across a café table from her friend", "clinking bottles with his friend": a person named
    // by a plain noun is someone in the picture (the counter reads pair words, not nouns).
    const named = counted < 2 && storySceneNamesSecondPerson(input.beat?.trim() || input.haystack);
    return Math.min(2, Math.max(1, named ? 2 : counted));
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

/** Sport days dress her for the sport, not in the Day outfit: "tennis sportswear and tennis shoes". */
function compactSportKit(
  beat: string | null | undefined,
  setting: string | null | undefined
): string {
  const sport = inferDaySportFromScene(beat, setting);
  const label = sport ? daySportLabel(sport) : null;
  const feet = daySportFootwear(label);
  return `${label ? `${label} ` : ''}sportswear${feet === 'barefoot' ? ', barefoot' : ` and ${feet}`}`;
}

/** Scene prompt for one time-of-day still. */
/**
 * Opening line for a Rapid recipe whose Image 1 is the Cast's face crop: what the long brief says
 * about identity, without the rest of the brief.
 */
/** "the outfit from the second image" → 2. */
function dayRecipeImageNumber(worn: string): number {
  const ordinal = /\b(first|second|third)\b/.exec(worn)?.[1];
  return ordinal === 'first' ? 1 : ordinal === 'third' ? 3 : 2;
}

const RAPID_FACE_CROP_IDENTITY_LEAD =
  'Image 1 is a FACE CROP only (head/shoulders) — keep facial likeness only. IDENTITY CRITICAL: the finished still must show the SAME woman as the Image 1 face crop — identical face shape, hair color and length, eye color, nose, and mouth; inventing a different beauty face means the edit FAILED.';

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
  /** OpenPose: camera angle the guide implies (overhead lying layouts, side-view profiles). */
  poseCamera?: 'overhead' | 'side' | 'low' | null;
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
  /**
   * A Cast member as the second person (Day "Partner") — set only on two-person stills where the
   * queue attached their face as Image 2 (the pose map is then the third image).
   */
  partner?: DayPartner | null;
  /** The Cast lead's gender (default a woman) — a man switches the Rapid adult duo recipe. */
  leadNoun?: DayPartnerNoun;
  /**
   * The outfit image is the Day's dressed plate (a picture of her, dressed) — the clothing
   * image on Rapid / Qwen-Image 2.1, Image 1 on Edit 2511.
   */
  outfitIsDressedPlate?: boolean;
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
  const dayMood = normalizeDayMood(input.dayMood);
  // Clothed moods: a baseline the Setting can host (adult beats own their rooms).
  const defaultPose = resolveDaySlotPoseBaseline(
    slot,
    isDayAdultMood(dayMood) ? null : rawSetting || null
  );
  const cameraCue = resolveDaySlotCameraCue(slot);
  const allowCompanions = input.allowCompanions === true;
  const intimateMix = normalizeDayIntimateMix(input.intimateMix);
  // Intimate/Raunchy: never feed pier/beach/boardwalk nouns into the positive SETTING.
  const setting = isDayAdultMood(dayMood)
    ? resolveDayAdultIndoorSetting({ setting: rawSetting, slotId: slot.id })
    : rawSetting;
  const omitGarment = input.omitGarment === true;
  const faceOnlyIdentity = input.faceOnlyIdentity === true;
  // Everyday joins when a Fitting garment rides on the undressed Cast plate (see
  // dayEverydayGarmentNeedsFaceBreak) — the orchestrator only face-breaks it then.
  const clothedFaceBreak =
    faceOnlyIdentity &&
    !omitGarment &&
    (dayMood === 'vacation' || dayMood === 'suggestive' || dayMood === 'everyday');
  // Rapid follows the first paragraph and ignores the SETTING line deep in the brief —
  // name the place up front on clothed Vacation/Suggestive plate stills too.
  const plateSceneLead =
    !faceOnlyIdentity && !omitGarment && (dayMood === 'vacation' || dayMood === 'suggestive')
      ? daySceneLeadLine(setting)
      : '';
  // Sport: the venue sat deep in a ~5k-char brief and Rapid drew every sport on a football
  // stadium field; cycling beats without "riding" lost the bike. Scene + action first: venue
  // right and the bike back 8/8 (live 2026-09-29, same seeds).
  const sportSceneLead =
    dayMood === 'sport' && !omitGarment && hints
      ? [daySceneLeadLine(setting), `ACTION: ${hints.split(' — ')[0]!.trim()}.`]
          .filter(Boolean)
          .join(' ')
      : null;
  const replaceKeepOutfit =
    !omitGarment && (input.replaceKeepOutfit === true || dayMoodReplacesKeepOutfit(dayMood));
  const keepAsImage1 = input.plateSource === 'keeper';
  const plateIsolated = input.plateIsolated === true;
  const garmentReinforce = input.garmentReinforce === true && !omitGarment && !replaceKeepOutfit;
  const poseGuide = input.poseGuide === true;
  const openPoseGuide = poseGuide && isOpenPoseStyle(input.poseGuideStyle);
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
  /** Suggestive couple beat with "Duo · companions" on — the solo-only locks stand down. */
  const suggestiveCouple = dayMood === 'suggestive' && allowCompanions && poseHeadcount === 2;
  // A beat that says it is solo is solo even when partners are allowed (People: Mixed).
  // Keyed on "partners allowed", a Mixed day's masturbation beats got "invent two bare-skin
  // bodies … one distinct partner" beside "Cast alone" and a solo pose map — a man appeared in
  // them 3/3 (user's renders, 2026-10-03).
  // Only beats that say so ("alone", "solo", masturbating): the headcount alone misses a
  // partner a sex beat implies ("against the wall mid-sex").
  const beatSaysSolo = Boolean(hints) && isDayIntimateSoloBeat(hints ?? '') && poseHeadcount < 2;
  const soloSubject =
    dayMood === 'suggestive'
      ? !allowCompanions || beatSaysSolo
      : !duoForced && (partnersAllowed ? beatSaysSolo : poseHeadcount < 2);
  const soloToy = soloSubject && dayBeatUsesSoloSexToy(hints);
  const duoPartner = !soloSubject ? (input.partner ?? null) : null;
  /** The partner's face rides in as Image 2 (a Cast partner, not an invented one). */
  const partnerImage = Boolean(duoPartner && !duoPartner.invented);
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
            : `POSE FIRST: ${everydayStanceDirective(dayEverydayPoseClass(hints), setting)} Beat (SETTING is backdrop/lighting only — do not invent a different stance from the scene): ${hints}${
                // A beat with its own stance must not carry the slot baseline: Rapid AIO renders
                // "mid-stride" as the baseline's "sitting in a diner booth".
                dayEverydayPoseClass(hints) === 'STILL'
                  ? `. Body-stance baseline only if the beat is vague: ${defaultPose}`
                  : ''
              }`
    : `mandatory new body pose: ${defaultPose}`;
  // Wall / couch / armchair / sink beats: no bed wording, or Rapid lays the pose on a mattress.
  const duoOffBed = isDayAdultMood(dayMood) && !soloSubject && intimateBeatIsOffBed(hints);
  const cameraLine =
    isDayAdultMood(dayMood) && poseHeadcount >= 2
      ? duoOffBed
        ? 'camera: intimate medium shot — both adults engaged with each other, looking at partner not the lens; the beat surface and bare skin in the foreground'
        : 'camera: intimate medium shot — both adults engaged with each other, looking at partner not the lens; empty sheets in the foreground'
      : isDayAdultMood(dayMood)
        ? dayMood === 'raunchy' && soloSubject
          ? soloToy
            ? 'camera: intimate medium / three-quarter on the beat body pose — prioritize that stance over environment; bare sheets in the foreground; eyes closed or half-lidded looking down at the penis-shaped dildo inserted in her vaginal opening — never a soft fashion pin-up staring at the lens; never invent a man or partner; never raised gesture hands; never beach, sand, ocean, shoreline, pier, or night-beach city lights — indoor rumpled sheets only'
            : 'camera: intimate medium / three-quarter on the beat body pose — prioritize that stance over environment; bare sheets in the foreground; eyes closed or half-lidded looking down at her hands — never a soft fashion pin-up staring at the lens; never raised hands or fingers pointing up; nothing held — fingers only; never beach, sand, ocean, shoreline, pier, or night-beach city lights — indoor rumpled sheets only'
          : 'camera: intimate medium / three-quarter on the beat body pose and sex/action — prioritize stance over environment; empty lap and bare sheets in the foreground; eyes half-lidded or looking at her own body/hands — never a soft fashion pin-up staring at the lens with hands flat on the mattress'
        : dayMood === 'suggestive'
          ? 'camera: charged medium / three-quarter on the beat body pose — match Image 3 (dance with both arms raised and one knee lifted, zip-twist look-back with hands on her own zipper, lean, sit, stretch, or recline as written); lingerie or dress stays on (top and bottom); ' +
            (suggestiveCouple
              ? 'the woman and her partner both in frame, both fully clothed; '
              : 'one woman alone; never invent a man; ') +
            'never a stiff square-on standing catalog pose with arms at her sides; never a nude or bottomless framing; never a distant establishing landscape'
          : dayMood === 'sport'
            ? 'camera: athletic action medium / three-quarter on the sport pose — prioritize mid-play stance and limbs over venue; never a soft fashion pin-up or distant empty stadium establishing shot'
            : dayMood === 'vacation'
              ? allowCompanions && poseHeadcount >= 2
                ? 'camera: travel medium / full-body shot of the couple — she and her partner both fully in frame, both dressed, doing what the beat says; no third person; never a stiff square-on standing catalog pose or empty postcard establishing shot'
                : 'camera: travel medium / three-quarter on the beat vacation pose — if RELAXING/RECLINING show her lying ON what the beat names (hips down, knees drawn up), not standing beside it; if SEATED/PERCHED show hips ON the seat with knees bent; if DANCING show both arms raised overhead and one knee lifted mid-kick with hips mid-sway; if MID-STRIDE show FULL BODY walking with both feet visible, one foot clearly ahead, opposite arm swing — never a mid-thigh portrait crop; if WAVING show one arm raised high overhead with weight shift full body; if REACHING show one arm high; one woman alone; never invent a man; never hands-and-knees or rear-presenting on a bed; never a stiff square-on standing catalog pose with both feet planted and arms at her sides or empty postcard establishing shot'
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
  // FLUX.2 Klein, two or more people, clothed moods: the "never a third person / second body /
  // twin clone" locks summoned extra people and her outfit leaked onto him. Live on the real
  // Day graphs (2 beats × 6 seeds): trimmed + his outfit named = 0/12 extra people, 0/6 leaks
  // (as sent: 1/12 extra, 6/6 leaks). Adult moods are untested on Klein and keep their locks.
  const partner = inferPoseGuidePartner(hints);
  const kleinClothedDuo =
    openPoseGuide &&
    poseHeadcount >= 2 &&
    /flux-2-klein/i.test(String(input.model ?? '')) &&
    !isDayAdultMood(dayMood);
  const poseGuideLine = poseGuide
    ? poseGuidePromptBlock(realismMode, {
        headcount: poseHeadcount,
        model: input.model,
        style: openPoseGuide ? input.poseGuideStyle : 'legacy',
        leadPosition: leadPositionPhrase,
        camera: openPoseGuide ? input.poseCamera : null,
        partner,
        partnerOutfit: kleinClothedDuo && partner === 'man' ? KLEIN_MALE_PARTNER_OUTFIT_LINE : null,
      })
    : null;
  const soloLock = soloSubject
    ? soloToy
      ? `${buildSinglePersonUserDirective()} SOLO TOY LOCK: exactly one adult woman — never invent a man, male partner, boyfriend, second face, or second body. ${SOLO_DILDO_INSERTION_CUE}. ${SOLO_DILDO_NO_EXTERNAL_HOLD_CUE}`
      : dayMood === 'suggestive' || dayMood === 'vacation'
        ? `${buildSinglePersonUserDirective()} CLOTHED SOLO LOCK: exactly one woman — never invent a man, boyfriend, or second adult; clothes stay on; match the beat stance (reclining, seated, mid-stride, dancing with arms raised and one knee lifted, reaching, leaning) — never rear-presenting or hands-and-knees; never a square-on standing catalog pose with arms at her sides.`
        : buildSinglePersonUserDirective()
    : null;
  const rapidAio = poseProfileForModel(input.model).rapidGraph;
  const companionLock =
    partnersAllowed && poseHeadcount >= 2 && !kleinClothedDuo
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
    dayMood === 'vacation'
      ? buildDayVacationPromptLocks({
          beat: hints,
          setting,
          couple: allowCompanions && poseHeadcount >= 2,
        })
      : null;
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
          ? `MOOD: intimate duo sex still — follow the beat sex/stance exactly; both adults mid-sex with readable body contact; looking at each other not the lens; Cast face on the lead only; never a tame softcore portrait; ${duoOffBed ? 'bare skin and the beat surface only' : 'bare sheets and skin only'} in the foreground.`
          : intimateMix === 'solo'
            ? 'MOOD: intimate solo sex/self-touch still — follow the beat body pose and hand placement exactly; Cast alone mid-act with readable arousal (open thighs, arched back, head tipped, hands on her own vulva/breasts as the beat says); never invent a second adult, partner torso, or thigh under her; never a soft floral-dress pin-up staring politely at the lens; empty rumpled sheets only — SETTING is backdrop only.'
            : 'MOOD: intimate adult still — follow the beat sex/stance exactly; Cast face on the lead only; never a soft fashion pin-up; bare sheets and skin only in the foreground.'
        : dayMood === 'suggestive'
          ? 'MOOD: suggestive heat — clothed flirt only: wear the Keep/Image 2 outfit exactly (lingerie/robe/dress as shown — never swap it or strip her); cleavage/straps/unfinished unzip when written; underwear or bottoms stay on; follow the beat body stance exactly (dancing with both arms raised and one knee lifted, twisting to zip a dress looking over a shoulder, leaning, seated, stretching, hip cocked — never a stiff standing fashion plate staring at the lens with arms at her sides); never nude, never bottomless, ' +
            (suggestiveCouple
              ? 'her partner stays fully clothed too; '
              : 'never invent a man or second adult; ') +
            'never genitals or sex contact; never a polite everyday portrait or grocery/walk still.'
          : (vacationLocks?.moodLine ?? sportLocks?.moodLine ?? null);
  const suggestiveClothingLock =
    dayMood === 'suggestive'
      ? buildDaySuggestivePoseLock(hints, { couple: suggestiveCouple })
      : null;
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
      : duoOffBed
        ? 'FOREGROUND: bare bodies and the beat surface only (wall, couch, chair, counter as written) — bed out of frame; closed blinds on every window (no glass balcony door, no ocean or water visible outside); hands on bodies only; nothing open or held in the foreground.'
        : 'FOREGROUND: bare sheets and bodies only — empty bed surface around the couple; closed blinds on every window (no glass balcony door, no ocean or water visible outside); hands on bodies only; nothing open or held in the foreground.'
    : null;
  const adultPropsLock = isDayAdultMood(dayMood)
    ? intimateMix === 'duo' || poseHeadcount >= 2
      ? duoOffBed
        ? 'PROPS + FRAME: sex/contact fills the frame — bare skin and the beat surface only; empty hands on bodies; nothing held.'
        : 'PROPS + FRAME: sex/contact fills the frame — bare skin and sheets only; empty hands on bodies; bare nightstand; nothing open on the bed.'
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
  const poseActionLock = poseGuide && !kleinClothedDuo ? POSE_GUIDE_ACTION_LOCK : null;
  // Heat moods face-break Image 1 instead; everyday/plate keeps the full standing Keep, which
  // an Edit-2511 model copies unless told not to.
  const everydayPoseStickyLock =
    !isDayHeatMood(dayMood) && input.hasPlate && isDayPoseStickyEditModel(input.model)
      ? buildDayEverydayKeepPoseUnlock(hints, setting)
      : null;
  const poseAntiLeak = kleinClothedDuo
    ? null
    : poseGuide
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
  // Footwear and swimwear follow the sport: "sport shoes" and "discard … one-piece swimsuit"
  // on every sport put sneakers on swimmers and surfers (live 2026-09-29).
  const sportLabel = replaceKeepOutfit
    ? /athletic action in proper ([a-z][a-z ]*?) kit/i.exec(hints ?? '')?.[1]
    : undefined;
  const sportFeet = daySportFootwear(sportLabel);
  const sportWearsSwimsuit = /swim|surf|triathlon/i.test(sportLabel ?? '');
  const sportOutfitLine = replaceKeepOutfit
    ? `outfit: ATHLETIC KIT ONLY — discard every Image 1 garment including floral dress, mini-dress, sundress,${sportWearsSwimsuit ? '' : ' one-piece swimsuit,'} street clothes, sandals${sportFeet === 'barefoot' ? '' : ', and barefoot fashion'}; wear only the SPORT KIT ${sportFeet === 'barefoot' ? 'barefoot' : `and ${sportFeet === 'sport footwear' ? 'sport shoes' : sportFeet}`} for the beat; mid-play athletic action on a real sport venue — never kneeling on asphalt in a sundress, never a soft fashion pin-up`
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
    // FLUX.2 Klein clothed spoon: a compact recipe, sent without a pose guide (see
    // klein-duo-recipe.ts) — the brief plus the overlapping spoon guide drew a third body.
    if (
      kleinSpoonRecipeApplies({
        model: input.model,
        adultMood: isDayAdultMood(dayMood),
        beat: hints,
      })
    ) {
      return buildKleinSpoonRecipe({
        outfit,
        setting,
        partnerOutfit: KLEIN_MALE_PARTNER_GARMENTS,
      });
    }
    // Rapid AIO clothed Suggestive: the ~6–7k brief asked for an Image 2 outfit / wardrobe kit
    // that was not attached (Rapid invented bikinis and rompers) and its zip-twist header moved
    // sill and window beats onto the bed. Say the pose, the clothes and the room once.
    // Vacation the same (live 2026-09-29): the kit rode in as a bare id with no packshot, so
    // swimsuits went to cafés and sundresses into pools, and the shared dance tail lifted arms.
    // With "Duo · companions" on, a solo beat keeps the solo recipe (headcount 1) and a
    // Suggestive couple beat gets the clothed couple recipe.
    // Edit 2511 takes the short recipes for every Day still (pose-model-profile:
    // compactDayRecipes): Vacation / Suggestive and the adult moods share Rapid's, the rest use
    // the Day recipes.
    const compactDay = !rapidAio && poseProfileForModel(input.model).compactDayRecipes;
    const compactClothed = compactDay && !isDayAdultMood(dayMood);
    /** A two-person clothed still outside the Suggestive couple recipe (2511 only). */
    const compactDuo = compactClothed && poseHeadcount >= 2 && !suggestiveCouple;
    const moodRecipe = dayMood === 'suggestive' || dayMood === 'vacation';
    // Rapid Everyday solo: the brief drops the action (pose-model-profile:
    // compactEverydayRecipe). Two-person Everyday stills stay on the brief, which holds them.
    // Only the path that was swept: the Cast's face crop as Image 1 with a clothing image as
    // Image 2. A catalog kit in words and a Keep plate stay on the brief until they are tested.
    const rapidEveryday =
      rapidAio &&
      poseProfileForModel(input.model).compactEverydayRecipe &&
      dayMood === 'everyday' &&
      poseHeadcount < 2 &&
      faceOnlyIdentity &&
      Boolean(garmentReinforce);
    // Rapid, a clothed two-person still with a Cast partner's face: the compact couple recipe.
    // Replayed live (two seeds), the brief drew a stranger or a third person instead of the
    // partner; the couple recipe drew the lead and the partner, faces right, both times.
    // A couple beat ("with her partner": Vacation, Date night, Lazy Sunday) takes it with no
    // partner face too (People: Duo, no partner picked). Live, Rapid v23, 2026-10-06, same seeds:
    // the ~4–6k brief left the man shirtless 6/18 and posed both to camera; the recipe kept him
    // dressed 18/18 and did the beat (head on his shoulder 4/4 vs 0/4). Friend beats stay on the
    // brief: with no partner the recipe makes the friend "a man … affectionate" (10/10).
    const rapidPartnerDuo =
      rapidAio &&
      !isDayAdultMood(dayMood) &&
      poseHeadcount >= 2 &&
      (partnerImage || dayMood === 'vacation' || /\bpartner\b/i.test(hints ?? '')) &&
      !suggestiveCouple;
    if (
      (rapidAio ? moodRecipe || rapidEveryday || rapidPartnerDuo : compactClothed) &&
      !omitGarment &&
      (poseHeadcount < 2 || suggestiveCouple || compactDuo || rapidPartnerDuo)
    ) {
      // The Day kit in plain words: a catalog description's first sentence, no leading article.
      const kit = (input.wardrobeLabel?.trim() || garmentDescription || '')
        .split(/(?<=[.!?])\s+/)[0]!
        .replace(/[.\s]+$/, '')
        .replace(/^(?:an?|the)\s+/i, '')
        .replace(/^[A-Z](?=[a-z])/, letter => letter.toLowerCase());
      const recipeInput = {
        beat: hints,
        setting,
        timeOfDay,
        descriptor,
        // A garment packshot (or the partner's face) takes Image 2 and pushes the pose map to
        // Image 3.
        poseGuide: poseGuide && (garmentReinforce || partnerImage) ? ('third' as const) : poseGuide,
        outfitImage: garmentReinforce && !partnerImage ? ('second' as const) : null,
        outfit:
          compactDay || rapidEveryday
            ? kit || null
            : input.wardrobeLabel?.trim() || garmentDescription || null,
        faceOnly: faceOnlyIdentity,
        outfitFromFirst: !faceOnlyIdentity && keepAsImage1 && !replaceKeepOutfit,
      };
      const coupleInput = {
        ...recipeInput,
        ...(duoPartner ? { partner: { partner: duoPartner, image: 'second' as const } } : {}),
        lead: input.leadNoun === 'man' ? ('man' as const) : ('woman' as const),
      };
      const recipe = suggestiveCouple
        ? buildRapidSuggestiveDuoRecipe(coupleInput)
        : compactDuo || rapidPartnerDuo
          ? buildCompactDayDuoRecipe(coupleInput)
          : dayMood === 'vacation'
            ? buildRapidVacationRecipe(recipeInput)
            : dayMood === 'suggestive'
              ? buildRapidSuggestiveRecipe(recipeInput)
              : buildCompactDayRecipe({
                  ...recipeInput,
                  // Sport presets carry a boilerplate tail after the action ("— tennis athletic
                  // action in proper tennis kit …"): the recipe says kit and venue itself.
                  ...(dayMood === 'sport'
                    ? {
                        beat: hints?.split(' — ')[0]?.trim() || hints,
                        sportKit: compactSportKit(hints, setting),
                      }
                    : {}),
                });
      if (recipe && (compactClothed || rapidEveryday)) {
        // Edit 2511 keeps the plate's underwear unless the outfit is stated first and firmly.
        // Name the kit when the recipe dresses her from it; else repeat the beat's own clothes
        // (a pool beat's swimsuit must not be overruled by the day's kit).
        const worn = recipe.match(/\b(?:She|He) wears ([^.;]+)[.;]/)?.[1] ?? '';
        const fromKit = /^the outfit from the (?:first|second|third) image$/.test(worn);
        // Rapid on a face-crop Image 1 has no underwear to explain away (2511 keeps the clause:
        // it was confirmed with it).
        const base =
          rapidEveryday && faceOnlyIdentity
            ? ''
            : '; the underwear in Image 1 is only the fitting base, never part of the outfit';
        // Image 1 is a dressed plate (an Outfit Keep or Day's dress plate): the outfit is the one
        // she has on there — there is no fitting underwear to explain away.
        const outfitLead =
          fromKit && kit && recipeInput.outfitFromFirst
            ? `OUTFIT (mandatory): she wears a ${kit} — exactly the outfit${
                beatOwnsFootwear(hints) ? '' : ' and shoes'
              } she has on in Image 1, unchanged.`
            : fromKit && kit
              ? `OUTFIT (mandatory): she wears a ${kit} — fully dressed${base}.`
              : worn && !fromKit && !suggestiveCouple
                ? `OUTFIT (mandatory): she wears ${worn}${base}.`
                : fromKit && input.outfitIsDressedPlate && !suggestiveCouple
                  ? // A dressed plate with no kit name or description: the outfit was never said
                    // in words, and Qwen-Image 2.1 drew lying beats nude (live 2026-10-03).
                    `OUTFIT (mandatory): she is fully clothed in exactly the outfit shown in Image ${dayRecipeImageNumber(worn)}, covering her body as it does there; no bare body.`
                  : null;
        // Rapid on a face crop: the brief's identity sentence first. It says what Image 1 is; the
        // likeness gain is small (InsightFace distance 0.61 against 0.64 without it, 32 stills —
        // the brief's standing portraits scored 0.48).
        const identityLead =
          rapidEveryday && faceOnlyIdentity ? RAPID_FACE_CROP_IDENTITY_LEAD : null;
        // The couple recipes are written for a man lead already and skip the final swap
        // (assembleDayStillPrompt), so the lines put in front of them speak of him too —
        // "SCENE: she is in the hotel suite" opened two-men stills.
        const coupleForHim =
          input.leadNoun === 'man' && (suggestiveCouple || compactDuo || rapidPartnerDuo);
        const leadVoice = (line: string | null) =>
          line && coupleForHim ? swapDayPromptGender(line) : line;
        // Scene first, as the brief does (the confirmed 4/4 run had it), then the outfit.
        return [
          identityLead,
          leadVoice(daySceneLeadLine(setting?.replace(/^(?:an?|the)\s+/i, ''))),
          leadVoice(outfitLead),
          recipe,
        ]
          .filter(Boolean)
          .join('\n');
      }
      if (recipe) {
        return recipe;
      }
    }
    // Rapid AIO duo nude beats: the full lock brief (~9k chars) drowned the beat and every
    // duo still became the same reclining couple on a bed. Send where each body goes instead.
    if ((rapidAio || compactDay) && omitGarment && !soloSubject && isDayAdultMood(dayMood)) {
      const recipe = buildRapidDuoRecipe({
        beat: hints,
        setting,
        timeOfDay,
        descriptor,
        poseGuide: poseGuide && partnerImage ? 'third' : poseGuide,
        ...(duoPartner ? { partner: { partner: duoPartner, image: 'second' as const } } : {}),
        lead: input.leadNoun === 'man' ? 'man' : 'woman',
      });
      if (recipe) {
        return recipe;
      }
    }
    // Solo too: the 8–13k solo brief missed prone, toy and hands on Rapid, and its rolled room
    // overrode the beat's own ("kitchen floor" rendered in a bathroom).
    if ((rapidAio || compactDay) && omitGarment && soloSubject && isDayAdultMood(dayMood)) {
      const recipe = buildRapidSoloRecipe({
        beat: hints,
        setting,
        timeOfDay,
        descriptor,
        poseGuide,
        toy: dayBeatUsesSoloSexToy(hints),
      });
      if (recipe) {
        return recipe;
      }
    }
    // Self-touch with the clothes still on ("clothes half off"): same recipe, outfit pushed open.
    // The long brief's bedroom lock drew over the beat's own couch (live 2026-09-28).
    if (
      (rapidAio || compactDay) &&
      !omitGarment &&
      soloSubject &&
      isDayAdultMood(dayMood) &&
      /\bmasturbat/i.test(stripNegatedClauses(hints ?? ''))
    ) {
      const recipe = buildRapidSoloRecipe({
        beat: hints,
        setting,
        timeOfDay,
        descriptor,
        // A garment packshot takes Image 2 and pushes the pose map to Image 3.
        poseGuide: poseGuide && garmentReinforce ? 'third' : poseGuide,
        toy: dayBeatUsesSoloSexToy(hints),
        clothedOutfit: outfit || null,
      });
      if (recipe) {
        return recipe;
      }
    }
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
        ? openPoseGuide
          ? DAY_FACE_BREAK_SETTING_FILL_OPENPOSE
          : DAY_FACE_BREAK_SETTING_FILL
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
        dayMood === 'suggestive' || dayMood === 'vacation' || dayMood === 'everyday'
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
              setting,
            }
          )
        : null;
      const everydayStanceLead =
        faceBreakLeads && dayMood === 'everyday'
          ? dayEverydayFaceBreakStanceLead(hints, setting)
          : null;
      const clothedFaceBreakPreamble = faceBreakLeads
        ? [everydayStanceLead, faceBreakLeads.preamble].filter(Boolean).join('\n')
        : null;
      const clothedFaceBreakImage1 = faceBreakLeads?.image1 ?? null;
      return [
        sportSceneLead,
        nudeEditPreamble ??
          clothedFaceBreakPreamble ??
          (replaceKeepOutfit
            ? 'Edit Image 1. Keep facial likeness only. Discard Image 1 floral dress, sundress, swimsuit, street clothes, and footwear entirely — dress her in the beat SPORT KIT with athletic shoes on a sport venue. Do not preserve body pose, kneeling fashion stance, arm positions, camera angle, or background — aggressively refactor into mid-play athletic action (sprint, swing, dunk, lunge) as described — never a barefoot asphalt pin-up.'
            : dayMood === 'suggestive'
              ? [buildDaySuggestiveKeepPoseUnlock(hints), plateSceneLead].filter(Boolean).join(' ')
              : dayMood === 'vacation'
                ? [
                    vacationLocks?.keepUnlock ?? DAY_VACATION_KEEP_POSE_UNLOCK_PREFIX,
                    plateSceneLead,
                  ]
                    .filter(Boolean)
                    .join(' ')
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
                ? `Image 2 is a clothing-only packshot — copy this EXACT garment (cut, colors, print, fabric, coverage) onto the new Image 3 pose (${garmentDescription}); swapping the outfit or stripping her means the edit FAILED; ignore Image 2 layout and any white/gray void.`
                : `Image 2 is a clothing-only packshot — copy garment cut, colors, and fabric onto the new Image 3 pose (${garmentDescription}); ignore Image 2 layout and any white/gray void.`
              : `Image 2 is a clothing-only packshot — reinforce garment cut, colors, and fabric from Image 1 using Image 2 (${garmentDescription}); ignore Image 2 layout.`
            : clothedFaceBreak
              ? dayMood === 'suggestive'
                ? 'Image 2 is a clothing-only packshot — copy this EXACT garment onto the new Image 3 pose (same print/cut/coverage); swapping the outfit or stripping her means the edit FAILED; ignore Image 2 layout and any white/gray void.'
                : 'Image 2 is a clothing-only packshot — copy garment cut, colors, and fabric ONLY onto the new Image 3 pose; ignore Image 2 layout and any white/gray void.'
              : 'Image 2 is a wardrobe packshot — use it only to reinforce garment cut, colors, and fabric from Image 1; ignore Image 2 layout.'
          : clothedFaceBreak && garmentDescription
            ? dayMood === 'suggestive'
              ? `CLOTHING LOCK: wear this EXACT outfit — ${garmentDescription} — swapping the outfit or stripping her means the edit FAILED.`
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
          dayMood === 'suggestive' || dayMood === 'vacation' || dayMood === 'everyday'
            ? clothedHeatUnlockPoseClass(hints, dayMood)
            : vacationLocks?.poseClass,
          'cast',
          dayMood,
          {
            garmentDescription,
            hasOutfitImage: Boolean(garmentReinforce),
            setting,
            seated: rapidAio && dayMood === 'suggestive' && daySuggestiveBeatIsSeated(hints),
          }
        )
      : null;
    const castEverydayStanceLead =
      castFaceBreakLeads && dayMood === 'everyday'
        ? dayEverydayFaceBreakStanceLead(hints, setting)
        : null;
    // Catalog kit on the undressed Cast plate (no Image 2): named only at the end of the brief,
    // Rapid kept the plate's underwear 13/16 and never wore the kit; stated first, the exact kit
    // 16/16 with poses held (live 2026-09-29, same seeds).
    const castOutfitLead =
      castOutfitLine && outfit
        ? `OUTFIT (mandatory): she wears a ${outfit} — fully dressed; the underwear in Image 1 is only the fitting base, never part of the outfit.`
        : null;
    return [
      sportSceneLead,
      castOutfitLead,
      nudeEditPreamble ??
        (clothedFaceBreak
          ? ((castFaceBreakLeads
              ? [castEverydayStanceLead, castFaceBreakLeads.preamble].filter(Boolean).join('\n')
              : null) ??
            'Edit Image 1. Image 1 is a FACE CROP only (head/shoulders) — keep facial likeness only. Invent the full body pose from Image 3 and the beat. CRITICAL: Image 1 has no standing body — do not invent a square-on fashion stand with arms at her sides. Dress her from Image 2 garment colors/cut only; ignore Image 2 standing pose and room. Aggressively match Image 3 stance and the SETTING backdrop.')
          : plateSceneLead
            ? `${QWEN_POSE_UNLOCK_MODIFY_PREFIX} ${plateSceneLead}`
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
              ? `Image 2 is a clothing-only packshot — copy this EXACT garment (cut, colors, print, fabric, coverage) onto the Image 3 pose (${garmentDescription}); swapping the outfit or stripping her means the edit FAILED; ignore Image 2 layout and any white/gray void.`
              : `Image 2 is a clothing-only packshot — copy garments onto the Image 3 pose (${garmentDescription}); ignore Image 2 layout and any white/gray void.`
            : `Image 2 is a clothing-only packshot — apply that outfit to the subject (${garmentDescription}).`
          : clothedFaceBreak
            ? dayMood === 'suggestive'
              ? 'Image 2 is a clothing-only packshot — copy this EXACT garment onto the Image 3 pose (same print/cut/coverage); swapping the outfit or stripping her means the edit FAILED; ignore Image 2 layout and any white/gray void.'
              : 'Image 2 is a clothing-only packshot — copy garments onto the Image 3 pose; ignore Image 2 layout and any white/gray void.'
            : 'Image 2 is a clothing-only packshot — apply that outfit to the subject.'
        : clothedFaceBreak && garmentDescription
          ? dayMood === 'suggestive'
            ? `CLOTHING LOCK: wear this EXACT outfit — ${garmentDescription} — swapping the outfit or stripping her means the edit FAILED.`
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

/** A 0–1 score (pose match), else null. */
function readScore(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : null;
}

/** A Best of two pair's other take: its kind and pose score. */
function readPairTake(
  take: DaySlotStill['previousTake']
): Pick<NonNullable<DaySlotStill['previousTake']>, 'kind' | 'poseScore'> {
  if (take?.kind === 'two-takes') return { kind: 'two-takes' };
  if (take?.kind === 'fix-area') return { kind: 'fix-area' };
  if (take?.kind !== 'best-of-two') return {};
  const poseScore = readScore(take.poseScore);
  return { kind: 'best-of-two', ...(poseScore != null ? { poseScore } : {}) };
}

/** Two takes: the second take, when it has a prompt id. */
function readTwoTakes(value: DaySlotStill['twoTakes']): Pick<DaySlotStill, 'twoTakes'> {
  const promptId = readText(value?.promptId, 160);
  if (!promptId) return {};
  const imageUrl = readText(value?.imageUrl, 2048);
  const status = readStillStatus(value?.status);
  const hold = value?.adultHold;
  const likelier = value?.likelier;
  const likelierNote = readText(value?.likelierNote, 240);
  return {
    twoTakes: {
      promptId,
      ...(imageUrl ? { imageUrl } : {}),
      ...(status ? { status } : {}),
      ...(hold === 'checking' || hold === 'withheld' ? { adultHold: hold } : {}),
      ...(value?.likelierChecked === true ? { likelierChecked: true } : {}),
      ...(likelier === 'first' || likelier === 'second' ? { likelier } : {}),
      ...(likelierNote ? { likelierNote } : {}),
    },
  };
}

function readBestOfTwo(value: DaySlotStill['bestOfTwo']): Pick<DaySlotStill, 'bestOfTwo'> {
  const keptScore = readScore(value?.keptScore);
  const otherScore = readScore(value?.otherScore);
  return keptScore != null && otherScore != null ? { bestOfTwo: { keptScore, otherScore } } : {};
}

function readClipStatus(value: unknown): DaySlotClipStatus | undefined {
  if (value === 'queued' || value === 'running' || value === 'completed' || value === 'error') {
    return value;
  }
  return undefined;
}

/** Only a non-empty check is kept — no `promptCheck: undefined` key on every still. */
function withPromptCheck(value: unknown): Pick<DaySlotStill, 'promptCheck'> {
  const promptCheck = normalizeStillPromptCheck(value);
  return promptCheck ? { promptCheck } : {};
}

/** Deepest "Undo the fix" stack kept per slot. */
export const DAY_FIX_HISTORY_MAX = 8;

/** The pictures before earlier fixes (fix-area.ts), when there are any. */
function readFixHistory(value: unknown): Pick<DaySlotStill, 'fixHistory'> {
  if (!Array.isArray(value)) return {};
  const history: NonNullable<DaySlotStill['fixHistory']> = [];
  for (const entry of value) {
    const record = entry as { imageUrl?: unknown; promptId?: unknown } | null;
    const imageUrl = readText(record?.imageUrl, 2048);
    if (!imageUrl) continue;
    const promptId = readText(record?.promptId, 160);
    history.push({ imageUrl, ...(promptId ? { promptId } : {}) });
  }
  return history.length > 0 ? { fixHistory: history.slice(-DAY_FIX_HISTORY_MAX) } : {};
}

/** Only a usable end pose is kept — no `endPose: undefined` key on every still. */
function withEndPose(value: unknown): Pick<DaySlotStill, 'endPose'> {
  const endPose = normalizeDayEndPose(value);
  return endPose ? { endPose } : {};
}

export function normalizeDaySlotStills(
  input?: DaySlotStill[] | null,
  slots?: Array<Pick<DaySlot, 'id'>> | null
): DaySlotStill[] {
  const bySlot = new Map<DaySlotId, DaySlotStill>();
  for (const still of input ?? []) {
    if (!still?.slotId || !isDaySlotId(still.slotId)) {
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
      finishedUrl: readText(still.finishedUrl, 2048) || undefined,
      finishedFor: readText(still.finishedFor, 160) || undefined,
      ...withPromptCheck(still.promptCheck),
      ...(readText(still.beatKey, 400) ? { beatKey: readText(still.beatKey, 400) } : {}),
      ...(readText(still.previousTake?.imageUrl, 2048)
        ? {
            previousTake: {
              imageUrl: readText(still.previousTake?.imageUrl, 2048),
              promptId: readText(still.previousTake?.promptId, 160) || undefined,
              ...readPairTake(still.previousTake),
            },
          }
        : {}),
      ...readFixHistory(still.fixHistory),
      ...withEndPose(still.endPose),
      ...readBestOfTwo(still.bestOfTwo),
      ...readTwoTakes(still.twoTakes),
      ...(still.redoReason === 'looks-wrong' ? { redoReason: 'looks-wrong' as const } : {}),
      ...(still.bestOfTwoJob === true ? { bestOfTwoJob: true } : {}),
      ...(still.adultHold === 'checking' || still.adultHold === 'withheld'
        ? { adultHold: still.adultHold }
        : {}),
      ...(still.adultHold === 'withheld' &&
      (still.adultHoldCause === 'age' || still.adultHoldCause === 'bare')
        ? { adultHoldCause: still.adultHoldCause }
        : {}),
      ...(still.adultGated === true ? { adultGated: true } : {}),
      ...(readText(still.engineNote, 160) ? { engineNote: readText(still.engineNote, 160) } : {}),
      ...(readText(still.referenceNote, 600)
        ? { referenceNote: readText(still.referenceNote, 600) }
        : {}),
    });
  }
  const order = slots?.length
    ? slots.map(slot => slot.id)
    : daySlotsForLength(inferDayLength([...bySlot.keys()])).map(slot => slot.id);
  return order.map(id => bySlot.get(id) ?? { slotId: id });
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
  /** The adult-appearance gate's mark (gallery-adult-check.ts). */
  adultCheck?: 'pending' | 'passed' | 'unchecked' | 'withheld';
  /** Why a withheld take was withheld (the card's message). */
  adultCheckCause?: 'age' | 'bare';
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
      const held =
        match &&
        !match.isClip &&
        (match.adultCheck === 'pending' || match.adultCheck === 'withheld');
      if (held) {
        // Held by the adult-appearance gate: never an image on the board. A finished render
        // being checked reads as in flight ("Checking…"); a withheld one as failed.
        const galleryStatus = stillStatusFromGallery(match!.status);
        const hold: DaySlotStill['adultHold'] =
          match!.adultCheck === 'withheld'
            ? 'withheld'
            : galleryStatus === 'completed'
              ? 'checking'
              : undefined;
        const status: DaySlotStill['status'] =
          hold === 'withheld' || galleryStatus === 'error'
            ? 'error'
            : galleryStatus === 'completed'
              ? 'running'
              : galleryStatus;
        const holdCause = hold === 'withheld' ? match!.adultCheckCause : undefined;
        if (
          still.adultHold !== hold ||
          still.adultHoldCause !== holdCause ||
          still.status !== status ||
          still.imageUrl ||
          still.finishedUrl
        ) {
          changed = true;
          updated = {
            ...updated,
            adultHold: hold,
            adultHoldCause: holdCause,
            status,
            imageUrl: undefined,
            finishedUrl: undefined,
            finishedFor: undefined,
          };
        }
      } else if (match && !match.isClip) {
        if (updated.adultHold || updated.adultHoldCause) {
          changed = true;
          updated = { ...updated, adultHold: undefined, adultHoldCause: undefined };
        }
        const finished = still.finishedFor === stillId ? still.finishedUrl?.trim() || '' : '';
        const galleryImage = finished || match.imageUrl?.trim() || '';
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
    // Two takes: the second take lands (or fails) on its own entry; a failed take leaves the other.
    const second = updated.twoTakes;
    if (second?.promptId) {
      const next = twoTakeFromGallery(second, byPromptId.get(second.promptId.trim()));
      if (next !== second) {
        changed = true;
        updated = { ...updated, twoTakes: next };
      }
    }
    const settled = settleDayTwoTakes(updated);
    if (settled !== updated) {
      changed = true;
      updated = settled;
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
        key: slot.id,
        caption: captionFromBeat(slot.sceneHints) || slot.label,
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
      key: slot.id,
      caption: captionFromBeat(slot.sceneHints) || slot.label,
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
  const motion = DAY_SLOT_MOTION_CUES[dayPartOf(slot.id)] || 'subtle natural motion, cinematic';
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

/**
 * Day briefs name the pose guide "Image 3" (Image 2 is the garment slot). With no garment the
 * queue compacts the guide into the second image, so the brief pointed at a picture that did
 * not exist. Renumber when the brief never mentions an Image 2 (otherwise it is ambiguous).
 */
export function renumberDayPoseGuideAsImage2(prompt: string): string {
  // The brief's general line "Never leave Image 2 or Image 3 white…" is not a second image:
  // it used to stop the renumbering, and a still with two images kept calling the pose map
  // "Image 3".
  // The same goes for the briefs' stock outfit phrases: with no clothing image attached the
  // outfit is the one worn in Image 1 (the Keep or dressed plate), not "Image 2".
  const merged = prompt
    .replace(/\bImage 2 or Image 3\b/g, 'Image 3')
    .replace(/\bKeep\/Image 2 outfit\b/g, 'Keep outfit')
    .replace(/\bthe outfit Image 2 or the beat names\b/g, 'the outfit worn in Image 1')
    .replace(/\bthe Keep outfit from Image 2\b/g, 'the Keep outfit from Image 1')
    // The adult nude line (intimate-prompt-clarify.ts) names a clothing image that is not attached.
    .replace(/\bImage 1 and Image 2 fabric is invisible\b/g, 'Image 1 fabric is invisible');
  if (/\bImage 2\b/.test(merged)) {
    return prompt;
  }
  return merged.replace(/\bImage 3\b/g, 'Image 2');
}

/** The slot's beat is the player's own words (typed, not changed by Day since). */
export function dayBeatIsTyped(slot: Pick<DaySlot, 'sceneHints' | 'sceneHintsTyped'>): boolean {
  return Boolean(slot.sceneHintsTyped && slot.sceneHintsTyped === slot.sceneHints);
}

/** The slot patch for a beat the player typed; Day's beat is kept from before the first edit. */
export function typedDayBeatPatch(
  slot: Pick<DaySlot, 'sceneHints' | 'sceneHintsTyped' | 'sceneHintsDay'>,
  value: string
): Pick<DaySlot, 'sceneHints' | 'sceneHintsTyped' | 'sceneHintsDay'> {
  const sceneHintsDay = dayBeatIsTyped(slot)
    ? slot.sceneHintsDay
    : slot.sceneHints?.trim() || undefined;
  return { sceneHints: value, sceneHintsTyped: value, sceneHintsDay };
}

/** Back to Day's beat (undefined when Day had none: the slot plans one again). */
export function restoreDayBeatPatch(
  slot: Pick<DaySlot, 'sceneHintsDay'>
): Pick<DaySlot, 'sceneHints' | 'sceneHintsTyped' | 'sceneHintsDay'> {
  return { sceneHints: slot.sceneHintsDay, sceneHintsTyped: undefined, sceneHintsDay: undefined };
}

/**
 * This take already carries its face finish. Face finish skips it: its baseline only covers
 * stills present when Day mounted, and on a fresh browser (or another device) the stills arrive
 * with the server pull after that — every finished still was finished again on each open, one
 * Edit 2511 render apiece.
 */
export function dayStillIsFaceFinished(still: DaySlotStill | null | undefined): boolean {
  return Boolean(
    still?.finishedUrl?.trim() && still.finishedFor && still.finishedFor === still.promptId
  );
}

/** The image a still shows: its face finish when that belongs to this take, else the take. */
export function dayStillShownImage(still: DaySlotStill | null | undefined): string {
  if (!still) return '';
  const finished = still.finishedUrl?.trim();
  if (finished && still.finishedFor && still.finishedFor === still.promptId) return finished;
  return still.imageUrl?.trim() || '';
}

/**
 * "Fix an area" used on a slot: the fixed picture is shown (as the take's finish, so the gallery
 * poll keeps it), and the picture it was made from stays as the previous take — "Undo the fix"
 * puts it back. Null when the slot has no finished still.
 */
export function dayStillFixAreaPatch(
  still: DaySlotStill | null | undefined,
  fixedUrl: string
): DaySlotStill | null {
  if (!still || still.status !== 'completed' || !fixedUrl.trim()) return null;
  const shown = dayStillShownImage(still);
  if (!shown) return null;
  // A fix on a fix: the picture before the earlier fix joins the undo stack.
  const earlier = still.previousTake?.kind === 'fix-area' ? still.previousTake : null;
  const history = [
    ...(still.fixHistory ?? []),
    ...(earlier
      ? [
          {
            imageUrl: earlier.imageUrl,
            ...(earlier.promptId ? { promptId: earlier.promptId } : {}),
          },
        ]
      : []),
  ].slice(-DAY_FIX_HISTORY_MAX);
  return {
    slotId: still.slotId,
    imageUrl: fixedUrl,
    status: 'completed',
    finishedUrl: fixedUrl,
    finishedFor: still.promptId,
    // The clip was made from the old picture.
    clipPromptId: undefined,
    clipUrl: undefined,
    clipStatus: undefined,
    previousTake: { imageUrl: shown, promptId: still.promptId, kind: 'fix-area' },
    fixHistory: history.length > 0 ? history : undefined,
    bestOfTwo: undefined,
  };
}

/** How many more "Undo the fix" steps a slot has after this one (its earlier fixes). */
export function dayFixUndoDepth(still: DaySlotStill | null | undefined): number {
  if (still?.previousTake?.kind !== 'fix-area') return 0;
  return 1 + (still.fixHistory?.length ?? 0);
}

/** Put the take a same-seed redo replaced back. */
export function restorePreviousDayTake(
  stills: DaySlotStill[] | null | undefined,
  slotId: DaySlotId
): DaySlotStill[] {
  const still = normalizeDaySlotStills(stills).find(entry => entry.slotId === slotId);
  const previous = still?.previousTake;
  if (!previous) return normalizeDaySlotStills(stills);
  // Undoing a fix: the picture before it was this same take (maybe face-finished) — kept as the
  // take's finish so the gallery poll does not swap the raw render back in. An earlier fix's
  // picture, when there is one, becomes the next "Undo the fix".
  const fix = previous.kind === 'fix-area' && Boolean(previous.promptId);
  const history = fix ? [...(still?.fixHistory ?? [])] : [];
  const older = history.pop();
  return upsertDaySlotStill(stills, {
    slotId,
    promptId: previous.promptId,
    imageUrl: previous.imageUrl,
    status: 'completed',
    finishedUrl: fix ? previous.imageUrl : undefined,
    finishedFor: fix ? previous.promptId : undefined,
    clipPromptId: undefined,
    clipUrl: undefined,
    clipStatus: undefined,
    previousTake: older
      ? {
          imageUrl: older.imageUrl,
          promptId: older.promptId ?? previous.promptId,
          kind: 'fix-area',
        }
      : undefined,
    fixHistory: older && history.length > 0 ? history : undefined,
    bestOfTwo: undefined,
    bestOfTwoJob: undefined,
    twoTakes: undefined,
  });
}
