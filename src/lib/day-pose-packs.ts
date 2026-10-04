/**
 * Pose packs: a themed set of Day poses (Fitness, Dance, Portrait, …) applied to a whole Day at
 * once. Applying one gives each slot the pack's next pose in order (cycling, with "Try another"
 * bumped on the second lap so repeats differ), and can fill a beat and setting into slots that
 * have none. The player's own beats are never touched. Pure — the Day page and the tests share it.
 *
 * Built-in packs use solo layouts with good live records (pose sweep 2026-10: Rapid / 2.1 /
 * Edit 2511 ≥ 40 of 41 Everyday solo, sport ~26 of 29). Left out on purpose: push-up (stands at
 * the squat rack on every seed), pull-up (renders as a squat), foot up and lying on the side
 * (2.1 misses / ghost double), taking a photo (2511 misses the camera) and the two-person
 * layouts (a pack poses one person; a duo slot keeps its own pose). Each beat reads as its own
 * pose to the guide's parser (tested), so the words and the drawn pose never pull apart. Beats
 * are Day's (written for a woman; swapped for a man lead like any Day beat).
 */

import { dayBeatIsTyped, type DaySlot } from '@/lib/day-planner';
import {
  normalizePhotoPose,
  normalizePoseCameraChoice,
  normalizePoseLookChoice,
  type PhotoPose,
  type PoseCameraChoice,
  type PoseLookChoice,
} from '@/lib/day-pose-guide';
import { POSE_PICKER_GROUPS } from '@/lib/pose-layout-labels';

/** One pose in a pack: a named Day pose (layout / posture) or a skeleton (photo / edit). */
export type PosePackEntry = {
  layout?: string;
  variant?: number;
  photo?: PhotoPose;
  camera?: PoseCameraChoice;
  lead?: 'left' | 'right';
  look?: PoseLookChoice;
  /** Beat written into a slot that has none (built-in packs). */
  beat?: string;
  /** Setting written into a slot that has none, alongside the beat. */
  setting?: string;
};

export type PosePack = {
  id: string;
  name: string;
  /** One line under the picker. */
  blurb?: string;
  entries: PosePackEntry[];
  /** Saved by the player (My packs) rather than shipped. */
  mine?: boolean;
  savedAt?: number;
};

export const POSE_PACK_NAME_MAX = 40;
export const POSE_PACK_ENTRIES_MAX = 12;

/** Pose picks a pack writes on a slot (and clears). */
type SlotPosePatch = Pick<
  DaySlot,
  'poseLayout' | 'poseVariant' | 'posePhoto' | 'poseCamera' | 'poseLead' | 'poseLook'
>;

const NO_POSE: SlotPosePatch = {
  poseLayout: undefined,
  poseVariant: undefined,
  posePhoto: undefined,
  poseCamera: undefined,
  poseLead: undefined,
  poseLook: undefined,
};

export const BUILT_IN_POSE_PACKS: readonly PosePack[] = [
  {
    id: 'fitness',
    name: 'Fitness',
    blurb: 'Yoga, lifts and a sprint — gym, studio and track.',
    entries: [
      {
        layout: 'sport_yoga_warrior',
        beat: 'holds warrior two on her yoga mat, arms stretched wide',
        setting: 'bright yoga studio with wooden floors',
      },
      {
        layout: 'sport_squat',
        beat: 'deep barbell back squat at the rack, bar across the shoulders',
        setting: 'busy gym floor',
      },
      {
        layout: 'stretch',
        beat: 'stretches before a run, one arm pulled across the chest',
        setting: 'park path in the morning',
      },
      {
        layout: 'sport_cycle',
        beat: 'rides her road bike along the coast road, cycling hard',
        setting: 'coast road on a bright morning',
      },
      {
        layout: 'sport_yoga_dog',
        beat: 'downward dog on a yoga mat, hips high',
        setting: 'quiet yoga studio',
      },
      {
        layout: 'sport_sprint',
        beat: 'sprints down the running track, mid-stride',
        setting: 'outdoor running track',
      },
      {
        layout: 'sport_deadlift',
        beat: 'deadlift from the floor, barbell at the shins',
        setting: 'weight room with rubber floors',
      },
      {
        layout: 'sport_plank',
        beat: 'holds a forearm plank on a mat',
        setting: 'home workout corner',
      },
    ],
  },
  {
    id: 'dance',
    name: 'Dance',
    blurb: 'Arms up, spins and jumps — club, studio and street.',
    entries: [
      {
        layout: 'arms_up',
        beat: 'throws both arms up in the air as the beat drops',
        setting: 'dance floor under club lights',
      },
      {
        layout: 'hair_touch',
        beat: 'runs a hand through her hair to the music',
        setting: 'rooftop party at dusk',
      },
      {
        layout: 'jump',
        beat: 'jumps with the music, both feet off the floor',
        setting: 'dance studio with a mirror wall',
      },
      {
        layout: 'look_back',
        beat: 'looks back over her shoulder under the club lights',
        setting: 'busy dance floor with neon lights',
      },
      {
        layout: 'hands_behind_head',
        beat: 'moves to the music, hands behind her head',
        setting: 'living room with the music up',
      },
      {
        layout: 'stretch',
        beat: 'stretches at the barre, one arm overhead',
        setting: 'ballet studio with a barre',
      },
    ],
  },
  {
    id: 'portrait',
    name: 'Portrait',
    blurb: 'Classic standing and seated portrait poses.',
    entries: [
      { layout: 'hands_hips', beat: 'stands with hands on hips, facing the camera' },
      { layout: 'cross_arms', beat: 'stands with arms crossed, a confident half-smile' },
      { layout: 'hair_touch', beat: 'tucks her hair behind one ear, soft smile' },
      { layout: 'look_back', beat: 'looks back over her shoulder at the camera' },
      { layout: 'lean_wall', beat: 'leans against the wall, relaxed' },
      { layout: 'perch_edge', beat: 'perches on the edge of the table, hands at her sides' },
      { layout: 'pockets', beat: 'stands with hands in pockets' },
      { layout: 'stand', beat: 'stands tall, full figure, looking at the camera' },
    ],
  },
  {
    id: 'lounging',
    name: 'Lounging',
    blurb: 'Sofa, floor and bed — slow, at-home poses.',
    entries: [
      {
        layout: 'sit',
        beat: 'sits back on the sofa, legs tucked up',
        setting: 'cosy living room',
      },
      {
        layout: 'read',
        beat: 'reads a book, curled up in an armchair',
        setting: 'reading nook by the window',
      },
      {
        layout: 'lounge_elbows',
        beat: 'lies back on her elbows across the bed',
        setting: 'sunlit bedroom',
      },
      {
        layout: 'sit_floor',
        beat: 'sits cross-legged on the rug with a mug',
        setting: 'living room floor with cushions',
      },
      {
        layout: 'laptop',
        beat: 'scrolls on a laptop, sitting on the sofa',
        setting: 'living room in the evening',
      },
      {
        layout: 'lie_front',
        beat: 'lies on her stomach on the bed, chin propped on her hands',
        setting: 'bedroom with soft morning light',
      },
      {
        layout: 'drink',
        beat: 'sips coffee from a warm mug',
        setting: 'kitchen table in the morning',
      },
    ],
  },
  {
    id: 'street',
    name: 'Street style',
    blurb: 'Walking shots and city leans.',
    entries: [
      {
        layout: 'walk',
        beat: 'walks down the street mid-stride',
        setting: 'city sidewalk lined with shops',
      },
      {
        layout: 'lean_wall',
        beat: 'leans against the graffiti wall',
        setting: 'side street with a graffiti wall',
      },
      {
        layout: 'pockets',
        beat: 'stands at the crossing, hands in pockets',
        setting: 'busy crosswalk downtown',
      },
      {
        layout: 'drink',
        beat: 'walks with a takeaway coffee in hand',
        setting: 'café corner on a city street',
      },
      {
        layout: 'look_back',
        beat: 'glances back over her shoulder on the sidewalk',
        setting: 'old town street with cobblestones',
      },
      {
        layout: 'stairs',
        beat: 'walks up the steps of a brownstone',
        setting: 'brownstone stoop',
      },
      {
        layout: 'phone',
        beat: 'checks the phone outside a shop window',
        setting: 'shopping street at golden hour',
      },
      {
        layout: 'carry',
        beat: 'walks down the street carrying a tote bag',
        setting: 'high street with boutiques',
      },
    ],
  },
  {
    id: 'beach',
    name: 'Beach',
    blurb: 'Sand, surf and sun — upright beach poses.',
    entries: [
      {
        layout: 'walk',
        beat: 'walks along the shoreline, sea at her ankles',
        setting: 'sandy beach at golden hour',
      },
      {
        layout: 'arms_up',
        beat: 'throws both arms up in the air to the sun',
        setting: 'beach with turquoise water',
      },
      {
        layout: 'sit',
        beat: 'sits on her beach towel, looking out to sea',
        setting: 'quiet beach cove',
      },
      {
        layout: 'hair_touch',
        beat: 'tucks her hair behind one ear in the sea breeze',
        setting: 'beach on a breezy afternoon',
      },
      {
        layout: 'sport_surf',
        beat: 'popping up on her surfboard on a wave',
        setting: 'surf break with rolling waves',
      },
      {
        layout: 'drink',
        beat: 'sips a cold drink at the beach bar',
        setting: 'beach bar under palm trees',
      },
      {
        layout: 'look_back',
        beat: 'looks back over her shoulder, walking into the sea',
        setting: 'shallow clear water at the beach',
      },
      {
        layout: 'hands_behind_head',
        beat: 'leans back in a lounger, hands behind her head',
        setting: 'poolside loungers by the beach',
      },
    ],
  },
];

const TWO_PERSON_IDS: ReadonlySet<string> = new Set(
  POSE_PICKER_GROUPS.find(group => group.label === 'Two people')?.ids ?? []
);

/** How many people a pack entry draws (two-person layouts and photo skeletons can be duos). */
export function posePackEntryPeople(entry: PosePackEntry): number {
  if (entry.photo?.people.length) return entry.photo.people.length;
  return entry.layout && TWO_PERSON_IDS.has(entry.layout) ? 2 : 1;
}

export function slotHasPosePick(slot: Pick<DaySlot, 'poseLayout' | 'posePhoto'>): boolean {
  return Boolean(slot.poseLayout?.trim() || slot.posePhoto?.people.length);
}

function entryPosePatch(entry: PosePackEntry, lap: number): SlotPosePatch {
  const variant = entry.photo ? 0 : (entry.variant ?? 0) + lap;
  return {
    ...NO_POSE,
    ...(entry.photo
      ? { posePhoto: entry.photo }
      : entry.layout
        ? { poseLayout: entry.layout }
        : {}),
    ...(variant > 0 ? { poseVariant: Math.min(99, variant) } : {}),
    ...(entry.camera ? { poseCamera: entry.camera } : {}),
    ...(entry.lead ? { poseLead: entry.lead } : {}),
    ...(entry.look ? { poseLook: entry.look } : {}),
  };
}

export type PosePackApplyResult = {
  slots: DaySlot[];
  /** Slots that got a pose. */
  posed: number;
  /** Empty beats the pack filled. */
  beatsFilled: number;
  /** Slots left as they were (a duo slot and the pack has no duo pose). */
  skipped: number;
};

/**
 * Pose every slot from the pack, in order and cycling. `slotPeople` is each slot's headcount
 * (the pose plan's): a slot only takes an entry with the same number of people, so a solo pack
 * never forces one figure onto a duo beat. Entries whose layout is in `avoidLayouts` (poor
 * pose-match record on this setup, or weak on the engine per the pose report card —
 * pose-engine-report.ts) are skipped unless that would leave none.
 */
export function applyPosePackToSlots(
  slots: readonly DaySlot[],
  pack: PosePack,
  options?: {
    fillBeats?: boolean;
    avoidLayouts?: ReadonlySet<string> | null;
    slotPeople?: readonly number[];
  }
): PosePackApplyResult {
  const avoid = options?.avoidLayouts;
  const usable = pack.entries.filter(entry => entry.layout || entry.photo?.people.length);
  const kept = avoid?.size
    ? usable.filter(entry => !entry.layout || !avoid.has(entry.layout))
    : usable;
  const entries = kept.length > 0 ? kept : usable;
  const used = new Map<number, number>();
  let posed = 0;
  let beatsFilled = 0;
  let skipped = 0;
  const next = slots.map((slot, index) => {
    const people = Math.max(1, options?.slotPeople?.[index] ?? 1);
    const fits = entries.filter(entry => posePackEntryPeople(entry) === people);
    if (fits.length === 0) {
      skipped += 1;
      return slot;
    }
    const n = used.get(people) ?? 0;
    used.set(people, n + 1);
    const entry = fits[n % fits.length]!;
    posed += 1;
    const patched: DaySlot = { ...slot, ...entryPosePatch(entry, Math.floor(n / fits.length)) };
    if (options?.fillBeats && entry.beat && !slot.sceneHints?.trim()) {
      beatsFilled += 1;
      patched.sceneHints = entry.beat;
      patched.sceneHintsTyped = undefined;
      if (entry.setting && !slot.location?.trim()) {
        patched.location = entry.setting;
      }
    }
    return patched;
  });
  return { slots: next, posed, beatsFilled, skipped };
}

const BUILT_IN_BEATS: ReadonlySet<string> = new Set(
  BUILT_IN_POSE_PACKS.flatMap(pack => pack.entries.map(entry => entry.beat ?? '')).filter(Boolean)
);
const BUILT_IN_SETTINGS: ReadonlySet<string> = new Set(
  BUILT_IN_POSE_PACKS.flatMap(pack => pack.entries.map(entry => entry.setting ?? '')).filter(
    Boolean
  )
);

/**
 * Every slot back to "pose from the beat". A beat (and its setting) a pack filled in goes too,
 * unless the player has since typed over it.
 */
export function clearPosePackFromSlots(slots: readonly DaySlot[]): DaySlot[] {
  return slots.map(slot => {
    const next: DaySlot = { ...slot, ...NO_POSE };
    const packBeat =
      slot.sceneHints && BUILT_IN_BEATS.has(slot.sceneHints) && !dayBeatIsTyped(slot);
    if (packBeat) {
      next.sceneHints = undefined;
      if (slot.location && BUILT_IN_SETTINGS.has(slot.location)) {
        next.location = undefined;
      }
    }
    return next;
  });
}

function samePose(slot: DaySlot, entry: PosePackEntry): boolean {
  if (entry.photo) {
    return Boolean(
      slot.posePhoto && JSON.stringify(slot.posePhoto.people) === JSON.stringify(entry.photo.people)
    );
  }
  return Boolean(entry.layout) && !slot.posePhoto && slot.poseLayout === entry.layout;
}

/**
 * The pack the Day's slots are posed from, or null: every slot has a pick and each pick is one
 * of the pack's poses. Ties go to the pack whose order matches best.
 */
export function activePosePack(
  slots: readonly DaySlot[],
  packs: readonly PosePack[]
): PosePack | null {
  if (slots.length === 0 || !slots.every(slotHasPosePick)) return null;
  let best: { pack: PosePack; score: number } | null = null;
  for (const pack of packs) {
    if (pack.entries.length === 0) continue;
    if (!slots.every(slot => pack.entries.some(entry => samePose(slot, entry)))) continue;
    const score = slots.filter((slot, index) =>
      samePose(slot, pack.entries[index % pack.entries.length]!)
    ).length;
    if (!best || score > best.score) best = { pack, score };
  }
  return best?.pack ?? null;
}

/** The posed slots as a pack (unposed slots are left out); null when nothing is posed. */
export function posePackFromSlots(
  slots: readonly DaySlot[],
  name: string,
  id: string,
  savedAt = Date.now()
): PosePack | null {
  const entries: PosePackEntry[] = slots.filter(slotHasPosePick).map(slot => ({
    ...(slot.posePhoto?.people.length
      ? { photo: slot.posePhoto }
      : { layout: slot.poseLayout!.trim() }),
    ...(slot.poseVariant && !slot.posePhoto ? { variant: slot.poseVariant } : {}),
    ...(slot.poseCamera ? { camera: slot.poseCamera } : {}),
    ...(slot.poseLead ? { lead: slot.poseLead } : {}),
    ...(slot.poseLook ? { look: slot.poseLook } : {}),
  }));
  if (entries.length === 0) return null;
  return normalizePosePack({ id, name, entries, mine: true, savedAt });
}

function readEntry(raw: unknown): PosePackEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const photo = normalizePhotoPose(record.photo);
  const layout =
    typeof record.layout === 'string' && record.layout.trim()
      ? record.layout.trim().slice(0, 40)
      : '';
  if (!photo && !layout) return null;
  const variant =
    typeof record.variant === 'number' && Number.isFinite(record.variant) && record.variant > 0
      ? Math.min(99, Math.floor(record.variant))
      : 0;
  const camera = normalizePoseCameraChoice(record.camera);
  const look = normalizePoseLookChoice(record.look);
  const lead = record.lead === 'left' || record.lead === 'right' ? record.lead : undefined;
  const text = (value: unknown, max: number) =>
    typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : '';
  const beat = text(record.beat, 320);
  const setting = text(record.setting, 160);
  return {
    ...(photo ? { photo } : { layout }),
    ...(variant && !photo ? { variant } : {}),
    ...(camera ? { camera } : {}),
    ...(lead ? { lead } : {}),
    ...(look ? { look } : {}),
    ...(beat ? { beat } : {}),
    ...(setting ? { setting } : {}),
  };
}

/** A stored / synced pack, cleaned; null when it has no usable pose. */
export function normalizePosePack(raw: unknown): PosePack | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const entries = (Array.isArray(record.entries) ? record.entries : [])
    .map(readEntry)
    .filter((entry): entry is PosePackEntry => Boolean(entry))
    .slice(0, POSE_PACK_ENTRIES_MAX);
  const id = typeof record.id === 'string' ? record.id.trim().slice(0, 80) : '';
  if (entries.length === 0 || !id) return null;
  const name =
    typeof record.name === 'string' && record.name.trim()
      ? record.name.trim().slice(0, POSE_PACK_NAME_MAX)
      : 'My pack';
  const blurb = typeof record.blurb === 'string' ? record.blurb.trim().slice(0, 120) : '';
  return {
    id,
    name,
    ...(blurb ? { blurb } : {}),
    entries,
    ...(record.mine === true ? { mine: true } : {}),
    ...(typeof record.savedAt === 'number' && Number.isFinite(record.savedAt)
      ? { savedAt: record.savedAt }
      : {}),
  };
}
