/**
 * The page's take helpers as plain functions of what they read (FINISHING_PLAN Phase 3): the
 * outfit's label, a slot's look and plates, its brief, its engine, the room of a script's scene.
 * The Day/Scene hook calls them with its state; the server's run calls them with the run's.
 */
import type { CharacterRecord } from '@/lib/character/os';
import { withCastPlace } from '@/lib/cast/places';
import type { ComfyUiModelLists } from '@/lib/comfyui/object-info';
import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery';
import type { LocationRecord } from '@/lib/location/records';
import type { PoseEngineReport } from '@/lib/pose/pose-engine-report';
import type { PoseGuideStylePreference } from '@/lib/pose/guide-prompt';
import { dayOutfitPromptName } from './clothed-lead';
import type { DayPartnerNoun } from './partner';
import type { DaySlot } from './planner';
import { resolveDayQueueIdentityPlate, type DayPlate } from './plate';
import { resolveDaySlotLook, type DaySlotOutfit } from './slot-look';
import { buildDaySlotPromptForStill, type DayStillSlotOptions } from './still-prompt';
import { planTakeModel, takeModelNeedsInventory, type TakeModelPlan } from './take-plan';

/** A kit's label: fetched, cached, in the picker, else its id in words. */
export function takeWardrobeLabel(
  wardrobeId: string | undefined,
  known: {
    labels: Record<string, string>;
    cached: (id: string) => string | null | undefined;
    options: ReadonlyArray<{ value: string; label: string }>;
    humanize: (id: string) => string;
  }
): string {
  const id = wardrobeId?.trim();
  if (!id) return '';
  // A kit auto-picked at queue time has no fetched label yet — the raw id went into the brief.
  return (
    known.labels[id] ??
    known.cached(id) ??
    known.options.find(option => option.value === id)?.label ??
    known.humanize(id)
  );
}

export type TakeLookInput = {
  character: CharacterRecord | null | undefined;
  gallery: ComfyGalleryEntry[];
  isolateSubject: boolean;
  outfit: DaySlotOutfit;
  /** The page's plate for the active look (isolated or not), and what queues as Image 1. */
  plate: DayPlate | null;
  hasPlate: boolean;
  queuePlate: DayPlate | null;
  preferCastPlate: boolean;
};

/**
 * A slot's look (day-slot-look.ts): its own look's plate, face and outfit, or — unset, or the
 * active look — the page's plate as it is.
 */
export function resolveTakeSlotLook(slot: Pick<DaySlot, 'lookId'>, input: TakeLookInput) {
  const resolved = resolveDaySlotLook({
    character: input.character,
    slot,
    gallery: input.gallery,
    isolateSubject: input.isolateSubject,
    outfit: input.outfit,
  });
  if (!resolved.lookId) {
    return {
      ...resolved,
      plate: input.plate,
      hasPlate: input.hasPlate,
      queuePlate: input.queuePlate,
    };
  }
  const lookPlate = resolved.plate ?? null;
  return {
    ...resolved,
    plate: lookPlate,
    hasPlate: Boolean(lookPlate?.filename?.trim() || lookPlate?.imageUrl?.trim()),
    queuePlate: resolveDayQueueIdentityPlate({
      character: resolved.character,
      displayPlate: lookPlate,
      preferCastPlate: input.preferCastPlate,
    }),
  };
}

export type TakePromptInput = {
  look: ReturnType<typeof resolveTakeSlotLook>;
  leadNoun: DayPartnerNoun;
  packshotUrl: (wardrobeId: string | undefined) => string | undefined | null;
  wardrobeLabel: (wardrobeId: string | undefined) => string;
  dayMood?: string;
  intimateEnabled: boolean;
  intimateMix?: unknown;
  allowCompanions: boolean;
  dayWeather?: string;
  lockedLocation?: string;
  locations: LocationRecord[];
  notes?: string;
  model: string;
  realismMode?: string;
  poseGuideStyle: PoseGuideStylePreference;
};

/** A still's brief / recipe (day-still-prompt.ts) from the take's state. */
export function buildTakeSlotPrompt(
  slot: DaySlot,
  input: TakePromptInput,
  options?: DayStillSlotOptions
): string {
  const { look } = input;
  return buildDaySlotPromptForStill(
    slot,
    {
      plate: look.plate,
      queuePlate: look.queuePlate,
      character: look.character,
      hasPlate: look.hasPlate,
      leadNoun: input.leadNoun,
      packshotUrl:
        input.packshotUrl(slot.wardrobeId?.trim() || look.outfit.lockedWardrobeId?.trim()) ??
        undefined,
      wardrobeLabel: dayOutfitPromptName(input.wardrobeLabel(slot.wardrobeId)),
      customGarmentUrl: look.outfit.customGarmentImageUrl,
      customGarmentFilename: look.outfit.customGarmentImageFilename,
      customGarmentDescription: look.outfit.customGarmentDescription,
      dayMood: input.dayMood,
      intimateEnabled: input.intimateEnabled,
      intimateMix: input.intimateMix,
      allowCompanions: input.allowCompanions,
      dayWeather: input.dayWeather,
      lockedLocation: input.lockedLocation,
      locations: input.locations,
      notes: input.notes,
      model: input.model,
      realismMode: input.realismMode,
      defaultPoseGuideStyle: input.poseGuideStyle,
    } as Parameters<typeof buildDaySlotPromptForStill>[1],
    options
  );
}

/**
 * The engine a still renders on and the model it is queued as (take-plan.ts). ComfyUI's
 * inventory is asked only when the picked engine has a per-still hand-off.
 */
export async function planTakeStillModel(
  input: Omit<Parameters<typeof takeModelNeedsInventory>[0], never>,
  deps: {
    inventory: () => Promise<ComfyUiModelLists | null>;
    weakLayouts: () => Set<string>;
    poseReport: () => PoseEngineReport | undefined;
  }
): Promise<TakeModelPlan> {
  const inventory = takeModelNeedsInventory(input) ? await deps.inventory() : null;
  return planTakeModel({
    ...input,
    inventory,
    weakLayouts: deps.weakLayouts,
    poseReport: deps.poseReport,
  });
}

/**
 * One room a scene (a run's oneRoom): the room a script's scene is shot in — made the first time
 * the scene is shot (its empty room, from the shot's place words), then the same for every shot.
 * Null when off, not a script's shot, or the render fails (the shot goes out as before).
 */
export async function takeSceneRoom(
  slot: DaySlot,
  input: {
    oneRoom: boolean;
    rooms: Record<string, string>;
    link: { scriptId?: string; sceneId?: string } | null | undefined;
    character: CharacterRecord | null | undefined;
    leadNoun: DayPartnerNoun;
    render: (
      place: Pick<LocationRecord, 'name' | 'look' | 'setting'>,
      filename: string
    ) => Promise<string>;
    /** The scene's room, made: kept for its other shots. */
    keep: (rooms: Record<string, string>) => void;
  }
): Promise<string | null> {
  if (!input.oneRoom) return null;
  const link = input.link;
  if (!link?.scriptId || !link.sceneId) return null;
  const key = `${link.scriptId}|${link.sceneId}`;
  const known = input.rooms[key];
  if (known) return known;
  const place =
    withCastPlace(slot.location, input.character, input.leadNoun)?.trim() || slot.location?.trim();
  if (!place) return null;
  try {
    const file = await input.render(
      { name: place, look: '', setting: /\boutdoors\b/i.test(place) ? 'EXT' : 'INT' },
      `scene-room-${link.sceneId.slice(0, 40)}.png`
    );
    input.keep({ ...input.rooms, [key]: file });
    return file;
  } catch (error) {
    console.warn('One room a scene: the room was not made —', error);
    return null;
  }
}
