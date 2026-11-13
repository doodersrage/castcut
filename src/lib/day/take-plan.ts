/**
 * A take's plan (FINISHING_PLAN Phase 3, step 4): the decisions the take builder (queueSlot, in
 * useDayPlannerToolOrchestrationCore.ts) makes before it does anything — taken out of the hook one
 * at a time, as pure functions, so the server can make the same decisions without a page. Each
 * piece is moved as it was; the golden take requests (e2e/golden/take-requests/) check that what a
 * take sends ComfyUI doesn't change.
 */
import {
  dayMoodWantsAutoKit,
  dayOutfitArcKit,
  pickDayAutoKit,
  scriptSceneOutfitKit,
  type DayAutoKitOption,
} from './auto-kit';
import {
  dayBeatOmitsGarmentPackshot,
  isDayAdultMood,
  normalizeDayIntimateMix,
  normalizeDayMood,
  type DaySlot,
} from './planner';
import { daySlotPoseLayout, planDaySlotPose } from './slot-pose';
import { isPenetrationLayout, photoPoseForStill } from './pose-guide';
import { COMFY_IMAGE_MODELS, type ComfyImageModel } from '../comfy-models/client';
import type { ComfyUiModelLists } from '../comfyui/object-info';
import type { ModelCheckpointMap } from '../model/checkpoint-map';
import { installedComfyModels } from '../model/picker';
import { customPoseOffPlate } from '../pose/custom-pose-engine';
import {
  pickPoseEngine,
  resolvePinnedEngine,
  type PoseEngineReport,
  type PoseEngineSwap,
} from '../pose/pose-engine-report';
import { poseProfileForModel } from '../pose/pose-model-profile';
import { resolveAdultNudePlateQueueModel, resolveDayStillModel } from '../queue/tool-model';

/** A Scene as the outfit choice reads it (scriptSceneOutfitKit). */
type OutfitScene = Parameters<typeof scriptSceneOutfitKit>[0][number];

export type TakeOutfitPlan = {
  /** The kit the take wears, if any. */
  wardrobeId?: string;
  /** The slot as the take renders it: its kit cleared when not the lead's, or the one picked. */
  target: DaySlot;
  /** A kit picked here (auto): the caller saves it on the slot. */
  picked?: string;
};

/**
 * The take's outfit: the slot's kit or the locked one — a kit not in the lead's catalog cleared
 * (another lead's) — and, with nothing dressing her and a mood that wants one, a kit picked: the
 * one the script's other Scenes wear at this time of day, else the Day's outfit arc, else one of
 * the catalog's for this slot.
 */
export function planTakeOutfit(input: {
  target: DaySlot;
  lockedWardrobeId?: string;
  /** The lead's catalog (empty before it loads: no kit is then judged not the lead's). */
  catalog: ReadonlyArray<DayAutoKitOption>;
  lookHasPlate: boolean;
  /** Where the look's plate came from ('keeper' — a Keep — is dressed already). */
  plateSource?: string;
  /** A clothing photo of her own is picked. */
  customGarment: boolean;
  dayMood: Parameters<typeof dayMoodWantsAutoKit>[0];
  /** A script's Scene: its script's other Scenes, and which one is open. */
  scene?: { scenes: ReadonlyArray<OutfitScene>; activeSceneId?: string | null };
  /** The board as the take builder has it, and its latest copy (a kit picked earlier this Queue). */
  workingSlots: ReadonlyArray<DaySlot>;
  latestSlots: ReadonlyArray<DaySlot>;
  /** Varies the pick between Casts (the Cast id). */
  salt?: string;
  hasPackshot: (wardrobeId: string) => boolean;
}): TakeOutfitPlan {
  let target = input.target;
  const locked = input.lockedWardrobeId?.trim() || undefined;
  let wardrobeId = target.wardrobeId?.trim() || locked;
  // The catalog list is filtered to the lead's gender, and the kit picker only offers what is in
  // it — a slot kit missing from it was left by another lead (a man in cocktail dresses, live
  // 2026-09-30). Treat it as unset.
  const catalogLoaded = input.catalog.some(option => option.value);
  const fitsLead = (id: string | undefined) =>
    !id?.trim() || !catalogLoaded || input.catalog.some(option => option.value === id);
  if (target.wardrobeId && !fitsLead(target.wardrobeId)) {
    target = { ...target, wardrobeId: undefined, wardrobeAuto: undefined };
    wardrobeId = locked;
  }
  // An auto-picked kit (not one the player chose) follows the outfit arc too.
  const autoKit = !target.wardrobeId?.trim() || target.wardrobeAuto === true;
  if (
    !autoKit ||
    locked ||
    !input.lookHasPlate ||
    input.plateSource === 'keeper' ||
    input.customGarment ||
    !dayMoodWantsAutoKit(input.dayMood)
  )
    return { wardrobeId, target };
  // Outfit arc: morning and afternoon share one outfit, evening and night another. A kit an
  // earlier slot picked in this same Queue day is only in the latest slots.
  const arcSlots = input.workingSlots.map(entry =>
    entry.wardrobeId?.trim()
      ? entry
      : (input.latestSlots.find(latest => latest.id === entry.id) ?? entry)
  );
  // A script's Scene: the outfit its script's other Scenes already wear at this time of day
  // (each Scene renders alone, so Day's arc can't see them).
  const scriptKit = input.scene
    ? scriptSceneOutfitKit(input.scene.scenes, input.scene.activeSceneId, input.dayMood, id =>
        fitsLead(id)
      )
    : undefined;
  const arcKit =
    scriptKit ??
    dayOutfitArcKit(
      arcSlots.filter(entry => fitsLead(entry.wardrobeId)),
      target.id,
      input.dayMood
    );
  const picked =
    arcKit ??
    (wardrobeId ||
      pickDayAutoKit({
        options: [...input.catalog],
        dayMood: input.dayMood,
        slotId: target.id,
        salt: input.salt,
        hasPackshot: input.hasPackshot,
        exclude: input.workingSlots.map(entry => entry.wardrobeId),
      }));
  if (!picked || (picked === target.wardrobeId && target.wardrobeAuto))
    return { wardrobeId, target };
  return {
    wardrobeId: picked,
    target: { ...target, wardrobeId: picked, wardrobeAuto: true },
    picked,
  };
}

export type TakeModelPlan = {
  /** The beat leaves the clothing packshot out (an adult nude still). */
  omitGarment: boolean;
  /** The engine the still renders on. */
  stillModel: ComfyImageModel;
  /** As the take sends it: with a plate, the Edit-capable (adult nude: NSFW) variant. */
  queueModel: ComfyImageModel;
  /** "Pick the best engine per pose" moved this still to an engine that holds its pose. */
  poseEngineSwap: PoseEngineSwap | null;
  /** The card's own engine wasn't installed: why it stayed on the short's. */
  pinNote?: string;
};

type TakeModelInput = {
  slot: DaySlot;
  /** The engine picked for the short (Settings → the still engine). */
  pickedModel: ComfyImageModel;
  modelCheckpointMap?: ModelCheckpointMap;
  dayMood: Parameters<typeof dayMoodWantsAutoKit>[0];
  intimateEnabled: boolean;
  intimateMix: unknown;
  allowCompanions: boolean;
  /** "Pick the best engine per pose" (opt-in). */
  bestEnginePerPose: boolean;
  /** The take's look has a plate. */
  hasPlate: boolean;
};

/**
 * Whether the model choice needs ComfyUI's installed models (an engine with hand-offs, the best
 * engine per pose, a card's own engine): the caller asks ComfyUI before {@link planTakeModel}.
 */
export function takeModelNeedsInventory(input: TakeModelInput): boolean {
  const profile = poseProfileForModel(input.pickedModel);
  return Boolean(
    profile.adultEngine ||
    profile.clothedDuoEngine ||
    profile.penetrationEngine ||
    profile.customPoseEngines?.length ||
    (input.bestEnginePerPose && input.hasPlate) ||
    input.slot.engine
  );
}

/**
 * The engine a take renders on: the short's engine, handed off for this still when it can't do it
 * (with "best engine per pose" on: adult nude stills, sex-pose duos, clothed duos, custom poses off
 * the plate, a pose the engine keeps missing), and the card's own engine over all of them.
 */
export function planTakeModel(
  input: TakeModelInput & {
    /** ComfyUI's installed models (null: not asked — nothing counts as installed). */
    inventory: ComfyUiModelLists | null;
    /** Pose layouts the engine keeps missing (play metrics), read only with best engine per pose. */
    weakLayouts: () => ReadonlySet<string>;
    /** The pose engine report card, read only with best engine per pose. */
    poseReport: () => PoseEngineReport | undefined;
  }
): TakeModelPlan {
  const { slot } = input;
  const omitGarment = dayBeatOmitsGarmentPackshot({
    blurb: slot.sceneHints,
    prompt: [slot.location, slot.sceneHints].filter(Boolean).join(' · '),
    // The mood the still plays as: an adult mood with Intimate off is Everyday, as the prompt
    // builder already treats it — on the raw mood these stills started from a face crop under an
    // Everyday prompt.
    dayMood: isDayAdultMood(input.dayMood) && !input.intimateEnabled ? 'everyday' : input.dayMood,
    intimateMix: normalizeDayIntimateMix(input.intimateMix),
  });
  // Qwen Edit 2511 hands adult nude stills to Rapid AIO NSFW — this still only; the picked engine
  // stays picked (pose-model-profile: adultEngine).
  const adultNudeStill = isDayAdultMood(input.dayMood) && input.intimateEnabled && omitGarment;
  const handOffProfile = poseProfileForModel(input.pickedModel);
  const bestEnginePerPose = input.bestEnginePerPose && input.hasPlate;
  const installed = (modelId: string) =>
    installedComfyModels(COMFY_IMAGE_MODELS, input.inventory, input.modelCheckpointMap)?.has(
      modelId
    ) === true;
  const playedMood = normalizeDayMood(
    isDayAdultMood(input.dayMood) && !input.intimateEnabled ? 'everyday' : input.dayMood
  );
  const pose = (model: string) =>
    planDaySlotPose({
      slot,
      dayMood: playedMood,
      intimateMix: input.intimateMix as never,
      allowCompanions: input.allowCompanions,
      model,
    });
  // Qwen-Image 2.1 hands nude two-person sex layouts to Rapid NSFW (pose-model-profile:
  // penetrationEngine) — only when the picked engine has that hand-off.
  const penetrationDuo =
    adultNudeStill &&
    Boolean(handOffProfile.penetrationEngine) &&
    (() => {
      const { layout, headcount } = daySlotPoseLayout({
        slot,
        dayMood: playedMood,
        intimateMix: input.intimateMix as never,
        allowCompanions: input.allowCompanions,
        model: input.pickedModel,
      });
      return headcount >= 2 && isPenetrationLayout(layout);
    })();
  // The hand-offs below (2511 adult nude, 2.1 sex-pose duos and clothed duos → Rapid) only run with
  // "Pick the best engine per pose" on; off, every still renders on the picked engine.
  const handOffs = input.bestEnginePerPose;
  // A one-person custom pose Edit 2511 redraws from its standing plate (lying, a plank, a back
  // view): Noct-Q, else Turbo, draws it (pose-model-profile: customPoseEngines).
  const customPoseOffPlateStill =
    handOffs &&
    Boolean(handOffProfile.customPoseEngines?.length) &&
    Boolean(slot.posePhoto?.people.length) &&
    input.hasPlate &&
    pose(input.pickedModel).headcount === 1 &&
    customPoseOffPlate(photoPoseForStill(slot.posePhoto, 1)) !== null;
  const routedStillModel = resolveDayStillModel(input.pickedModel, {
    adultNude: adultNudeStill,
    penetrationDuo,
    handOffs,
    customPoseOffPlate: customPoseOffPlateStill,
    // Qwen-Image 2.1 hands clothed two-person stills to Rapid (it fuses the pair).
    clothedDuo:
      !adultNudeStill &&
      // Not on the adult moods: their two-person beats that keep clothes on (a flash, a wardrobe
      // slip) belong on the adult engine, not plain Rapid.
      !(isDayAdultMood(input.dayMood) && input.intimateEnabled) &&
      pose(input.pickedModel).headcount >= 2,
    installed,
  });
  // "Pick the best engine per pose" (opt-in): a one-person clothed still whose pose the routed
  // engine keeps missing on the pose report card renders on an installed engine that holds it —
  // this still only, like the hand-offs above (pose-engine-report.ts).
  let poseEngineSwap: PoseEngineSwap | null = null;
  if (bestEnginePerPose) {
    const { layout, headcount } = daySlotPoseLayout({
      slot,
      dayMood: playedMood,
      intimateMix: input.intimateMix as never,
      allowCompanions: input.allowCompanions,
      model: routedStillModel,
      weakLayouts: input.weakLayouts(),
    });
    poseEngineSwap = pickPoseEngine({
      enabled: true,
      model: routedStillModel,
      layout,
      mood: playedMood,
      headcount,
      adult: adultNudeStill || (isDayAdultMood(input.dayMood) && input.intimateEnabled),
      installed,
      // The sweep's card, with this player's own keeps and redos folded in.
      report: input.poseReport(),
    });
  }
  // The card's own engine (its sheet's "Engine for this shot") wins over every hand-off: the
  // engine picked for the short when it is that family, else the family's installed variant; none
  // installed, the still stays on the short's engine and the card says so.
  const pinned = resolvePinnedEngine({ pin: slot.engine, picked: input.pickedModel, installed });
  const pinnedEngine = pinned.model as ComfyImageModel | null;
  const stillModel = (pinnedEngine ?? poseEngineSwap?.model ?? routedStillModel) as ComfyImageModel;
  const queueModel = input.hasPlate
    ? resolveAdultNudePlateQueueModel(stillModel, {
        adultNude: isDayAdultMood(normalizeDayMood(input.dayMood)) && omitGarment,
      })
    : stillModel;
  return {
    omitGarment,
    stillModel,
    queueModel: queueModel as ComfyImageModel,
    poseEngineSwap,
    ...(pinned.note ? { pinNote: pinned.note } : {}),
  };
}
