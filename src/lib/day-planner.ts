import {
  clampStillHoldSec,
  DEFAULT_STILL_HOLD_SEC,
  type FilmPlaylistShot,
} from '@/lib/character-film';
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

/** Scene prompt for one time-of-day still. */
export function buildDaySlotPrompt(input: {
  slot: DaySlot;
  wardrobeLabel?: string;
  characterName?: string;
  characterDescriptor?: string;
  lockedLocation?: string;
  notes?: string;
}): string {
  const slot = input.slot;
  const name = input.characterName?.trim();
  const descriptor = input.characterDescriptor?.trim();
  const outfit = input.wardrobeLabel?.trim() || slot.wardrobeId?.trim() || '';
  const setting = resolveRoleplaySetting(slot.location, input.lockedLocation);
  const hints = slot.sceneHints?.trim();
  const notes = input.notes?.trim();

  return [
    `Day planner still — ${slot.label.toLowerCase()}:`,
    descriptor
      ? `look (mandatory unique face and body — not a stock beauty face or default slim silhouette): ${descriptor}`
      : null,
    name ? `subject: ${name}` : 'subject: the active Cast character',
    outfit ? `outfit: ${outfit}` : 'outfit: catalog wardrobe kit for this slot',
    setting ? `setting: ${setting}` : 'setting: a coherent location that fits the time of day',
    hints ? `beat: ${hints}` : null,
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

/** Seed empty slot wardrobe ids from a Fitting / look-pack wardrobe lock. */
export function seedDaySlotsWardrobe(
  slots: DaySlot[] | null | undefined,
  wardrobeId?: string
): DaySlot[] {
  const id = wardrobeId?.trim();
  if (!id) {
    return normalizeDaySlots(slots);
  }
  return normalizeDaySlots(slots).map(slot => ({
    ...slot,
    wardrobeId: slot.wardrobeId?.trim() || id,
  }));
}

/**
 * Map multiple Fitting keeper kits onto morning→night.
 * First N keepers fill slots in order; remaining empty slots inherit the last keeper.
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
    return seedDaySlotsWardrobe(normalized, ids[0]);
  }
  const last = ids[ids.length - 1]!;
  return normalized.map((slot, index) => ({
    ...slot,
    wardrobeId: ids[index] ?? slot.wardrobeId?.trim() ?? last,
  }));
}
