import {
  clampStillHoldSec,
  DEFAULT_STILL_HOLD_SEC,
  type FilmPlaylistShot,
} from '@/lib/character-film';
import { QWEN_POSE_UNLOCK_MODIFY_PREFIX } from '@/lib/compose-prompt';
import { resolveRoleplaySetting } from '@/lib/roleplay';

export type DaySlotId = 'morning' | 'afternoon' | 'evening' | 'night';

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
      return { slotId: slot.id, url, title: slot.label.trim() || slot.id };
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

/** Day Keep→scene: hold face + worn kit from Image 1; unlock pose/camera/background. */
export const DAY_KEEP_OUTFIT_POSE_UNLOCK_PREFIX =
  'Edit Image 1. Keep facial likeness AND the worn outfit, garments, colors, fabric, and clothing silhouette from Image 1. Do not preserve body pose, standing/sitting stance, arm or hand positions, camera angle, or background — aggressively refactor into a new pose and scene as described. Keep facial likeness only for who they are; keep the clothing; replace everything else.';

/**
 * Default activity poses when the slot beat is empty.
 * Edit models copy the plate stance unless the prompt names a different pose.
 */
export const DEFAULT_DAY_SLOT_POSES: Record<DaySlotId, string> = {
  morning:
    'standing at a kitchen counter or sink, pouring a drink or reaching for a mug, casual weight shift, looking toward morning light',
  afternoon:
    'walking outdoors mid-stride, relaxed shoulders, arms in a natural swing, glancing ahead',
  evening:
    'seated at a table or couch edge, torso angled slightly, one forearm resting, engaged mid-conversation',
  night:
    'standing near a window or doorway at night, weight on one leg, quiet pause, hands at sides or in pockets',
};

/**
 * Time-of-day setting pools for Queue day diversification.
 * Empty slot locations pick a unique entry so morning→night do not share one backdrop.
 */
export const DAY_SLOT_SETTING_PRESETS: Record<DaySlotId, string[]> = {
  morning: [
    'sunlit kitchen window with breakfast clutter on the counters',
    'quiet neighborhood sidewalk at sunrise with long soft shadows',
    'steamy bathroom mirror after a shower, towel over one shoulder',
    'corner café counter with a fresh pour-over and morning newspapers',
    'apartment balcony overlooking quiet residential streets at dawn',
    'grocery store produce aisle under cool fluorescent light',
    'train platform in early light with commuters and coffee cups',
    'yoga studio with mats rolled and east-facing windows',
  ],
  afternoon: [
    'busy sidewalk café terrace with chalkboard menus and passing traffic',
    'leafy city park path with benches and distant playground noise',
    'open-air farmers market with produce stalls and striped awnings',
    'independent bookstore aisle with warm lamps and crowded shelves',
    'open-plan office corner desk with monitors and afternoon window light',
    'bright neighborhood gym floor with mirrors and free weights',
    'sunlit museum gallery with pale walls and soft skylight',
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

/** Optional beat seeds when the slot beat field is empty. */
export const DAY_SLOT_BEAT_PRESETS: Record<DaySlotId, string[]> = {
  morning: [
    'waking up, soft light, quiet start',
    'making coffee, still half-asleep',
    'checking the phone by the window',
    'stretching before heading out',
  ],
  afternoon: [
    'coffee, people-watching, midday energy',
    'errands between meetings, purposeful walk',
    'pausing to people-watch from a bench',
    'browsing casually, unhurried curiosity',
  ],
  evening: [
    'pause at the end of the work day',
    'catching up with a friend, relaxed posture',
    'unwinding with a drink, soft conversation',
    'watching the light change, quiet moment',
  ],
  night: [
    'walking home, neon reflections',
    'late quiet pause before sleep',
    'heading somewhere after dark, alert calm',
    'lingering under a streetlamp, end of day',
  ],
};

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
    random?: () => number;
  }
): { slots: DaySlot[]; changed: boolean } {
  const random = options?.random ?? Math.random;
  const forceLocations = options?.forceLocations === true;
  const fillBeats = options?.fillBeats !== false;
  const forceBeats = options?.forceBeats === true;
  const usedLocations = new Set<string>();
  const usedBeats = new Set<string>();
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
    }
  }

  const next = normalized.map(slot => {
    let location = slot.location?.trim() || '';
    let sceneHints = slot.sceneHints?.trim() || '';
    let slotChanged = false;

    if (!location || forceLocations) {
      const picked = pickUnusedPreset(
        DAY_SLOT_SETTING_PRESETS[slot.id] ?? [],
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
      const picked = pickUnusedPreset(DAY_SLOT_BEAT_PRESETS[slot.id] ?? [], usedBeats, random);
      if (picked && picked !== sceneHints) {
        sceneHints = picked;
        slotChanged = true;
      }
    }
    if (sceneHints) {
      usedBeats.add(sceneHints.toLowerCase());
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
  /**
   * Keep stays Image 1. Optional wardrobe packshot as Image 2 reinforces garments
   * (Fitting pattern) without swapping Cast onto Image 1.
   */
  garmentReinforce?: boolean;
}): string {
  const slot = input.slot;
  const name = input.characterName?.trim();
  const descriptor = input.characterDescriptor?.trim();
  const outfit = input.wardrobeLabel?.trim() || slot.wardrobeId?.trim() || '';
  const setting = resolveRoleplaySetting(slot.location, input.lockedLocation);
  const hints = slot.sceneHints?.trim();
  const notes = input.notes?.trim();
  const timeOfDay = slot.label.toLowerCase();
  const defaultPose = DEFAULT_DAY_SLOT_POSES[slot.id];
  const keepAsImage1 = input.plateSource === 'keeper';
  const garmentReinforce = keepAsImage1 && input.garmentReinforce === true;

  if (input.hasPlate) {
    const poseLine = hints
      ? `mandatory new pose from the beat: ${hints}`
      : `mandatory new pose: ${defaultPose}`;
    if (keepAsImage1) {
      return [
        DAY_KEEP_OUTFIT_POSE_UNLOCK_PREFIX,
        `Edit instruction for a Day planner still — ${timeOfDay}:`,
        'Image 1 is the Outfit Keep try-on (face + worn kit).',
        garmentReinforce
          ? 'Image 2 is a wardrobe packshot — use it only to reinforce garment cut, colors, and fabric from Image 1; ignore Image 2 layout.'
          : null,
        'keep facial likeness only for identity; keep the clothing from Image 1; aggressively refactor pose, camera, lighting, and environment',
        descriptor
          ? `look (mandatory unique face and body — not a stock beauty face or default slim silhouette): ${descriptor}`
          : null,
        name ? `subject: ${name}` : 'subject: the active Cast character',
        outfit
          ? `outfit continuity: stay in ${outfit} (same kit as Image 1) in the new pose`
          : 'outfit continuity: same garments and colors as Image 1 in the new pose',
        poseLine,
        setting
          ? `setting: ${setting} — place them there for ${timeOfDay}`
          : `setting: a coherent real-world location that fits ${timeOfDay}`,
        hints ? `beat: ${hints}` : null,
        notes ? `notes: ${notes}` : null,
        'replace everything else: pose, stance, limbs, hands, framing, lighting, and background',
        `output: a new cinematic ${timeOfDay} scene — same face, same kept outfit, different pose — not a cleaned-up copy of Image 1`,
        'single full or three-quarter framing, natural lighting for the time of day',
      ]
        .filter(Boolean)
        .join('\n');
    }

    return [
      QWEN_POSE_UNLOCK_MODIFY_PREFIX,
      `Edit instruction for a Day planner still — ${timeOfDay}:`,
      'Image 1 is the Cast identity plate.',
      'keep facial likeness only from Image 1; aggressively refactor pose, camera, lighting, and environment',
      descriptor
        ? `look (mandatory unique face and body — not a stock beauty face or default slim silhouette): ${descriptor}`
        : null,
      name ? `subject: ${name}` : 'subject: the active Cast character',
      outfit
        ? `replace clothing with this slot's outfit: ${outfit}`
        : "replace clothing with this slot's catalog wardrobe kit",
      poseLine,
      setting
        ? `setting: ${setting} — place them there for ${timeOfDay}`
        : `setting: a coherent real-world location that fits ${timeOfDay}`,
      hints ? `beat: ${hints}` : null,
      notes ? `notes: ${notes}` : null,
      'replace everything else: pose, stance, limbs, hands, framing, lighting, and background',
      `output: a new cinematic ${timeOfDay} scene — same face, different pose — not a cleaned-up copy of Image 1`,
      'single full or three-quarter framing, natural lighting for the time of day',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    `Day planner still — ${timeOfDay}:`,
    descriptor
      ? `look (mandatory unique face and body — not a stock beauty face or default slim silhouette): ${descriptor}`
      : null,
    name ? `subject: ${name}` : 'subject: the active Cast character',
    outfit ? `outfit: ${outfit}` : 'outfit: catalog wardrobe kit for this slot',
    setting ? `setting: ${setting}` : 'setting: a coherent location that fits the time of day',
    hints ? `beat: ${hints}` : `pose: ${defaultPose}`,
    notes ? `notes: ${notes}` : null,
    'single cinematic still, full or three-quarter framing, natural lighting for the time of day',
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
        const imageUrl = match.imageUrl?.trim() || still.imageUrl;
        const status = stillStatusFromGallery(match.status);
        if (still.imageUrl !== imageUrl || still.status !== status) {
          changed = true;
          updated = { ...updated, imageUrl, status };
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
  return [
    `${name} during ${slot.label.toLowerCase()}`,
    location ? `at ${location}` : null,
    hints ? hints : null,
    'subtle natural motion, cinematic',
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
