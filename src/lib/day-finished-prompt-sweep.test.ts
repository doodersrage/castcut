/**
 * Sweeps Day's FINISHED prompts — the text that is queued, after the brief or recipe, the opening
 * lines, the footwear and partner lines, the pose cue, the adult reinforcement, the man-lead swap
 * and the pose-map renumbering — for every planner beat, on three engines, in the situations the
 * queue hook can be in. No render, no ComfyUI.
 *
 * `decideStill` follows `queueSlot` (useDayPlannerToolOrchestrationCore.ts) step by step. The
 * decisions themselves are the hook's own functions (day-still-plan.ts: dress plate, Image 1
 * route, clothing image, footwear); where the hook waits on an upload or a render, the setup
 * says how it came out (the dress plate rendered, the pose map was accepted, the face crop
 * exists). The text itself comes from the same functions the hook calls:
 * `buildDaySlotPromptForStill`, `assembleDayStillPrompt`, `finishDayStillPrompt`,
 * `queuedDayStillPrompt`.
 *
 * The sweep runs once at module load; each test asserts one invariant. A failure names the mood,
 * beat, engine and situation. Genuine app defects go in KNOWN_ISSUES (so the suite stays green);
 * the last test fails on an entry that no longer matches anything.
 *
 * `DAY_FINISHED_SWEEP_STATS=1` prints the prompt-length distribution (nothing is printed
 * otherwise).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayGarmentPromptName, dayOutfitPromptName } from './day-clothed-lead';
import {
  dayStillClothingReinforce,
  dayStillDressedPlateUse,
  dayStillFootwearApplies,
  dayStillIdentityRoute,
  dayStillWantsDressPlate,
} from './day-still-plan';
import { dayPartnerApplies, inventedDayPartner, type DayPartner } from './day-partner';
import { activeLook, normalizeCharacterRecord, type CharacterRecord } from './character-os';
import {
  type DayPlate,
  isClothingOnlyDayGarment,
  resolveDayGarmentReinforce,
  resolveDayQueueIdentityPlate,
} from './day-plate';
import {
  DAY_LATE_SLOT_BEAT_PRESETS,
  DAY_LATE_SLOT_COMPANION_BEAT_PRESETS,
  DAY_LATE_SLOT_HEAT_SETTING_PRESETS,
  DAY_LATE_SLOT_SETTING_PRESETS,
  DAY_LATE_SLOT_SUGGESTIVE_BEAT_PRESETS,
  DAY_PARTS,
  DAY_SLOT_BEAT_PRESETS,
  DAY_SLOT_COMPANION_BEAT_PRESETS,
  DAY_SLOT_HEAT_SETTING_PRESETS,
  DAY_SLOT_SETTING_PRESETS,
  DAY_SLOT_SUGGESTIVE_BEAT_PRESETS,
  DAY_SLOT_SUGGESTIVE_DUO_BEAT_PRESETS,
  dayBeatOmitsGarmentPackshot,
  dayMoodReplacesKeepOutfit,
  daySlotDefaultLabel,
  daySlotsForLength,
  intimateBeatsForMix,
  isDayAdultMood,
  normalizeDayMood,
  raunchyBeatsForMix,
  type DayIntimateMix,
  type DayMood,
  type DayPart,
  type DaySlot,
  type DaySlotId,
} from './day-planner';
import { dayPoseGuideFallbackIndex, resolveSceneGuidePlan } from './day-pose-guide';
import { resolveDaySlotLook, type DaySlotOutfit } from './day-slot-look';
import { dayClothedGuideContradictsBeat, planDaySlotPose } from './day-slot-pose';
import { daySportBeatPresetsForSlot, daySportSettingPresetsForSlot } from './day-sport';
import {
  assembleDayStillPrompt,
  buildDaySlotPromptForStill,
  dayPlayedMood,
  dayStillAgeFacts,
  dayStillSceneRedraw,
  dayStillSceneSlot,
  finishDayStillPrompt,
  queuedDayStillPrompt,
} from './day-still-prompt';
import { hasAdultAgeLine, youthWordsIn } from './adult-age-safeguard';
import { dayMoodNeedsAdultSafeguards } from './adult-appearance-gate';
import { DAY_THEMES } from './day-themes';
import {
  dayVacationBeatPresetsForSlot,
  dayVacationDuoBeatPresetsForSlot,
  dayVacationSettingPresetsForSlot,
} from './day-vacation';
import { normalizeFootwear } from './footwear';
import { cuePoseLayouts, poseLayoutFromKey, weakPoseLayouts } from './play-metrics';
import { DEFAULT_POSE_GUIDE_STYLE } from './pose-guide-prompt';
import { poseModelFamily, poseProfileForModel } from './pose/pose-model-profile';
import { resolveDayStillModel } from './queue-tool-model';
import { auditStillPrompt } from './still-prompt-audit';
import { formatWardrobeKitLabel } from './wardrobe-kit-picker';

// ── Engines ──────────────────────────────────────────────────────────────────────────────

const RAPID = 'qwen-rapid-aio-edit';
const EDIT_2511 = 'qwen-image-edit-2511-lightning-8';
const QWEN_21 = 'qwen-image-2.1-edit';
const ENGINES = [RAPID, EDIT_2511, QWEN_21] as const;
type Engine = (typeof ENGINES)[number];

// ── Beats (the planner's pools; one Setting per beat) ────────────────────────────────────

type Beat = {
  /** The stored Day mood: a base mood or a theme id (themes run as Everyday). */
  mood: string;
  kind: DayMood;
  pool: string;
  /** From a two-person pool (companion / couple beats). */
  two: boolean;
  slotId: DaySlotId;
  beat: string;
  location: string;
};

function collectBeats(): Beat[] {
  const beats: Beat[] = [];
  const seen = new Set<string>();
  const add = (beat: Omit<Beat, 'kind'>) => {
    const key = `${beat.mood}|${beat.beat}`;
    if (!beat.beat.trim() || seen.has(key)) return;
    seen.add(key);
    beats.push({ ...beat, kind: normalizeDayMood(beat.mood) });
  };
  const late = (part: DayPart): DaySlotId => `${part}-2`;
  // The planner draws a Setting from the slot's pool; the sweep takes them in turn.
  const turn = (pool: readonly string[] | undefined, index: number) =>
    pool?.length ? pool[index % pool.length]! : '';

  for (const part of DAY_PARTS) {
    const everyday: Array<[string, boolean, DaySlotId, string[], string[]]> = [
      ['everyday', false, part, DAY_SLOT_BEAT_PRESETS[part], DAY_SLOT_SETTING_PRESETS[part]],
      [
        'everyday companions',
        true,
        part,
        DAY_SLOT_COMPANION_BEAT_PRESETS[part],
        DAY_SLOT_SETTING_PRESETS[part],
      ],
      [
        'everyday late',
        false,
        late(part),
        DAY_LATE_SLOT_BEAT_PRESETS[part],
        DAY_LATE_SLOT_SETTING_PRESETS[part],
      ],
      [
        'everyday late companions',
        true,
        late(part),
        DAY_LATE_SLOT_COMPANION_BEAT_PRESETS[part],
        DAY_LATE_SLOT_SETTING_PRESETS[part],
      ],
    ];
    for (const [pool, two, slotId, presets, settings] of everyday) {
      (presets ?? []).forEach((beat, index) =>
        add({ mood: 'everyday', pool, two, slotId, beat, location: turn(settings, index) })
      );
    }
    const heat = DAY_SLOT_HEAT_SETTING_PRESETS[part];
    const lateHeat = DAY_LATE_SLOT_HEAT_SETTING_PRESETS[part] ?? heat;
    (DAY_SLOT_SUGGESTIVE_BEAT_PRESETS[part] ?? []).forEach((beat, index) =>
      add({
        mood: 'suggestive',
        pool: 'suggestive',
        two: false,
        slotId: part,
        beat,
        location: turn(heat, index),
      })
    );
    (DAY_LATE_SLOT_SUGGESTIVE_BEAT_PRESETS[part] ?? []).forEach((beat, index) =>
      add({
        mood: 'suggestive',
        pool: 'suggestive late',
        two: false,
        slotId: late(part),
        beat,
        location: turn(lateHeat, index),
      })
    );
    (DAY_SLOT_SUGGESTIVE_DUO_BEAT_PRESETS[part] ?? []).forEach((beat, index) =>
      add({
        mood: 'suggestive',
        pool: 'suggestive couple',
        two: true,
        slotId: part,
        beat,
        location: turn(heat, index),
      })
    );
  }

  for (const slotId of daySlotsForLength(8).map(slot => slot.id)) {
    const part = slotId.split('-')[0] as DayPart;
    const vacationSettings = dayVacationSettingPresetsForSlot(slotId);
    const sportSettings = daySportSettingPresetsForSlot(slotId);
    const heat =
      (slotId === part ? undefined : DAY_LATE_SLOT_HEAT_SETTING_PRESETS[part]) ??
      DAY_SLOT_HEAT_SETTING_PRESETS[part];
    dayVacationBeatPresetsForSlot(slotId).forEach((beat, index) =>
      add({
        mood: 'vacation',
        pool: 'vacation',
        two: false,
        slotId,
        beat,
        location: turn(vacationSettings, index),
      })
    );
    dayVacationDuoBeatPresetsForSlot(slotId).forEach((beat, index) =>
      add({
        mood: 'vacation',
        pool: 'vacation couple',
        two: true,
        slotId,
        beat,
        location: turn(vacationSettings, index),
      })
    );
    daySportBeatPresetsForSlot(slotId).forEach((beat, index) =>
      add({
        mood: 'sport',
        pool: 'sport',
        two: false,
        slotId,
        beat,
        location: turn(sportSettings, index),
      })
    );
    intimateBeatsForMix(slotId, 'mixed').forEach((beat, index) =>
      add({
        mood: 'intimate',
        pool: 'intimate',
        two: false,
        slotId,
        beat,
        location: turn(heat, index),
      })
    );
    raunchyBeatsForMix(slotId, 'mixed').forEach((beat, index) =>
      add({
        mood: 'raunchy',
        pool: 'raunchy',
        two: false,
        slotId,
        beat,
        location: turn(heat, index),
      })
    );
  }

  for (const theme of Object.values(DAY_THEMES)) {
    for (const part of DAY_PARTS) {
      for (const [beat, location] of theme.scenes[part]) {
        add({ mood: theme.id, pool: `theme ${theme.id}`, two: false, slotId: part, beat, location });
      }
      for (const [beat, location] of theme.duoScenes[part]) {
        add({
          mood: theme.id,
          pool: `theme ${theme.id} couple`,
          two: true,
          slotId: part,
          beat,
          location,
        });
      }
    }
  }
  return beats;
}

// ── Setups: what the player has, and how the uploads / renders came out ──────────────────

type LeadNoun = 'woman' | 'man';

type Setup = {
  id: string;
  /** The Day plate shown on the page: the Cast look plate, or an Outfit Keep. */
  plate: 'cast' | 'keeper';
  /**
   * Clothing: a catalog kit (auto-picked by the Day, or picked by the player), the player's own
   * clothing photo (with or without a description), a Fitting Room packshot picked as the
   * clothing image, or none.
   */
  clothing: 'none' | 'kit-auto' | 'kit-picked' | 'photo' | 'photo-unnamed' | 'packshot';
  /** The dress plate rendered (when the hook asks for one). */
  dressPlateRenders: boolean;
  partner: 'none' | 'cast' | 'cast-same' | 'invented';
  /** People: companions on (Mixed) — the planner's two-person beats draw two. */
  companions: boolean;
  /** The pose map was drawn and accepted by ComfyUI. */
  poseMap: boolean;
  /** Intimate is on (the adult moods play as adult). */
  intimate: boolean;
  /** Which beats this setup is swept on. */
  beats: (beat: Beat) => boolean;
};

const clothedBeat = (beat: Beat) => !isDayAdultMood(beat.kind);
/** People → Solo: the planner offers no two-person beat (it rerolls them, alignDaySlotsToPeople). */
const soloClothedBeat = (beat: Beat) => clothedBeat(beat) && !beat.two;
const BASE = {
  dressPlateRenders: true,
  partner: 'none',
  companions: false,
  poseMap: true,
  intimate: false,
  beats: soloClothedBeat,
} as const;

const SETUPS: Setup[] = [
  // a. Cast plate + the player's clothing photo (and b. where a face-break beat takes it).
  { ...BASE, id: 'cast plate + clothing photo', plate: 'cast', clothing: 'photo', dressPlateRenders: false },
  // b. Cast plate + a clothing-only packshot: face-crop stills keep the packshot as Image 2.
  { ...BASE, id: 'cast plate + packshot', plate: 'cast', clothing: 'packshot', dressPlateRenders: false },
  // The default first Day: Cast plate, the Day picks a kit, nothing attaches for it.
  { ...BASE, id: 'cast plate + auto kit', plate: 'cast', clothing: 'kit-auto' },
  // c / d. A picked kit: the Cast is dressed once, the stills start from that plate.
  { ...BASE, id: 'dressed plate (picked kit)', plate: 'cast', clothing: 'kit-picked' },
  // The player's own clothing photo with no description: the dress plate is the only word of it.
  { ...BASE, id: 'dressed plate (unnamed photo)', plate: 'cast', clothing: 'photo-unnamed' },
  // e. Outfit Keep as Image 1, no clothing image.
  { ...BASE, id: 'Keep plate', plate: 'keeper', clothing: 'none' },
  // Keep + the kit's packshot as Image 2.
  { ...BASE, id: 'Keep plate + packshot', plate: 'keeper', clothing: 'kit-picked' },
  // f. Two-person beats with a Cast partner and with an invented one.
  {
    ...BASE,
    id: 'Cast partner (dressed plate)',
    plate: 'cast',
    clothing: 'kit-picked',
    partner: 'cast',
    companions: true,
    beats: beat => clothedBeat(beat) && beat.two,
  },
  // Two men / two women: the lead's own sex as the Cast partner.
  {
    ...BASE,
    id: 'Cast partner, same sex',
    plate: 'cast',
    clothing: 'kit-picked',
    partner: 'cast-same',
    companions: true,
    beats: beat => clothedBeat(beat) && beat.two,
  },
  {
    ...BASE,
    id: 'invented partner (auto kit)',
    plate: 'cast',
    clothing: 'kit-auto',
    partner: 'invented',
    companions: true,
    beats: beat => clothedBeat(beat) && beat.two,
  },
  {
    ...BASE,
    id: 'companions on, no partner picked',
    plate: 'cast',
    clothing: 'photo',
    dressPlateRenders: false,
    companions: true,
    beats: beat => clothedBeat(beat) && beat.two,
  },
  // g. The pose map failed or was not drawn.
  {
    ...BASE,
    id: 'no pose map (dressed plate)',
    plate: 'cast',
    clothing: 'kit-picked',
    poseMap: false,
  },
  {
    ...BASE,
    id: 'no pose map (clothing photo)',
    plate: 'cast',
    clothing: 'photo',
    dressPlateRenders: false,
    poseMap: false,
  },
  // h. Adult moods with Intimate on: nude solo and duo, with and without a Cast partner.
  {
    ...BASE,
    id: 'adult (Intimate on)',
    plate: 'cast',
    clothing: 'kit-auto',
    companions: true,
    intimate: true,
    beats: beat => isDayAdultMood(beat.kind),
  },
  {
    ...BASE,
    id: 'adult + Cast partner',
    plate: 'cast',
    clothing: 'kit-auto',
    partner: 'cast',
    companions: true,
    intimate: true,
    beats: beat => isDayAdultMood(beat.kind),
  },
  // An adult mood with Intimate off plays as Everyday.
  {
    ...BASE,
    id: 'adult mood, Intimate off',
    plate: 'cast',
    clothing: 'kit-auto',
    companions: true,
    beats: beat => isDayAdultMood(beat.kind),
  },
];

const KIT_ID = 'navy-wrap-dress';
const KIT_LABEL = 'Navy wrap dress';
const PACKSHOT_URL = 'https://example.test/wardrobe/navy-wrap-dress.png';
const PHOTO_DESCRIPTION = 'a red satin slip dress with thin straps';
const SHOES = 'white leather sneakers';

const CAST_PLATE_FILENAME = 'cast-look-plate.png';
/** A Cast member with a look plate and a face crop of their own. */
const leadCharacter = (lead: LeadNoun): CharacterRecord => ({
  id: `cast-${lead}`,
  name: LEADS[lead].name,
  version: 1,
  updatedAt: 0,
  descriptor: LEADS[lead].descriptor,
  reference: { originalFilename: CAST_PLATE_FILENAME },
  ipAdapter: { imageFilename: 'cast-face-crop.png' },
});

/**
 * The lead with a second look (another plate and kit) beside the active one: a slot with no look
 * of its own, or the active one, must build the very same prompt as before looks per slot.
 */
const twoLookCharacter = (lead: LeadNoun): CharacterRecord => {
  const cast = normalizeCharacterRecord(leadCharacter(lead));
  return normalizeCharacterRecord({
    ...cast,
    looks: [
      ...(cast.looks ?? []),
      {
        id: 'look-beach',
        name: 'Beach',
        createdAt: -1,
        reference: { originalFilename: 'beach-plate.png' },
        ipAdapter: { imageFilename: 'beach-face.png' },
        lockedWardrobeId: 'beach-kaftan',
      },
    ],
  });
};
/** Every this-many stills, the slot prompt is built again through resolveDaySlotLook. */
const LOOK_CHECK_EVERY = 25;
let lookCheckCount = 0;
let lookChecked = 0;
const LOOK_MISMATCHES: string[] = [];

const LEADS: Record<LeadNoun, { name: string; descriptor: string }> = {
  woman: { name: 'Lana', descriptor: 'a woman with shoulder-length dark hair and green eyes' },
  man: { name: 'Marco', descriptor: 'a tall man with short dark hair and a trimmed beard' },
};
/** The Cast partner: the other gender (SAME_SEX_PARTNERS below for two men / two women). */
const CAST_PARTNERS: Record<LeadNoun, DayPartner> = {
  woman: { name: 'Theo', noun: 'man', descriptor: 'a man with short brown hair and a square jaw' },
  man: { name: 'Mia', noun: 'woman', descriptor: 'a woman with long auburn hair and freckles' },
};
const SAME_SEX_PARTNERS: Record<LeadNoun, DayPartner> = {
  woman: { name: 'Ada', noun: 'woman', descriptor: 'a woman with a black bob and round glasses' },
  man: { name: 'Sam', noun: 'man', descriptor: 'a man with short curly black hair and a navy sweater' },
};
const PARTNER_KIT_LABEL = 'Grey linen suit';

// ── One still, decided as queueSlot decides it ───────────────────────────────────────────

type Still = {
  beat: Beat;
  setup: Setup;
  engine: Engine;
  /** The engine this still renders on (per-still hand-offs). */
  stillModel: string;
  lead: LeadNoun;
  shoesPicked: boolean;
  footwearApplies: boolean;
  /** What is Image 1, the second and the third image. */
  image1: 'face crop' | 'dressed plate' | 'Keep plate' | 'Cast plate';
  second: 'partner face' | 'dressed plate' | 'clothing image' | 'none';
  third: 'pose map' | 'none';
  situation: string;
  adultStill: boolean;
  omitGarment: boolean;
  partner: DayPartner | null;
  figures: number;
  imageCount: number;
  swapLead: boolean;
  recipe: boolean;
  /** The mood the still plays as (an adult mood with Intimate off plays as Everyday). */
  playedMood: string;
  prompt: string;
};

type PosePlan = {
  headcount: number;
  layout: string | null;
  poseKey: string;
  figures: number;
  camera: 'overhead' | 'side' | 'low' | null;
  rawLeadPosition: ReturnType<typeof resolveSceneGuidePlan>['openPose']['leadPosition'];
};

const posePlans = new Map<string, PosePlan>();
function posePlanFor(beat: Beat, playedMood: string, setup: Setup, model: string): PosePlan {
  const intimateMix: DayIntimateMix = setup.companions ? 'mixed' : 'solo';
  const key = `${beat.mood}|${beat.beat}|${playedMood}|${intimateMix}|${setup.companions}|${model}`;
  let plan = posePlans.get(key);
  if (!plan) {
    const slotPlan = planDaySlotPose({
      slot: { id: beat.slotId, sceneHints: beat.beat, location: beat.location },
      dayMood: playedMood,
      intimateMix,
      allowCompanions: setup.companions,
      model,
      retryVariant: 0,
      weakLayouts: weakPoseLayouts(),
    });
    // buildDayPoseGuide → buildSceneGuide (OpenPose style): the pure part.
    const guide = resolveSceneGuidePlan(slotPlan.sceneText, dayPoseGuideFallbackIndex(beat.slotId), {
      ...slotPlan.options,
      openPose: true,
    });
    plan = {
      headcount: slotPlan.headcount,
      layout: poseLayoutFromKey(guide.openPose.poseKey),
      poseKey: guide.openPose.poseKey,
      figures: guide.openPose.keypoints.length,
      rawLeadPosition: guide.openPose.leadPosition,
      camera: guide.openPose.camera,
    };
    posePlans.set(key, plan);
  }
  return plan;
}

const CUE_LAYOUTS = cuePoseLayouts();

function decideStill(
  drawn: Beat,
  setup: Setup,
  engine: Engine,
  lead: LeadNoun,
  shoesPicked: boolean
): Still {
  // The hook fits the beat's furniture to the Setting before anything else (dayStillSceneSlot).
  const sceneHints = dayStillSceneSlot(
    { sceneHints: drawn.beat, location: drawn.location },
    { dayMood: drawn.mood, intimateEnabled: setup.intimate }
  ).sceneHints;
  const beat: Beat = sceneHints && sceneHints !== drawn.beat ? { ...drawn, beat: sceneHints } : drawn;
  const toolMood = beat.mood;
  const intimateMix: DayIntimateMix = setup.companions ? 'mixed' : 'solo';
  // An adult mood with Intimate off plays as Everyday.
  const playedMood = dayPlayedMood(toolMood, setup.intimate);
  const slot: DaySlot = {
    id: beat.slotId,
    label: daySlotDefaultLabel(beat.slotId),
    sceneHints: beat.beat,
    location: beat.location,
    ...(setup.clothing === 'kit-auto' || setup.clothing === 'kit-picked'
      ? { wardrobeId: KIT_ID, wardrobeAuto: setup.clothing === 'kit-auto' }
      : {}),
  };
  const wardrobeId = slot.wardrobeId;
  const packshotUrl = wardrobeId ? PACKSHOT_URL : undefined;
  const customGarmentPicked =
    setup.clothing === 'photo' || setup.clothing === 'photo-unnamed' || setup.clothing === 'packshot';
  const customGarmentFilename =
    setup.clothing === 'photo' || setup.clothing === 'photo-unnamed'
      ? 'my-dress-photo.png'
      : setup.clothing === 'packshot'
        ? 'fitting-garment-packshot-7.png'
        : undefined;
  const customGarmentDescription =
    customGarmentPicked && setup.clothing !== 'photo-unnamed' ? PHOTO_DESCRIPTION : undefined;

  const omitGarment = dayBeatOmitsGarmentPackshot({
    blurb: beat.beat,
    prompt: [beat.location, beat.beat].filter(Boolean).join(' · '),
    // The mood the still plays as (an adult mood with Intimate off is Everyday).
    dayMood: playedMood,
    intimateMix,
  });
  const replaceKeepOutfit = dayMoodReplacesKeepOutfit(toolMood);
  const adultStill = isDayAdultMood(toolMood) && setup.intimate;
  const adultNudeStill = adultStill && omitGarment;
  // Per-still hand-offs, with every engine installed.
  const stillModel = resolveDayStillModel(engine, {
    adultNude: adultNudeStill,
    clothedDuo:
      !adultNudeStill && !adultStill && posePlanFor(beat, playedMood, setup, engine).headcount >= 2,
    installed: () => true,
  });
  const profile = poseProfileForModel(stillModel);

  // Dress plate.
  const pickedShoes = normalizeFootwear(shoesPicked ? SHOES : '');
  let dressPlate = false;
  let dressClothingFilename: string | null = null;
  const dressedPlate =
    setup.plate === 'cast' &&
    setup.dressPlateRenders &&
    dayStillWantsDressPlate({
      castPlateAvailable: true,
      model: stillModel,
      dayMood: toolMood,
      intimateEnabled: setup.intimate,
      plateSource: setup.plate,
      customGarmentPicked,
      kitPicked: setup.clothing === 'kit-picked',
      packshotUrl,
      pickedShoes,
      omitGarment,
      replaceOutfit: replaceKeepOutfit,
      sceneHints: beat.beat,
    })
      ? { filename: 'day-dress-plate-lana-1.png' }
      : null;
  if (dressedPlate) {
    if (profile.dressPlate === 'clothing') dressClothingFilename = dressedPlate.filename;
    else dressPlate = true;
  }
  const slotPlateSource: 'cast' | 'keeper' = dressPlate ? 'keeper' : setup.plate;
  const slotCustomGarmentFilename =
    dressClothingFilename ?? (dressPlate ? undefined : customGarmentFilename);
  const slotPackshotUrl = dressPlate || dressClothingFilename ? undefined : packshotUrl;
  // resolveDayQueueIdentityPlate: the Cast plate when the outfit is dropped or replaced.
  let identitySource: 'cast' | 'keeper' =
    replaceKeepOutfit || omitGarment ? 'cast' : slotPlateSource;

  // OpenPose is the default guide style: the Lightning identity path keeps the pose map. A
  // clothed drawing that contradicts the beat stays out (dayClothedGuideContradictsBeat).
  const skipPoseGuideImage = dayClothedGuideContradictsBeat({
    slot: { id: beat.slotId, sceneHints: beat.beat, location: beat.location },
    dayMood: playedMood,
    intimateMix: setup.companions ? 'mixed' : 'solo',
    allowCompanions: setup.companions,
    model: stillModel,
  });
  // Lightning keeps the full plate as Image 1; the others crop the face (the crop exists).
  const vacationFaceBreak =
    dayStillIdentityRoute({
      dayMood: toolMood,
      model: stillModel,
      sceneHints: beat.beat,
      omitGarment,
      hasCharacter: true,
      hasIdentityPlate: true,
      identitySource,
      clothingOnlyGarment: isClothingOnlyDayGarment(
        resolveDayGarmentReinforce({
          plateSource: slotPlateSource,
          packshotUrl: slotPackshotUrl,
          customGarmentFilename: slotCustomGarmentFilename,
        })
      ),
    }) === 'face-break';
  // Nude stills start from a face crop (a distinct Cast face, or the auto crop).
  const faceOnlyIdentity = omitGarment || vacationFaceBreak;
  const dressedPlateUse = dayStillDressedPlateUse({
    hasDressedPlate: Boolean(dressedPlate),
    omitGarment,
    faceOnlyIdentity,
  });
  if (dressedPlate && dressedPlateUse === 'clothing') {
    dressPlate = false;
    dressClothingFilename = dressedPlate.filename;
  } else if (dressedPlate && dressedPlateUse === 'plate') {
    dressPlate = true;
    identitySource = 'keeper';
    dressClothingFilename = null;
  }
  const byoOrPackGarment = resolveDayGarmentReinforce({
    plateSource: dressPlate ? 'keeper' : dressClothingFilename ? 'cast' : slotPlateSource,
    packshotUrl: dressedPlate ? undefined : slotPackshotUrl,
    customGarmentFilename: dressedPlate
      ? (dressClothingFilename ?? undefined)
      : slotCustomGarmentFilename,
  });

  // Partner.
  const partnerCandidate =
    setup.partner === 'invented'
      ? inventedDayPartner(lead === 'man' ? 'new:woman' : 'new:man')
      : setup.partner === 'cast'
        ? CAST_PARTNERS[lead]
        : setup.partner === 'cast-same'
          ? SAME_SEX_PARTNERS[lead]
          : null;
  let slotPartner: DayPartner | null = null;
  let partnerFace = false;
  if (partnerCandidate) {
    const { headcount } = posePlanFor(beat, playedMood, setup, stillModel);
    if (
      dayPartnerApplies({
        partner: partnerCandidate,
        headcount,
        adultMood: isDayAdultMood(playedMood),
        lead,
        sameSexLayouts: profile.sameSexLayouts,
      })
    ) {
      slotPartner = partnerCandidate;
      // A Cast partner's face crop takes the second image; the invented one here is "a new
      // stranger with their own face" (the stand-in render is not part of this sweep).
      partnerFace = !partnerCandidate.invented;
    }
  }
  const clothingReinforce = dayStillClothingReinforce({
    omitGarment,
    replaceOutfit: replaceKeepOutfit,
    partnerFace,
    faceBreak: vacationFaceBreak,
    garment: byoOrPackGarment,
  });
  const footwearApplies = dayStillFootwearApplies({
    dayMood: toolMood,
    intimateEnabled: setup.intimate,
    sceneHints: beat.beat,
  });
  const footwear = footwearApplies ? pickedShoes : '';
  // Shoes in words (no shoe picture), so the clothing image is the garment's own.
  const garmentReinforce = clothingReinforce;
  const garmentAttached = Boolean(garmentReinforce?.imageUrl || garmentReinforce?.imageFilename);

  // Pose map.
  const pose =
    setup.poseMap && !skipPoseGuideImage ? posePlanFor(beat, playedMood, setup, stillModel) : null;

  // The brief / recipe: the hook's buildSlotPrompt hands the Day state to
  // buildDaySlotPromptForStill, with what this still has attached.
  const character = leadCharacter(lead);
  const displayPlate: DayPlate =
    setup.plate === 'keeper'
      ? { filename: 'lana-outfit-keep.png', source: 'keeper' }
      : { filename: CAST_PLATE_FILENAME, source: 'cast' };
  const slotPrompt = buildDaySlotPromptForStill(
    slot,
    {
      plate: displayPlate,
      queuePlate: resolveDayQueueIdentityPlate({ character, displayPlate }),
      character,
      hasPlate: true,
      leadNoun: lead,
      packshotUrl,
      wardrobeLabel: dayOutfitPromptName(wardrobeId ? KIT_LABEL : ''),
      customGarmentFilename,
      customGarmentDescription,
      dayMood: toolMood,
      intimateEnabled: setup.intimate,
      intimateMix,
      allowCompanions: setup.companions,
      model: engine,
      defaultPoseGuideStyle: DEFAULT_POSE_GUIDE_STYLE,
    },
    {
      poseGuide: Boolean(pose),
      poseGuideStyle: DEFAULT_POSE_GUIDE_STYLE,
      poseLeadPosition: pose?.rawLeadPosition ?? null,
      poseCamera: pose?.camera ?? null,
      faceOnlyIdentity,
      forceGarmentReinforce: (vacationFaceBreak || Boolean(dressClothingFilename)) && garmentAttached,
      clothingImageAttached: garmentAttached,
      partner: slotPartner,
      dressPlate: dressPlate && dressedPlate ? { filename: dressedPlate.filename, source: 'keeper' } : null,
      clothingIsDressedPlate: Boolean(dressClothingFilename),
    }
  );

  lookCheckCount += 1;
  if (lookCheckCount % LOOK_CHECK_EVERY === 0) {
    // Looks per slot: what the hook's buildSlotPrompt hands over, through the slot-look resolver.
    const cast = twoLookCharacter(lead);
    const outfit: DaySlotOutfit = {
      customGarmentImageFilename: customGarmentFilename,
      customGarmentDescription,
    };
    const build = (look: { character: CharacterRecord | null | undefined; outfit: DaySlotOutfit }) =>
      buildDaySlotPromptForStill(
        slot,
        {
          plate: displayPlate,
          queuePlate: resolveDayQueueIdentityPlate({ character: look.character, displayPlate }),
          character: look.character,
          hasPlate: true,
          leadNoun: lead,
          packshotUrl,
          wardrobeLabel: dayOutfitPromptName(wardrobeId ? KIT_LABEL : ''),
          customGarmentFilename: look.outfit.customGarmentImageFilename,
          customGarmentDescription: look.outfit.customGarmentDescription,
          dayMood: toolMood,
          intimateEnabled: setup.intimate,
          intimateMix,
          allowCompanions: setup.companions,
          model: engine,
          defaultPoseGuideStyle: DEFAULT_POSE_GUIDE_STYLE,
        },
        { poseGuide: Boolean(pose), faceOnlyIdentity, partner: slotPartner }
      );
    const before = build({ character: cast, outfit });
    for (const lookId of [undefined, activeLook(cast).id]) {
      const resolved = resolveDaySlotLook({ character: cast, slot: { ...slot, lookId }, outfit });
      lookChecked += 1;
      if (
        resolved.lookId ||
        resolved.plate !== undefined ||
        resolved.character !== cast ||
        resolved.outfit !== outfit ||
        build(resolved) !== before
      ) {
        LOOK_MISMATCHES.push(`${beat.mood} · ${beat.beat} · ${engine} · lookId ${lookId ?? 'unset'}`);
      }
    }
  }

  const assembled = assembleDayStillPrompt({
    slotPrompt,
    beat: beat.beat,
    setting: beat.location,
    dayMood: toolMood,
    adult: adultStill,
    leadNoun: lead,
    leadDescriptor: LEADS[lead].descriptor,
    partner: slotPartner,
    // A Cast partner with a kit of their own.
    partnerOutfit:
      setup.partner === 'cast'
        ? dayOutfitPromptName(formatWardrobeKitLabel(PARTNER_KIT_LABEL)) || null
        : null,
    leadOutfit:
      !omitGarment && !replaceKeepOutfit && wardrobeId
        ? dayOutfitPromptName(formatWardrobeKitLabel(KIT_LABEL))
        : !omitGarment && !replaceKeepOutfit
          ? dayGarmentPromptName(customGarmentDescription)
          : null,
    dressedPlateIsClothingImage: Boolean(dressClothingFilename),
    pickedShoes,
    footwear,
    footwearImage: null,
    pose: pose ? { layout: pose.layout, poseKey: pose.poseKey, figures: pose.figures } : null,
    cueLayouts: CUE_LAYOUTS,
    poseLook: undefined,
    kleinFace: false,
    qualityNudge: undefined,
    sportActionCue: poseProfileForModel(stillModel).sportActionCue,
  });
  // Play / Simple mode and the recipes skip the lint round-trip (actions.finalizePrompt).
  const finalized = finishDayStillPrompt(assembled.prompt, {
    adultMood: isDayAdultMood(playedMood),
    adult: adultStill,
    swapLead: assembled.swapLead,
    leadDescriptor: LEADS[lead].descriptor,
    partnerDescriptor: slotPartner?.descriptor,
    ages: dayStillAgeFacts({
      playedMood,
      leadNoun: lead,
      lead: { descriptor: LEADS[lead].descriptor },
      partner: slotPartner,
      figures: pose?.figures,
    }),
  });
  // extraFilenames: [1] the partner's face, else the clothing image; [2] the pose map.
  const second = partnerFace || garmentAttached;
  const third = Boolean(pose);
  const queued = queuedDayStillPrompt(finalized, { second, third });

  const image1: Still['image1'] = faceOnlyIdentity
    ? 'face crop'
    : dressPlate
      ? 'dressed plate'
      : identitySource === 'keeper'
        ? 'Keep plate'
        : 'Cast plate';
  const secondIs: Still['second'] = partnerFace
    ? 'partner face'
    : !garmentAttached
      ? 'none'
      : dressClothingFilename
        ? 'dressed plate'
        : 'clothing image';
  const thirdIs: Still['third'] = third ? 'pose map' : 'none';
  return {
    beat,
    setup,
    engine,
    stillModel,
    lead,
    shoesPicked,
    footwearApplies,
    image1,
    second: secondIs,
    third: thirdIs,
    situation: `${setup.id}${shoesPicked ? ', shoes' : ''}, ${lead} lead: ${image1} + ${secondIs} + ${thirdIs}`,
    adultStill,
    omitGarment,
    partner: slotPartner,
    figures: pose?.figures ?? 0,
    imageCount: queued.imageCount,
    swapLead: assembled.swapLead,
    recipe: assembled.recipe,
    playedMood,
    prompt: queued.prompt,
  };
}

// ── The sweep ────────────────────────────────────────────────────────────────────────────

const BEATS = collectBeats();
const REDRAWN = new Set<string>();
function sceneRedrawn(beat: Beat, setup: Setup): boolean {
  const context = { dayMood: beat.mood, intimateEnabled: setup.intimate };
  const fitted = dayStillSceneSlot({ sceneHints: beat.beat, location: beat.location }, context);
  return Boolean(
    dayStillSceneRedraw(fitted, {
      ...context,
      pairedScenes: beat.mood !== beat.kind || beat.kind === 'vacation' || beat.kind === 'sport',
    })
  );
}
const STILLS: Still[] = [];
for (const setup of SETUPS) {
  for (const beat of BEATS) {
    if (!setup.beats(beat)) continue;
    // A drawn beat its Setting cannot host even fitted is drawn again at queue time: it never
    // goes out as it is (dayStillSceneRedraw).
    if (sceneRedrawn(beat, setup)) {
      REDRAWN.add(`${beat.mood} · ${beat.beat} · ${beat.location}`);
      continue;
    }
    for (const engine of ENGINES) {
      for (const lead of ['woman', 'man'] as const) {
        for (const shoesPicked of [false, true]) {
          STILLS.push(decideStill(beat, setup, engine, lead, shoesPicked));
        }
      }
    }
  }
}

// ── Failures and the known-issue allow-list ──────────────────────────────────────────────

type Failure = { invariant: string; still: Still; detail: string };

const FAILURES: Failure[] = [];
const fail = (invariant: string, still: Still, detail: string) => {
  FAILURES.push({ invariant, still, detail });
};

function describeFailure({ invariant, still, detail }: Failure): string {
  return `[${invariant}] mood ${still.beat.mood} (${still.beat.pool}) · engine ${still.engine}${still.stillModel === still.engine ? '' : ` → ${still.stillModel}`} · ${still.situation} · beat "${still.beat.beat}" — ${detail}`;
}

const AUDIT_NAME = 'prompt audit';
const OUTFIT_SOURCE_NAME = 'outfit source';

type KnownIssue = {
  id: string;
  invariant: string;
  /** Where the defect is and what it does. */
  why: string;
  matches: (failure: Failure) => boolean;
};

/**
 * KNOWN_ISSUES — genuine app defects this sweep found. Each entry excuses exactly the failures
 * it describes; everything else still fails. Remove the entry with the fix.
 */
const KNOWN_ISSUES: KnownIssue[] = [
];

const hitKnownIssues = new Set<string>();
function unexpected(invariant: string): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const failure of FAILURES) {
    if (failure.invariant !== invariant) continue;
    const known = KNOWN_ISSUES.find(
      issue => issue.invariant === invariant && issue.matches(failure)
    );
    if (known) {
      hitKnownIssues.add(known.id);
      continue;
    }
    const line = describeFailure(failure);
    if (!seen.has(line)) {
      seen.add(line);
      lines.push(line);
    }
  }
  return lines;
}

function assertHolds(invariant: string): void {
  const lines = unexpected(invariant);
  assert.equal(
    lines.length,
    0,
    `${lines.length} failure(s):\n${lines.slice(0, 30).join('\n')}${lines.length > 30 ? '\n…' : ''}`
  );
}

// ── Invariants ───────────────────────────────────────────────────────────────────────────

const AUDIT = AUDIT_NAME;
const PARTNER_LINE = 'partner line';
const FOOTWEAR = 'footwear line';
const OUTFIT_SOURCE = OUTFIT_SOURCE_NAME;
const MAN_LEAD = 'man lead wording';
const NO_POSE_MAP = 'no pose map';
const AGE_LINE = 'adult age line';

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

for (const still of STILLS) {
  const { prompt } = still;

  // I1 — the audit the hook runs before queueing.
  for (const issue of auditStillPrompt(prompt, {
    people: still.figures || undefined,
    imageCount: still.imageCount,
    // As the hook passes it: clothed stills are checked against their Setting.
    setting: still.adultStill ? null : still.beat.location,
  })) {
    fail(AUDIT, still, `${issue.code}: ${issue.message} ("${issue.evidence}")`);
  }

  // I2b — a Cast partner is described as they are: the man-lead rewording once turned a man
  // partner into "a woman … with a ginger beard".
  if (still.partner && !still.partner.invented && still.partner.descriptor) {
    const shown = still.partner.descriptor.slice(0, 40);
    const swapped = /\bman\b/.test(shown) ? shown.replace(/\bman\b/, 'woman') : shown.replace(/\bwoman\b/, 'man');
    if (!prompt.includes(shown) && prompt.includes(swapped)) {
      fail(PARTNER_LINE, still, `the partner's description was reworded: "${swapped}"`);
    }
  }

  // I2 — the partner's line only on a two-person still.
  if (still.figures === 1 && /SECOND PERSON:/.test(prompt)) {
    fail(PARTNER_LINE, still, 'a one-figure still carries the SECOND PERSON line');
  }
  if (!still.partner && /SECOND PERSON: Image 2 is the face/.test(prompt)) {
    fail(PARTNER_LINE, still, 'no partner picked, but the prompt names a partner face image');
  }

  // I3 — shoes: one FOOTWEAR line when they apply and are picked; when not picked, at most one
  // (a clothed still on auto names a pair outdoors — dayAutoFootwear).
  const footwearLines = count(prompt, /FOOTWEAR \(mandatory\):/g);
  const expectedLines = still.shoesPicked && still.footwearApplies ? 1 : 0;
  const autoPair = !still.shoesPicked && footwearLines === 1 && !still.adultStill;
  if (footwearLines !== expectedLines && !autoPair) {
    fail(
      FOOTWEAR,
      still,
      `${footwearLines} FOOTWEAR line(s), expected ${expectedLines} (shoes ${still.shoesPicked ? 'picked' : 'not picked'}, ${still.footwearApplies ? 'apply' : 'do not apply'})`
    );
  }

  // I4 — the outfit comes from the image that carries it.
  if (!still.adultStill || !still.omitGarment) {
    const fromSecond =
      /\b(?:outfit|clothes|clothing|garments?)\s+(?:from|shown in|in|of)\s+(?:the\s+)?(?:second image|Image 2)\b|\bkeep the outfit Image 2\b|\bImage 2 is (?:a|the) clothing|\bImage 2 is a picture of her already dressed|\bsecond image \(the same person, dressed/i.exec(
        prompt
      );
    const clothingInSecond = still.second === 'clothing image' || still.second === 'dressed plate';
    if (fromSecond && !clothingInSecond) {
      const at = fromSecond.index;
      fail(
        OUTFIT_SOURCE,
        still,
        `the second image is ${still.second === 'none' ? (still.third === 'pose map' ? 'the pose map' : 'not attached') : `the ${still.second}`}, but the prompt takes the outfit from it: "…${prompt.slice(Math.max(0, at - 60), at + 90).replace(/\s+/g, ' ')}…"`
      );
    }
  }

  // I5 — a one-figure still of a man lead has no "she / her / woman" left in it.
  // Clothed stills only: the adult solo beats are written for a woman's body, and what a swap
  // should make of them is not a wording question.
  if (
    still.lead === 'man' &&
    still.swapLead &&
    !still.adultStill &&
    still.figures <= 1 &&
    !still.partner
  ) {
    const left = /\b(?:she|her|hers|herself|woman|women|girl)\b/i.exec(prompt);
    if (left) {
      const at = left.index;
      fail(
        MAN_LEAD,
        still,
        `"${left[0]}" left for a man lead: "…${prompt.slice(Math.max(0, at - 50), at + 50).replace(/\s+/g, ' ')}…"`
      );
    }
  }

  // I5b — a man lead in a clothed two-person still is the man: the couple recipe is written
  // for him, and re-wording it turned "A man and his friend" into "A woman and her friend".
  if (still.lead === 'man' && still.figures === 2 && !still.adultStill) {
    const wrong = /\bA woman and (?:her|his) \w+|\bShe wears\b[^.]*;\s*(?:his|her) (?:friend|boyfriend|partner)/.exec(prompt);
    if (wrong) {
      fail(MAN_LEAD, still, `a man lead written as a woman: "${wrong[0]}"`);
    }
  }
  // …and so are his shoes ("on her feet she wears" was left on the couple recipe).
  if (still.lead === 'man' && !still.adultStill && /FOOTWEAR \(mandatory\): on her\b/.test(prompt)) {
    fail(MAN_LEAD, still, 'the shoe line is written for a woman');
  }
  // Two people: the shoe line says whose shoes they are.
  if (still.figures === 2 && /FOOTWEAR \(mandatory\): on (?:his|her) feet\b/.test(prompt)) {
    fail(FOOTWEAR, still, 'a two-person shoe line does not say whose shoes they are');
  }

  // I7 — every Suggestive / Intimate / Raunchy still names everyone's adult age, once, and
  // carries no youth-coded words (adult-age-safeguard.ts). Rapid runs at CFG 1: the negative
  // prompt cannot carry it.
  if (dayMoodNeedsAdultSafeguards(still.playedMood)) {
    if (!hasAdultAgeLine(prompt)) {
      fail(AGE_LINE, still, 'an adult-mood still with no age sentence');
    } else if (count(prompt, /\b(?:Both are|She is|He is|They are|Everyone in the picture is) (?:clearly )?(?:an )?adults?\b/g) !== 1) {
      fail(AGE_LINE, still, 'more than one age sentence');
    }
    const youth = youthWordsIn(prompt);
    if (youth.length > 0) fail(AGE_LINE, still, `youth-coded words left: ${youth.join(', ')}`);
    // On a recipe the age sentence follows the pose sentence — never ahead of it.
    if (still.recipe && /^(?:Explicit (?:sex|solo) photo|Suggestive photo):\s*(?:Both are|She is|He is)\b/m.test(prompt)) {
      fail(AGE_LINE, still, 'the age sentence comes before the pose sentence');
    }
  } else if (hasAdultAgeLine(prompt)) {
    fail(AGE_LINE, still, `a ${still.playedMood} still carries the adult age sentence`);
  }

  // I6 — with no pose map attached, the prompt does not refer to a pose image.
  if (still.third === 'none') {
    const refers = /\b(?:pose map|pose guide|OpenPose|skeleton|stick[- ]figure|wireframe)\b/i.exec(
      prompt
    );
    if (refers) {
      const at = refers.index;
      fail(
        NO_POSE_MAP,
        still,
        `no pose map attached, the prompt says "…${prompt.slice(Math.max(0, at - 40), at + 60).replace(/\s+/g, ' ')}…"`
      );
    }
  }
}

// ── Length statistics (reported, not asserted) ───────────────────────────────────────────

function lengthStats(stills: Still[]): { n: number; median: number; p95: number; max: number } {
  const lengths = stills.map(still => still.prompt.length).sort((a, b) => a - b);
  const at = (q: number) => lengths[Math.min(lengths.length - 1, Math.floor(q * lengths.length))]!;
  return { n: lengths.length, median: at(0.5), p95: at(0.95), max: lengths[lengths.length - 1]! };
}

if (process.env.DAY_FINISHED_SWEEP_STATS) {
  const rows: Record<string, ReturnType<typeof lengthStats>> = {};
  for (const engine of ENGINES) {
    rows[engine] = lengthStats(STILLS.filter(still => still.engine === engine));
    for (const setup of SETUPS) {
      const stills = STILLS.filter(still => still.engine === engine && still.setup === setup);
      if (stills.length) rows[`${engine} · ${setup.id}`] = lengthStats(stills);
    }
  }
  console.table(rows);
  const shapes: Record<string, number> = {};
  for (const still of STILLS) {
    const shape = `${still.image1} + ${still.second} + ${still.third}${still.partner ? (still.partner.invented ? ' (invented partner)' : ' (Cast partner)') : ''}${still.adultStill ? ' (adult)' : ''}`;
    shapes[shape] = (shapes[shape] ?? 0) + 1;
  }
  console.table(shapes);
  console.log({ beats: BEATS.length, stills: STILLS.length, recipes: STILLS.filter(s => s.recipe).length });
  const byInvariant: Record<string, number> = {};
  for (const failure of FAILURES) byInvariant[failure.invariant] = (byInvariant[failure.invariant] ?? 0) + 1;
  console.table(byInvariant);
}

// ── Tests ────────────────────────────────────────────────────────────────────────────────

describe('Day finished prompt sweep', () => {
  it('covers every mood, engine and image arrangement', () => {
    assert.deepEqual(ENGINES.map(poseModelFamily), ['rapid-aio', 'qwen-edit-2511', 'qwen-image-2.1']);
    for (const kind of ['everyday', 'suggestive', 'vacation', 'sport', 'intimate', 'raunchy']) {
      assert.ok(BEATS.filter(beat => beat.kind === kind).length >= 20, `${kind} beats`);
    }
    const has = (test: (still: Still) => boolean, what: string) =>
      assert.ok(STILLS.some(test), `no still with ${what}`);
    // a–h.
    has(s => s.image1 === 'Cast plate' && s.second === 'clothing image' && s.third === 'pose map', 'a');
    has(s => s.image1 === 'face crop' && s.second === 'clothing image' && s.third === 'pose map', 'b');
    has(s => s.image1 === 'dressed plate' && s.second === 'none' && s.imageCount === 2, 'c');
    has(s => s.image1 === 'face crop' && s.second === 'dressed plate', 'd');
    has(s => s.image1 === 'Keep plate' && s.second === 'none', 'e');
    has(s => s.second === 'partner face' && s.figures === 2, 'f (Cast partner)');
    has(s => Boolean(s.partner?.invented) && s.second !== 'partner face' && s.figures === 2, 'f (invented)');
    has(s => s.third === 'none', 'g');
    has(s => s.adultStill && s.omitGarment && s.figures === 1, 'h (solo)');
    has(s => s.adultStill && s.omitGarment && s.figures === 2, 'h (duo)');
    has(s => s.lead === 'man' && s.swapLead, 'a swapped man lead');
    has(s => s.shoesPicked && s.footwearApplies, 'shoes ordered');
    has(s => s.shoesPicked && !s.footwearApplies, 'shoes ruled out');
    has(s => s.stillModel !== s.engine, 'a per-still engine hand-off');
  });

  it('passes the queue-time prompt audit', () => assertHolds(AUDIT));
  it('names a partner only on a two-person still with one', () => assertHolds(PARTNER_LINE));
  it('orders shoes exactly once where they apply, and never where they do not', () =>
    assertHolds(FOOTWEAR));
  it('takes the outfit from the image that carries it', () => assertHolds(OUTFIT_SOURCE));
  it('leaves no "she" in a one-person still of a man lead', () => assertHolds(MAN_LEAD));
  it('does not refer to a pose image that is not attached', () => assertHolds(NO_POSE_MAP));
  it('names every adult-mood still\'s ages once, after the pose sentence', () =>
    assertHolds(AGE_LINE));

  it('builds byte-identical prompts for slots with no look of their own (or the active one)', () => {
    assert.ok(lookChecked > 100, `only ${lookChecked} look checks ran`);
    assert.deepEqual(LOOK_MISMATCHES.slice(0, 5), []);
  });

  it('has no stale KNOWN_ISSUES entry', () => {
    for (const invariant of new Set(KNOWN_ISSUES.map(issue => issue.invariant))) {
      unexpected(invariant);
    }
    assert.deepEqual(
      KNOWN_ISSUES.filter(issue => !hitKnownIssues.has(issue.id)).map(issue => issue.id),
      [],
      'fixed — delete these KNOWN_ISSUES entries'
    );
  });
});
