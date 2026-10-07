'use client';

import { realKitId } from '@/lib/outfit-handoff';
import { useEngineWarmUp } from '@/hooks/useEngineWarmUp';
import {
  type DayStillSlotOptions,
  assembleDayStillPrompt,
  buildDaySlotPromptForStill,
  dayBeatIsTyped,
  dayStillAgeFacts,
  dayStillSceneRedraw,
  dayStillSceneSlot,
  finishDayStillPrompt,
  queuedDayStillPrompt,
} from '@/lib/day-still-prompt';
import { dayMoodNeedsAdultSafeguards } from '@/lib/adult-appearance-gate';
import { isAdultContentPrompt } from '@/lib/adult-age-safeguard';
import {
  repairStillPrompt,
  stillPromptCheckRecord,
  stillPromptIssuesLine,
} from '@/lib/still-prompt-audit';
import { castPlateThumbUrl } from '@/lib/cast-plate-thumb';
import { installedComfyModels } from '@/lib/model-picker';
import {
  fetchComfyObjectInfoModelsCached,
  fetchComfyObjectInfoNodeTypesCached,
  readCachedComfyObjectInfoModels,
} from '@/lib/comfyui-object-info-cache';
import { COMFY_IMAGE_MODELS } from '@/lib/comfy-models/client';
import { poseProfileForModel } from '@/lib/pose/pose-model-profile';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import { applyDayPremiseBeats, requestDayPremiseBeats } from '@/lib/day-premise';
import { dayWalkingDuoSkipsPoseGuide } from '@/lib/rapid-duo-recipe';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { isLeanWorkspaceMode } from '@/lib/workspace-mode';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { parseCharacterHints } from '@/lib/character-hints';
import {
  assembleAndStampFilm,
  downloadFilmBlob,
  stampAssembledFilm,
} from '@/lib/character-film-assemble-lazy';
import { filmDownloadFilename } from '@/lib/character-film';
import { dayAfterOutfitHandoff } from '@/lib/day-outfit-scope';
import {
  activeLook,
  applyCharacterRecord,
  applyCharacterRecordFresh,
  castLoraSessionIds,
  characterHomeHref,
  looksOf,
  getCharacter,
  getCharactersSnapshot,
  getServerCharactersSnapshot,
  subscribeCharacters,
  upsertCharacter,
} from '@/lib/character-os';
import {
  markOnboardingFirstFilmCut,
  markOnboardingFirstPlayCampaign,
} from '@/lib/onboarding-hooks';
import { subjectGenderToClothingGender } from '@/lib/clothing-gender';
import {
  fetchClothingLabels,
  fetchClothingSelectOptions,
  getCachedClothingLabel,
  humanizeClothingId,
} from '@/lib/clothing-catalog-client';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  galleryEntryPrimaryViewUrl,
  loadComfyGallery,
  type ComfyGalleryEntry,
} from '@/lib/comfyui-gallery';
import { resolveAdultNudePlateQueueModel, resolveDayStillModel } from '@/lib/queue-tool-model';
import { useNsfwGeneratorEnabled } from '@/hooks/useNsfwGeneratorEnabled';
import { STORY_INTIMATE_POSE_IDENTITY_LOCK_CAP, resolveRoleplaySetting } from '@/lib/roleplay';
import {
  buildDaySlotMotionSubject,
  dayBeatOmitsGarmentPackshot,
  dayMoodReplacesKeepOutfit,
  dayQueueBlockReason,
  dayStillsCachePatch,
  dayWatchPlaylist,
  diversifyDaySlotScenes,
  alignDaySlotsToPeople,
  ensureDaySlotsMatchMood,
  isDayAdultMood,
  normalizeDayLength,
  isDayHeatMood,
  mergeDaySlotStills,
  nextDaySlotToEdit,
  normalizeDayIntimateMix,
  normalizeDayMood,
  normalizeDaySlotStills,
  normalizeDaySlots,
  promoteDayStillsToSoftPassChildren,
  rerollDaySlotScene,
  upsertDaySlotStill,
  dayStillShownImage,
  restorePreviousDayTake,
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
  setDayAvoidedBeatsSource,
} from '@/lib/day-planner';
import {
  castFaceDuplicatesBodyPlate,
  isClothingOnlyDayGarment,
  resolveDayCastPlate,
  resolveDayFaceOnlyPlate,
  resolveDayGarmentReinforce,
  resolveDayPlate,
  resolveDayQueueIdentityPlate,
} from '@/lib/day-plate';
import { resolveDayNudeIdentityPlateWithFaceCrop } from '@/lib/day-nude-face-crop';
import { comfyInputViewUrl } from '@/lib/face-match-client';
import {
  checkReferenceImage,
  checkStillReferences,
  referenceViewUrl,
} from '@/lib/reference-check-client';
import {
  dayMoodWantsAutoKit,
  pickDayAutoKit,
  dayOutfitArcKit,
  dayOutfitBlock,
} from '@/lib/day-auto-kit';
import {
  resolveDayVacationFaceBreakPlate,
  resolveDayVacationIdentityVlPlate,
  uploadDayIdentityLatentPlate,
} from '@/lib/day-vacation-face-crop';
import { dayVacationPoseNeedsBodyUnlock, clothedHeatUnlockPoseClass } from '@/lib/day-vacation';
import { buildDayPoseGuide } from '@/lib/day-pose-guide';
import { customPoseWords } from '@/lib/pose-describe';
import { bestOfTwoAsOneJob, setLearnedHardLayoutsSource } from '@/lib/day-best-of-two';
import { dayTwoTakesApplies } from '@/lib/day-two-takes';
import { castcutBestOfTwoAvailable, castcutGuideJson } from '@/lib/castcut-nodes';
import {
  dayClothedGuideContradictsBeat,
  daySlotPoseLayout,
  planDaySlotPose,
  plannedDaySlotPoseKey,
} from '@/lib/day-slot-pose';
import { notePoseTakeQueued, takeKeptSeed } from '@/lib/pose-outcome-stats';
import { pickPoseEngine } from '@/lib/pose/pose-engine-report';
import { blendedPoseEngineReport } from '@/lib/pose/pose-engine-report-blended';
import {
  DEFAULT_FILM_CUT_OPTIONS,
  type FilmCutOptionsValue,
} from '@/components/FilmCutOptionsControls';
import { probeImageUrlDimensions } from '@/lib/browser-image-dimensions';
import { dayThemeOf } from '@/lib/day-themes';
import { normalizeDayWeather } from '@/lib/day-weather';
import { dayGarmentPromptName, dayOutfitPromptName } from '@/lib/day-clothed-lead';
import { footwearIsBarefoot, normalizeFootwear } from '@/lib/footwear';
import {
  buildFootwearReferenceImage,
  footwearImageSuitsModel,
  hasFootwearImage,
} from '@/lib/footwear-image';
import { formatWardrobeKitLabel } from '@/lib/wardrobe-kit-picker';
import {
  renderDayPartnerStandIn,
  uploadDayPartnerVlFace,
  reusableDayPartnerStandIn,
  type DayPartnerStandIn,
} from '@/lib/day-partner-stand-in';
import {
  dayPartnerApplies,
  dayPartnerNoun,
  inventedDayPartner,
  toDayPartner,
  type DayPartner,
} from '@/lib/day-partner';
import { loadPoseLibrary, type NormalizedBody } from '@/lib/pose-library';
import { isOpenPoseStyle } from '@/lib/pose-guide-prompt';
import type { PoseLeadPosition } from '@/lib/pose-guide-openpose';
import type { PoseGuideStylePreference } from '@/lib/pose-guide-prompt';
import { loadPoseGuideStylePreference } from '@/lib/render-realism-settings';
import { readsPoseGuideImage } from '@/lib/model-denoise-defaults';
import { kleinSpoonRecipeApplies } from '@/lib/klein-duo-recipe';
import { shouldAppendKleinFaceReference } from '@/lib/klein-face-reference';
import {
  poseGuideFailureReason,
  recordPoseGuideOutcome,
  poseGuidePreviews,
  summarizePoseGuideOutcomes,
  type PoseGuideOutcome,
} from '@/lib/pose-guide-status';
import { useDayPlateIsolate } from '@/hooks/day-planner/useDayPlateIsolate';
import { collectIsolateSourceUrls, ISOLATE_QUEUE_BLOCKED_MESSAGE } from '@/lib/isolate-subject';
import { IDENTITY_MEDIA_URL } from '@/lib/gallery-media-client';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import {
  DRESS_PLATE_SHOE_PASS_STATUS,
  dayDressPlateStatus,
  type DayDressPlateEntry,
} from '@/lib/day-dress-plate';
import { loadDressPlates, removeDressPlate, subscribeDressPlates } from '@/lib/dress-plate-store';
import { dayDressPlateRequestKey } from '@/lib/day-dress-plate';
import {
  DAY_OUTFIT_LINE_RE,
  dayStillClothingReinforce,
  dayStillDressedPlateUse,
  dayStillFaceCropCanvas,
  dayStillFootwearApplies,
  dayStillIdentityRoute,
  dayStillLiesDown,
  dayStillWantsDressPlate,
} from '@/lib/day-still-plan';
import type { DayPlate } from '@/lib/day-plate';
import { pushSystemTrayMessage } from '@/lib/system-tray-messages';
import { NO_FACE_ON_PLATE_MESSAGE } from '@/lib/face-locate';

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
import {
  loadWardrobeGarmentThumbManifest,
  resolveWardrobeGarmentThumbQueueUrl,
} from '@/lib/wardrobe-garment-thumbs';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import {
  countWardrobeOptionsForFilter,
  filterWardrobeSelectOptions,
  normalizeWardrobeCategoryFilter,
} from '@/lib/wardrobe-catalog-ui';
import {
  applyLookPackToDaySlots,
  loadLookPack,
  lookPackNotes,
  lookPackRoleplayHref,
  saveLookPack,
} from '@/lib/look-pack';
import {
  bumpPlayCampaignStep,
  completePlayCampaign,
  resolvePlayLoopEntryCharacterId,
} from '@/lib/play-campaign';
import { castFaceQueueParamsBase, syncSharedIdentityToCast } from '@/lib/look-outfit-plate';
import { resolveDaySlotLook } from '@/lib/day-slot-look';
import {
  chronicRerollBeats,
  cuePoseLayouts,
  PLAY_METRICS_UPDATED_EVENT,
  poseLayoutFromKey,
  recordPlayerSlotRender,
  rerollBeatKey,
  rerollProneLayouts,
  weakPoseLayouts,
} from '@/lib/play-metrics';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { isGalleryClipEntry } from '@/lib/roleplay-film';
import { resolvePreferredVideoModel } from '@/lib/queue-tool-model';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  DEFAULT_DAY_TOOL_CACHE,
  DEFAULT_VIDEO_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
  saveSharedSettings,
} from '@/lib/settings-cache';

const TOOL_ID = 'day' as const;
type ClothingOption = { value: string; label: string; group?: string };

export function useDayPlannerToolOrchestrationCore() {
  const router = useRouter();
  const workspaceMode = useWorkspaceMode();
  const leanChrome = isLeanWorkspaceMode(workspaceMode);
  const intimateEnabled = useNsfwGeneratorEnabled();
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'day',
    DEFAULT_DAY_TOOL_CACHE
  );
  useEngineWarmUp({ mounted, model: shared.model });

  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filmGuideHref, setFilmGuideHref] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeSlotId, setActiveSlotId] = useState<DaySlotId>('morning');
  const [wardrobeLabels, setWardrobeLabels] = useState<Record<string, string>>({});
  // Whether Image 3 actually reached the queue, per slot — see pose-guide-status.
  const [poseGuideOutcomes, setPoseGuideOutcomes] = useState<PoseGuideOutcome[]>([]);
  const [assemblingFilm, setAssemblingFilm] = useState(false);
  const [filmStatus, setFilmStatus] = useState<string | null>(null);
  const [filmCutOptions, setFilmCutOptions] =
    useState<FilmCutOptionsValue>(DEFAULT_FILM_CUT_OPTIONS);
  const [filmNeedsCast, setFilmNeedsCast] = useState(false);
  const assembledFilmRef = useRef<{ filename: string; data: Uint8Array } | null>(null);
  const deepLinkHandled = useRef(false);
  const stillsRef = useRef(normalizeDaySlotStills(toolSettings.stills));
  const slotStatusRef = useRef<Partial<Record<DaySlotId, string>>>({});
  // "Same stranger all day": the invented partner's face, rendered once and reused. A ref, since
  // Queue day runs every slot inside one callback (settings would still hold the old value).
  const partnerStandInRef = useRef<DayPartnerStandIn | null>(toolSettings.partnerStandIn ?? null);
  useEffect(() => {
    partnerStandInRef.current = toolSettings.partnerStandIn ?? null;
  }, [toolSettings.partnerStandIn]);
  /** Dressed plates shared with Story and Outfit (dress-plate-store.ts), newest first. */
  const dressPlatesJson = useSyncExternalStore(
    subscribeDressPlates,
    () => JSON.stringify(loadDressPlates()),
    () => '[]'
  );
  const [dressPlateStatus, setDressPlateStatus] = useState<{
    text: string;
    busy: boolean;
  } | null>(null);
  /** One-shot prompt fixes from the quality gate, consumed by the next queue of that slot. */
  const rerollNudgeRef = useRef<Partial<Record<DaySlotId, string>>>({});
  /** Guide layout variant per slot — the quality gate bumps it so a reroll tries a new body. */
  const poseVariantRef = useRef<Partial<Record<DaySlotId, number>>>({});
  /** What each slot's last Image 3 guide asked for, so the gate can score the still against it. */
  const poseGuideExpectRef = useRef<Partial<Record<DaySlotId, DayPoseGuideExpectation>>>({});

  const slots = useMemo(
    () => normalizeDaySlots(toolSettings.slots, toolSettings.dayLength),
    [toolSettings.dayLength, toolSettings.slots]
  );
  // Latest slots for the outfit arc: Queue day runs every slot in one callback, whose `slots`
  // never sees the kit the slot before it just picked.
  const latestSlotsRef = useRef(slots);
  latestSlotsRef.current = slots;
  const stills = useMemo(
    () => normalizeDaySlotStills(toolSettings.stills, slots),
    [slots, toolSettings.stills]
  );
  stillsRef.current = stills;
  const watchPlaylist = useMemo(() => dayWatchPlaylist(stills, slots), [slots, stills]);
  const activeSlot = slots.find(slot => slot.id === activeSlotId) ?? slots[0]!;

  // When a still finishes, jump the editor to the next time-of-day that still needs work.
  useEffect(() => {
    let advancedFrom: DaySlotId | null = null;
    for (const slot of slots) {
      const status = stills.find(entry => entry.slotId === slot.id)?.status ?? 'idle';
      const previous = slotStatusRef.current[slot.id] ?? 'idle';
      if (
        previous !== 'completed' &&
        status === 'completed' &&
        (previous === 'queued' || previous === 'running' || activeSlotId === slot.id)
      ) {
        advancedFrom = slot.id;
      }
      slotStatusRef.current[slot.id] = status;
    }
    if (!advancedFrom) {
      return;
    }
    const nextId = nextDaySlotToEdit(slots, stills, advancedFrom);
    if (nextId && nextId !== activeSlotId) {
      setActiveSlotId(nextId);
    }
  }, [activeSlotId, slots, stills]);

  const character = getCharacter(shared.activeCharacterId);
  // Day's prompts are written for a woman lead; a man lead switches the adult duo recipe.
  const leadNoun = dayPartnerNoun(character ?? {});
  // The Cast store hydrates after first render; a one-off read left the partner picker without
  // the Cast until something else re-rendered Day.
  const castRoster = useSyncExternalStore(
    subscribeCharacters,
    getCharactersSnapshot,
    getServerCharactersSnapshot
  );
  const selectedModel = getComfyModelDefinition(shared.model);
  const [galleryEntries, setGalleryEntries] = useState<ComfyGalleryEntry[]>([]);
  const basePlate = useMemo(
    () => resolveDayPlate({ character, gallery: galleryEntries }),
    [character, galleryEntries]
  );
  const {
    plate,
    hasPlate,
    isolateSubject,
    isolatePending,
    isolateBusy,
    isolateStatus,
    platePreviewUrl,
    setIsolateSubject,
  } = useDayPlateIsolate({
    mounted,
    model: shared.model,
    characterId: shared.activeCharacterId,
    basePlate,
    toolSettings,
    updateToolSettings,
    setError,
  });
  // Display Keep when present. Everyday queues Keep as Image 1; Sport uses Cast so
  // Outfit Keep floral/street try-ons cannot win over athletic kit.
  const preferCastPlate = dayMoodReplacesKeepOutfit(toolSettings.dayMood);
  const queuePlate = useMemo(
    () =>
      resolveDayQueueIdentityPlate({
        character,
        displayPlate: plate,
        preferCastPlate,
      }),
    [character, plate, preferCastPlate]
  );

  // The plate for what is picked NOW (this Cast plate, clothing, shoes, engine). The store is
  // shared with Story and Outfit and holds other Casts' plates too: showing its newest entry
  // put another Cast's plate under this Day, and "Dress her again" removed that one.
  const currentDressPlate = useMemo(() => {
    const entries = JSON.parse(dressPlatesJson) as DayDressPlateEntry[];
    if (entries.length === 0 || plate?.source !== 'cast') return null;
    const castPlate = resolveDayQueueIdentityPlate({
      character,
      displayPlate: plate,
      preferCastPlate: true,
    });
    if (!castPlate) return null;
    const customFilename = toolSettings.customGarmentImageFilename?.trim();
    const customUrl = toolSettings.customGarmentImageUrl?.trim();
    const clothing =
      customFilename || customUrl
        ? [
            {
              clothing: { imageFilename: customFilename, imageUrl: customUrl },
              clothingDescription: toolSettings.customGarmentDescription,
            },
          ]
        : [
            ...new Set(
              [shared.lockedWardrobeId, ...slots.map(slot => slot.wardrobeId)]
                .map(id => id?.trim())
                .filter((id): id is string => Boolean(id))
            ),
          ].map(id => ({ clothingKey: `kit:${id}` }));
    // 2.1 hands clothed two-person stills to Rapid, which keys its own plate.
    const models = [shared.model, poseProfileForModel(shared.model).clothedDuoEngine].filter(
      (model): model is string => Boolean(model)
    );
    const keys = new Set(
      models.flatMap(model =>
        clothing.map(pick =>
          dayDressPlateRequestKey({
            model,
            plate: { filename: castPlate.filename, imageUrl: castPlate.imageUrl },
            clothingLabel: '',
            footwear: normalizeFootwear(toolSettings.footwear),
            footwearImage: {
              imageUrl: toolSettings.footwearImageUrl,
              imageFilename: toolSettings.footwearImageFilename,
            },
            subject: 'she',
            ...pick,
          })
        )
      )
    );
    return entries.find(entry => keys.has(entry.key)) ?? null;
  }, [
    character,
    dressPlatesJson,
    plate,
    shared.lockedWardrobeId,
    shared.model,
    slots,
    toolSettings.customGarmentDescription,
    toolSettings.customGarmentImageFilename,
    toolSettings.customGarmentImageUrl,
    toolSettings.footwear,
    toolSettings.footwearImageFilename,
    toolSettings.footwearImageUrl,
  ]);

  useEffect(() => {
    if (!mounted || typeof window === 'undefined') {
      return;
    }
    const refresh = () => {
      setGalleryEntries(loadComfyGallery());
    };
    refresh();
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, refresh);
    };
  }, [mounted]);

  const clothingGender = useMemo(
    () =>
      subjectGenderToClothingGender(
        parseCharacterHints(character?.hints || character?.descriptor).gender
      ),
    [character?.descriptor, character?.hints]
  );

  const [wardrobeOptions, setWardrobeOptions] = useState<ClothingOption[]>([
    { value: '', label: 'Default kit…' },
  ]);
  const [wardrobeLoadedKey, setWardrobeLoadedKey] = useState<string | null>(null);
  const wardrobeOptionsKey = `wardrobeCatalog:${clothingGender}`;
  const wardrobeReady = wardrobeLoadedKey === wardrobeOptionsKey;
  const wardrobeCategoryFilter = normalizeWardrobeCategoryFilter(
    toolSettings.wardrobeCategoryFilter
  );
  const filteredWardrobeOptions = useMemo(
    () =>
      filterWardrobeSelectOptions(
        wardrobeOptions,
        wardrobeCategoryFilter,
        activeSlot.wardrobeId || shared.lockedWardrobeId
      ),
    [activeSlot.wardrobeId, shared.lockedWardrobeId, wardrobeCategoryFilter, wardrobeOptions]
  );
  const wardrobeKitCount = useMemo(
    () => countWardrobeOptionsForFilter(wardrobeOptions, wardrobeCategoryFilter),
    [wardrobeCategoryFilter, wardrobeOptions]
  );

  useSeedToolDraft(mounted, {
    toolKey: TOOL_ID,
    label: 'Day',
    href: '/day',
    fields: [character?.name, activeSlot.sceneHints, toolSettings.notes],
  });

  const actions = usePromptResultActions({
    tool: TOOL_ID,
    model: shared.model,
    detail: shared.detail,
    hints: toolSettings.notes,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const updateSlot = useCallback(
    (slotId: DaySlotId, patch: Partial<DaySlot>) => {
      updateToolSettings({
        slots: slots.map(slot => (slot.id === slotId ? { ...slot, ...patch } : slot)),
      });
    },
    [slots, updateToolSettings]
  );

  useEffect(() => {
    if (!mounted || typeof window === 'undefined' || deepLinkHandled.current) {
      return;
    }
    deepLinkHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    const queryCharacterId = params.get('character')?.trim() || '';
    // 'custom-garment' (a clothing-photo try-on) is not a kit.
    const wardrobeId = realKitId(params.get('wardrobe')) || undefined;
    const fromLook = params.get('from')?.trim() === 'look';
    const characterId = resolvePlayLoopEntryCharacterId({
      queryCharacterId,
      activeCharacterId: shared.activeCharacterId,
    });

    const record = characterId ? getCharacter(characterId) : undefined;
    if (record) {
      try {
        // Not the "fresh" apply: opening the page re-binds the active Cast, and the fresh one
        // dropped its face lock, lock strength and locked kit on every visit. A switch to
        // another Cast clears those anyway (applyCharacterRecord).
        updateShared(applyCharacterRecord(record));
      } catch (err) {
        scheduleAfterCommit(() =>
          setError(err instanceof Error ? err.message : 'Could not apply that character.')
        );
      }
    }
    // Outfit's Use on Day / Keep: the kit is the whole Day's (the session's outfit lock). Slots
    // follow it — an earlier Day-wide kit stamped on them goes, a slot's own look or kit picked
    // by hand stays and the Look & clothing row says so (day-outfit-scope.ts). The kit used to
    // be forced onto every slot, over the slots' own picks, while their own looks still won.
    const pack = fromLook ? loadLookPack() : null;
    const dayKit = wardrobeId || realKitId(pack?.wardrobeId) || undefined;
    const handOff = (slots: DaySlot[] | undefined) =>
      dayAfterOutfitHandoff(
        { ...toolSettings, slots },
        {
          kitId: dayKit ?? shared.lockedWardrobeId,
          activeLookId: record ? activeLook(record).id : undefined,
          lookIds: record ? looksOf(record).map(look => look.id) : undefined,
          at: Date.now(),
        }
      );
    if (dayKit) {
      updateShared({ lockedWardrobeId: dayKit });
    }
    if (wardrobeId && !pack) {
      const handed = handOff(normalizeDaySlots(toolSettings.slots));
      updateToolSettings({ slots: handed.slots, outfitHandoffKept: handed.outfitHandoffKept });
    }
    if (fromLook) {
      // Keep the session pack for Roleplay handoff; Roleplay clears on apply.
      if (pack) {
        const handed = handOff(
          applyLookPackToDaySlots(normalizeDaySlots(toolSettings.slots), pack, { wardrobe: false })
        );
        const notes = lookPackNotes(pack);
        const moodAligned = ensureDaySlotsMatchMood(handed.slots, {
          dayMood: toolSettings.dayMood,
          intimateMix: toolSettings.intimateMix,
          allowCompanions: toolSettings.allowCompanions === true,
        });
        updateToolSettings({
          slots: moodAligned.slots,
          outfitHandoffKept: handed.outfitHandoffKept,
          notes: notes || toolSettings.notes,
        });
        scheduleAfterCommit(() =>
          setFilmStatus(
            moodAligned.changed
              ? 'Applied Look pack to day slots · refreshed adult Setting/Beat.'
              : 'Applied Look pack to day slots.'
          )
        );
      }
    }
  }, [
    mounted,
    shared.activeCharacterId,
    toolSettings.notes,
    toolSettings.slots,
    updateShared,
    updateToolSettings,
  ]);

  useEffect(() => {
    let cancelled = false;
    void fetchClothingSelectOptions('wardrobeCatalog', clothingGender).then(next => {
      if (cancelled) {
        return;
      }
      setWardrobeOptions(next);
      setWardrobeLoadedKey(wardrobeOptionsKey);
    });
    return () => {
      cancelled = true;
    };
  }, [clothingGender, wardrobeOptionsKey]);

  useEffect(() => {
    const ids = [
      ...new Set(slots.map(slot => slot.wardrobeId?.trim()).filter(Boolean) as string[]),
    ];
    if (ids.length === 0) {
      return;
    }
    let cancelled = false;
    void fetchClothingLabels(ids).then(labels => {
      if (cancelled) {
        return;
      }
      setWardrobeLabels(previous => {
        const next = { ...previous };
        for (const [id, label] of labels) {
          if (label) {
            next[id] = label;
          }
        }
        return next;
      });
    });
    for (const id of ids) {
      const cached = getCachedClothingLabel(id);
      if (cached) {
        setWardrobeLabels(previous =>
          previous[id] === cached ? previous : { ...previous, [id]: cached }
        );
      }
    }
    return () => {
      cancelled = true;
    };
  }, [slots]);

  useEffect(() => {
    const sync = () => {
      const current = stillsRef.current;
      const galleryEntries = loadComfyGallery();
      const promoted = promoteDayStillsToSoftPassChildren(
        current,
        galleryEntries.map(entry => ({
          id: entry.id,
          promptId: entry.promptId,
          parentGalleryEntryId: entry.parentGalleryEntryId,
          derivedKind: entry.derivedKind,
          status: entry.status,
          imageUrl: galleryEntryPrimaryViewUrl(entry),
          queuedAt: entry.queuedAt,
          prompt: entry.prompt,
        }))
      );
      const baseStills = promoted.changed ? promoted.stills : current;
      const wanted = new Set(
        baseStills
          .flatMap(still => [still.promptId?.trim(), still.twoTakes?.promptId?.trim()])
          .filter(Boolean) as string[]
      );
      const clipWanted = new Set(
        baseStills.map(still => still.clipPromptId?.trim()).filter(Boolean) as string[]
      );
      if (wanted.size === 0 && clipWanted.size === 0 && !promoted.changed) {
        return;
      }
      const gallery = galleryEntries
        .filter(entry => wanted.has(entry.promptId) || clipWanted.has(entry.promptId))
        .map(entry => ({
          promptId: entry.promptId,
          status: entry.status,
          imageUrl: galleryEntryPrimaryViewUrl(entry),
          isClip: isGalleryClipEntry(entry) || clipWanted.has(entry.promptId),
          adultCheck: entry.adultCheck?.state,
          adultCheckCause: entry.adultCheck?.cause,
        }));
      const merged = mergeDaySlotStills(baseStills, gallery);
      if (promoted.changed || merged.changed) {
        const next = merged.changed ? merged.stills : baseStills;
        stillsRef.current = next;
        updateToolSettings(dayStillsCachePatch(next, shared.activeCharacterId));
      }
    };
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, sync);
    sync();
    return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, sync);
  }, [shared.activeCharacterId, updateToolSettings]);

  const wardrobeLabelFor = useCallback(
    (wardrobeId?: string) => {
      const id = wardrobeId?.trim();
      if (!id) {
        return '';
      }
      // A kit auto-picked at queue time has no fetched label yet — the raw id went into the brief.
      return (
        wardrobeLabels[id] ??
        getCachedClothingLabel(id) ??
        wardrobeOptions.find(option => option.value === id)?.label ??
        humanizeClothingId(id)
      );
    },
    [wardrobeLabels, wardrobeOptions]
  );

  // A slot can be made in another of the Cast's looks — its plate, face, outfit and dressed
  // plate — without changing the active look (day-slot-look.ts). Unset (or the active look):
  // the same character, plates and outfit picks as before, so those stills are unchanged.
  const resolveSlotLook = useCallback(
    (slot: Pick<DaySlot, 'lookId'>) => {
      const resolved = resolveDaySlotLook({
        character,
        slot,
        gallery: galleryEntries,
        isolateSubject,
        outfit: {
          lockedWardrobeId: shared.lockedWardrobeId,
          customGarmentImageUrl: toolSettings.customGarmentImageUrl,
          customGarmentImageFilename: toolSettings.customGarmentImageFilename,
          customGarmentDescription: toolSettings.customGarmentDescription,
          footwear: toolSettings.footwear,
          footwearImageUrl: toolSettings.footwearImageUrl,
          footwearImageFilename: toolSettings.footwearImageFilename,
        },
      });
      if (!resolved.lookId) {
        return { ...resolved, plate, hasPlate: Boolean(hasPlate), queuePlate };
      }
      const lookPlate = resolved.plate ?? null;
      return {
        ...resolved,
        plate: lookPlate,
        hasPlate: Boolean(lookPlate?.filename?.trim() || lookPlate?.imageUrl?.trim()),
        queuePlate: resolveDayQueueIdentityPlate({
          character: resolved.character,
          displayPlate: lookPlate,
          preferCastPlate,
        }),
      };
    },
    [
      character,
      galleryEntries,
      hasPlate,
      isolateSubject,
      plate,
      preferCastPlate,
      queuePlate,
      shared.lockedWardrobeId,
      toolSettings.customGarmentDescription,
      toolSettings.customGarmentImageFilename,
      toolSettings.customGarmentImageUrl,
      toolSettings.footwear,
      toolSettings.footwearImageFilename,
      toolSettings.footwearImageUrl,
    ]
  );

  // The brief / recipe for one still is written in day-still-prompt.ts (the same code the
  // finished-prompt sweep runs); this only hands it the Day state.
  const buildSlotPrompt = useCallback(
    (slot: DaySlot, options?: DayStillSlotOptions) => {
      const look = resolveSlotLook(slot);
      return buildDaySlotPromptForStill(
        slot,
        {
          plate: look.plate,
          queuePlate: look.queuePlate,
          character: look.character,
          hasPlate: look.hasPlate,
          leadNoun,
          packshotUrl: resolveWardrobeGarmentThumbQueueUrl(
            slot.wardrobeId?.trim() || look.outfit.lockedWardrobeId?.trim()
          ),
          wardrobeLabel: dayOutfitPromptName(wardrobeLabelFor(slot.wardrobeId)),
          customGarmentUrl: look.outfit.customGarmentImageUrl,
          customGarmentFilename: look.outfit.customGarmentImageFilename,
          customGarmentDescription: look.outfit.customGarmentDescription,
          dayMood: toolSettings.dayMood,
          intimateEnabled,
          intimateMix: toolSettings.intimateMix,
          allowCompanions: toolSettings.allowCompanions === true,
          dayWeather: toolSettings.dayWeather,
          lockedLocation: shared.lockedLocation,
          notes: toolSettings.notes,
          model: shared.model,
          realismMode: shared.renderRealismMode,
          defaultPoseGuideStyle: loadPoseGuideStylePreference(shared.model),
        },
        options
      );
    },
    [
      resolveSlotLook,
      shared.lockedLocation,
      shared.model,
      shared.renderRealismMode,
      toolSettings.allowCompanions,
      toolSettings.dayMood,
      toolSettings.intimateMix,
      toolSettings.notes,
      toolSettings.dayWeather,
      intimateEnabled,
      leadNoun,
      wardrobeLabelFor,
    ]
  );

  // The engine one still renders on (its hand-offs: Edit 2511 adult nude → Rapid, 2.1 clothed duo
  // → Rapid), and the model it is queued as — Queue all groups stills by it (model-aware queue).
  const resolveSlotStillModel = useCallback(
    async (queueTarget: DaySlot) => {
      const omitGarment = dayBeatOmitsGarmentPackshot({
        blurb: queueTarget.sceneHints,
        prompt: [queueTarget.location, queueTarget.sceneHints].filter(Boolean).join(' · '),
        // The mood the still plays as: an adult mood with Intimate off is Everyday, as the
        // prompt builder already treats it — on the raw mood these stills started from a
        // face crop under an Everyday prompt.
        dayMood:
          isDayAdultMood(toolSettings.dayMood) && !intimateEnabled
            ? 'everyday'
            : toolSettings.dayMood,
        intimateMix: normalizeDayIntimateMix(toolSettings.intimateMix),
      });
      // Qwen Edit 2511 hands adult nude stills to Rapid AIO NSFW — this still only; the picked
      // engine stays picked (pose-model-profile: adultEngine).
      const adultNudeStill = isDayAdultMood(toolSettings.dayMood) && intimateEnabled && omitGarment;
      // What is installed, for the per-still hand-offs. The list is only in memory once
      // something has asked ComfyUI for it; in a fresh session it was missing and the hand-off
      // silently did not happen, so ask for it here when the picked engine has one.
      const handOffProfile = poseProfileForModel(shared.model);
      const bestEnginePerPose =
        toolSettings.bestEnginePerPose === true && resolveSlotLook(queueTarget).hasPlate;
      const handOffInventory =
        handOffProfile.adultEngine || handOffProfile.clothedDuoEngine || bestEnginePerPose
          ? (readCachedComfyObjectInfoModels() ??
            (await fetchComfyObjectInfoModelsCached().catch(() => null)))
          : null;
      const installed = (modelId: string) =>
        installedComfyModels(COMFY_IMAGE_MODELS, handOffInventory, shared.modelCheckpointMap)?.has(
          modelId
        ) === true;
      const playedMood = normalizeDayMood(
        isDayAdultMood(toolSettings.dayMood) && !intimateEnabled ? 'everyday' : toolSettings.dayMood
      );
      const routedStillModel = resolveDayStillModel(shared.model, {
        adultNude: adultNudeStill,
        // Qwen-Image 2.1 hands clothed two-person stills to Rapid (it fuses the pair).
        clothedDuo:
          !adultNudeStill &&
          // Not on the adult moods: their two-person beats that keep clothes on (a flash, a
          // wardrobe slip) belong on the adult engine, not plain Rapid.
          !(isDayAdultMood(toolSettings.dayMood) && intimateEnabled) &&
          planDaySlotPose({
            slot: queueTarget,
            dayMood: playedMood,
            intimateMix: toolSettings.intimateMix,
            allowCompanions: toolSettings.allowCompanions === true,
            model: shared.model,
          }).headcount >= 2,
        installed,
      });
      // "Pick the best engine per pose" (opt-in): a one-person clothed still whose pose the
      // routed engine keeps missing on the pose report card renders on an installed engine that
      // holds it — this still only, like the hand-offs above (pose-engine-report.ts).
      let poseEngineSwap: ReturnType<typeof pickPoseEngine> = null;
      if (bestEnginePerPose) {
        const { layout, headcount } = daySlotPoseLayout({
          slot: queueTarget,
          dayMood: playedMood,
          intimateMix: toolSettings.intimateMix,
          allowCompanions: toolSettings.allowCompanions === true,
          model: routedStillModel,
          weakLayouts: weakPoseLayouts(),
        });
        poseEngineSwap = pickPoseEngine({
          enabled: true,
          model: routedStillModel,
          layout,
          mood: playedMood,
          headcount,
          adult: adultNudeStill || (isDayAdultMood(toolSettings.dayMood) && intimateEnabled),
          installed,
          // The sweep's card, with this player's own keeps and redos folded in.
          report: blendedPoseEngineReport(),
        });
      }
      const stillModel = poseEngineSwap?.model ?? routedStillModel;
      // As queueSlot sends it: with a plate, the Edit-capable (and adult nude: NSFW) variant.
      const queueModel = resolveSlotLook(queueTarget).hasPlate
        ? resolveAdultNudePlateQueueModel(stillModel, {
            adultNude: isDayAdultMood(normalizeDayMood(toolSettings.dayMood)) && omitGarment,
          })
        : stillModel;
      return { omitGarment, stillModel, queueModel, poseEngineSwap };
    },
    [
      intimateEnabled,
      resolveSlotLook,
      shared.model,
      shared.modelCheckpointMap,
      toolSettings.allowCompanions,
      toolSettings.bestEnginePerPose,
      toolSettings.dayMood,
      toolSettings.intimateMix,
    ]
  );

  // The beat each slot last rendered for the player (re-roll record, play-metrics).
  const lastPlayerBeatRef = useRef<Record<string, string>>({});
  useEffect(() => {
    let avoided = chronicRerollBeats();
    let hard = rerollProneLayouts();
    const refresh = () => {
      avoided = chronicRerollBeats();
      hard = rerollProneLayouts();
    };
    setDayAvoidedBeatsSource(() => avoided);
    setLearnedHardLayoutsSource(() => hard);
    window.addEventListener(PLAY_METRICS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(PLAY_METRICS_UPDATED_EVENT, refresh);
  }, []);

  const queueSlot = useCallback(
    async (
      slot: DaySlot,
      options?: {
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
      }
    ) => {
      const manageBusy = options?.manageBusy !== false;
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
        let workingSlots = slots;
        const moodAligned = ensureDaySlotsMatchMood(slots, {
          dayMood: toolSettings.dayMood,
          intimateMix: toolSettings.intimateMix,
          allowCompanions: toolSettings.allowCompanions === true,
        });
        if (moodAligned.changed) {
          workingSlots = moodAligned.slots;
          updateToolSettings({ slots: moodAligned.slots });
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
            updateToolSettings({ slots: diversified.slots });
            queueTarget =
              diversified.slots.find(entry => entry.id === queueTarget.id) ?? queueTarget;
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
          pairedScenes:
            Boolean(dayThemeOf(toolSettings.dayMood)) ||
            normalizeDayMood(toolSettings.dayMood) === 'vacation' ||
            normalizeDayMood(toolSettings.dayMood) === 'sport',
        });
        if (redraw) {
          const redrawn = diversifyDaySlotScenes(
            workingSlots.map(entry =>
              entry.id === queueTarget.id ? { ...entry, ...redraw } : entry
            ),
            {
              allowCompanions: toolSettings.allowCompanions === true,
              dayMood: toolSettings.dayMood,
              intimateMix: toolSettings.intimateMix,
            }
          );
          const next = redrawn.slots.find(entry => entry.id === queueTarget.id);
          if (next?.sceneHints?.trim()) {
            workingSlots = redrawn.slots;
            updateToolSettings({ slots: redrawn.slots });
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
        let wardrobeId = queueTarget.wardrobeId?.trim() || outfit.lockedWardrobeId?.trim();
        // No kit, no clothing photo and the undressed Cast plate as Image 1: nothing dressed her,
        // so everyday / vacation stills came out in the plate's underwear. Pick a real kit.
        // The catalog list is filtered to the lead's gender, and the kit picker only offers what
        // is in it — a slot kit missing from it was left by another lead (a man in cocktail
        // dresses, live 2026-09-30). Treat it as unset.
        const catalogLoaded = wardrobeOptions.some(option => option.value);
        const fitsLead = (id: string | undefined) =>
          !id?.trim() || !catalogLoaded || wardrobeOptions.some(option => option.value === id);
        if (queueTarget.wardrobeId && !fitsLead(queueTarget.wardrobeId)) {
          queueTarget = { ...queueTarget, wardrobeId: undefined, wardrobeAuto: undefined };
          wardrobeId = outfit.lockedWardrobeId?.trim() || undefined;
        }
        // An auto-picked kit (not one the player chose) follows the outfit arc too.
        const autoKit = !queueTarget.wardrobeId?.trim() || queueTarget.wardrobeAuto === true;
        if (
          autoKit &&
          !outfit.lockedWardrobeId?.trim() &&
          lookHasPlate &&
          lookPlate?.source !== 'keeper' &&
          !outfit.customGarmentImageUrl?.trim() &&
          !outfit.customGarmentImageFilename?.trim() &&
          dayMoodWantsAutoKit(toolSettings.dayMood)
        ) {
          // Outfit arc: morning and afternoon share one outfit, evening and night another.
          // A kit an earlier slot picked in this same Queue day is only in the latest slots.
          const arcSlots = workingSlots.map(entry =>
            entry.wardrobeId?.trim()
              ? entry
              : (latestSlotsRef.current.find(latest => latest.id === entry.id) ?? entry)
          );
          const arcKit = dayOutfitArcKit(
            arcSlots.filter(entry => fitsLead(entry.wardrobeId)),
            queueTarget.id,
            toolSettings.dayMood
          );
          const picked =
            arcKit ??
            (wardrobeId ||
              pickDayAutoKit({
                options: wardrobeOptions,
                dayMood: toolSettings.dayMood,
                slotId: queueTarget.id,
                salt: lookCharacter?.id,
                hasPackshot: id => Boolean(resolveWardrobeGarmentThumbQueueUrl(id)),
                exclude: workingSlots.map(entry => entry.wardrobeId),
              }));
          if (picked && (picked !== queueTarget.wardrobeId || !queueTarget.wardrobeAuto)) {
            wardrobeId = picked;
            queueTarget = { ...queueTarget, wardrobeId: picked, wardrobeAuto: true };
            workingSlots = workingSlots.map(entry =>
              entry.id === queueTarget.id
                ? { ...entry, wardrobeId: picked, wardrobeAuto: true }
                : entry
            );
            updateToolSettings({ slots: workingSlots });
            latestSlotsRef.current = latestSlotsRef.current.map(entry =>
              entry.id === queueTarget.id
                ? { ...entry, wardrobeId: picked, wardrobeAuto: true }
                : entry
            );
          }
        }
        const packshotUrl = resolveWardrobeGarmentThumbQueueUrl(wardrobeId);
        const { omitGarment, stillModel, poseEngineSwap } =
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
        const castPlate =
          lookPlate?.source === 'cast'
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
            plateSource: lookPlate?.source,
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
            const { ensureDayDressPlate } = await import('@/lib/day-dress-plate-client');
            const { entry } = await ensureDayDressPlate(
              {
                model: stillModel,
                plate: { filename: castPlate.filename, imageUrl: castPlate.imageUrl },
                clothing,
                clothingKey: customGarmentPicked ? undefined : `kit:${wardrobeId ?? ''}`,
                clothingLabel: customGarmentPicked
                  ? dayGarmentPromptName(outfit.customGarmentDescription) || 'the outfit'
                  : dayOutfitPromptName(wardrobeLabelFor(wardrobeId)) || 'the outfit',
                clothingDescription: customGarmentPicked
                  ? outfit.customGarmentDescription
                  : undefined,
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
                visionShared: shared,
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
          preferCastPlate: replaceKeepOutfit || omitGarment,
          preferFaceOnlyPlate: omitGarment,
        });
        let nudeFaceAutoCropped = false;
        let vacationFaceBreak = false;
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
              identityPlate = faceBreak.facePlate;
              vacationFaceBreak = true;
              // Opt-in: full plate as a mid-size ReferenceLatent (never VL) — the head crop
              // alone leaves face-break behind the plate path on identity.
              if (
                toolSettings.identityBoost === true &&
                (bodyPlate?.filename || bodyPlate?.imageUrl)
              ) {
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
          (omitGarment &&
            (nudeFaceAutoCropped || Boolean(resolveDayFaceOnlyPlate(lookCharacter)))) ||
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
        // an invented man / woman ("new:…") with their own face and no extra image.
        const partnerCharacter =
          toolSettings.partnerCharacterId && toolSettings.partnerCharacterId !== lookCharacter?.id
            ? getCharacter(toolSettings.partnerCharacterId)
            : null;
        const partnerCandidate =
          inventedDayPartner(toolSettings.partnerCharacterId) ?? toDayPartner(partnerCharacter);
        let slotPartner: DayPartner | null = null;
        let partnerFace: { filename?: string; imageUrl?: string } | null = null;
        if (partnerCandidate && lookHasPlate) {
          const partnerMood = normalizeDayMood(
            isDayAdultMood(toolSettings.dayMood) && !intimateEnabled
              ? 'everyday'
              : toolSettings.dayMood
          );
          const { headcount } = planDaySlotPose({
            slot: queueTarget,
            dayMood: partnerMood,
            intimateMix: toolSettings.intimateMix,
            allowCompanions: toolSettings.allowCompanions === true,
            model: stillModel,
          });
          if (
            dayPartnerApplies({
              partner: partnerCandidate,
              headcount,
              adultMood: isDayAdultMood(partnerMood),
              lead: leadNoun,
              sameSexLayouts: poseProfileForModel(stillModel).sameSexLayouts,
            })
          ) {
            if (partnerCandidate.invented && partnerCandidate.noun !== 'person') {
              let standIn = reusableDayPartnerStandIn(
                partnerStandInRef.current,
                partnerCandidate.noun
              );
              if (!standIn && lookCharacter) {
                const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
                const leadFace = await resolveDayNudeIdentityPlateWithFaceCrop({
                  character: lookCharacter,
                  model: stillModel,
                  comfyUrl,
                });
                const leadFaceFilename = leadFace.plate?.filename?.trim();
                if (leadFace.faceLockRejected) referenceNotes.push(leadFace.faceLockRejected);
                if (leadFaceFilename) {
                  standIn = await renderDayPartnerStandIn({
                    noun: partnerCandidate.noun,
                    leadFaceFilename,
                    model: stillModel,
                    comfyUrl,
                    sendComfyUi: actions.sendComfyUi,
                    characterId: lookCharacter.id,
                  }).catch(() => null);
                  if (standIn) {
                    partnerStandInRef.current = standIn;
                    updateToolSettings({ partnerStandIn: standIn });
                  }
                }
              }
              if (standIn) {
                partnerFace = { filename: standIn.filename };
                slotPartner = {
                  name: '',
                  noun: standIn.noun,
                  descriptor: standIn.look.slice(0, 220),
                };
              } else {
                // No face to reuse (render failed): a new stranger with their own face.
                slotPartner = partnerCandidate;
              }
            } else if (partnerCharacter) {
              const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
              const resolved = await resolveDayNudeIdentityPlateWithFaceCrop({
                character: partnerCharacter,
                model: stillModel,
                comfyUrl,
              });
              if (resolved.faceLockRejected) referenceNotes.push(resolved.faceLockRejected);
              if (resolved.plate?.filename?.trim() || resolved.plate?.imageUrl?.trim()) {
                // The partner's face must be a face, theirs, and not the lead's. A picture that
                // fails is left out and the still invents the partner (the engine made up a
                // stranger anyway when the upload was an unrelated picture, d56fe14a) — said on
                // the card. A check that could not run keeps the picture.
                const verdict = await checkReferenceImage({
                  role: 'partner-face',
                  filename: resolved.plate.filename,
                  imageUrl: resolved.plate.imageUrl,
                  subject: partnerCharacter.name,
                  partnerReferenceUrl: referenceViewUrl(resolveDayCastPlate(partnerCharacter)),
                  leadReferenceUrl: referenceViewUrl(resolveDayCastPlate(lookCharacter)),
                  comfyUrl,
                });
                if (verdict.status === 'mismatch') {
                  referenceNotes.push(
                    `${verdict.message ?? "The partner's face picture is not a face."} This still invents the partner instead.`
                  );
                  slotPartner = { name: '', noun: partnerCandidate.noun, invented: true };
                } else {
                  partnerFace = {
                    filename: resolved.plate.filename?.trim() || undefined,
                    imageUrl: resolved.plate.imageUrl?.trim() || undefined,
                  };
                  slotPartner = partnerCandidate;
                }
              }
            }
          }
        }
        const clothingReinforce = dayStillClothingReinforce({
          omitGarment,
          replaceOutfit: replaceKeepOutfit,
          partnerFace: Boolean(partnerFace),
          faceBreak: vacationFaceBreak,
          garment: byoOrPackGarment,
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
        let footwearImage: 'combined' | null = null;
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
        // Klein clothed spoon: the compact recipe goes out alone — no guide, no face crop.
        const kleinSpoonRecipe = kleinSpoonRecipeApplies({
          model: stillModel,
          adultMood: isDayAdultMood(toolSettings.dayMood) && intimateEnabled,
          beat: queueTarget.sceneHints,
        });
        if (kleinSpoonRecipe) {
          skipPoseGuideImage = true;
        }
        // Vacation / Suggestive draw clothed stills upright; when that drawing contradicts the
        // beat (a lie or a kneel drawn as a seated or standing pair) the words carry the pose.
        if (
          !skipPoseGuideImage &&
          dayClothedGuideContradictsBeat({
            slot: queueTarget,
            dayMood: normalizeDayMood(
              isDayAdultMood(toolSettings.dayMood) && !intimateEnabled
                ? 'everyday'
                : toolSettings.dayMood
            ),
            intimateMix: toolSettings.intimateMix,
            allowCompanions: toolSettings.allowCompanions === true,
            model: stillModel,
          })
        ) {
          skipPoseGuideImage = true;
        }
        let walkingDuoNoGuide = false;
        // Walking hand in hand on Edit 2511: the standing hold-hands map froze the walk.
        if (
          !skipPoseGuideImage &&
          !(isDayAdultMood(toolSettings.dayMood) && intimateEnabled) &&
          dayWalkingDuoSkipsPoseGuide(stillModel, queueTarget.sceneHints)
        ) {
          skipPoseGuideImage = true;
          walkingDuoNoGuide = true;
        }
        // Clothing options for this still's brief / recipe (the pose map's are added below).
        const slotPromptOptions = {
          faceOnlyIdentity,
          // Only force Image 2 language when a clothing-only packshot is actually attached.
          forceGarmentReinforce:
            (vacationFaceBreak || Boolean(dressClothingFilename)) &&
            Boolean(garmentReinforce?.imageUrl || garmentReinforce?.imageFilename),
          clothingImageAttached: Boolean(
            garmentReinforce?.imageUrl || garmentReinforce?.imageFilename
          ),
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
            })
          : null;
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
            const poseBuild = await buildDayPoseGuide(
              queueTarget.id,
              posePlan.sceneText,
              stillModel,
              {
                ...posePlan.options,
                stylePreference: poseGuideStyle,
                aspect: !isOpenPoseStyle(poseGuideStyle)
                  ? null
                  : faceCropCanvas
                    ? faceCropCanvas
                    : await probeImage1Size(image1Url),
                library: isOpenPoseStyle(poseGuideStyle) ? loadPoseLibrary() : [],
              }
            );
            const poseFile = poseBuild.file;
            poseGuideDrawnStyle = poseBuild.stylePreference;
            poseLeadPosition = poseBuild.leadPosition;
            poseCamera = poseBuild.camera;
            if (
              posePlan.options.photoPose?.people.length &&
              poseBuild.poseKey.startsWith('photo:')
            ) {
              customPose = customPoseWords({
                photo: posePlan.options.photoPose,
                drawn: {
                  keypoints: poseBuild.keypoints,
                  aspect: poseBuild.canvas.width / poseBuild.canvas.height,
                },
                sceneText: [queueTarget.sceneHints, queueTarget.location]
                  .filter(Boolean)
                  .join(' · '),
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

        if (poseGuideFilename && poseExpectation) {
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
                ? { state: 'skipped' as const, reason: 'no Day plate' }
                : skipPoseGuideImage
                  ? {
                      state: 'skipped' as const,
                      reason: kleinSpoonRecipe
                        ? 'FLUX.2 Klein spoon reads the overlapping guide as a third person (stance from text)'
                        : walkingDuoNoGuide
                          ? 'A walk in step: the standing hold-hands drawing froze it (stride from text)'
                          : 'Lightning identity path keeps Image 1 whole (stance from text)',
                    }
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
          beat: queueTarget.sceneHints,
          beatTyped: dayBeatIsTyped(queueTarget),
          setting: queueTarget.location,
          dayMood: toolSettings.dayMood,
          adult: adultStill,
          leadNoun,
          leadDescriptor,
          partner: slotPartner,
          partnerOutfit: partnerCharacter?.lockedWardrobeId?.trim()
            ? dayOutfitPromptName(
                formatWardrobeKitLabel(
                  wardrobeLabelFor(partnerCharacter.lockedWardrobeId.trim()) || ''
                )
              ) || null
            : null,
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
          isDayAdultMood(toolSettings.dayMood) && !intimateEnabled
            ? 'everyday'
            : toolSettings.dayMood
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
          label: 'Day',
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
          // Clothed stills: the partner face rides VL-only (see uploadDayPartnerVlFace).
          const partnerComfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
          const vlFace = !adultStill
            ? await uploadDayPartnerVlFace({
                ...partnerFace,
                model: stillModel,
                comfyUrl: partnerComfyUrl,
              })
            : null;
          extraUrls[1] = vlFace ? undefined : partnerFace.imageUrl;
          extraFilenames[1] = vlFace || partnerFace.filename || '';
          // The file that actually goes out (the VL re-upload is a new file: for four days it
          // was a different picture from the face it was made from). A Cast partner's is
          // compared with their plate and the lead's; the stand-in's only has to be a face.
          const sentFilename = extraFilenames[1].trim();
          if (sentFilename) {
            const castPartner = slotPartner && !slotPartner.invented ? partnerCharacter : null;
            const verdict = await checkReferenceImage({
              role: castPartner ? 'partner-face' : 'face',
              filename: sentFilename,
              subject: castPartner?.name ?? "the partner's",
              ...(castPartner
                ? {
                    partnerReferenceUrl: referenceViewUrl(resolveDayCastPlate(castPartner)),
                    leadReferenceUrl: referenceViewUrl(resolveDayCastPlate(lookCharacter)),
                  }
                : {}),
              comfyUrl: partnerComfyUrl,
            });
            if (verdict.status === 'mismatch') {
              referenceNotes.push(
                `${verdict.message ?? 'The partner picture is not a face.'} It was left out of this still, so the engine invents the partner.`
              );
              extraUrls[1] = undefined;
              extraFilenames[1] = '';
            } else if (castPartner) {
              partnerSentFace = { partnerId: castPartner.id, filename: sentFilename };
            }
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
        if (vacationFaceBreak && identityLatentPlate?.filename) {
          extraFilenames[2] = extraFilenames[2] ?? '';
          extraUrls[3] = undefined;
          extraFilenames[3] = identityLatentPlate.filename;
        } else if (kleinFaceFilename) {
          extraFilenames[2] = extraFilenames[2] ?? '';
          extraUrls[3] = undefined;
          extraFilenames[3] = kleinFaceFilename;
        }
        const hasExtras =
          extraUrls.some((url, index) => index > 0 && Boolean(url)) ||
          extraFilenames.some((name, index) => index > 0 && Boolean(name.trim()));
        const queueImagePlate = omitGarment ? identityPlate : (identityPlate ?? slotQueuePlate);
        // Image 1 meant as a face crop, and the clothing image, checked against their roles
        // (cached per picture: the same crop goes out with every still of the Day).
        const plainReferenceNote = await checkStillReferences({
          face: faceOnlyIdentity ? queueImagePlate : null,
          clothing:
            !partnerFace && extraFilenames[1]?.trim() ? { filename: extraFilenames[1] } : null,
          subject: lookCharacter?.name,
          comfyUrl: loadComfyUiSettings().apiUrl?.trim() || undefined,
        });
        if (plainReferenceNote) referenceNotes.push(plainReferenceNote);
        const queueOptions = !lookHasPlate
          ? undefined
          : queueImagePlate?.filename?.trim() || queueImagePlate?.imageUrl?.trim()
            ? {
                inputImageFilename: queueImagePlate?.filename?.trim() || undefined,
                inputImageUrl: queueImagePlate?.imageUrl?.trim() || undefined,
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
                  : (dayMood === 'vacation' || dayMood === 'suggestive') &&
                      Boolean(poseGuideFilename)
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
        if (plateQueueModel && plateQueueModel !== stillModel) {
          updateShared({ model: plateQueueModel });
        }
        // No garment: the queue compacts the guide into the second image — say so.
        const numbered = queuedDayStillPrompt(finalized, {
          second: Boolean(extraFilenames[1]?.trim() || extraUrls[1]),
          third: Boolean(extraFilenames[2]?.trim() || extraUrls[2]),
        });
        // Text contradictions that only ever showed up as a bad render (a solo still that talks
        // about "the two people", shoes ordered on a barefoot beat, a third image that is not
        // attached). What can be repaired without guessing is repaired; the rest raises a
        // notice. Never a block — the still is queued either way.
        const checked = repairStillPrompt(numbered.prompt, {
          people: poseExpectation?.keypoints.length || undefined,
          imageCount:
            1 +
            [1, 2, 3].filter(index => Boolean(extraFilenames[index]?.trim() || extraUrls[index]))
              .length,
          // Clothed stills: the pose's furniture must fit the Setting. Adult beats own their rooms.
          setting: adultStill
            ? null
            : resolveRoleplaySetting(queueTarget.location, shared.lockedLocation) || undefined,
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
                // Lying solo stills on Qwen-Image 2.1: landscape (see faceCropCanvas).
                ...(faceCropCanvas ? { figurePixelSize: { ...faceCropCanvas } } : {}),
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
                exclude: [
                  gallerySeed(lastTake?.promptId),
                  gallerySeed(lastTake?.twoTakes?.promptId),
                ],
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
            const second = await actions.sendComfyUi(
              queuedPrompt,
              undefined,
              undefined,
              sendOptions
            );
            if (typeof second === 'string' && second.trim() && second !== promptId) {
              secondPromptId = second.trim();
            }
          } catch (secondError) {
            console.warn('Day: the second take was not queued:', queueTarget.label, secondError);
          }
        }
        // Pose × engine stats: the take, and whether it redoes the slot's last one.
        if (typeof promptId === 'string') {
          notePoseTakeQueued({
            takeId: promptId,
            poseKey: trackedPoseKey,
            model: stillModel,
            surface: 'day',
            // A pair's second take leaves the first to the pair's pick.
            replaces:
              !options?.keepTake && lastTake?.status === 'completed' ? lastTake.promptId : null,
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
          clipUrl: undefined,
          clipStatus: undefined,
          // Shown on the slot card ("Prompt check: fixed 1"); a clean prompt clears the last one.
          promptCheck: stillPromptCheckRecord(checked),
          beatKey: rerollBeatKey(queueTarget.sceneHints) || undefined,
          previousTake,
          bestOfTwo: undefined,
          bestOfTwoJob: castcutPoseGuide ? true : undefined,
          twoTakes: secondPromptId ? { promptId: secondPromptId, status: 'queued' } : undefined,
          redoReason: options?.looksWrong && promptId ? 'looks-wrong' : undefined,
          adultHold: undefined,
          adultGated: adultSafeguards ? true : undefined,
          engineNote: poseEngineSwap?.reason,
          referenceNote: referenceNotes.length > 0 ? referenceNotes.join(' ') : undefined,
        });
        stillsRef.current = nextStills;
        updateToolSettings({
          ...dayStillsCachePatch(nextStills, shared.activeCharacterId),
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
        setError(err instanceof Error ? err.message : 'Could not queue that slot.');
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
    },
    [
      actions,
      buildSlotPrompt,
      character,
      isolatePending,
      isolateSubject,
      leanChrome,
      leadNoun,
      resolveSlotLook,
      resolveSlotStillModel,
      shared.activeCharacterId,
      shared.activeLookId,
      shared.ipAdapterStrength,
      slots,
      toolSettings.allowCompanions,
      toolSettings.autoReviewStills,
      toolSettings.bestOfTwoHardPoses,
      toolSettings.dayMood,
      toolSettings.identityBoost,
      toolSettings.intimateMix,
      toolSettings.partnerCharacterId,
      toolSettings.posePriority,
      toolSettings.twoTakesIntimate,
      intimateEnabled,
      shared.lockedLocation,
      shared.model,
      updateShared,
      updateToolSettings,
      wardrobeOptions,
    ]
  );
  const suggestDayScenes = useCallback(() => {
    const diversified = diversifyDaySlotScenes(slots, {
      forceLocations: true,
      forceBeats: true,
      fillBeats: true,
      allowCompanions: toolSettings.allowCompanions === true,
      dayMood: toolSettings.dayMood,
      intimateMix: toolSettings.intimateMix,
    });
    if (diversified.changed) {
      updateToolSettings({ slots: diversified.slots });
    }
    return diversified.changed;
  }, [
    slots,
    toolSettings.allowCompanions,
    toolSettings.dayMood,
    toolSettings.intimateMix,
    updateToolSettings,
  ]);

  // Day from an idea: the LLM writes one beat + room per slot from the player's premise.
  const writeDayFromIdea = useCallback(
    async (premise: string): Promise<number> => {
      const beats = await requestDayPremiseBeats({
        premise,
        slotIds: slots.map(slot => slot.id),
        companions: toolSettings.allowCompanions === true,
        llmBody: sharedLlmRequestBody(shared),
      });
      updateToolSettings({ slots: applyDayPremiseBeats(slots, beats) });
      return beats.length;
    },
    [shared, slots, toolSettings.allowCompanions, updateToolSettings]
  );

  const rerollActiveSlotScene = useCallback(
    (options?: {
      slotId?: import('@/lib/day-planner').DaySlotId;
      rerollLocation?: boolean;
      rerollBeat?: boolean;
    }) => {
      const slotId = options?.slotId ?? activeSlotId;
      const next = rerollDaySlotScene(slots, slotId, {
        rerollLocation: options?.rerollLocation !== false,
        rerollBeat: options?.rerollBeat !== false,
        allowCompanions: toolSettings.allowCompanions === true,
        dayMood: toolSettings.dayMood,
        intimateMix: toolSettings.intimateMix,
      });
      if (next.changed) {
        if (slotId !== activeSlotId) {
          setActiveSlotId(slotId);
        }
        updateToolSettings({ slots: next.slots });
      }
      return next.changed;
    },
    [
      activeSlotId,
      slots,
      toolSettings.allowCompanions,
      toolSettings.dayMood,
      toolSettings.intimateMix,
      updateToolSettings,
    ]
  );

  const queueBlockReason = dayQueueBlockReason({
    hasCharacter: Boolean(character),
    hasPlate,
    isolateSubject,
    isolatePending,
  });

  return {
    router,
    setBusy,
    setAssemblingFilm,
    setFilmStatus,
    setFilmNeedsCast,
    stillsRef,
    assembledFilmRef,
    rerollNudgeRef,
    poseVariantRef,
    poseGuideExpectRef,
    buildSlotPrompt,
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    output,
    setOutput,
    copied,
    setCopied,
    error,
    setError,
    filmGuideHref,
    setFilmGuideHref,
    busy,
    activeSlotId,
    setActiveSlotId,
    wardrobeLabels,
    assemblingFilm,
    filmStatus,
    filmCutOptions,
    setFilmCutOptions,
    filmNeedsCast,
    slots,
    stills,
    watchPlaylist,
    activeSlot,
    character,
    selectedModel,
    plate,
    hasPlate,
    isolateSubject,
    isolatePending,
    isolateBusy,
    isolateStatus,
    platePreviewUrl,
    setIsolateSubject,
    allowCompanions: toolSettings.allowCompanions === true,
    setAllowCompanions: (next: boolean) => updateToolSettings({ allowCompanions: next }),
    dayLength: normalizeDayLength(toolSettings.dayLength ?? slots.length),
    setDayLength: (next: number) => {
      const length = normalizeDayLength(next);
      // Keep every slot's plan and still by id; growing adds the late slots, shrinking drops them.
      const nextSlots = normalizeDaySlots(slots, length);
      updateToolSettings({
        dayLength: length,
        slots: nextSlots,
        stills: normalizeDaySlotStills(stillsRef.current, nextSlots),
      });
    },
    posePriority: toolSettings.posePriority !== false,
    setPosePriority: (next: boolean) => updateToolSettings({ posePriority: next }),
    identityBoost: toolSettings.identityBoost === true,
    setIdentityBoost: (next: boolean) => updateToolSettings({ identityBoost: next }),
    faceFinish: toolSettings.faceFinish === true,
    setFaceFinish: (next: boolean) => updateToolSettings({ faceFinish: next }),
    autoReviewStills: toolSettings.autoReviewStills === true,
    setAutoReviewStills: (next: boolean) => updateToolSettings({ autoReviewStills: next }),
    redoPoseMisses: toolSettings.redoPoseMisses === true,
    setRedoPoseMisses: (next: boolean) => updateToolSettings({ redoPoseMisses: next }),
    bestOfTwoHardPoses: toolSettings.bestOfTwoHardPoses === true,
    setBestOfTwoHardPoses: (next: boolean) => updateToolSettings({ bestOfTwoHardPoses: next }),
    twoTakesIntimate: toolSettings.twoTakesIntimate === true,
    setTwoTakesIntimate: (next: boolean) => updateToolSettings({ twoTakesIntimate: next }),
    bestEnginePerPose: toolSettings.bestEnginePerPose === true,
    setBestEnginePerPose: (next: boolean) => updateToolSettings({ bestEnginePerPose: next }),
    hideStickyCutCoach: toolSettings.hideStickyCutCoach === true,
    setHideStickyCutCoach: (next: boolean) => updateToolSettings({ hideStickyCutCoach: next }),
    // A theme (Date night, Cosplay…) stays as its own id; it renders as Everyday.
    dayMood: (dayThemeOf(toolSettings.dayMood)?.id ??
      normalizeDayMood(
        isDayAdultMood(toolSettings.dayMood) && !intimateEnabled ? 'everyday' : toolSettings.dayMood
      )) as import('@/lib/day-planner').DayMoodSetting,
    setDayMood: (next: import('@/lib/day-planner').DayMoodSetting) => {
      const theme = dayThemeOf(next);
      const mood: import('@/lib/day-planner').DayMoodSetting =
        theme?.id ??
        (isDayAdultMood(next) && !intimateEnabled ? 'everyday' : normalizeDayMood(next));
      const mix = normalizeDayIntimateMix(toolSettings.intimateMix);
      // Date night / Night out beats need a second person — turn companions on with them.
      const allowCompanions = theme?.companions ? true : toolSettings.allowCompanions === true;
      const aligned = ensureDaySlotsMatchMood(slots, {
        dayMood: mood,
        intimateMix: mix,
        allowCompanions,
      });
      // A theme dresses from its own pool: kits picked under another mood (a suit on a Cosplay
      // day, overalls on Date night) are dropped so the queue picks a fitting one.
      const baseSlots = aligned.changed ? aligned.slots : slots;
      const redressed = theme
        ? baseSlots.map(slot =>
            slot.wardrobeId &&
            !(theme.eveningKitOnly && dayOutfitBlock(slot.id, theme.id) !== 'evening') &&
            !theme.kitRe.test(wardrobeLabelFor(slot.wardrobeId) ?? '')
              ? { ...slot, wardrobeId: undefined }
              : slot
          )
        : baseSlots;
      const kitsChanged = redressed.some((slot, index) => slot !== baseSlots[index]);
      updateToolSettings({
        dayMood: mood,
        ...(theme?.companions && toolSettings.allowCompanions !== true
          ? {
              allowCompanions: true,
              ...(normalizeDayIntimateMix(toolSettings.intimateMix) === 'solo'
                ? { intimateMix: 'mixed' as const }
                : {}),
            }
          : {}),
        ...(aligned.changed || kitsChanged ? { slots: redressed } : {}),
      });
    },
    intimateEnabled,
    partnerCharacterId:
      toolSettings.partnerCharacterId && toolSettings.partnerCharacterId !== character?.id
        ? toolSettings.partnerCharacterId
        : '',
    partnerOptions: castRoster
      .filter(record => record.id !== character?.id && record.name?.trim())
      .map(record => ({
        id: record.id,
        name: record.name.trim(),
        noun: dayPartnerNoun(record),
        thumb: castPlateThumbUrl(record) || undefined,
      })),
    partnerTwoWomen: poseProfileForModel(shared.model).sameSexLayouts,
    leadNoun,
    setPartnerCharacterId: (next: string) => {
      partnerStandInRef.current = null;
      updateToolSettings({
        partnerCharacterId: next.trim() || undefined,
        partnerStandIn: undefined,
        partnerSentFace: undefined,
      });
    },
    partnerStandInUrl: toolSettings.partnerStandIn?.imageUrl,
    // The face picture that went out as the Cast partner on the last two-person still.
    partnerSentFaceUrl:
      toolSettings.partnerSentFace?.partnerId &&
      toolSettings.partnerSentFace.partnerId === toolSettings.partnerCharacterId?.trim()
        ? toolSettings.partnerSentFace.url || undefined
        : undefined,
    dayWeather: normalizeDayWeather(toolSettings.dayWeather) ?? '',
    setDayWeather: (next: string) =>
      updateToolSettings({ dayWeather: normalizeDayWeather(next) ?? undefined }),
    newPartnerStandIn: () => {
      partnerStandInRef.current = null;
      updateToolSettings({ partnerStandIn: undefined });
    },
    // People (Solo / Mixed / Duo) — one control for every mood. Clothed moods: Solo = no
    // companion, Mixed = some stills with a friend / partner, Duo = every still. Adult moods: the
    // Solo / Mixed / Duo mix. Both settings move together so switching mood keeps the choice.
    people: ((): import('@/lib/day-planner').DayIntimateMix => {
      const mix = normalizeDayIntimateMix(toolSettings.intimateMix);
      if (isDayAdultMood(toolSettings.dayMood) && intimateEnabled) return mix;
      if (toolSettings.allowCompanions !== true) return 'solo';
      return mix === 'solo' ? 'mixed' : mix;
    })(),
    setPeople: (next: import('@/lib/day-planner').DayIntimateMix) => {
      const mix = normalizeDayIntimateMix(next);
      const rawMood =
        dayThemeOf(toolSettings.dayMood)?.id ??
        normalizeDayMood(
          isDayAdultMood(toolSettings.dayMood) && !intimateEnabled
            ? 'everyday'
            : toolSettings.dayMood
        );
      const allowCompanions = mix !== 'solo';
      const aligned = isDayAdultMood(rawMood)
        ? ensureDaySlotsMatchMood(slots, { dayMood: rawMood, intimateMix: mix, allowCompanions })
        : alignDaySlotsToPeople(slots, { dayMood: rawMood, people: mix });
      updateToolSettings({
        intimateMix: mix,
        allowCompanions,
        ...(aligned.changed ? { slots: aligned.slots } : {}),
      });
    },
    intimateMix: normalizeDayIntimateMix(toolSettings.intimateMix),
    setIntimateMix: (next: import('@/lib/day-planner').DayIntimateMix) => {
      const mix = normalizeDayIntimateMix(next);
      const mood =
        dayThemeOf(toolSettings.dayMood)?.id ??
        normalizeDayMood(
          isDayAdultMood(toolSettings.dayMood) && !intimateEnabled
            ? 'everyday'
            : toolSettings.dayMood
        );
      const aligned = ensureDaySlotsMatchMood(slots, {
        dayMood: mood,
        intimateMix: mix,
        allowCompanions: toolSettings.allowCompanions === true,
      });
      updateToolSettings({
        intimateMix: mix,
        ...(aligned.changed ? { slots: aligned.slots } : {}),
      });
    },
    suggestDayScenes,
    writeDayFromIdea,
    rerollActiveSlotScene,
    queueBlockReason,
    poseGuideLine: summarizePoseGuideOutcomes(poseGuideOutcomes),
    dressPlateStatus,
    // The newest dressed plate, shown beside its status so a bad one can be seen and redone —
    // every clothed still starts from it.
    dressPlatePreviewUrl:
      poseProfileForModel(shared.model).dressPlate &&
      !isDayAdultMood(toolSettings.dayMood) &&
      normalizeDayMood(toolSettings.dayMood) !== 'sport'
        ? (currentDressPlate?.imageUrl ?? null)
        : null,
    redoDressPlate: () => {
      if (currentDressPlate) removeDressPlate(currentDressPlate.key);
      setDressPlateStatus({ text: 'The next Queue dresses her again first.', busy: false });
    },
    poseGuidePreviews: poseGuidePreviews(poseGuideOutcomes),
    wardrobeOptions,
    wardrobeReady,
    wardrobeCategoryFilter,
    filteredWardrobeOptions,
    wardrobeKitCount,
    actions,
    updateSlot,
    wardrobeLabelFor,
    queueSlot,
    resolveSlotStillModel,
    leanChrome,
  };
}

export type DayPlannerToolOrchestrationCore = ReturnType<typeof useDayPlannerToolOrchestrationCore>;

/** A slot's queued guide, kept for the pose-match check and the pose library. */
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
};

/** Image 1 sizes by URL — the plate rarely changes within a Day, so probe once. */
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
