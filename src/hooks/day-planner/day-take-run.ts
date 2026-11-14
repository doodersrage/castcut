'use client';

import { loadLocations, shotPlacePhoto } from '@/lib/location/records';

import {
  castPlacePhotoFor,
  withPlacePhotoInAdultPrompt,
  withPlacePhotoInLongAdultBrief,
  withPlacePhotoInPrompt,
  withRoomPhotoAsImage2,
} from '@/lib/cast/places';

import { partnerOutfitWords } from '@/lib/day/partner-outfit';
import { castMarksLine } from '@/lib/cast/marks';
import { recordCastOutfitWorn } from '@/lib/cast/wardrobe';
import { castPropsLine } from '@/lib/cast/props';

import {
  type DayStillSlotOptions,
  assembleDayStillPrompt,
  dayStillCamera,
  dayBeatIsTyped,
  dayStillAgeFacts,
  dayStillSceneRedraw,
  dayStillSceneSlot,
  finishDayStillPrompt,
  queuedDayStillPrompt,
  withDuoLeadBodyLine,
  withDuoPartnerBodyLine,
  withNudeDuoLeadBodyLine,
  withNudeBodyPlateLine,
} from '@/lib/day/still-prompt';
import { isFaceDownNudeSolo } from '@/lib/pose/face-down-solo';
import { dayMoodNeedsAdultSafeguards } from '@/lib/adult/adult-appearance-gate';
import { isAdultContentPrompt } from '@/lib/adult/adult-age-safeguard';
import {
  repairStillPrompt,
  stillPromptCheckRecord,
  stillPromptIssuesLine,
} from '@/lib/still/prompt-audit';

import { fetchComfyObjectInfoNodeTypesCached } from '@/lib/comfyui/object-info-cache';
import { poseModelFamily, poseProfileForModel } from '@/lib/pose/pose-model-profile';

import { activeDayEvent } from '@/lib/day/event';

import { usePromptResultActions } from '@/hooks/usePromptResultActions';

import {
  activeLook,
  castLoraSessionIds,
  characterHomeHref,
  looksOf,
  getCharacter,
} from '@/lib/character/os';

import { fetchClothingSelectOptions } from '@/lib/wardrobe/clothing-catalog-client';

import { loadComfyGallery } from '@/lib/gallery/comfyui-gallery';
import { clothedOnlyHandOffNote, resolveAdultNudePlateQueueModel } from '@/lib/queue/tool-model';

import {
  STORY_INTIMATE_POSE_IDENTITY_LOCK_CAP,
  resolveRoleplaySetting,
} from '@/lib/story/roleplay';
import {
  dayMoodReplacesKeepOutfit,
  dayStillsCachePatch,
  diversifyDaySlotScenes,
  ensureDaySlotsMatchMood,
  isDayAdultMood,
  isDayHeatMood,
  normalizeDayIntimateMix,
  normalizeDayMood,
  upsertDaySlotStill,
  clearDaySlotLine,
  dayStillShownImage,
  type DaySlotStill,
  DAY_EVERYDAY_POSE_IDENTITY_LOCK_CAP,
  DAY_EVERYDAY_POSE_DENOISE,
  DAY_PLATE_IDENTITY_LOCK_CAP,
  isDayPoseStickyEditModel,
  DAY_VACATION_POSE_IDENTITY_LOCK_CAP,
  DAY_VACATION_FACE_BREAK_IDENTITY_LOCK_CAP,
  DAY_VACATION_UPRIGHT_FACE_IDENTITY_LOCK_CAP,
  DAY_VACATION_POSE_DENOISE,
  DAY_VACATION_UPRIGHT_FACE_DENOISE,
  DAY_ADULT_DUO_IDENTITY_LOCK_CAP,
  DAY_ADULT_SOLO_NUDE_IDENTITY_LOCK_CAP,
  type DaySlot,
  type DaySlotId,
} from '@/lib/day/planner';
import {
  castFaceDuplicatesBodyPlate,
  dayLeadBodyPlate,
  isClothingOnlyDayGarment,
  resolveDayCastPlate,
  resolveDayFaceOnlyPlate,
  resolveDayGarmentReinforce,
  resolveDayPlate,
  resolveDayQueueIdentityPlate,
} from '@/lib/day/plate';
import { resolveDayNudeIdentityPlateWithFaceCrop } from '@/lib/day/nude-face-crop';
import { withThirdPerson, type DayThirdPerson } from '@/lib/day/group';
import { comfyInputViewUrl } from '@/lib/face/match-client';
import { checkStillReferences } from '@/lib/checks/reference-check-client';

import { postTakeShadow } from '@/lib/day/run-bundle-client';
import { resolveTakeGroupFaces } from '@/lib/day/take-group';
import { resolveTakePartnerFace, sendTakePartnerFace } from '@/lib/day/take-partner-face';
import { planTakeOutfit, planTakePartner, planTakePoseGuide } from '@/lib/day/take-plan';
import {
  resolveDayVacationFaceBreakPlate,
  resolveDayVacationIdentityVlPlate,
  uploadDayIdentityLatentPlate,
} from '@/lib/day/vacation-face-crop';
import { dayVacationPoseNeedsBodyUnlock, clothedHeatUnlockPoseClass } from '@/lib/day/vacation';
import { buildDayPoseGuide } from '@/lib/day/pose-guide';
import { customPoseWords } from '@/lib/pose/describe';
import { bestOfTwoAsOneJob } from '@/lib/day/best-of-two';
import { dayTwoTakesApplies } from '@/lib/day/two-takes';
import { castcutBestOfTwoAvailable, castcutGuideJson } from '@/lib/castcut/nodes';
import {
  daySlotPoseLayout,
  daySlotPoseOverride,
  pickedStillCamera,
  planDaySlotPose,
  plannedDaySlotPoseKey,
} from '@/lib/day/slot-pose';
import { notePoseTakeQueued, takeKeptSeed } from '@/lib/pose/outcome-stats';

import { probeImageUrlDimensions } from '@/lib/storage/browser-image-dimensions';

import { dayThemeOf } from '@/lib/day/themes';

import { dayGarmentPromptName, dayOutfitPromptName } from '@/lib/day/clothed-lead';
import { footwearIsBarefoot, normalizeFootwear } from '@/lib/wardrobe/footwear';
import {
  buildFootwearReferenceImage,
  footwearImageSuitsModel,
  hasFootwearImage,
} from '@/lib/wardrobe/footwear-image';
import { formatWardrobeKitLabel } from '@/lib/wardrobe/kit-picker';
import type { DayPartnerStandIn } from '@/lib/day/partner-stand-in';
import { type DayPartner } from '@/lib/day/partner';
import { loadPoseLibrary, type NormalizedBody } from '@/lib/pose/library';
import { isOpenPoseStyle } from '@/lib/pose/guide-prompt';
import type { PoseLeadPosition } from '@/lib/pose/guide-openpose';
import type { PoseGuideStylePreference } from '@/lib/pose/guide-prompt';
import { loadPoseGuideStylePreference } from '@/lib/engine/render-realism-settings';
import { readsPoseGuideImage } from '@/lib/model/denoise-defaults';
import { shouldAppendKleinFaceReference } from '@/lib/engine/klein-face-reference';
import {
  poseGuideFailureReason,
  recordPoseGuideOutcome,
  type PoseGuideOutcome,
} from '@/lib/pose/guide-status';

import {
  collectIsolateSourceUrls,
  ISOLATE_QUEUE_BLOCKED_MESSAGE,
} from '@/lib/edit/isolate-subject';
import { IDENTITY_MEDIA_URL } from '@/lib/gallery/media-client';
import { resolveQueueInputImage } from '@/lib/queue/input-image';
import { DRESS_PLATE_SHOE_PASS_STATUS, dayDressPlateStatus } from '@/lib/day/dress-plate';

import { dayIdentityPrefersCastPlate, dayKeepOutfitStale } from '@/lib/day/dress-plate';
import {
  DAY_OUTFIT_LINE_RE,
  dayStillClothingReinforce,
  dayStillSceneDressesItself,
  dayStillDressedPlateUse,
  dayStillFaceCropCanvas,
  DAY_WIDE_CANVAS,
  dayStillFootwearApplies,
  dayStillIdentityRoute,
  dayStillLiesDown,
  dayStillWantsDressPlate,
} from '@/lib/day/still-plan';
import type { DayPlate } from '@/lib/day/plate';
import { pushSystemTrayMessage } from '@/lib/app/system-tray-messages';
import { pushAppToast, shortErrorText } from '@/lib/app/toast';
import { NO_FACE_ON_PLATE_MESSAGE } from '@/lib/face/locate';

import {
  loadWardrobeGarmentThumbManifest,
  resolveWardrobeGarmentThumbQueueUrl,
} from '@/lib/wardrobe/garment-thumbs';
import { loadComfyUiSettings } from '@/lib/comfyui/settings';

import { castFaceQueueParamsBase, syncSharedIdentityToCast } from '@/lib/look/outfit-plate';

import {
  cuePoseLayouts,
  poseLayoutFromKey,
  recordPlayerSlotRender,
  rerollBeatKey,
  weakPoseLayouts,
} from '@/lib/play/metrics';

import { rememberDraftFields } from '@/lib/app/remember-draft-fields';

import { stillsAreWide, type SceneToolCache } from '@/lib/play/settings';
import { sceneScriptPartners } from '@/lib/day/scenes';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { CharacterRecord } from '@/lib/character/os';
import type { DayPartnerNoun } from '@/lib/day/partner';
import type { DaySlotOutfit } from '@/lib/day/slot-look';
import type { TakeModelPlan } from '@/lib/day/take-plan';
import type { DayToolCache } from '@/lib/play/settings';
import type { SharedToolSettings } from '@/lib/settings/cache';

/**
 * A Day / Scene take, queued (FINISHING_PLAN Phase 3: the take built off the page). The body of
 * the page's queueSlot, as a function of what it reads from the page (`DayTakeContext`): the page
 * passes its settings, refs, setters and helpers; the server will pass its own. Step one of
 * moving it to lib/day — the page-only parts of the context are lifted out next.
 */

const TOOL_ID = 'day' as const;

export type ClothingOption = { value: string; label: string; group?: string };

export type DayPoseGuideExpectation = {
  keypoints: NormalizedBody[];
  /** Guide canvas width / height. */
  aspect: number;
  style: PoseGuideStylePreference;
  poseKey: string;
  /** The prompt also spelled the pose out in words (logged separately in Play metrics). */
  cued?: boolean;
  /** The slot's beat as queued — the gesture check's questions come from it (pose-gesture.ts). */
  beat?: string;
  /**
   * A words-only ground-sit redo: its pose words. Queued without this guide (the map sat her on
   * the ground) and judged against it posture first (ground-sit-redo.ts judgeWordsOnlyRedo).
   */
  wordsOnly?: string;
};

/**
 * The face crop fell back to the top of the plate: no face was found on it (lying down, turned
 * away). Said once per queue (the tray replaces the same notice), with the Cast home where
 * Prepare plate lives.
 */
function warnNoFaceOnPlate(character: { id: string } | null | undefined): void {
  pushSystemTrayMessage({
    text: NO_FACE_ON_PLATE_MESSAGE,
    tone: 'warning',
    ttlMs: 30_000,
    ...(character?.id ? { href: characterHomeHref(character.id) } : {}),
  });
}

const image1SizeCache = new Map<string, { width: number; height: number } | null>();

async function probeImage1Size(
  url: string | undefined
): Promise<{ width: number; height: number } | null> {
  const key = url?.trim();
  if (!key) return null;
  if (!image1SizeCache.has(key)) {
    image1SizeCache.set(key, await probeImageUrlDimensions(key).catch(() => null));
  }
  return image1SizeCache.get(key) ?? null;
}

export type DayTakeOptions = {
  manageBusy?: boolean;
  qualityProfile?: 'draft' | 'final' | 'max';
  /** Redo with the current take's seed, keeping that take to compare (and restore). */
  sameSeed?: boolean;
  /**
   * Best of two for hard poses: a new seed, with the current take kept beside it as the
   * other take of the pair (day-best-of-two.ts).
   */
  keepTake?: DaySlotStill['previousTake'];
  /**
   * The player said the last take looked wrong (⋯ → Looks wrong): a new seed (never a
   * remembered one), and the card notes why it was redone.
   */
  looksWrong?: boolean;
  /**
   * The adult-appearance gate withheld the last take: this one says the ages more
   * strongly (adult-age-safeguard.ts), and a second withheld take stops there.
   */
  strongAgeLine?: boolean;
  /**
   * The gate saw bare skin on a clothed-mood (Suggestive) still: this one leads with the
   * strong coverage line (clothed-coverage.ts), and a second such take is withheld.
   */
  coverageLine?: boolean;
  /** Queued by the player (board, slot sheet, retry) — counted in the re-roll record. */
  byPlayer?: boolean;
};

export type DayTakeContext = {
  toolSettings: DayToolCache;
  shared: SharedToolSettings;
  sceneCacheRef: RefObject<
    Pick<SceneToolCache, 'scenes' | 'activeSceneId' | 'scriptPartners' | 'run'>
  >;
  /** The queue's three steps the take uses (the server: its own sendComfyUi). */
  actions: Pick<
    ReturnType<typeof usePromptResultActions>,
    'sendComfyUi' | 'finalizePrompt' | 'resetStatuses'
  >;
  wardrobeLabelFor: (wardrobeId?: string) => string;
  stillsRef: RefObject<DaySlotStill[]>;
  latestSlotsRef: RefObject<DaySlot[]>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  sceneMode: boolean;
  intimateEnabled: boolean;
  updateToolSettings: (partial: Parameters<(partial: Partial<DayToolCache>) => void>[0]) => void;
  storeToolSettings: (partial: Partial<DayToolCache>) => void;
  setDressPlateStatus: Dispatch<SetStateAction<{ text: string; busy: boolean } | null>>;
  partnerStandInRef: RefObject<DayPartnerStandIn | null>;
  leadNoun: DayPartnerNoun;
  character: CharacterRecord | undefined;
  wardrobeOptions: ClothingOption[];
  slots: DaySlot[];
  setError: Dispatch<SetStateAction<string | null>>;
  scriptLineStays: () => boolean;
  wordsOnlyRedoRef: RefObject<
    Partial<Record<DaySlotId, { words: string; expectation: DayPoseGuideExpectation }>>
  >;
  sharedRef: RefObject<SharedToolSettings>;
  rerollNudgeRef: RefObject<Partial<Record<DaySlotId, string>>>;
  poseGuideExpectRef: RefObject<Partial<Record<DaySlotId, DayPoseGuideExpectation>>>;
  lastPlayerBeatRef: RefObject<Record<string, string>>;
  buildSlotPrompt: (slot: DaySlot, options?: DayStillSlotOptions) => string;
  setPoseGuideOutcomes: Dispatch<SetStateAction<PoseGuideOutcome[]>>;
  setOutput: Dispatch<SetStateAction<string>>;
  setCopied: Dispatch<SetStateAction<boolean>>;
  setActiveSlotId: Dispatch<SetStateAction<DaySlotId>>;
  scriptSceneRoom: (slot: DaySlot) => Promise<string | null>;
  resolveSlotStillModel: (queueTarget: DaySlot) => Promise<TakeModelPlan>;
  resolveSlotLook: (slot: Pick<DaySlot, 'lookId'>) => {
    plate: DayPlate | null;
    hasPlate: boolean;
    queuePlate: DayPlate | null;
    lookId?: string;
    character: CharacterRecord | null | undefined;
    outfit: DaySlotOutfit;
  };
  queuePlaceShot: (slot: DaySlot) => Promise<string | null>;
  queueEventMoment: (slot: DaySlot, previous: DaySlot) => Promise<string | null>;
  poseVariantRef: RefObject<Partial<Record<DaySlotId, number>>>;
  leanChrome: boolean;
  isolateSubject: boolean;
  isolatePending: boolean;
  clothingGender: 'women' | 'men' | 'any';
};

export async function runDayTake(
  ctx: DayTakeContext,
  slot: DaySlot,
  options?: DayTakeOptions
): Promise<void> {
  const {
    toolSettings,
    shared,
    sceneCacheRef,
    actions,
    wardrobeLabelFor,
    stillsRef,
    latestSlotsRef,
    setBusy,
    sceneMode,
    intimateEnabled,
    updateToolSettings,
    storeToolSettings,
    setDressPlateStatus,
    partnerStandInRef,
    leadNoun,
    character,
    wardrobeOptions,
    slots,
    setError,
    scriptLineStays,
    wordsOnlyRedoRef,
    sharedRef,
    rerollNudgeRef,
    poseGuideExpectRef,
    lastPlayerBeatRef,
    buildSlotPrompt,
    setPoseGuideOutcomes,
    setOutput,
    setCopied,
    setActiveSlotId,
    scriptSceneRoom,
    resolveSlotStillModel,
    resolveSlotLook,
    queuePlaceShot,
    queueEventMoment,
    poseVariantRef,
    leanChrome,
    isolateSubject,
    isolatePending,
    clothingGender,
  } = ctx;
  const manageBusy = options?.manageBusy !== false;
  // One event, moment 2 on: an edit of the moment before, not a Day still of its own.
  const dayEvent = activeDayEvent(toolSettings.dayEvent, slots);
  const momentIndex = dayEvent ? slots.findIndex(entry => entry.id === slot.id) : -1;
  if (dayEvent && momentIndex > 0) {
    if (manageBusy) setBusy(true);
    try {
      await queueEventMoment(slot, slots[momentIndex - 1]!);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not queue that moment.');
    } finally {
      if (manageBusy) setBusy(false);
    }
    return;
  }
  if (slot.placeOnly) {
    if (manageBusy) setBusy(true);
    try {
      await queuePlaceShot(slot);
    } finally {
      if (manageBusy) setBusy(false);
    }
    return;
  }
  if (options?.byPlayer) {
    // The same beat again on this slot is a re-roll (play-metrics): layouts kept re-rolled
    // get best of two, beats kept re-rolled are skipped by Suggest day.
    const beatKey = rerollBeatKey(slot.sceneHints);
    // The slot's last take records its beat (survives a reload); this session's ref covers a
    // take still being queued.
    const lastBeat =
      lastPlayerBeatRef.current[slot.id] ??
      stillsRef.current.find(still => still.slotId === slot.id)?.beatKey;
    const rerolled = Boolean(beatKey) && lastBeat === beatKey;
    lastPlayerBeatRef.current[slot.id] = beatKey;
    try {
      recordPlayerSlotRender({
        layout: daySlotPoseLayout({
          slot,
          dayMood: normalizeDayMood(toolSettings.dayMood),
          intimateMix: toolSettings.intimateMix,
          allowCompanions: toolSettings.allowCompanions === true,
          model: shared.model,
        }).layout,
        beat: slot.sceneHints,
        rerolled,
      });
    } catch {
      // A record that can't be written never blocks the render.
    }
  }
  if (manageBusy) {
    setBusy(true);
  }
  setError(null);
  setCopied(false);
  setActiveSlotId(slot.id);
  actions.resetStatuses();
  // Reference checks (reference-check.ts): a picture that is not what its slot expects is
  // never sent silently — the safe path is taken where there is one, and the card says so.
  const referenceNotes: string[] = [];
  /** The face picture sent as a Cast partner on this still (the partner tile shows it). */
  let partnerSentFace: { partnerId: string; filename: string } | null = null;
  try {
    if (isolateSubject && isolatePending) {
      throw new Error(ISOLATE_QUEUE_BLOCKED_MESSAGE);
    }
    // Fill blank Setting/Beat so a single Queue doesn't fall back to a generic time-of-day line.
    // Adult Solo/Duo: also replace stale everyday notebook/bookstore beats left from prior mood.
    // From the latest slots, not this render's: Queue day runs every slot through one
    // callback, and writing its `slots` back would undo what the slots before it saved (a
    // new still's cleared line came back on the card).
    const saveSlots = (next: DaySlot[]) => {
      latestSlotsRef.current = next;
      updateToolSettings({ slots: next });
    };
    let workingSlots = latestSlotsRef.current;
    const moodAligned = ensureDaySlotsMatchMood(workingSlots, {
      dayMood: toolSettings.dayMood,
      intimateMix: toolSettings.intimateMix,
      allowCompanions: toolSettings.allowCompanions === true,
      // A scene's Setting is the player's: a blank beat is filled under it, never rerolled.
      keepSettings: sceneMode,
    });
    if (moodAligned.changed) {
      workingSlots = moodAligned.slots;
      saveSlots(moodAligned.slots);
    }
    let queueTarget = workingSlots.find(entry => entry.id === slot.id) ?? slot;
    const needsScene = !queueTarget.location?.trim() || !queueTarget.sceneHints?.trim();
    if (needsScene) {
      const diversified = diversifyDaySlotScenes(
        workingSlots.map(entry => (entry.id === queueTarget.id ? queueTarget : entry)),
        {
          allowCompanions: toolSettings.allowCompanions === true,
          dayMood: toolSettings.dayMood,
          intimateMix: toolSettings.intimateMix,
        }
      );
      if (diversified.changed) {
        workingSlots = diversified.slots;
        saveSlots(diversified.slots);
        queueTarget = diversified.slots.find(entry => entry.id === queueTarget.id) ?? queueTarget;
      }
    }
    // The beat's furniture fitted to the Setting for this still (a sofa beat on a plaza sits
    // on the fountain's edge); the slot keeps the beat as it is. A drawn beat the place still
    // cannot host (cooking at the stove on a street) is drawn again, like a blank one.
    const sceneContext = {
      dayMood: toolSettings.dayMood,
      intimateEnabled,
      lockedLocation: shared.lockedLocation,
    };
    queueTarget = dayStillSceneSlot(queueTarget, sceneContext);
    const redraw = dayStillSceneRedraw(queueTarget, {
      ...sceneContext,
      // A scene's Setting is the player's: only its beat is drawn again.
      pairedScenes:
        !sceneMode &&
        (Boolean(dayThemeOf(toolSettings.dayMood)) ||
          normalizeDayMood(toolSettings.dayMood) === 'vacation' ||
          normalizeDayMood(toolSettings.dayMood) === 'sport'),
    });
    if (redraw) {
      const redrawn = diversifyDaySlotScenes(
        workingSlots.map(entry => (entry.id === queueTarget.id ? { ...entry, ...redraw } : entry)),
        {
          allowCompanions: toolSettings.allowCompanions === true,
          dayMood: toolSettings.dayMood,
          intimateMix: toolSettings.intimateMix,
        }
      );
      const next = redrawn.slots.find(entry => entry.id === queueTarget.id);
      if (next?.sceneHints?.trim()) {
        workingSlots = redrawn.slots;
        saveSlots(redrawn.slots);
        queueTarget = dayStillSceneSlot(next, sceneContext);
      }
    }
    // The look this still is made in (day-slot-look.ts): the slot's own look, else the active
    // one. From here on the Cast, its plates and the outfit are that look's; the active look
    // itself is not changed.
    const slotLook = resolveSlotLook(queueTarget);
    const {
      character: lookCharacter,
      plate: lookPlate,
      hasPlate: lookHasPlate,
      queuePlate: lookQueuePlate,
      outfit,
    } = slotLook;
    await loadWardrobeGarmentThumbManifest();
    // The catalog as this page has it — or, queued before the page's own load came back,
    // fetched here (the same cached request): a take sent in the first seconds went with no
    // kit picked, in the plate's underwear (found by the take golden test, 2026-11-13).
    const catalog = wardrobeOptions.some(option => option.value)
      ? wardrobeOptions
      : await fetchClothingSelectOptions('wardrobeCatalog', clothingGender).catch(
          () => wardrobeOptions
        );
    // The outfit, decided in the take's plan (take-plan.ts — the server makes it the same way).
    // What the outfit choice started from (a run's shadow report sends it).
    const outfitInput = {
      target: queueTarget,
      workingSlots,
      latestSlots: latestSlotsRef.current,
    };
    const outfitPlan = planTakeOutfit({
      target: queueTarget,
      lockedWardrobeId: outfit.lockedWardrobeId,
      catalog,
      lookHasPlate,
      plateSource: lookPlate?.source,
      customGarment: Boolean(
        outfit.customGarmentImageUrl?.trim() || outfit.customGarmentImageFilename?.trim()
      ),
      dayMood: toolSettings.dayMood,
      scene: sceneMode
        ? {
            scenes: sceneCacheRef.current.scenes ?? [],
            activeSceneId: sceneCacheRef.current.activeSceneId,
          }
        : undefined,
      workingSlots,
      latestSlots: latestSlotsRef.current,
      salt: lookCharacter?.id,
      hasPackshot: id => Boolean(resolveWardrobeGarmentThumbQueueUrl(id)),
    });
    const wardrobeId = outfitPlan.wardrobeId;
    queueTarget = outfitPlan.target;
    const { picked } = outfitPlan;
    if (picked) {
      workingSlots = workingSlots.map(entry =>
        entry.id === queueTarget.id ? { ...entry, wardrobeId: picked, wardrobeAuto: true } : entry
      );
      saveSlots(
        latestSlotsRef.current.map(entry =>
          entry.id === queueTarget.id ? { ...entry, wardrobeId: picked, wardrobeAuto: true } : entry
        )
      );
    }
    const packshotUrl = resolveWardrobeGarmentThumbQueueUrl(wardrobeId);
    const { omitGarment, stillModel, queueModel, poseEngineSwap, pinNote } =
      await resolveSlotStillModel(queueTarget);
    const replaceKeepOutfit = dayMoodReplacesKeepOutfit(toolSettings.dayMood);
    // Dress plate: dress her once (the picked clothing and shoes on the Cast plate), then
    // start this still from that plate — no clothing image, the outfit is on Image 1.
    let dressPlate: DayPlate | null = null;
    // Face-crop engines (Rapid AIO): the dressed plate rides in the clothing image's place.
    let dressClothingFilename: string | null = null;
    // The dressed plate itself, whichever way this still ends up using it (decided below,
    // once it is known whether Image 1 is a face crop or the full plate).
    let dressedPlate: DayPlate | null = null;
    const customGarmentPicked = Boolean(
      outfit.customGarmentImageUrl?.trim() || outfit.customGarmentImageFilename?.trim()
    );
    const pickedShoes = normalizeFootwear(outfit.footwear);
    // A Keep kept in another outfit than the one picked now: dress the Cast plate instead.
    const keepLook = lookCharacter
      ? (looksOf(lookCharacter).find(look => look.id === slotLook.lookId) ??
        activeLook(lookCharacter))
      : null;
    const keepStale =
      lookPlate?.source === 'keeper' &&
      dayKeepOutfitStale(keepLook?.keptOutfit, {
        customGarmentImageUrl: outfit.customGarmentImageUrl,
        customGarmentImageFilename: outfit.customGarmentImageFilename,
        kitId:
          (queueTarget.wardrobeAuto !== true ? queueTarget.wardrobeId : undefined) ||
          outfit.lockedWardrobeId,
        footwear: pickedShoes,
      });
    const castPlate =
      lookPlate?.source === 'cast' || keepStale
        ? resolveDayQueueIdentityPlate({
            character: lookCharacter,
            displayPlate: lookPlate,
            preferCastPlate: true,
          })
        : null;
    if (
      lookHasPlate &&
      castPlate &&
      dayStillWantsDressPlate({
        castPlateAvailable: Boolean(castPlate.filename?.trim() || castPlate.imageUrl?.trim()),
        model: stillModel,
        dayMood: toolSettings.dayMood,
        intimateEnabled,
        plateSource: keepStale ? 'cast' : lookPlate?.source,
        customGarmentPicked,
        kitPicked:
          Boolean(queueTarget.wardrobeId?.trim() && queueTarget.wardrobeAuto !== true) ||
          Boolean(outfit.lockedWardrobeId?.trim()),
        packshotUrl,
        pickedShoes,
        omitGarment,
        replaceOutfit: replaceKeepOutfit,
        sceneHints: queueTarget.sceneHints,
      })
    ) {
      const clothing = customGarmentPicked
        ? {
            imageUrl: outfit.customGarmentImageUrl?.trim() || undefined,
            imageFilename: outfit.customGarmentImageFilename?.trim() || undefined,
          }
        : { imageUrl: packshotUrl ?? undefined };
      const hasShoes = Boolean(pickedShoes) && !footwearIsBarefoot(pickedShoes);
      try {
        const { ensureDayDressPlate } = await import('@/lib/day/dress-plate-client');
        const { entry } = await ensureDayDressPlate(
          {
            model: stillModel,
            plate: { filename: castPlate.filename, imageUrl: castPlate.imageUrl },
            clothing,
            clothingKey: customGarmentPicked ? undefined : `kit:${wardrobeId ?? ''}`,
            clothingLabel: customGarmentPicked
              ? dayGarmentPromptName(outfit.customGarmentDescription) || 'the outfit'
              : dayOutfitPromptName(wardrobeLabelFor(wardrobeId)) || 'the outfit',
            clothingDescription: customGarmentPicked ? outfit.customGarmentDescription : undefined,
            footwear: pickedShoes,
            footwearImage: {
              imageUrl: outfit.footwearImageUrl,
              imageFilename: outfit.footwearImageFilename,
            },
            subject: leadNoun === 'man' ? 'he' : 'she',
            characterName: lookCharacter?.name,
            characterId: shared.activeCharacterId,
            lookId: slotLook.lookId ?? shared.activeLookId ?? character?.activeLookId,
          },
          {
            sendComfyUi: actions.sendComfyUi,
            // Shoes picked: the plate's feet are checked and fixed once (footwear-check.ts).
            visionShared: sharedRef.current,
            onShoePass: () => {
              setDressPlateStatus({ text: DRESS_PLATE_SHOE_PASS_STATUS, busy: true });
              pushSystemTrayMessage({ text: DRESS_PLATE_SHOE_PASS_STATUS, tone: 'info' });
            },
            onRender: ({ change }) => {
              const text = dayDressPlateStatus({
                name: lookCharacter?.name,
                clothing: true,
                footwear: hasShoes,
                change,
              });
              setDressPlateStatus({ text, busy: true });
              pushSystemTrayMessage({ text, tone: 'info' });
            },
          }
        );
        dressedPlate = {
          filename: entry.filename,
          imageUrl: entry.imageUrl,
          isolated: false,
          isolateSubject: false,
          source: 'keeper',
        };
        // The engine's usual way in, for the routing below: Edit 2511 treats it as the
        // plate, the face-crop engines as the clothing image.
        if (poseProfileForModel(stillModel).dressPlate === 'clothing') {
          dressClothingFilename = entry.filename;
        } else {
          dressPlate = dressedPlate;
        }
        setDressPlateStatus({
          text: 'Dressed plate ready — the clothed stills start from it.',
          busy: false,
        });
      } catch (dressError) {
        // Fall back to dressing her in each still, as before.
        setDressPlateStatus({
          text: `Dress plate skipped (${dressError instanceof Error ? dressError.message : 'it did not render'}) — the stills dress her from the clothing image instead.`,
          busy: false,
        });
      }
    }
    // From here on, this still's plate is the dressed one when there is one.
    const slotPlate = dressPlate ?? lookPlate;
    const slotQueuePlate = dressPlate ?? lookQueuePlate;
    const slotCustomGarmentUrl =
      dressPlate || dressClothingFilename ? undefined : outfit.customGarmentImageUrl;
    const slotCustomGarmentFilename =
      dressClothingFilename ?? (dressPlate ? undefined : outfit.customGarmentImageFilename);
    const slotPackshotUrl = dressPlate || dressClothingFilename ? undefined : packshotUrl;
    let identityPlate = resolveDayQueueIdentityPlate({
      character: lookCharacter,
      displayPlate: slotPlate,
      preferCastPlate: dayIdentityPrefersCastPlate({
        replaceOutfit: replaceKeepOutfit,
        omitGarment,
        keepStale,
        dressed: Boolean(dressPlate),
      }),
      preferFaceOnlyPlate: omitGarment,
    });
    let nudeFaceAutoCropped = false;
    let vacationFaceBreak = false;
    // The full plate a face-break still was cropped from (an Everyday Keep plate rides as the
    // clothing image — see below).
    let faceBreakBodyPlate: DayPlate | null = null;
    let identityLatentPlate: { filename?: string; imageUrl?: string } | null = null;
    let skipPoseGuideImage = false;
    // Lightning keeps full Keep/Cast as Image 1 (ReferenceLatent) — tuned separately from
    // whether Image 3 rides along.
    let lightningIdentityPath = false;
    // Lightning dropped Image 3 because the legacy capsule/outline art leaked into stills;
    // an OpenPose keypoint map is a pose condition Edit-2511 understands, so it stays on.
    const poseGuideStyle = loadPoseGuideStylePreference(stillModel);
    const lightningDropsPoseGuide = poseGuideStyle === 'legacy';
    // How Image 1 is chosen (day-still-plan.ts). Findings behind the face-break cases:
    // - Seated Suggestive on Rapid with the undressed Cast plate as Image 1: the plate's full
    //   latent kept her in its underwear over the kit 5/6 whatever the brief said. Face-break
    //   (face crop + the garment's latent) dressed her 3/3 and, with the seated lead, sat 3/3.
    // - Everyday on Rapid with a Fitting garment over the undressed Cast plate: the plate's
    //   full latent plus the packshot's turned walk / crouch / kneel / menu beats into the
    //   same legs-apart seated swimsuit pin-up 4/4, with the packshot's rib knit as streaks.
    const identityRoute = dayStillIdentityRoute({
      dayMood: toolSettings.dayMood,
      model: stillModel,
      sceneHints: queueTarget.sceneHints,
      omitGarment,
      hasCharacter: Boolean(lookCharacter),
      hasIdentityPlate: Boolean(identityPlate ?? slotQueuePlate),
      identitySource: (identityPlate ?? slotQueuePlate)?.source,
      clothingOnlyGarment: isClothingOnlyDayGarment(
        resolveDayGarmentReinforce({
          plateSource: slotPlate?.source,
          packshotUrl: slotPackshotUrl,
          customGarmentUrl: slotCustomGarmentUrl,
          customGarmentFilename: slotCustomGarmentFilename,
        })
      ),
      dressedPlate: Boolean(dressedPlate),
    });
    if (identityRoute === 'nude' && lookCharacter) {
      const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
      const nudeIdentity = await resolveDayNudeIdentityPlateWithFaceCrop({
        character: lookCharacter,
        model: stillModel,
        comfyUrl,
      });
      if (nudeIdentity.plate) {
        identityPlate = nudeIdentity.plate;
        nudeFaceAutoCropped = nudeIdentity.autoCropped;
      }
      if (nudeIdentity.noFaceFound) warnNoFaceOnPlate(lookCharacter);
      if (nudeIdentity.faceLockRejected) referenceNotes.push(nudeIdentity.faceLockRejected);
    } else if (identityRoute === 'heat-full-plate' || identityRoute === 'face-break') {
      // Upright MID-STRIDE / WAVING / DANCING: full Keep as Image 1 freezes stand.
      // On Edit-2511, sit/lounge freezes the same way — face-break every clothed-heat beat.
      // Face-crop Image 1; full Keep rides Image 2 for outfit (no re-suggest needed).
      const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
      const bodyPlate = identityPlate ?? slotQueuePlate;
      if (identityRoute === 'heat-full-plate') {
        // Face-crop Image 1 invents a new person every slot. Legacy pose-guide Image 3
        // paints a color overlay. Full Keep/Cast as Image 1 with ReferenceLatent.
        skipPoseGuideImage = lightningDropsPoseGuide;
        lightningIdentityPath = true;
        const identityVl = await resolveDayVacationIdentityVlPlate({
          bodyPlate,
          character: lookCharacter,
          model: stillModel,
          comfyUrl,
        });
        if (identityVl) {
          identityPlate = identityVl;
        }
      } else {
        const faceBreak = await resolveDayVacationFaceBreakPlate({
          bodyPlate,
          character: lookCharacter,
          model: stillModel,
          comfyUrl,
        });
        if (faceBreak.noFaceFound) warnNoFaceOnPlate(lookCharacter);
        if (faceBreak.facePlate) {
          faceBreakBodyPlate = bodyPlate ?? null;
          identityPlate = faceBreak.facePlate;
          vacationFaceBreak = true;
          // Opt-in: full plate as a mid-size ReferenceLatent (never VL) — the head crop
          // alone leaves face-break behind the plate path on identity.
          if (toolSettings.identityBoost === true && (bodyPlate?.filename || bodyPlate?.imageUrl)) {
            identityLatentPlate = await uploadDayIdentityLatentPlate({
              imageUrl: bodyPlate.imageUrl,
              filename: bodyPlate.filename,
              model: stillModel,
              comfyUrl,
            });
          }
        }
      }
    } else if (identityRoute === 'everyday-full-plate') {
      // Everyday Lightning: legacy Image 3 paints speckle rain and a Keep-plate ghost
      // (second woman / beige lingerie). Full Keep as Image 1; stance from text (legacy)
      // or from the OpenPose map.
      skipPoseGuideImage = lightningDropsPoseGuide;
      lightningIdentityPath = true;
      const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
      const identityVl = await resolveDayVacationIdentityVlPlate({
        bodyPlate: identityPlate ?? slotQueuePlate,
        character: lookCharacter,
        model: stillModel,
        comfyUrl,
      });
      if (identityVl) {
        identityPlate = identityVl;
      }
    }
    // Distinct Cast face lock OR auto crop → face-only Image 1 language + IP pin.
    const faceOnlyIdentity =
      (omitGarment && (nudeFaceAutoCropped || Boolean(resolveDayFaceOnlyPlate(lookCharacter)))) ||
      vacationFaceBreak;
    // Face-break: clothing-only packshot Image 2 is OK (no standing body silhouette),
    // including a Fitting Room packshot picked as the custom garment. Full-body Keep /
    // BYO worn stills teach studio voids — dress from garment text.
    // The packshot keeps its own name so it gets a ReferenceLatent like the Keep path:
    // as a VL-only `day-outfit-vl` Image 2, Rapid kept the print but invented the cut
    // (live: exact collar/sleeves/tiers 12/12 with the latent, poses still held).
    // Where the dressed plate goes on THIS still. The engine mode above is only the usual
    // case: a still that starts from a face crop takes the plate as its clothing image, and
    // a still that starts from the full plate takes the dressed plate as that plate.
    // Otherwise Rapid's full-plate Vacation stills started from the undressed Cast plate
    // (its underwear won over the clothing image), and plain Edit 2511's face-crop stills
    // carried the dressed plate nowhere.
    // Everyday on Edit 2511 breaks to the face when the plate is an Outfit Keep plate
    // (day-still-plan.ts): that plate already wears the outfit, so it is the clothing image —
    // as a dressed plate would be. Without this the dress came from words alone.
    if (
      !dressedPlate &&
      vacationFaceBreak &&
      faceBreakBodyPlate?.source === 'keeper' &&
      normalizeDayMood(toolSettings.dayMood) === 'everyday'
    ) {
      dressedPlate = faceBreakBodyPlate;
    }
    const dressedPlateUse = dayStillDressedPlateUse({
      hasDressedPlate: Boolean(dressedPlate),
      omitGarment,
      faceOnlyIdentity,
    });
    if (dressedPlate && dressedPlateUse === 'clothing') {
      dressPlate = null;
      dressClothingFilename = dressedPlate.filename ?? null;
    } else if (dressedPlate && dressedPlateUse === 'plate') {
      if (!dressPlate) {
        identityPlate = dressedPlate;
      }
      dressPlate = dressedPlate;
      dressClothingFilename = null;
    }
    const byoOrPackGarment = resolveDayGarmentReinforce({
      plateSource: dressPlate ? 'keeper' : dressClothingFilename ? 'cast' : slotPlate?.source,
      packshotUrl: dressedPlate ? undefined : slotPackshotUrl,
      customGarmentUrl: dressedPlate ? undefined : slotCustomGarmentUrl,
      customGarmentFilename: dressedPlate
        ? (dressClothingFilename ?? undefined)
        : slotCustomGarmentFilename,
    });
    // Partner: a chosen Cast member plays the second person on two-person stills — their
    // face crop takes Image 2 (the outfit is said in words), the pose map stays Image 3 — or
    // an invented man / woman ("new:…") with their own face and no extra image. Who, decided
    // in the take's plan (take-plan.ts); the faces found or rendered here.
    const partnerPlanFilmScriptId = sceneMode
      ? sceneCacheRef.current.scenes?.find(
          scene => scene.id === sceneCacheRef.current.activeSceneId
        )?.fromScript?.scriptId
      : undefined;
    const partnerPlan = planTakePartner({
      slot: queueTarget,
      partnerCharacterId: toolSettings.partnerCharacterId,
      scriptShot: scriptLineStays(),
      leadNoun,
      lead: lookCharacter,
      getCharacter,
      lookHasPlate,
      dayMood: toolSettings.dayMood,
      intimateEnabled,
      intimateMix: toolSettings.intimateMix,
      allowCompanions: toolSettings.allowCompanions === true,
      stillModel,
      filmScriptId: partnerPlanFilmScriptId,
    });
    const { partnerCharacter } = partnerPlan;
    // The face found or made (take-partner-face.ts); what changed is kept here.
    const filmPartners = sceneMode ? sceneScriptPartners(sceneCacheRef.current.scriptPartners) : {};
    const partnerResult = await resolveTakePartnerFace({
      plan: partnerPlan,
      filmPartners,
      pageStandIn: partnerStandInRef.current,
      lead: lookCharacter,
      stillModel,
      comfyUrl: loadComfyUiSettings().apiUrl?.trim() || undefined,
      sendComfyUi: actions.sendComfyUi,
    });
    referenceNotes.push(...partnerResult.notes);
    if (partnerResult.pageStandIn) {
      partnerStandInRef.current = partnerResult.pageStandIn;
      updateToolSettings({ partnerStandIn: partnerResult.pageStandIn });
    }
    if (partnerResult.filmPartners) {
      storeToolSettings({
        scriptPartners: partnerResult.filmPartners,
      } as Parameters<typeof storeToolSettings>[0]);
    }
    const slotPartner: DayPartner | null = partnerResult.slotPartner;
    const partnerFace = partnerResult.partnerFace;
    const clothingReinforce = dayStillClothingReinforce({
      omitGarment,
      replaceOutfit: replaceKeepOutfit,
      partnerFace: Boolean(partnerFace),
      faceBreak: vacationFaceBreak,
      garment: byoOrPackGarment,
      dressedPlateClothing: Boolean(dressClothingFilename),
      sceneOwnsClothes:
        dayStillSceneDressesItself({
          dayMood: toolSettings.dayMood,
          intimateEnabled,
          sceneHints: queueTarget.sceneHints,
        }) && !/\b(?:swim\w*|bikini|bathing)\b/i.test(wardrobeLabelFor(wardrobeId) ?? ''),
    });
    // Footwear picked beside the clothing (day-still-plan.ts: clothed stills, not Sport, not a
    // beat about the feet, not a scene that dresses her itself).
    const footwearApplies = dayStillFootwearApplies({
      dayMood: toolSettings.dayMood,
      intimateEnabled,
      sceneHints: queueTarget.sceneHints,
    });
    const footwear = footwearApplies ? normalizeFootwear(outfit.footwear) : '';
    // With a picture (a kit's, or your own photo) the shoes share Image 2 with the clothing.
    // Only when the still has a clothing image: other paths use Image 2 for something else
    // (a partner's face, the pose map), and there the shoes go out in words alone.
    let garmentReinforce = clothingReinforce;
    let footwearImage: 'combined' | 'worn' | null = null;
    const footwearRef = {
      imageUrl: outfit.footwearImageUrl,
      imageFilename: outfit.footwearImageFilename,
    };
    if (
      footwearApplies &&
      footwearImageSuitsModel(stillModel) &&
      !footwearIsBarefoot(footwear) &&
      hasFootwearImage(footwearRef) &&
      (clothingReinforce?.imageUrl || clothingReinforce?.imageFilename)
    ) {
      const shoeStillPeople = planDaySlotPose({
        slot: queueTarget,
        dayMood: toolSettings.dayMood,
        intimateMix: toolSettings.intimateMix,
        allowCompanions: toolSettings.allowCompanions === true,
        model: stillModel,
      }).headcount;
      if (dressClothingFilename && shoeStillPeople < 2 && !partnerFace) {
        // The dressed plate already wears these shoes (its key has them). A shoe photo under
        // it showed the pair twice, and lounging stills at home put the loose pair on the
        // rug or the bed: 10/12 extra pairs, plate alone 1/12, right shoes 6/6 either way
        // (live, Edit 2511, 2026-10-16). Two-person stills keep the photo: a full-figure
        // plate alone read as a third person 2/2.
        footwearImage = 'worn';
      } else {
        try {
          const reference = await buildFootwearReferenceImage({
            garment: clothingReinforce,
            footwear: footwearRef,
            model: stillModel,
          });
          if (reference?.combined) {
            garmentReinforce = {
              ...clothingReinforce,
              imageUrl: undefined,
              imageFilename: reference.filename,
            };
            footwearImage = 'combined';
          }
        } catch (footwearError) {
          console.warn('Day footwear image could not be attached:', footwearError);
          pushAppToast({
            text: `${queueTarget.label}: the shoe picture couldn't be attached — the shoes go out in words only.`,
            tone: 'warning',
            ttlMs: 12_000,
          });
        }
      }
    }
    // FLUX.2 Klein holds a full-body plate's face loosely — the head crop rides along as the
    // last reference (see klein-face-reference.ts). Same cached crop as face-break.
    let kleinFaceReference: { filename?: string } | null = null;
    if (
      lookHasPlate &&
      shouldAppendKleinFaceReference({
        model: stillModel,
        imageOneIsFaceCrop: faceOnlyIdentity,
      })
    ) {
      try {
        kleinFaceReference = (
          await resolveDayVacationFaceBreakPlate({
            bodyPlate: identityPlate ?? slotQueuePlate,
            character: lookCharacter,
            model: stillModel,
            comfyUrl: loadComfyUiSettings().apiUrl?.trim() || undefined,
          })
        ).facePlate;
      } catch (faceError) {
        console.warn('Klein face reference could not be attached:', faceError);
        pushAppToast({
          text: `${queueTarget.label}: the face close-up couldn't be attached — the face may match the cast less closely.`,
          tone: 'warning',
          ttlMs: 12_000,
        });
      }
    }

    // Image 3: mannequin pose guide from Beat (Keep / Cast stay Image 1).
    // Heat moods: beat only — Setting location text must not rewrite Image 3 stance.
    let poseGuideUrl: string | undefined;
    let poseGuideFilename: string | undefined;
    let poseGuideFailure: string | undefined;
    let poseGuideDrawnStyle: PoseGuideStylePreference = poseGuideStyle;
    let poseLeadPosition: PoseLeadPosition | null = null;
    let poseCamera: 'overhead' | 'side' | 'low' | null = null;
    let poseExpectation: DayPoseGuideExpectation | undefined;
    // A custom pose in words (pose-describe.ts) — set once its guide is drawn.
    let customPose = '';
    // She sat on the ground for a crouch with the map: this redo goes out words-only — no
    // map, the crouch words in its place — judged against the guide it missed.
    const wordsOnlyRedo = wordsOnlyRedoRef.current[queueTarget.id];
    delete wordsOnlyRedoRef.current[queueTarget.id];
    if (wordsOnlyRedo) {
      skipPoseGuideImage = true;
      customPose = wordsOnlyRedo.words;
      poseExpectation = { ...wordsOnlyRedo.expectation, wordsOnly: wordsOnlyRedo.words };
    }
    // Whether the drawn guide goes with this take, decided in the take's plan (take-plan.ts):
    // Klein's spoon recipe, a clothed drawing against the beat, Rapid's spoon poses, a walk
    // in step — the pose then goes out in words.
    const poseGuidePlan = planTakePoseGuide({
      slot: queueTarget,
      stillModel,
      dayMood: toolSettings.dayMood,
      intimateEnabled,
      intimateMix: toolSettings.intimateMix,
      allowCompanions: toolSettings.allowCompanions === true,
      skippedForIdentity: skipPoseGuideImage,
      wordsOnlyRedo: Boolean(wordsOnlyRedo),
      partnerNoun: slotPartner?.noun,
      leadNoun,
    });
    skipPoseGuideImage = poseGuidePlan.skip;
    const { kleinSpoonRecipe } = poseGuidePlan;
    // A run's take: what it decided, for the server to check against the run's bundle
    // (run-bundle.ts, shadow mode — nothing here waits for it).
    const shadowRun = sceneMode ? sceneCacheRef.current.run : undefined;
    if (shadowRun?.state === 'running' && sceneCacheRef.current.activeSceneId) {
      const sceneId = sceneCacheRef.current.activeSceneId;
      postTakeShadow({
        runId: shadowRun.id,
        sceneId,
        slot: outfitInput.target,
        outfitScenes: (sceneCacheRef.current.scenes ?? []).map(scene => ({
          id: scene.id,
          createdAt: scene.createdAt,
          ...(scene.fromScript ? { fromScript: scene.fromScript } : {}),
          slot: { id: scene.slot.id, wardrobeId: scene.slot.wardrobeId },
        })),
        workingSlots: outfitInput.workingSlots,
        latestSlots: outfitInput.latestSlots,
        scriptShot: scriptLineStays(),
        ...(partnerPlanFilmScriptId ? { filmScriptId: partnerPlanFilmScriptId } : {}),
        settings: {
          dayMood: toolSettings.dayMood,
          intimateMix: toolSettings.intimateMix,
          allowCompanions: toolSettings.allowCompanions === true,
          ...(toolSettings.partnerCharacterId
            ? { partnerCharacterId: toolSettings.partnerCharacterId }
            : {}),
        },
        look: {
          ...(lookCharacter?.id ? { lookCharacterId: lookCharacter.id } : {}),
          hasPlate: lookHasPlate,
          ...(lookPlate?.source ? { plateSource: lookPlate.source } : {}),
          ...(outfit.lockedWardrobeId?.trim()
            ? { lockedWardrobeId: outfit.lockedWardrobeId.trim() }
            : {}),
          customGarment: Boolean(
            outfit.customGarmentImageUrl?.trim() || outfit.customGarmentImageFilename?.trim()
          ),
        },
        decisions: {
          ...(wardrobeId ? { wardrobeId } : {}),
          stillModel,
          queueModel,
          partner: partnerPlan.kind,
          ...(partnerPlan.kind === 'cast' ? { partnerId: partnerPlan.character.id } : {}),
          poseGuideSkip: planTakePoseGuide({
            slot: queueTarget,
            stillModel,
            dayMood: toolSettings.dayMood,
            intimateEnabled,
            intimateMix: toolSettings.intimateMix,
            allowCompanions: toolSettings.allowCompanions === true,
            skippedForIdentity: false,
            wordsOnlyRedo: false,
            partnerNoun: partnerPlan.kind === 'none' ? null : partnerPlan.candidate.noun,
            leadNoun,
          }).skip,
        },
      });
    }
    // Clothing options for this still's brief / recipe (the pose map's are added below).
    const slotPromptOptions = {
      faceOnlyIdentity,
      // Only force Image 2 language when a clothing-only packshot is actually attached.
      forceGarmentReinforce:
        (vacationFaceBreak || Boolean(dressClothingFilename)) &&
        Boolean(garmentReinforce?.imageUrl || garmentReinforce?.imageFilename),
      clothingImageAttached: Boolean(garmentReinforce?.imageUrl || garmentReinforce?.imageFilename),
      partner: slotPartner,
      dressPlate,
      clothingIsDressedPlate: Boolean(dressClothingFilename),
    };
    // The face-crop canvas: landscape for one person lying down on Qwen-Image 2.1 when the
    // text names her outfit (day-still-plan.ts). Decided before the pose map, which is drawn
    // at the still's aspect; the outfit line does not depend on the map.
    const faceCropCanvas = faceOnlyIdentity
      ? dayStillFaceCropCanvas({
          model: stillModel,
          solo: !slotPartner,
          lying: dayStillLiesDown({ beat: queueTarget.sceneHints }),
          outfitLine: DAY_OUTFIT_LINE_RE.test(buildSlotPrompt(queueTarget, slotPromptOptions)),
          wide: stillsAreWide(toolSettings),
        })
      : null;
    // The still's canvas when it isn't Image 1's shape: 16:9 stills on every identity path (a
    // plate is portrait — the first live take came back 1104×1472), else the face crop's.
    const stillCanvas = stillsAreWide(toolSettings) ? { ...DAY_WIDE_CANVAS } : faceCropCanvas;
    if (lookHasPlate && !skipPoseGuideImage) {
      try {
        const dayMood = normalizeDayMood(
          isDayAdultMood(toolSettings.dayMood) && !intimateEnabled
            ? 'everyday'
            : toolSettings.dayMood
        );
        // Same plan the slot editor's pose preview draws (beat text, headcount, picked pose).
        const posePlan = planDaySlotPose({
          slot: queueTarget,
          dayMood,
          intimateMix: toolSettings.intimateMix,
          allowCompanions: toolSettings.allowCompanions === true,
          model: stillModel,
          retryVariant: poseVariantRef.current[queueTarget.id] ?? 0,
          weakLayouts: weakPoseLayouts(),
        });
        // The still renders at Image 1's aspect, so draw the guide at that aspect too —
        // a portrait guide squeezed onto a square latent lands the body in the wrong place.
        const image1Plate = omitGarment ? identityPlate : (identityPlate ?? slotQueuePlate);
        // Only URLs of that file: the shared identity image can be another shape (a square
        // face), and a guide drawn to it is squeezed onto the portrait still.
        const image1Url =
          image1Plate?.imageUrl?.trim() ||
          collectIsolateSourceUrls({
            filename: image1Plate?.filename?.trim() || undefined,
            comfyUrl: loadComfyUiSettings().apiUrl?.trim() || undefined,
          }).find(url => url !== IDENTITY_MEDIA_URL);
        const poseBuild = await buildDayPoseGuide(queueTarget.id, posePlan.sceneText, stillModel, {
          ...posePlan.options,
          stylePreference: poseGuideStyle,
          aspect: !isOpenPoseStyle(poseGuideStyle)
            ? null
            : stillCanvas
              ? stillCanvas
              : await probeImage1Size(image1Url),
          library: isOpenPoseStyle(poseGuideStyle) ? loadPoseLibrary() : [],
        });
        const poseFile = poseBuild.file;
        poseGuideDrawnStyle = poseBuild.stylePreference;
        poseLeadPosition = poseBuild.leadPosition;
        poseCamera = poseBuild.camera;
        if (posePlan.options.photoPose?.people.length && poseBuild.poseKey.startsWith('photo:')) {
          customPose = customPoseWords({
            photo: posePlan.options.photoPose,
            drawn: {
              keypoints: poseBuild.keypoints,
              aspect: poseBuild.canvas.width / poseBuild.canvas.height,
            },
            sceneText: [queueTarget.sceneHints, queueTarget.location].filter(Boolean).join(' · '),
          });
        }
        poseExpectation = {
          keypoints: poseBuild.keypoints,
          aspect: poseBuild.canvas.width / poseBuild.canvas.height,
          style: poseBuild.stylePreference,
          poseKey: poseBuild.poseKey,
          beat: queueTarget.sceneHints,
        };
        const uploaded = await resolveQueueInputImage({
          file: poseFile,
          filename: poseFile.name,
          model: stillModel,
        });
        poseGuideFilename = uploaded?.filename?.trim() || undefined;
        if (poseGuideFilename) {
          const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
          poseGuideUrl =
            collectIsolateSourceUrls({
              filename: poseGuideFilename,
              comfyUrl,
            }).find(url => url.includes('/api/comfyui/view?')) || undefined;
        }
      } catch (poseError) {
        // Pose guide is best-effort — Day still queues without Image 3 — but a silent drop
        // reads as "posing is broken", so keep the reason and surface it on the board.
        poseGuideFailure = poseGuideFailureReason(poseError);
        console.warn('Day pose guide could not be attached:', poseError);
      }
    }

    if ((poseGuideFilename || wordsOnlyRedo) && poseExpectation) {
      poseGuideExpectRef.current[queueTarget.id] = poseExpectation;
    } else {
      delete poseGuideExpectRef.current[queueTarget.id];
    }
    setPoseGuideOutcomes(previous =>
      recordPoseGuideOutcome(previous, {
        slotId: queueTarget.id,
        slotLabel: queueTarget.label,
        ...(poseGuideFilename
          ? {
              state: 'attached' as const,
              model: stillModel,
              editCapableModel: readsPoseGuideImage(stillModel),
              style: poseGuideDrawnStyle,
              ...(poseGuideUrl ? { previewUrl: poseGuideUrl } : {}),
            }
          : !lookHasPlate
            ? { state: 'skipped' as const, reason: 'no plate' }
            : skipPoseGuideImage
              ? { state: 'skipped' as const, reason: poseGuidePlan.skipReason ?? '' }
              : {
                  state: 'failed' as const,
                  reason: poseGuideFailure ?? 'ComfyUI did not accept the guide upload',
                }),
      })
    );

    const slotPrompt = buildSlotPrompt(queueTarget, {
      ...slotPromptOptions,
      poseGuide: Boolean(poseGuideFilename),
      poseGuideStyle: poseGuideDrawnStyle,
      poseLeadPosition,
      poseCamera,
    });
    // Quality-gate reroll: append the fix for whatever the reviewer flagged, once.
    const qualityNudge = rerollNudgeRef.current[queueTarget.id]?.trim();
    delete rerollNudgeRef.current[queueTarget.id];
    const drawnLayout = poseExpectation ? poseLayoutFromKey(poseExpectation.poseKey) : null;
    // Solo only — on a two-person guide the extra face reads as an extra head.
    const kleinFaceFilename =
      kleinFaceReference?.filename &&
      !kleinSpoonRecipe &&
      shouldAppendKleinFaceReference({
        model: stillModel,
        imageOneIsFaceCrop: faceOnlyIdentity,
        headcount: poseExpectation?.keypoints.length,
      })
        ? kleinFaceReference.filename
        : undefined;
    const adultStill = isDayAdultMood(toolSettings.dayMood) && intimateEnabled;
    const leadDescriptor = (lookCharacter?.descriptor || lookCharacter?.hints || '').trim();
    // The text itself is assembled in day-still-prompt.ts (the same code the beat sweep
    // runs), from the decisions made above.
    const assembled = assembleDayStillPrompt({
      slotPrompt,
      // Edit 2511: clothed stills only (A/B'd with its pose map). Qwen-Image 2.1 drops the
      // planner's own maps (a custom pose's map is attached): the words lead in every mood
      // (day-still-prompt.ts).
      poseFirst:
        poseModelFamily(stillModel) === 'qwen-image-2.1' ||
        (/qwen-image-edit-2511|qwen_image_edit_2511/i.test(stillModel ?? '') &&
          !isDayAdultMood(normalizeDayMood(toolSettings.dayMood)) &&
          !adultStill),
      // Qwen-Image 2.1: the line stands on the words, never naming a map (Turbo, 2026-10-17).
      poseFirstWithoutMap: poseModelFamily(stillModel) === 'qwen-image-2.1',
      // The slot's picked plain posture: 2.1 drops the map it was drawn on.
      pickedPosture: daySlotPoseOverride(queueTarget.poseLayout)?.body ?? null,
      camera: dayStillCamera({
        slotId: queueTarget.id,
        model: stillModel,
        dayMood: toolSettings.dayMood,
        adult: adultStill,
        people: slotPartner ? 2 : 1,
      }),
      // The player's camera (a custom 3D pose's own, else the slot's Camera row) replaces it.
      pickedCamera: pickedStillCamera(queueTarget)?.choice ?? null,
      beat: queueTarget.sceneHints,
      beatTyped: dayBeatIsTyped(queueTarget),
      setting: queueTarget.location,
      dayMood: toolSettings.dayMood,
      adult: adultStill,
      leadNoun,
      leadDescriptor,
      partner: slotPartner,
      // The partner Cast's own outfit, as dressed in Outfit (their look's kept outfit: a kit,
      // or a clothing photo's description, and their shoes) — said the same on every still,
      // else they were dressed anew each time.
      partnerOutfit: partnerOutfitWords(partnerCharacter, kitId =>
        formatWardrobeKitLabel(wardrobeLabelFor(kitId) || '')
      ),
      // Her own clothing photo counts too: on a two-person still the partner's face takes
      // the clothing image's slot, and unnamed she fell back to a plain top (sweep
      // 2026-10-02: a beige tank on 4 of 6 Rapid duo stills).
      leadOutfit:
        !omitGarment && !replaceKeepOutfit && wardrobeId
          ? dayOutfitPromptName(formatWardrobeKitLabel(wardrobeLabelFor(wardrobeId) || ''))
          : !omitGarment && !replaceKeepOutfit
            ? dayGarmentPromptName(outfit.customGarmentDescription)
            : null,
      dressedPlateIsClothingImage: Boolean(dressClothingFilename),
      pickedShoes,
      footwear,
      footwearImage,
      pose: poseExpectation
        ? {
            layout: drawnLayout,
            poseKey: poseExpectation.poseKey,
            figures: poseExpectation.keypoints.length,
          }
        : null,
      customPose: customPose || null,
      cueLayouts: cuePoseLayouts(),
      poseLook: queueTarget.poseLook,
      kleinFace: Boolean(kleinFaceFilename),
      qualityNudge,
      sportActionCue: poseProfileForModel(stillModel).sportActionCue,
      leadMarks: castMarksLine(lookCharacter?.marks, {
        outfit:
          !omitGarment && !replaceKeepOutfit && wardrobeId
            ? formatWardrobeKitLabel(wardrobeLabelFor(wardrobeId) || '')
            : !omitGarment && !replaceKeepOutfit
              ? outfit.customGarmentDescription
              : null,
        beat: queueTarget.sceneHints,
        undressed: adultStill,
      }),
      leadProps: castPropsLine(lookCharacter?.props, {
        beat: queueTarget.sceneHints,
        setting: queueTarget.location,
      }),
    });
    if (assembled.cued && poseExpectation) {
      poseExpectation.cued = true;
    }
    const prompt = assembled.prompt;
    // Play/Simple: skip lint round-trip — Day stills are draft-speed first film.
    // Rapid duo recipe skips it too — its length is the point.
    const drafted =
      leanChrome || assembled.recipe
        ? prompt
        : await actions.finalizePrompt(prompt, lookCharacter?.name || slot.label);
    const dayMoodForPrompt = normalizeDayMood(
      isDayAdultMood(toolSettings.dayMood) && !intimateEnabled ? 'everyday' : toolSettings.dayMood
    );
    // Suggestive / Intimate / Raunchy: every person gets an explicit adult age, and the
    // still waits for the adult-appearance gate before it is shown anywhere.
    const finalized = finishDayStillPrompt(drafted, {
      adultMood: isDayAdultMood(dayMoodForPrompt),
      adult: adultStill,
      swapLead: assembled.swapLead,
      leadDescriptor,
      partnerDescriptor: slotPartner?.descriptor,
      ages: dayStillAgeFacts({
        playedMood: dayMoodForPrompt,
        leadNoun,
        lead: { ageBand: lookCharacter?.traits?.ageBand, descriptor: leadDescriptor },
        partner: slotPartner,
        figures: poseExpectation?.keypoints.length,
        strong: options?.strongAgeLine === true,
      }),
      coverage: options?.coverageLine === true,
    });
    // An adult beat played with Intimate off still reads as adult content: gate it too.
    const adultSafeguards =
      dayMoodNeedsAdultSafeguards(dayMoodForPrompt) || isAdultContentPrompt(finalized);
    setOutput(finalized);
    rememberDraftFields({
      toolKey: TOOL_ID,
      label: 'Short',
      href: '/day',
      fields: [lookCharacter?.name ?? '', queueTarget.label, finalized],
    });
    // Everyday: Keep as Image 1 for worn-kit fidelity on Qwen 2511.
    // Sport / nude adult beats: Cast as Image 1 so Keep lingerie cannot stick.
    // Upright vacation face-break: face crop Image 1; full Keep on Image 2.
    // Image 2 = optional garment packshot; Image 3 = crude pose wireframe.
    const extraUrls: Array<string | undefined> = [undefined];
    const extraFilenames: string[] = [''];
    if (partnerFace) {
      // Clothed stills: the partner face rides VL-only, checked as it goes
      // (take-partner-face.ts); what changed is kept here.
      const sent = await sendTakePartnerFace({
        partnerFace,
        adultStill,
        slotPartner,
        partnerCharacter,
        lead: lookCharacter,
        stillModel,
        comfyUrl: loadComfyUiSettings().apiUrl?.trim() || undefined,
        filmPartners: sceneScriptPartners(sceneCacheRef.current.scriptPartners),
        pageStandIn: partnerStandInRef.current,
      });
      extraUrls[1] = sent.url;
      extraFilenames[1] = sent.filename;
      if (sent.note) referenceNotes.push(sent.note);
      if (sent.sentFace) partnerSentFace = sent.sentFace;
      if (sent.clearPageStandIn) {
        partnerStandInRef.current = null;
        updateToolSettings({ partnerStandIn: undefined });
      }
      if (sent.filmPartners) {
        storeToolSettings({ scriptPartners: sent.filmPartners } as Parameters<
          typeof storeToolSettings
        >[0]);
      }
    } else if (garmentReinforce?.imageUrl || garmentReinforce?.imageFilename) {
      extraUrls[1] = garmentReinforce.imageUrl;
      extraFilenames[1] = garmentReinforce.imageFilename?.trim() || '';
    } else {
      extraUrls[1] = undefined;
      extraFilenames[1] = '';
    }
    if (poseGuideUrl || poseGuideFilename) {
      extraUrls[2] = poseGuideUrl;
      extraFilenames[2] = poseGuideFilename || '';
    }
    // A photo of the Cast's own room (Cast → Places) for a clothed still set there: it takes
    // Image 3 from the pose map (the pose stays in words), only with Image 2 attached so it
    // stays the third image (cast-places.ts withPlacePhotoInPrompt). The queue gives it a
    // ReferenceLatent — what carries the room: the room in the text encoder alone came
    // through 0/4 on Rapid, with the latent 3/8, led in the SCENE line 4/4; Edit 2511 solo
    // 6/6, two-person (partner face as Image 2) 4/4 with the latent (live 2026-10-16).
    // Rapid only with the short recipe (its SCENE line): the long Outfit Keep brief ignored
    // the room 0/12 even cleaned of its pose-map lines — there the map stays.
    // Qwen-Image 2.1 (one person, short recipe): the room as its third reference, led in the
    // SCENE line — Turbo 8/8 the exact room, pose and outfit kept (live 2026-10-17).
    const roomLedEngine =
      /rapid-aio/i.test(stillModel ?? '') || poseModelFamily(stillModel) === 'qwen-image-2.1';
    const clothedRoomEngine =
      /qwen-image-edit-2511|qwen_image_edit_2511/i.test(stillModel ?? '') ||
      (roomLedEngine && !partnerFace && /\bSCENE: /.test(finalized));
    // Set in a location record (M8): its picture, when it has one — never a room of her home
    // (a photo added beside the Setting is kept on one). The adult and group prompts below
    // say "the room shown in Image N": an outdoor location's photo is not theirs.
    const slotLocations = queueTarget.locationId?.trim() ? loadLocations() : [];
    const settingPhoto = (indoorsOnly = false) =>
      shotPlacePhoto(
        queueTarget.locationId,
        slotLocations,
        () => castPlacePhotoFor(lookCharacter, queueTarget.location),
        { indoorsOnly }
      );
    // One room a scene (a run's oneRoom): the scene's own room when nothing else gives one.
    const sceneRoom = settingPhoto() ? null : await scriptSceneRoom(queueTarget);
    const roomPhoto: { filename: string; locationName?: string } | null =
      !adultStill &&
      !queueTarget.thirdCastId?.trim() &&
      // A two-person still keeps its face-break crop as Image 1 (the 4/4 test above ran so);
      // one person's face-break crop too on Qwen-Image 2.1 with Image 2 free (the room rides
      // there) — on Edit 2511 her Image 2 is the plate.
      (!vacationFaceBreak ||
        Boolean(partnerFace) ||
        (poseModelFamily(stillModel) === 'qwen-image-2.1' &&
          !extraFilenames[1]?.trim() &&
          !extraUrls[1])) &&
      !kleinFaceFilename
        ? (settingPhoto() ?? (sceneRoom ? { filename: sceneRoom } : null))
        : null;
    // Image 3 beside an Image 2; or, on Qwen-Image 2.1 with Image 2 free (a dressed plate wears
    // the outfit, so no clothing image rides along), Image 2 itself — the photo was never sent
    // there before (M8 follow-up, live 2026-10-28: withRoomPhotoAsImage2).
    const imageTwoFree = !extraFilenames[1]?.trim() && !extraUrls[1];
    const placePhoto: { filename: string; locationName?: string; asImage: 2 | 3 } | null =
      roomPhoto && clothedRoomEngine && !imageTwoFree
        ? { ...roomPhoto, asImage: 3 }
        : roomPhoto &&
            imageTwoFree &&
            !partnerFace &&
            // One room a scene on Edit 2511 too: her shots alone had Image 2 free and went
            // out with no room at all, so only the two-person shots held it (2026-11-11).
            (poseModelFamily(stillModel) === 'qwen-image-2.1' ||
              (Boolean(sceneRoom) && roomPhoto.filename === sceneRoom)) &&
            withRoomPhotoAsImage2(finalized, {
              place: roomPhoto.locationName,
              words: queueTarget.location,
            })
          ? { ...roomPhoto, asImage: 2 }
          : null;
    if (placePhoto?.asImage === 3) {
      extraUrls[2] = undefined;
      extraFilenames[2] = placePhoto.filename;
    } else if (placePhoto?.asImage === 2) {
      extraUrls[1] = undefined;
      extraFilenames[1] = placePhoto.filename;
    }
    // Group still: a third Cast member's face as Image 3, a fourth's as Image 4 (take-group.ts)
    // — clothed two-person stills only; elsewhere the card says why they were left out. The
    // room photo then rides as Image 5 (below).
    const group = await resolveTakeGroupFaces({
      slot: queueTarget,
      getCharacter,
      stillModel,
      comfyUrl: loadComfyUiSettings().apiUrl?.trim() || undefined,
      placePhoto: Boolean(placePhoto),
      adultStill,
      partnerFace: Boolean(partnerFace),
      kleinFace: Boolean(kleinFaceFilename),
    });
    referenceNotes.push(...group.notes);
    const thirdPerson: DayThirdPerson | null = group.third?.person ?? null;
    const fourthPerson: DayThirdPerson | null = group.fourth?.person ?? null;
    if (group.third) {
      extraUrls[2] = undefined;
      extraFilenames[2] = group.third.filename;
    }
    if (group.fourth) {
      extraUrls[3] = undefined;
      extraFilenames[3] = group.fourth.filename;
    }
    // Adult Rapid solo: the pose map moves to Image 2 (where the recipe already says it is —
    // the queue would compact it there) and the room photo rides as Image 3.
    const adultPlacePhoto =
      !placePhoto &&
      adultStill &&
      !partnerFace &&
      /rapid-aio/i.test(stillModel ?? '') &&
      !extraFilenames[1]?.trim() &&
      !extraUrls[1] &&
      Boolean(extraFilenames[2]?.trim() || extraUrls[2]) &&
      !extraFilenames[3]?.trim()
        ? settingPhoto(true)
        : null;
    if (adultPlacePhoto) {
      extraUrls[1] = extraUrls[2];
      extraFilenames[1] = extraFilenames[2] ?? '';
      extraUrls[2] = undefined;
      extraFilenames[2] = adultPlacePhoto.filename;
    }
    // Adult Rapid two-person still: the room takes the pose map's place as Image 3 (the pose
    // is in the recipe's words), or is Image 3 when the layout has no map. Live 2026-10-16
    // (a lift, four seeds): the room 4/4 with its ReferenceLatent (the text encoder alone:
    // the sofa, not the room). Not with the long brief, which explains Image 3 as the two
    // skeletons throughout — there the map stays.
    const adultDuoPlacePhoto =
      !placePhoto &&
      !adultPlacePhoto &&
      adultStill &&
      Boolean(partnerFace) &&
      /rapid-aio/i.test(stillModel ?? '') &&
      !/OpenPose keypoint skeleton|Image 3 has two skeletons/.test(finalized) &&
      Boolean(extraFilenames[1]?.trim() || extraUrls[1]) &&
      !extraFilenames[3]?.trim()
        ? settingPhoto(true)
        : null;
    if (adultDuoPlacePhoto) {
      extraUrls[2] = undefined;
      extraFilenames[2] = adultDuoPlacePhoto.filename;
    }
    if (vacationFaceBreak && identityLatentPlate?.filename) {
      extraFilenames[2] = extraFilenames[2] ?? '';
      extraUrls[3] = undefined;
      extraFilenames[3] = identityLatentPlate.filename;
    } else if (kleinFaceFilename) {
      extraFilenames[2] = extraFilenames[2] ?? '';
      extraUrls[3] = undefined;
      extraFilenames[3] = kleinFaceFilename;
    }
    // The room photo as Image 4 where Image 3 is spoken for — a group still's third face, or
    // the two-skeleton map of the long adult duo brief. Its ReferenceLatent carries the room
    // (the text encoder reads only three pictures). Live 2026-10-17: group stills the room
    // 8/8 (three people, own clothes); two-skeleton duos the room 4/4, both people.
    const roomAsImage4 =
      !placePhoto &&
      !adultPlacePhoto &&
      !adultDuoPlacePhoto &&
      !extraFilenames[3]?.trim() &&
      Boolean(extraFilenames[2]?.trim() || extraUrls[2]) &&
      (thirdPerson !== null ||
        (adultStill &&
          Boolean(partnerFace) &&
          /rapid-aio/i.test(stillModel ?? '') &&
          /OpenPose keypoint skeleton|Image 3 has two skeletons/.test(finalized)))
        ? settingPhoto(true)
        : null;
    if (roomAsImage4) {
      extraUrls[3] = undefined;
      extraFilenames[3] = roomAsImage4.filename;
    }
    // A four-person still (Image 4 is the fourth face): the room photo as Image 5 — the queue
    // carries up to eight pictures and Qwen-Image 2.1 reads them all. Turbo, the same sofa
    // beat and seeds (2026-10-17): the exact room 3/3 (0/3 from words alone), four distinct
    // people; the lead's face 0.33 → 0.47 (three-person stills 0.52), ~7 s more.
    const roomAsImage5 =
      fourthPerson !== null &&
      !placePhoto &&
      Boolean(extraFilenames[3]?.trim()) &&
      !extraFilenames[4]?.trim()
        ? settingPhoto(true)
        : null;
    if (roomAsImage5) {
      extraUrls[4] = undefined;
      extraFilenames[4] = roomAsImage5.filename;
    }
    // Image 1 of this still (the queue may cut it out on white; it is the same picture).
    const imageOnePlate = omitGarment ? identityPlate : (identityPlate ?? slotQueuePlate);
    // A nude one-person still on Qwen-Image 2.1: the Cast's undressed plate as Image 2 carries
    // her body (day-still-prompt.ts withNudeBodyPlateLine). Not face-down beats — those go to
    // Rapid, where the plate's latent kept its underwear.
    const nudeBodyPlate =
      adultStill &&
      omitGarment &&
      !partnerFace &&
      !thirdPerson &&
      poseProfileForModel(stillModel).family === 'qwen-image-2.1' &&
      !extraFilenames[1]?.trim() &&
      !extraUrls[1] &&
      !isFaceDownNudeSolo(finalized, true)
        ? dayLeadBodyPlate({
            candidate: resolveDayQueueIdentityPlate({
              character: lookCharacter,
              displayPlate: lookPlate,
              preferCastPlate: true,
            }),
            imageOne: imageOnePlate,
            imageOneIsFaceCrop: faceOnlyIdentity,
          })
        : null;
    const nudeBodyAttached = Boolean(
      nudeBodyPlate?.filename?.trim() || nudeBodyPlate?.imageUrl?.trim()
    );
    if (nudeBodyPlate && nudeBodyAttached) {
      // By its picture URL, as the dress plate goes: the bare output filename is not an input
      // ComfyUI can load (every still of the Day failed to queue with it).
      const bodyUrl = nudeBodyPlate.imageUrl?.trim();
      extraUrls[1] = bodyUrl || undefined;
      extraFilenames[1] = bodyUrl ? '' : (nudeBodyPlate.filename?.trim() ?? '');
    }
    // A nude two-person still on Qwen-Image 2.1 (sex layouts already went to Rapid): the lead's
    // undressed Cast plate in the next free picture carries her body, as on a nude solo.
    let nudeDuoBodySlot: number | null = null;
    if (
      adultStill &&
      omitGarment &&
      Boolean(partnerFace) &&
      !thirdPerson &&
      poseProfileForModel(stillModel).family === 'qwen-image-2.1'
    ) {
      // Not when Image 1 is already that whole plate (no face crop): her body twice.
      const plate = dayLeadBodyPlate({
        candidate: resolveDayQueueIdentityPlate({
          character: lookCharacter,
          displayPlate: lookPlate,
          preferCastPlate: true,
        }),
        imageOne: imageOnePlate,
        imageOneIsFaceCrop: faceOnlyIdentity,
      });
      const plateUrl = plate?.imageUrl?.trim();
      const plateFile = plate?.filename?.trim();
      let slot = 2;
      while (slot < 5 && (extraFilenames[slot]?.trim() || extraUrls[slot])) slot += 1;
      if ((plateUrl || plateFile) && slot < 5) {
        // By URL, as the solo body plate: a bare output filename is not a loadable input.
        extraUrls[slot] = plateUrl || undefined;
        extraFilenames[slot] = plateUrl ? '' : (plateFile ?? '');
        nudeDuoBodySlot = slot;
      }
    }
    // A clothed two-person still on Qwen-Image 2.1: the lead's dressed plate (or an Outfit
    // Keep, already dressed) as Image 3 carries her body and outfit next to the two faces
    // (day-still-prompt.ts withDuoLeadBodyLine).
    // Only next to a face crop: on 2.1 Image 1 is the full dressed plate / Keep (still-plan.ts),
    // and the same picture again as Image 3 put her whole body in the graph twice.
    const duoBodySource =
      !adultStill &&
      Boolean(partnerFace) &&
      !thirdPerson &&
      poseProfileForModel(stillModel).family === 'qwen-image-2.1' &&
      !extraFilenames[3]?.trim() &&
      !extraUrls[3]
        ? dayLeadBodyPlate({
            candidate: dressedPlate ?? (lookPlate?.source === 'keeper' ? lookPlate : null),
            imageOne: imageOnePlate,
            imageOneIsFaceCrop: faceOnlyIdentity,
          })
        : null;
    const duoBodyUrl = duoBodySource?.imageUrl?.trim();
    const duoBodyFile = duoBodySource?.filename?.trim();
    const duoBodyAttached = Boolean(duoBodyUrl || duoBodyFile);
    // Image 3 when free; else Image 4 — the clothed duo's pose map (Image 3) is dropped by
    // the 2.1 converter, which renumbers the plate to Image 3.
    const duoBodySlot = extraFilenames[2]?.trim() || extraUrls[2] ? 3 : 2;
    if (duoBodyAttached) {
      extraUrls[duoBodySlot] = duoBodyUrl || undefined;
      extraFilenames[duoBodySlot] = duoBodyUrl ? '' : (duoBodyFile ?? '');
    }
    // The partner Cast's body the same way: their Outfit Keep, else their Cast plate dressed
    // once in their kept outfit (cached like the lead's). An invented partner has no plate.
    let partnerBodySlot: number | null = null;
    if (
      !adultStill &&
      Boolean(partnerFace) &&
      !thirdPerson &&
      poseProfileForModel(stillModel).family === 'qwen-image-2.1' &&
      partnerCharacter &&
      slotPartner &&
      !slotPartner.invented
    ) {
      const partnerKeep = resolveDayPlate({
        character: partnerCharacter,
        gallery: loadComfyGallery(),
      });
      let partnerBody: { filename?: string; imageUrl?: string } | null =
        partnerKeep?.source === 'keeper' ? partnerKeep : null;
      if (!partnerBody) {
        const kept = activeLook(partnerCharacter)?.keptOutfit;
        const kitId = kept?.wardrobeId?.trim() || partnerCharacter.lockedWardrobeId?.trim() || '';
        const photoUrl = kept?.customGarmentImageUrl?.trim();
        const photoFile = kept?.customGarmentImageFilename?.trim();
        const kitUrl = kitId ? resolveWardrobeGarmentThumbQueueUrl(kitId) : undefined;
        const partnerCast = resolveDayCastPlate(partnerCharacter);
        const clothing =
          photoUrl || photoFile
            ? { imageUrl: photoUrl || undefined, imageFilename: photoFile || undefined }
            : kitUrl
              ? { imageUrl: kitUrl }
              : null;
        if (clothing && partnerCast && stillModel) {
          try {
            const { ensureDayDressPlate } = await import('@/lib/day/dress-plate-client');
            const { entry } = await ensureDayDressPlate(
              {
                model: stillModel,
                plate: { filename: partnerCast.filename, imageUrl: partnerCast.imageUrl },
                clothing,
                clothingKey: photoUrl || photoFile ? undefined : `kit:${kitId}`,
                clothingLabel:
                  photoUrl || photoFile
                    ? dayGarmentPromptName(kept?.customGarmentDescription) || 'the outfit'
                    : dayOutfitPromptName(wardrobeLabelFor(kitId)) || 'the outfit',
                clothingDescription:
                  photoUrl || photoFile ? kept?.customGarmentDescription : undefined,
                footwear: normalizeFootwear(kept?.footwear),
                footwearImage: {
                  imageUrl: kept?.footwearImageUrl,
                  imageFilename: kept?.footwearImageFilename,
                },
                subject: slotPartner.noun === 'man' ? 'he' : 'she',
                characterName: partnerCharacter.name,
                characterId: partnerCharacter.id,
                lookId: activeLook(partnerCharacter)?.id,
              },
              { sendComfyUi: actions.sendComfyUi, visionShared: sharedRef.current }
            );
            partnerBody = { filename: entry.filename, imageUrl: entry.imageUrl };
          } catch {
            // No partner plate this time: their body stays in words.
          }
        }
      }
      const partnerUrl = partnerBody?.imageUrl?.trim();
      const partnerFile = partnerBody?.filename?.trim();
      if (partnerUrl || partnerFile) {
        let slot = 2;
        while (slot < 5 && (extraFilenames[slot]?.trim() || extraUrls[slot])) slot += 1;
        if (slot < 5) {
          for (let fill = extraFilenames.length; fill < slot; fill += 1) extraFilenames[fill] = '';
          extraUrls[slot] = partnerUrl || undefined;
          extraFilenames[slot] = partnerUrl ? '' : (partnerFile ?? '');
          partnerBodySlot = slot;
        }
      }
    }
    const hasExtras =
      extraUrls.some((url, index) => index > 0 && Boolean(url)) ||
      extraFilenames.some((name, index) => index > 0 && Boolean(name.trim()));
    // Image 1 meant as a face crop, and the clothing image, checked against their roles
    // (cached per picture: the same crop goes out with every still of the Day).
    const plainReferenceNote = await checkStillReferences({
      face: faceOnlyIdentity ? imageOnePlate : null,
      clothing:
        !partnerFace && !nudeBodyAttached && extraFilenames[1]?.trim()
          ? { filename: extraFilenames[1] }
          : null,
      subject: lookCharacter?.name,
      comfyUrl: loadComfyUiSettings().apiUrl?.trim() || undefined,
    });
    if (plainReferenceNote) referenceNotes.push(plainReferenceNote);
    const queueOptions = !lookHasPlate
      ? undefined
      : imageOnePlate?.filename?.trim() || imageOnePlate?.imageUrl?.trim()
        ? {
            inputImageFilename: imageOnePlate?.filename?.trim() || undefined,
            inputImageUrl: imageOnePlate?.imageUrl?.trim() || undefined,
            ...(hasExtras
              ? {
                  ...(extraUrls.some(url => Boolean(url)) ? { inputImageUrls: extraUrls } : {}),
                  ...(extraFilenames.some(name => Boolean(name.trim()))
                    ? { inputImageFilenames: extraFilenames }
                    : {}),
                }
              : {}),
          }
        : undefined;
    // 2.0: pin Cast face onto Day stills the same way Outfit plates already do —
    // don't rely on whatever leftover session IP-Adapter shared happens to hold.
    // The active look's: a slot made in another look must not switch the session to it (its
    // own face goes on the job, below).
    if (character) {
      syncSharedIdentityToCast(character);
    }
    const dayMood = normalizeDayMood(toolSettings.dayMood);
    const intimateMix = normalizeDayIntimateMix(toolSettings.intimateMix);
    const clothedUnlockClass = clothedHeatUnlockPoseClass(queueTarget.sceneHints, dayMood);
    // Soft sit/lounge face-breaks need firmer face lock; hard upright stays softer
    // so Image 3 stance still wins. Blanket 0.06 on every slot caused identity float.
    const uprightHardFaceBreak =
      vacationFaceBreak && dayVacationPoseNeedsBodyUnlock(clothedUnlockClass);
    // Everyday keeps the whole standing Keep as Image 1, and Edit-2511 anchors pose from
    // Image 1 — so a seated/crouching/lying beat needs the identity lock loosened the way
    // the heat moods already do, or the plate's stance wins no matter what the prompt says.
    const everydayPoseUnlock =
      toolSettings.posePriority !== false &&
      !isDayHeatMood(dayMood) &&
      isDayPoseStickyEditModel(stillModel) &&
      (Boolean(poseGuideFilename) || lightningIdentityPath);
    // Nude Solo: always soft-cap identity even without Image 3 — high IP + lingerie
    // face crop is how beige bras win over FULLY NUDE.
    const identityCap =
      isDayAdultMood(dayMood) && omitGarment && intimateMix !== 'duo'
        ? DAY_ADULT_SOLO_NUDE_IDENTITY_LOCK_CAP
        : isDayAdultMood(dayMood) && Boolean(poseGuideFilename)
          ? intimateMix === 'duo'
            ? DAY_ADULT_DUO_IDENTITY_LOCK_CAP
            : Math.min(DAY_PLATE_IDENTITY_LOCK_CAP, STORY_INTIMATE_POSE_IDENTITY_LOCK_CAP)
          : uprightHardFaceBreak
            ? DAY_VACATION_UPRIGHT_FACE_IDENTITY_LOCK_CAP
            : vacationFaceBreak
              ? DAY_VACATION_FACE_BREAK_IDENTITY_LOCK_CAP
              : (dayMood === 'vacation' || dayMood === 'suggestive') && Boolean(poseGuideFilename)
                ? DAY_VACATION_POSE_IDENTITY_LOCK_CAP
                : everydayPoseUnlock
                  ? DAY_EVERYDAY_POSE_IDENTITY_LOCK_CAP
                  : DAY_PLATE_IDENTITY_LOCK_CAP;
    const identityStrength = Math.min(shared.ipAdapterStrength ?? 0.75, identityCap);
    // Pin the shared face-crop filename on the job (Lightning does not splice IP).
    const croppedFaceFilename =
      nudeFaceAutoCropped || vacationFaceBreak
        ? identityPlate?.filename?.trim() || undefined
        : undefined;
    const faceQueueParams = croppedFaceFilename
      ? {
          ipAdapterImageFilename: croppedFaceFilename,
          ipAdapterImageFilenames: [croppedFaceFilename],
          ipAdapterStrength: identityStrength,
        }
      : omitGarment && castFaceDuplicatesBodyPlate(lookCharacter)
        ? undefined
        : castFaceQueueParamsBase(lookCharacter, identityStrength);
    const castLoras = castLoraSessionIds(lookCharacter);
    const poseUnlockDenoise = uprightHardFaceBreak
      ? DAY_VACATION_UPRIGHT_FACE_DENOISE
      : vacationFaceBreak
        ? DAY_VACATION_POSE_DENOISE
        : (dayMood === 'vacation' || dayMood === 'suggestive') && Boolean(poseGuideFilename)
          ? DAY_VACATION_POSE_DENOISE
          : everydayPoseUnlock
            ? DAY_EVERYDAY_POSE_DENOISE
            : undefined;
    // Plate + pose Image 3 need an Edit-capable model. Adult nude + Rapid AIO
    // must use Edit NSFW — SFW Edit soft-censors into beige lingerie.
    const plateQueueModel = lookHasPlate
      ? resolveAdultNudePlateQueueModel(stillModel, {
          adultNude: isDayAdultMood(dayMood) && omitGarment,
        })
      : undefined;
    // Sent as queueModel below; the picked engine is left as you picked it (the take's plan
    // decides for the engine it renders on — take-plan.ts takeEngineFor).
    const withDuoPartnerSlotLine = (prompt: string) =>
      partnerBodySlot !== null && slotPartner
        ? withDuoPartnerBodyLine(
            prompt,
            slotPartner.noun === 'man' ? 'man' : 'woman',
            partnerBodySlot === 2 ? 'third' : partnerBodySlot === 3 ? 'fourth' : 'fifth'
          )
        : prompt;
    const withNudeDuoBody = (prompt: string) =>
      nudeDuoBodySlot === null
        ? prompt
        : withNudeDuoLeadBodyLine(
            prompt,
            leadNoun === 'man',
            nudeDuoBodySlot === 2 ? 'third' : nudeDuoBodySlot === 3 ? 'fourth' : 'fifth'
          );
    // No garment: the queue compacts the guide into the second image — say so.
    const numbered = queuedDayStillPrompt(
      withNudeDuoBody(
        thirdPerson
          ? roomAsImage4
            ? withPlacePhotoInPrompt(withThirdPerson(finalized, thirdPerson), 4, { lead: true })
            : roomAsImage5
              ? withPlacePhotoInPrompt(withThirdPerson(finalized, thirdPerson, fourthPerson), 5, {
                  lead: true,
                })
              : withThirdPerson(finalized, thirdPerson, fourthPerson)
          : roomAsImage4
            ? withPlacePhotoInLongAdultBrief(finalized, 4)
            : placePhoto?.asImage === 2
              ? (withRoomPhotoAsImage2(finalized, {
                  beat: queueTarget.sceneHints,
                  place: placePhoto.locationName,
                  words: queueTarget.location,
                }) ?? finalized)
              : placePhoto
                ? withPlacePhotoInPrompt(finalized, 3, {
                    lead: roomLedEngine,
                    place: placePhoto.locationName,
                    words: queueTarget.location,
                  })
                : adultPlacePhoto
                  ? withPlacePhotoInAdultPrompt(finalized)
                  : adultDuoPlacePhoto
                    ? withPlacePhotoInAdultPrompt(finalized, 3, { replacesMap: true })
                    : nudeBodyAttached
                      ? withNudeBodyPlateLine(finalized, leadNoun === 'man')
                      : duoBodyAttached || partnerBodySlot !== null
                        ? withDuoPartnerSlotLine(
                            duoBodyAttached
                              ? withDuoLeadBodyLine(
                                  finalized,
                                  leadNoun === 'man',
                                  duoBodySlot === 3 ? 'fourth' : 'third'
                                )
                              : finalized
                          )
                        : finalized
      ),
      {
        second: Boolean(extraFilenames[1]?.trim() || extraUrls[1]),
        third: Boolean(extraFilenames[2]?.trim() || extraUrls[2]),
      }
    );
    // Text contradictions that only ever showed up as a bad render (a solo still that talks
    // about "the two people", shoes ordered on a barefoot beat, a third image that is not
    // attached). What can be repaired without guessing is repaired; the rest raises a
    // notice. Never a block — the still is queued either way.
    const checked = repairStillPrompt(numbered.prompt, {
      people: poseExpectation?.keypoints.length || undefined,
      imageCount:
        1 +
        extraFilenames
          .map((name, index) => Boolean(name?.trim() || extraUrls[index]))
          .filter((attached, index) => index > 0 && attached).length,
      // Clothed stills: the pose's furniture must fit the Setting. Adult beats own their rooms.
      setting: adultStill
        ? null
        : resolveRoleplaySetting(queueTarget.location, shared.lockedLocation) || undefined,
      framing: queueTarget.poseCamera?.shot ?? null,
    });
    const queuedPrompt = checked.prompt;
    if (checked.repaired.length > 0) {
      console.info('Day prompt check repaired:', queueTarget.label, checked.repaired);
    }
    if (checked.remaining.length > 0) {
      console.warn('Day prompt check:', queueTarget.label, checked.remaining, queuedPrompt);
      pushSystemTrayMessage({
        text: stillPromptIssuesLine(checked.remaining, queueTarget.label),
        tone: 'warning',
        ttlMs: 20_000,
      });
    }
    // Same seed: the take's seed from its gallery entry. Without one the redo would be a
    // fresh roll that only looks like a comparison, so it stops instead.
    let sameSeed: string | undefined;
    let previousTake: DaySlotStill['previousTake'];
    if (options?.sameSeed) {
      const current = stillsRef.current.find(entry => entry.slotId === queueTarget.id);
      const takeId = current?.promptId?.trim();
      const entry = takeId
        ? loadComfyGallery().find(galleryEntry => galleryEntry.promptId === takeId)
        : undefined;
      sameSeed = entry?.queueParams?.seed?.toString().trim() || undefined;
      const shown = dayStillShownImage(current);
      if (!sameSeed || !shown) {
        throw new Error(
          `${queueTarget.label}: this take's seed isn't in the gallery any more — use Requeue for a new take.`
        );
      }
      previousTake = { imageUrl: shown, promptId: takeId };
    } else if (options?.keepTake?.imageUrl) {
      previousTake = options.keepTake;
    }
    // Two takes (intimate stills): the same prompt queued twice back to back, two seeds; the
    // player picks one when both land (day-two-takes.ts). Never paired by pose score.
    const twoTakes = dayTwoTakesApplies({
      enabled: toolSettings.twoTakesIntimate === true,
      intimateStill: isDayAdultMood(toolSettings.dayMood) && intimateEnabled,
      sameSeed: Boolean(sameSeed),
      keepsATake: Boolean(previousTake),
    });
    // Best of two for hard poses in ONE job when the Castcut node pack is installed: both
    // takes render as a batch, the pose check runs in the job and the closer take is saved
    // (castcut-nodes.ts). Without the pack the second take is queued after the first lands.
    let castcutPoseGuide: string | undefined;
    const pairRule = {
      enabled: toolSettings.bestOfTwoHardPoses === true && !twoTakes,
      autoReview: toolSettings.autoReviewStills === true,
      poseKey: poseExpectation?.poseKey,
      keepsATake: Boolean(sameSeed || previousTake),
    };
    if (
      poseExpectation &&
      // The one-job pair returns two takes at once; the adult-appearance gate checks one.
      !adultSafeguards &&
      bestOfTwoAsOneJob({ ...pairRule, packInstalled: true }) &&
      castcutBestOfTwoAvailable(await fetchComfyObjectInfoNodeTypesCached().catch(() => null))
    ) {
      castcutPoseGuide = castcutGuideJson(poseExpectation.keypoints, poseExpectation.aspect);
    }
    const sendOptions: NonNullable<Parameters<typeof actions.sendComfyUi>[3]> = {
      ...(queueOptions ?? {}),
      ...(lookHasPlate
        ? {
            queueTool: 'image-prompt',
            castPlateReference: true,
            // A face crop is filename-only (no size probe) and says nothing about the body.
            // Lying solo stills on Qwen-Image 2.1: landscape (see faceCropCanvas); 16:9 stills.
            ...(stillCanvas ? { figurePixelSize: { ...stillCanvas } } : {}),
            // Strong turbo rewrite fights face lock on Edit-2511 face-break Day.
            turboEditStrength:
              vacationFaceBreak || lightningIdentityPath || everydayPoseUnlock
                ? 'balanced'
                : 'strong',
            identityLock: true,
            identityLockStrength: identityStrength,
            // Lightning skips IP/InstantID insert; InstantID is wrong for Qwen UNET.
            ...(plateQueueModel ? { queueModel: plateQueueModel } : {}),
          }
        : {}),
      characterId: shared.activeCharacterId,
      lookId: slotLook.lookId ?? shared.activeLookId ?? character?.activeLookId,
      ...(faceQueueParams || poseUnlockDenoise != null || castcutPoseGuide
        ? {
            queueParamsBase: {
              ...faceQueueParams,
              ...(poseUnlockDenoise != null ? { denoise: poseUnlockDenoise } : {}),
              ...(castcutPoseGuide ? { castcutPoseGuide } : {}),
            },
          }
        : {}),
      ...(castLoras ? { sessionActiveLoraIds: castLoras } : {}),
      // Render quality comes from Day's Quality preset (the tool's queue profile); an explicit
      // per-queue profile still wins.
      ...(options?.qualityProfile ? { qualityProfile: options.qualityProfile } : {}),
      ...(adultSafeguards
        ? {
            adultGate: {
              strong: options?.strongAgeLine === true,
              covered: options?.coverageLine === true,
            },
          }
        : {}),
    };
    // The pose this take counts under (pose × engine stats, kept seeds).
    let trackedPoseKey = poseExpectation?.poseKey;
    if (!trackedPoseKey && lookHasPlate) {
      try {
        trackedPoseKey = plannedDaySlotPoseKey(
          planDaySlotPose({
            slot: queueTarget,
            dayMood:
              isDayAdultMood(toolSettings.dayMood) && !intimateEnabled
                ? 'everyday'
                : toolSettings.dayMood,
            intimateMix: toolSettings.intimateMix,
            allowCompanions: toolSettings.allowCompanions === true,
            model: stillModel,
          }),
          queueTarget.id
        );
      } catch {
        trackedPoseKey = undefined;
      }
    }
    const intimateStill = isDayAdultMood(toolSettings.dayMood) && intimateEnabled;
    const lastTake = stillsRef.current.find(entry => entry.slotId === queueTarget.id);
    const gallerySeed = (takeId: string | null | undefined) => {
      const id = takeId?.trim();
      if (!id) return null;
      const seed = loadComfyGallery().find(entry => entry.promptId === id)?.queueParams?.seed;
      return seed != null ? seed.toString() : null;
    };
    // Kept seeds: an intimate still of a layout the player has kept before starts from one of
    // those seeds (in turn, then a random roll). Never for a Looks wrong redo (a new seed is
    // the point), a same-seed redo or a pair's second take; never the seed being replaced.
    const keptSeed =
      intimateStill && !sameSeed && !previousTake
        ? takeKeptSeed({
            poseKey: trackedPoseKey,
            model: stillModel,
            fresh: options?.looksWrong === true,
            exclude: [gallerySeed(lastTake?.promptId), gallerySeed(lastTake?.twoTakes?.promptId)],
          })
        : null;
    const firstSeed = sameSeed ?? keptSeed ?? undefined;
    const promptId = await actions.sendComfyUi(queuedPrompt, undefined, undefined, {
      ...sendOptions,
      ...(firstSeed ? { seed: firstSeed } : {}),
    });
    // Two takes: the second right behind the first (same engine, so the model-aware queue
    // keeps them together), on a new seed. If it can't be queued the first stands alone.
    let secondPromptId: string | undefined;
    if (twoTakes && typeof promptId === 'string') {
      try {
        const second = await actions.sendComfyUi(queuedPrompt, undefined, undefined, sendOptions);
        if (typeof second === 'string' && second.trim() && second !== promptId) {
          secondPromptId = second.trim();
        }
      } catch (secondError) {
        console.warn('Day: the second take was not queued:', queueTarget.label, secondError);
        pushAppToast({
          text: `${queueTarget.label}: the second take wasn't queued (${shortErrorText(secondError)}) — the first one is on its way.`,
          tone: 'warning',
          ttlMs: 12_000,
        });
      }
    }
    // What she wore, for Cast home's wardrobe (cast-wardrobe.ts) — not a beat that drops the
    // outfit (nude, or the mood's own clothes).
    if (typeof promptId === 'string' && !omitGarment && !replaceKeepOutfit) {
      recordCastOutfitWorn(lookCharacter?.id, {
        outfit: {
          wardrobeId: wardrobeId || undefined,
          customGarmentImageUrl: wardrobeId ? undefined : outfit.customGarmentImageUrl,
          customGarmentImageFilename: wardrobeId ? undefined : outfit.customGarmentImageFilename,
          customGarmentDescription: wardrobeId ? undefined : outfit.customGarmentDescription,
          footwear: outfit.footwear,
          footwearImageUrl: outfit.footwearImageUrl,
          footwearImageFilename: outfit.footwearImageFilename,
        },
        label: wardrobeId
          ? formatWardrobeKitLabel(wardrobeLabelFor(wardrobeId) || '') || wardrobeId
          : dayGarmentPromptName(outfit.customGarmentDescription) || 'Clothing photo',
        promptId,
      });
    }
    // Pose × engine stats: the take, and whether it redoes the slot's last one.
    if (typeof promptId === 'string') {
      notePoseTakeQueued({
        takeId: promptId,
        poseKey: trackedPoseKey,
        model: stillModel,
        surface: 'day',
        // A pair's second take leaves the first to the pair's pick.
        replaces: !options?.keepTake && lastTake?.status === 'completed' ? lastTake.promptId : null,
        seed: firstSeed ?? gallerySeed(promptId),
        intimate: intimateStill,
      });
      // The second of two takes is the other half of a pick, not a redo.
      if (secondPromptId) {
        notePoseTakeQueued({
          takeId: secondPromptId,
          poseKey: trackedPoseKey,
          model: stillModel,
          surface: 'day',
          seed: gallerySeed(secondPromptId),
          intimate: intimateStill,
        });
      }
    }
    const nextStills = upsertDaySlotStill(stillsRef.current, {
      slotId: queueTarget.id,
      promptId: typeof promptId === 'string' ? promptId : undefined,
      status: promptId ? 'queued' : 'error',
      imageUrl: undefined,
      clipPromptId: undefined,
      clipRenderPromptId: undefined,
      clipUrl: undefined,
      clipStatus: undefined,
      // Shown on the slot card ("Prompt check: fixed 1"); a clean prompt clears the last one.
      promptCheck: stillPromptCheckRecord(checked),
      beatKey: rerollBeatKey(queueTarget.sceneHints) || undefined,
      dressedPlateUrl: dressedPlate
        ? dressedPlate.imageUrl?.trim() || comfyInputViewUrl(dressedPlate.filename) || undefined
        : undefined,
      previousTake,
      bestOfTwo: undefined,
      bestOfTwoJob: castcutPoseGuide ? true : undefined,
      twoTakes: secondPromptId ? { promptId: secondPromptId, status: 'queued' } : undefined,
      redoReason: options?.looksWrong && promptId ? 'looks-wrong' : undefined,
      adultHold: undefined,
      adultGated: adultSafeguards ? true : undefined,
      engineNote:
        pinNote ?? poseEngineSwap?.reason ?? clothedOnlyHandOffNote(shared.model, stillModel),
      referenceNote: referenceNotes.length > 0 ? referenceNotes.join(' ') : undefined,
    });
    stillsRef.current = nextStills;
    // A new picture over a finished one: its line, tone and reply were for the old picture.
    const replacing = Boolean(promptId) && lastTake?.status === 'completed' && !scriptLineStays();
    const slotsBefore = latestSlotsRef.current;
    const slotsAfter = replacing
      ? slotsBefore.map(entry => (entry.id === queueTarget.id ? clearDaySlotLine(entry) : entry))
      : null;
    const lineCleared = Boolean(slotsAfter?.some((entry, index) => entry !== slotsBefore[index]));
    if (slotsAfter && lineCleared) latestSlotsRef.current = slotsAfter;
    updateToolSettings({
      ...dayStillsCachePatch(nextStills, shared.activeCharacterId),
      ...(slotsAfter && lineCleared ? { slots: slotsAfter } : {}),
      ...(partnerSentFace
        ? {
            partnerSentFace: {
              ...partnerSentFace,
              url: comfyInputViewUrl(partnerSentFace.filename) ?? '',
            },
          }
        : {}),
    });
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Could not queue that moment.');
    const nextStills = upsertDaySlotStill(stillsRef.current, {
      slotId: slot.id,
      status: 'error',
      promptCheck: undefined,
      twoTakes: undefined,
      referenceNote: referenceNotes.length > 0 ? referenceNotes.join(' ') : undefined,
    });
    stillsRef.current = nextStills;
    updateToolSettings(dayStillsCachePatch(nextStills, shared.activeCharacterId));
  } finally {
    if (manageBusy) {
      setBusy(false);
    }
  }
}
