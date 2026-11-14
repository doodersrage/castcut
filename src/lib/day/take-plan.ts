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
import { dayClothedGuideContradictsBeat, daySlotPoseLayout, planDaySlotPose } from './slot-pose';
import { kleinSpoonRecipeApplies } from '../play/klein-duo-recipe';
import { dayWalkingDuoSkipsPoseGuide, rapidAdultSkipsPoseGuide } from '../play/rapid-duo-recipe';
import { GROUND_SIT_REDO_MARK } from '../pose/ground-sit-words';
import {
  dayPartnerApplies,
  dayPartnerChoiceFor,
  inventedDayPartner,
  toDayPartner,
  type DayPartner,
  type DayPartnerNoun,
} from './partner';
import { filmStandInKey, scriptShotOther, type ScriptShotOther } from './script-shot-other';
import { dayThemeOf } from './themes';
import { castRelationOf, relationAllowsRomance } from '../cast/relationships';
import type { CharacterRecord } from '../character/os';
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
 * The engine a take decides with: with a plate, the Edit-capable engine it renders on (2512 →
 * Edit 2511). Before 2026-11-13 the page decided the first take of a run with the picked engine
 * and then saved the Edit one as the picked engine, so the first take's words were another
 * engine's than the rest's (found by the run's shadow check).
 */
export function takeEngineFor(pickedModel: ComfyImageModel, hasPlate: boolean): ComfyImageModel {
  return hasPlate
    ? (resolveAdultNudePlateQueueModel(pickedModel, { adultNude: false }) as ComfyImageModel)
    : pickedModel;
}

/**
 * Whether the model choice needs ComfyUI's installed models (an engine with hand-offs, the best
 * engine per pose, a card's own engine): the caller asks ComfyUI before {@link planTakeModel}.
 */
export function takeModelNeedsInventory(input: TakeModelInput): boolean {
  const profile = poseProfileForModel(takeEngineFor(input.pickedModel, input.hasPlate));
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
  const slot = input.slot;
  // Decided for the engine it renders on (takeEngineFor).
  const pickedModel = takeEngineFor(input.pickedModel, input.hasPlate);
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
  const handOffProfile = poseProfileForModel(pickedModel);
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
        model: pickedModel,
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
    pose(pickedModel).headcount === 1 &&
    customPoseOffPlate(photoPoseForStill(slot.posePhoto, 1)) !== null;
  const routedStillModel = resolveDayStillModel(pickedModel, {
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
      pose(pickedModel).headcount >= 2,
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
  const pinned = resolvePinnedEngine({ pin: slot.engine, picked: pickedModel, installed });
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

export type TakePartnerPlan = {
  /** The partner Cast member picked for the short (their face, their outfit in words). */
  partnerCharacter: CharacterRecord | null;
} & (
  | {
      /** No second person in this still (none picked, no plate, the shot has one person…). */
      kind: 'none';
      /** Why the picked partner is left out, for the card (family in a romantic mood). */
      note?: string;
    }
  | {
      /**
       * An invented partner, or a stranger the script's shot names: a stand-in face, one per film
       * (kept under `filmKey` — '' outside a script) and per page for the partner, its own for a
       * stranger; rendered when there is none to reuse.
       */
      kind: 'stand-in';
      candidate: DayPartner & { noun: 'man' | 'woman' };
      stranger: ScriptShotOther | null;
      filmKey: string;
    }
  | {
      /** A Cast member plays the partner: their face crop, checked, as Image 2. */
      kind: 'cast';
      candidate: DayPartner;
      character: CharacterRecord;
    }
);

/**
 * Who the second person in a take is: the picked partner Cast member, an invented man or woman
 * ("new:…"), or a stranger the script's shot names (never the partner's face) — when the still has
 * room for two and the mood allows them (family never plays a romantic partner).
 */
export function planTakePartner(input: {
  slot: DaySlot;
  /** The partner picked for the short (Cast id, or "new:man"…). */
  partnerCharacterId?: string | null;
  /** A script's Scene with its line (the script decides who is in the shot). */
  scriptShot: boolean;
  leadNoun: DayPartnerNoun | null | undefined;
  /** The take's look's Cast (the lead), for their relationships. */
  lead: CharacterRecord | null | undefined;
  getCharacter: (id: string) => CharacterRecord | null | undefined;
  lookHasPlate: boolean;
  dayMood: Parameters<typeof dayMoodWantsAutoKit>[0];
  intimateEnabled: boolean;
  intimateMix: unknown;
  allowCompanions: boolean;
  stillModel: string;
  /** The script the open Scene was made from (its film's stand-ins). */
  filmScriptId?: string;
}): TakePartnerPlan {
  const { slot } = input;
  const partnerId = dayPartnerChoiceFor(input.partnerCharacterId, {
    scriptShot: input.scriptShot,
    lead: input.leadNoun,
  });
  const partnerCharacter =
    (partnerId && partnerId !== input.lead?.id ? input.getCharacter(partnerId) : null) ?? null;
  const castPartner = toDayPartner(partnerCharacter);
  // A script's two-shot with someone other than the partner (the bookstore's elderly man): a
  // stranger with a face of their own, never the partner's face (live 2026-11-11).
  const shotOther = input.scriptShot ? scriptShotOther(slot.sceneHints) : null;
  const firstName = (name: string | undefined) =>
    (name ?? '').trim().toLowerCase().split(/\s+/)[0] ?? '';
  const strangerInShot =
    shotOther?.who &&
    !(partnerCharacter && firstName(shotOther.who) === firstName(partnerCharacter.name))
      ? shotOther
      : null;
  const candidate: DayPartner | null = strangerInShot
    ? {
        name: '',
        noun:
          strangerInShot.noun ??
          inventedDayPartner(partnerId)?.noun ??
          (input.leadNoun === 'man' ? 'woman' : 'man'),
        invented: true,
      }
    : (inventedDayPartner(partnerId) ??
      (castPartner
        ? { ...castPartner, relation: castRelationOf(input.lead, partnerCharacter?.id) }
        : null));
  if (!candidate || !input.lookHasPlate) return { kind: 'none', partnerCharacter };
  const partnerMood = normalizeDayMood(
    isDayAdultMood(input.dayMood) && !input.intimateEnabled ? 'everyday' : input.dayMood
  );
  const { headcount } = planDaySlotPose({
    slot,
    dayMood: partnerMood,
    intimateMix: input.intimateMix as never,
    allowCompanions: input.allowCompanions,
    model: input.stillModel,
  });
  const applies = dayPartnerApplies({
    partner: candidate,
    headcount,
    adultMood: isDayAdultMood(partnerMood),
    lead: input.leadNoun ?? undefined,
    sameSexLayouts: poseProfileForModel(input.stillModel).sameSexLayouts,
    romanticMood: partnerMood === 'suggestive' || dayThemeOf(input.dayMood)?.id === 'date-night',
  });
  if (!applies) {
    // Family never plays the partner in a romantic or adult mood (cast-relationships.ts).
    return headcount === 2 && candidate.relation && !relationAllowsRomance(candidate.relation)
      ? {
          kind: 'none',
          partnerCharacter,
          note: `${candidate.name} is family — left out of this still (pick another partner for this mood).`,
        }
      : { kind: 'none', partnerCharacter };
  }
  if (candidate.invented && candidate.noun !== 'person')
    return {
      kind: 'stand-in',
      partnerCharacter,
      candidate: { ...candidate, noun: candidate.noun },
      stranger: strangerInShot,
      // The partner's face is the film's and the page's; a stranger's only their own.
      filmKey: input.filmScriptId ? filmStandInKey(input.filmScriptId, strangerInShot) : '',
    };
  if (partnerCharacter)
    return { kind: 'cast', partnerCharacter, candidate, character: partnerCharacter };
  return { kind: 'none', partnerCharacter };
}

export type TakePoseGuidePlan = {
  /** No drawn pose guide (Image 3) with this take: the pose goes out in words. */
  skip: boolean;
  /** FLUX.2 Klein's clothed spoon: its compact recipe goes out alone (no guide, no face crop). */
  kleinSpoonRecipe: boolean;
  /** Why there is no guide, as the card says it (with `skip`). */
  skipReason?: string;
};

/**
 * Whether a take sends its drawn pose guide: not on a words-only redo, the Lightning identity path
 * (decided with the identity route: `skippedForIdentity`), Klein's spoon recipe, a clothed drawing
 * that contradicts the beat, Rapid's spoon / face-down / against-a-wall poses, or a walk in step
 * on Edit 2511 — in that order.
 */
export function planTakePoseGuide(input: {
  slot: DaySlot;
  stillModel: string;
  dayMood: Parameters<typeof dayMoodWantsAutoKit>[0];
  intimateEnabled: boolean;
  intimateMix: unknown;
  allowCompanions: boolean;
  skippedForIdentity: boolean;
  /** A ground-sit redo (pose-describe): words only, judged against the guide it missed. */
  wordsOnlyRedo: boolean;
  partnerNoun?: DayPartnerNoun | null;
  leadNoun: DayPartnerNoun | null | undefined;
}): TakePoseGuidePlan {
  const { slot } = input;
  const adultIntimate = isDayAdultMood(input.dayMood) && input.intimateEnabled;
  let skip = input.skippedForIdentity || input.wordsOnlyRedo;
  // Klein clothed spoon: the compact recipe goes out alone — no guide, no face crop.
  const kleinSpoonRecipe = kleinSpoonRecipeApplies({
    model: input.stillModel,
    adultMood: adultIntimate,
    beat: slot.sceneHints,
  });
  if (kleinSpoonRecipe) skip = true;
  // Vacation / Suggestive draw clothed stills upright; when that drawing contradicts the beat (a
  // lie or a kneel drawn as a seated or standing pair) the words carry the pose.
  if (
    !skip &&
    dayClothedGuideContradictsBeat({
      slot,
      dayMood: normalizeDayMood(
        isDayAdultMood(input.dayMood) && !input.intimateEnabled ? 'everyday' : input.dayMood
      ),
      intimateMix: input.intimateMix as never,
      allowCompanions: input.allowCompanions,
      model: input.stillModel,
    })
  )
    skip = true;
  let spoonNoGuide = false;
  if (
    !skip &&
    rapidAdultSkipsPoseGuide({
      model: input.stillModel,
      adultMood: adultIntimate,
      beat: slot.sceneHints,
      pairing:
        input.partnerNoun && input.partnerNoun === input.leadNoun
          ? input.leadNoun === 'man'
            ? 'two-men'
            : 'two-women'
          : null,
    })
  ) {
    skip = true;
    spoonNoGuide = true;
  }
  // Walking hand in hand on Edit 2511: the standing hold-hands map froze the walk.
  let walkingDuoNoGuide = false;
  if (!skip && !adultIntimate && dayWalkingDuoSkipsPoseGuide(input.stillModel, slot.sceneHints)) {
    skip = true;
    walkingDuoNoGuide = true;
  }
  if (!skip) return { skip, kleinSpoonRecipe };
  return {
    skip,
    kleinSpoonRecipe,
    skipReason: input.wordsOnlyRedo
      ? `${GROUND_SIT_REDO_MARK} (pose from text)`
      : kleinSpoonRecipe
        ? 'FLUX.2 Klein spoon reads the overlapping guide as a third person (stance from text)'
        : spoonNoGuide
          ? 'Spooning, face-down or against a wall: the drawing fought the words (pose from text)'
          : walkingDuoNoGuide
            ? 'A walk in step: the standing hold-hands drawing froze it (stride from text)'
            : 'Lightning identity path keeps Image 1 whole (stance from text)',
  };
}
