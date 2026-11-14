'use client';

import { loadLocations } from '@/lib/location/records';
import { loadPoseLibrary } from '@/lib/pose/library';
import { useKeeperStandIn } from '@/hooks/fitting-room/useKeeperStandIn';
import { useLatestRef } from '@/hooks/useLatestRef';
import {
  LOCATION_PICTURE_MODEL,
  LOCATION_PICTURE_NEGATIVE,
  locationPictureGraph,
  locationPicturePrompt,
} from '@/lib/location/picture';
import { withCastPlace } from '@/lib/cast/places';
import { applyDayNarration } from '@/lib/day/narration';
import type { KeyedShot } from '@/lib/film/cut-plan';

import { useRenderBackend } from '@/lib/engine/render-backend-status';
import { realKitId } from '@/lib/fitting/outfit-handoff';
import { useEngineWarmUp } from '@/hooks/useEngineWarmUp';
import { type DayStillSlotOptions } from '@/lib/day/still-prompt';

import { castPlateThumbUrl } from '@/lib/character/plate-thumb';
import {
  fetchComfyObjectInfoModelsCached,
  readCachedComfyObjectInfoModels,
} from '@/lib/comfyui/object-info-cache';
import { poseProfileForModel } from '@/lib/pose/pose-model-profile';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { sharedLlmRequestBody } from '@/lib/llm/request-options';
import { applyDayPremiseBeats, requestDayPremiseBeats } from '@/lib/day/premise';
import {
  applyDayEventPlan,
  clearDayEventSlots,
  dayEventActionWords,
  dayEventBefore,
  DAY_EVENT_EDIT_CAMERA_LINE,
  dayEventKeepPropsLine,
  dayEventMomentWords,
  normalizeDayEvent,
  requestDayEventPlan,
  slotsForWholeDay,
} from '@/lib/day/event';
import { SAME_SHOT_MAX_DIFF } from '@/lib/search/image-similarity';
import { pictureGreyDifference } from '@/lib/search/image-similarity-client';
import { buildDayEndPoseEditPrompt, DAY_END_POSE_EDIT_NEGATIVE } from '@/lib/day/end-pose';
import { resolveCastPlatePrepareModel } from '@/lib/cast/plate-prepare';
import { normalizeDayThread } from '@/lib/day/thread';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { isLeanWorkspaceMode } from '@/lib/app/workspace-mode';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import {
  runDayTake,
  type ClothingOption,
  type DayPoseGuideExpectation,
  type DayTakeOptions,
} from './day-take-run';
export type { DayPoseGuideExpectation } from './day-take-run';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { parseCharacterHints } from '@/lib/character/hints';
import { dayAfterOutfitHandoff } from '@/lib/day/outfit-scope';
import {
  activeLook,
  applyCharacterRecord,
  characterFromPartnerStandIn,
  looksOf,
  getCharacter,
  getCharactersSnapshot,
  getServerCharactersSnapshot,
  subscribeCharacters,
  upsertCharacter,
} from '@/lib/character/os';
import { subjectGenderToClothingGender } from '@/lib/wardrobe/clothing-gender';
import {
  fetchClothingLabels,
  fetchClothingSelectOptions,
  getCachedClothingLabel,
  humanizeClothingId,
} from '@/lib/wardrobe/clothing-catalog-client';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  galleryEntryPrimaryViewUrl,
  loadComfyGallery,
  type ComfyGalleryEntry,
} from '@/lib/gallery/comfyui-gallery';

import { useNsfwGeneratorEnabled } from '@/hooks/useNsfwGeneratorEnabled';

import {
  dayMoodReplacesKeepOutfit,
  dayQueueBlockReason,
  dayStillsCachePatch,
  dayWatchPlaylist,
  diversifyDaySlotScenes,
  alignDaySlotsToPeople,
  ensureDaySlotsMatchMood,
  isDayAdultMood,
  normalizeDayLength,
  orderDaySlots,
  mergeDaySlotStills,
  nextDaySlotToEdit,
  normalizeDayIntimateMix,
  normalizeDayMood,
  dayMoodFlavor,
  dayMoodWithPlayful,
  migrateDayMoodFields,
  normalizeDaySlotStills,
  normalizeDaySlots,
  promoteDayStillsToSoftPassChildren,
  rerollDaySlotScene,
  upsertDaySlotStill,
  daySlotDefaultLabel,
  slotsAtTime,
  clearDaySlotLine,
  dayStillShownImage,
  type DaySlot,
  type DaySlotId,
  setDayAvoidedBeatsSource,
} from '@/lib/day/planner';
import { resolveDayPlate, resolveDayQueueIdentityPlate } from '@/lib/day/plate';

import { dayOutfitBlock } from '@/lib/day/auto-kit';
import { plateGalleryEntries, RUN_BUNDLE_VERSION, type RunBundle } from '@/lib/day/run-bundle';
import { captureRunQueueSettings } from '@/lib/day/run-bundle-client';

import { setLearnedHardLayoutsSource } from '@/lib/day/best-of-two';

import { blendedPoseEngineReport } from '@/lib/pose/pose-engine-report-blended';
import {
  DEFAULT_FILM_CUT_OPTIONS,
  type FilmCutOptionsValue,
} from '@/components/FilmCutOptionsControls';
import { probeImageUrlDimensions } from '@/lib/storage/browser-image-dimensions';
import { waitForGalleryPromptIds } from '@/lib/best-of-n/vision-queue';
import { dayThemeOf } from '@/lib/day/themes';
import { normalizeDayWeather } from '@/lib/day/weather';

import { normalizeFootwear } from '@/lib/wardrobe/footwear';

import type { DayPartnerStandIn } from '@/lib/day/partner-stand-in';
import { dayPartnerNoun } from '@/lib/day/partner';

import { loadPoseGuideStylePreference } from '@/lib/engine/render-realism-settings';

import {
  poseGuidePreviews,
  summarizePoseGuideOutcomes,
  type PoseGuideOutcome,
} from '@/lib/pose/guide-status';
import { useDayPlateIsolate } from '@/hooks/day-planner/useDayPlateIsolate';

import { type DayDressPlateEntry } from '@/lib/day/dress-plate';
import {
  loadDressPlates,
  removeDressPlate,
  subscribeDressPlates,
} from '@/lib/day/dress-plate-store';
import { dayDressPlateRequestKey } from '@/lib/day/dress-plate';

import { resolveWardrobeGarmentThumbQueueUrl } from '@/lib/wardrobe/garment-thumbs';

import {
  countWardrobeOptionsForFilter,
  filterWardrobeSelectOptions,
  normalizeWardrobeCategoryFilter,
} from '@/lib/wardrobe/catalog-ui';
import { applyLookPackToDaySlots, loadLookPack, lookPackNotes } from '@/lib/look/pack';
import { resolvePlayLoopEntryCharacterId } from '@/lib/play/campaign';

import {
  buildTakeSlotPrompt,
  planTakeStillModel,
  resolveTakeSlotLook,
  takeSceneRoom,
  takeWardrobeLabel,
} from '@/lib/day/take-helpers';
import {
  chronicRerollBeats,
  PLAY_METRICS_UPDATED_EVENT,
  recordFirstFullDay,
  rerollBeatKey,
  rerollProneLayouts,
  weakPoseLayouts,
} from '@/lib/play/metrics';
import { getReformatTargetModel } from '@/lib/edit/reformat-target';

import { isGalleryClipEntry } from '@/lib/story/roleplay-film';
import { slotDayPart } from '@/lib/day/parts';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import {
  DEFAULT_DAY_TOOL_CACHE,
  DEFAULT_SCENE_TOOL_CACHE,
  type SceneToolCache,
} from '@/lib/play/settings';
import {
  sceneScriptPartners,
  sceneScriptRooms,
  sceneSlotOf,
  sceneSlotsPatch,
} from '@/lib/day/scenes';

const TOOL_ID = 'day' as const;

/**
 * Which page runs Day's engine: Day (its plan of slots), or Scene — one shot at a time, its
 * working fields in the `scene` settings (day/scenes.ts). Fixed for the hook's lifetime.
 */
export type DayEngineVariant = 'day' | 'scene';

export function useDayPlannerToolOrchestrationCore(variant: DayEngineVariant = 'day') {
  const sceneMode = variant === 'scene';
  const router = useRouter();
  const workspaceMode = useWorkspaceMode();
  const leanChrome = isLeanWorkspaceMode(workspaceMode);
  const intimateEnabled = useNsfwGeneratorEnabled();
  const {
    mounted,
    shared,
    toolSettings: storedToolSettings,
    updateShared,
    updateToolSettings: storeToolSettings,
  } = useCachedSettings(
    // Scene's settings are a Day's working fields plus its saved scenes (SceneToolCache extends
    // DayToolCache), so the engine below reads and writes them the same way.
    (sceneMode ? 'scene' : 'day') as 'day',
    sceneMode ? DEFAULT_SCENE_TOOL_CACHE : DEFAULT_DAY_TOOL_CACHE
  );
  // Intimate with Playful on runs as the 'raunchy' flavor everywhere below (the old Raunchy
  // mood's beats and prompt lines, unchanged); writes go back in stored form (mood-flavor.ts).
  const toolSettings = useMemo(() => {
    const flavor = dayMoodFlavor(storedToolSettings);
    return flavor === storedToolSettings.dayMood
      ? storedToolSettings
      : { ...storedToolSettings, dayMood: flavor };
  }, [storedToolSettings]);
  // A scene is one slot: Day's helpers below hand back a whole Day's slots (sceneSlotsPatch).
  const sceneSlotsRef = useRef(storedToolSettings.slots);
  sceneSlotsRef.current = storedToolSettings.slots;
  /**
   * A script's Scene keeps its line through new takes: the line is the script's, for the shot,
   * not for one picture (Day clears it — there it was written to the picture). Clearing it lost
   * 58 of Lena's 78 lines in the 2026-11-06 episode: every redo or re-roll dropped one.
   */
  const sceneCacheRef = useRef<
    Pick<SceneToolCache, 'scenes' | 'activeSceneId' | 'scriptPartners' | 'run'>
  >({});
  sceneCacheRef.current = sceneMode
    ? {
        scenes: (storedToolSettings as SceneToolCache).scenes,
        activeSceneId: (storedToolSettings as SceneToolCache).activeSceneId,
        scriptPartners: (storedToolSettings as SceneToolCache).scriptPartners,
        // The run rendering (a take of it reports to the server's shadow check, run-bundle.ts).
        run: (storedToolSettings as SceneToolCache).run,
      }
    : {};
  /** One room a scene: on when the running run asked for it (EpisodeRunAuto.oneRoom). */
  const oneRoomRef = useRef<{ on: boolean; rooms: Record<string, string> }>({
    on: false,
    rooms: {},
  });
  oneRoomRef.current = sceneMode
    ? {
        on: (storedToolSettings as SceneToolCache).run?.auto?.oneRoom === true,
        rooms: sceneScriptRooms((storedToolSettings as SceneToolCache).scriptRooms),
      }
    : { on: false, rooms: {} };
  const scriptLineStays = () =>
    Boolean(
      sceneCacheRef.current.scenes?.find(scene => scene.id === sceneCacheRef.current.activeSceneId)
        ?.fromScript
    );
  const updateToolSettings = useCallback(
    (partial: Parameters<typeof storeToolSettings>[0]) => {
      const patch =
        sceneMode && partial.slots
          ? { ...partial, slots: sceneSlotsPatch(partial.slots, sceneSlotsRef.current) }
          : partial;
      storeToolSettings(migrateDayMoodFields(patch));
    },
    [sceneMode, storeToolSettings]
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
  /**
   * One-shot words-only redo per slot (ground-sit-redo.ts): the next queue of that slot sends no
   * pose map, says the pose in these words, and keeps the guide it missed to judge the redo by.
   */
  const wordsOnlyRedoRef = useRef<
    Partial<Record<DaySlotId, { words: string; expectation: DayPoseGuideExpectation }>>
  >({});

  const slots = useMemo(
    () =>
      // A scene is one slot (its time of day is the slot id).
      sceneMode
        ? [sceneSlotOf(toolSettings.slots)]
        : // In the board's order (a Short's: its script's — Step 5f), its ids only keys.
          orderDaySlots(
            normalizeDaySlots(toolSettings.slots, toolSettings.dayLength),
            toolSettings.slotOrder
          ),
    [sceneMode, toolSettings.dayLength, toolSettings.slotOrder, toolSettings.slots]
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
  // The Cut preview's shots: the narration already recorded on them, the rest listed to record.
  const previewNarration = useMemo(
    () => applyDayNarration(watchPlaylist as KeyedShot[], slots, stills),
    [slots, stills, watchPlaylist]
  );
  // Every slot has its still: Story opens (play-metrics firstFullDayAt) — no cut needed.
  const fullDay =
    slots.length > 0 &&
    slots.every(slot => {
      const still = stills.find(entry => entry.slotId === slot.id);
      return still?.status === 'completed' && Boolean(dayStillShownImage(still));
    });
  useEffect(() => {
    // A scene's one still is not a whole Day (Story opens on a Day).
    if (fullDay && !sceneMode) recordFirstFullDay();
  }, [fullDay, sceneMode]);
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
  /**
   * The room a script shot is set in under one room a scene: made the first time a scene is shot
   * (its empty room, from the shot's place words), then the same for every shot of it. Null when
   * off, not a script's shot, or the render fails (the shot goes out as before).
   */
  const scriptSceneRoom = useCallback(
    (slot: DaySlot): Promise<string | null> =>
      takeSceneRoom(slot, {
        oneRoom: oneRoomRef.current.on,
        rooms: oneRoomRef.current.rooms,
        link: sceneCacheRef.current.scenes?.find(
          scene => scene.id === sceneCacheRef.current.activeSceneId
        )?.fromScript,
        character,
        leadNoun,
        render: async (place, filename) => {
          const { renderEmptyPlace } = await import('@/lib/location/picture-client');
          return renderEmptyPlace(place, filename);
        },
        keep: rooms => {
          oneRoomRef.current = { ...oneRoomRef.current, rooms };
          storeToolSettings({ scriptRooms: rooms } as Parameters<typeof storeToolSettings>[0]);
        },
      }),
    [character, leadNoun, storeToolSettings]
  );
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
    label: 'Short',
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
  // A posed Keep's standing picture (fitting/keeper-stand-in.ts): Keep jumps here while it
  // renders, so Day says where it is — and offers Try again — not only Outfit.
  const keeperStandIn = useKeeperStandIn({ shared, actions });

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
          keepSettings: sceneMode,
        });
        updateToolSettings({
          slots: moodAligned.slots,
          outfitHandoffKept: handed.outfitHandoffKept,
          notes: notes || toolSettings.notes,
        });
        scheduleAfterCommit(() =>
          setFilmStatus(
            moodAligned.changed
              ? 'Applied Look pack to the moments · refreshed adult Setting/Beat.'
              : 'Applied Look pack to the moments.'
          )
        );
      }
    }
    // deepLinkHandled makes this run once; settings are listed only to read them current.
  }, [
    mounted,
    sceneMode,
    shared.activeCharacterId,
    shared.lockedWardrobeId,
    toolSettings,
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
    (wardrobeId?: string) =>
      takeWardrobeLabel(wardrobeId, {
        labels: wardrobeLabels,
        cached: getCachedClothingLabel,
        options: wardrobeOptions,
        humanize: humanizeClothingId,
      }),
    [wardrobeLabels, wardrobeOptions]
  );

  // A slot can be made in another of the Cast's looks — its plate, face, outfit and dressed
  // plate — without changing the active look (day-slot-look.ts). Unset (or the active look):
  // the same character, plates and outfit picks as before, so those stills are unchanged.
  const resolveSlotLook = useCallback(
    (slot: Pick<DaySlot, 'lookId'>) =>
      resolveTakeSlotLook(slot, {
        character,
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
        plate,
        hasPlate: Boolean(hasPlate),
        queuePlate,
        preferCastPlate,
      }),
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
    (slot: DaySlot, options?: DayStillSlotOptions) =>
      buildTakeSlotPrompt(
        slot,
        {
          look: resolveSlotLook(slot),
          leadNoun,
          packshotUrl: resolveWardrobeGarmentThumbQueueUrl,
          wardrobeLabel: wardrobeLabelFor,
          dayMood: toolSettings.dayMood,
          intimateEnabled,
          intimateMix: toolSettings.intimateMix,
          allowCompanions: toolSettings.allowCompanions === true,
          dayWeather: toolSettings.dayWeather,
          lockedLocation: shared.lockedLocation,
          locations: loadLocations(),
          notes: toolSettings.notes,
          model: shared.model,
          realismMode: shared.renderRealismMode,
          poseGuideStyle: loadPoseGuideStylePreference(shared.model),
        },
        options
      ),
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

  // The engine one still renders on (its hand-offs: Edit 2511 adult nude → Rapid, Edit 2511 custom
  // pose off its plate → Noct-Q / Turbo, 2.1 sex-pose duo → Rapid), and the model it is queued as — Queue all groups stills by it (model-aware queue).
  const resolveSlotStillModel = useCallback(
    (queueTarget: DaySlot) =>
      // The engine, decided in the take's plan (take-plan.ts — the server makes it the same way).
      // What is installed is asked for when the picked engine has a per-still hand-off: in a
      // fresh session the list was missing and the hand-off silently did not happen.
      planTakeStillModel(
        {
          slot: queueTarget,
          pickedModel: shared.model,
          modelCheckpointMap: shared.modelCheckpointMap,
          dayMood: toolSettings.dayMood,
          intimateEnabled,
          intimateMix: toolSettings.intimateMix,
          allowCompanions: toolSettings.allowCompanions === true,
          bestEnginePerPose: toolSettings.bestEnginePerPose === true,
          hasPlate: resolveSlotLook(queueTarget).hasPlate,
        },
        {
          inventory: async () =>
            readCachedComfyObjectInfoModels() ??
            (await fetchComfyObjectInfoModelsCached().catch(() => null)),
          weakLayouts: weakPoseLayouts,
          poseReport: blendedPoseEngineReport,
        }
      ),
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

  /**
   * A run's inputs, frozen at Start (FINISHING_PLAN Phase 3, step 2; run-bundle.ts): the page's
   * settings and plate, the run's Scenes as their takes read them, the Cast they name, the play
   * metrics. The server keeps it; each of the run's takes is checked against it (shadow mode).
   */
  const captureRunBundle = useCallback(
    (run: { id: string; castId: string; items: ReadonlyArray<{ sceneId: string }> }): RunBundle => {
      const ids = new Set(run.items.map(item => item.sceneId));
      const scenes = (sceneCacheRef.current.scenes ?? [])
        .filter(scene => ids.has(scene.id))
        .map(scene => ({
          id: scene.id,
          slot: scene.slot,
          ...(scene.dayMood !== undefined ? { dayMood: scene.dayMood } : {}),
          ...(scene.intimateMix !== undefined ? { intimateMix: scene.intimateMix } : {}),
          ...(scene.allowCompanions !== undefined
            ? { allowCompanions: scene.allowCompanions }
            : {}),
          ...(scene.partnerCharacterId ? { partnerCharacterId: scene.partnerCharacterId } : {}),
          ...(scene.outfit ? { outfit: scene.outfit as Record<string, string> } : {}),
          ...(scene.fromScript ? { fromScript: scene.fromScript } : {}),
        }));
      const castIds = new Set(
        [
          run.castId,
          character?.id,
          toolSettings.partnerCharacterId,
          ...scenes.map(scene => scene.partnerCharacterId),
        ].filter((id): id is string => Boolean(id?.trim()) && !id!.startsWith('new:'))
      );
      return {
        version: RUN_BUNDLE_VERSION,
        runId: run.id,
        castId: run.castId,
        capturedAt: Date.now(),
        settings: {
          model: shared.model,
          ...(shared.modelCheckpointMap ? { modelCheckpointMap: shared.modelCheckpointMap } : {}),
          dayMood: toolSettings.dayMood,
          intimateMix: toolSettings.intimateMix,
          intimateEnabled,
          allowCompanions: toolSettings.allowCompanions === true,
          bestEnginePerPose: toolSettings.bestEnginePerPose === true,
          ...(toolSettings.partnerCharacterId
            ? { partnerCharacterId: toolSettings.partnerCharacterId }
            : {}),
          ...(shared.lockedWardrobeId?.trim()
            ? { lockedWardrobeId: shared.lockedWardrobeId.trim() }
            : {}),
          clothingGender,
        },
        pagePlate: {
          hasPlate: Boolean(hasPlate),
          ...(plate?.source ? { plateSource: plate.source } : {}),
        },
        cast: [...castIds]
          .map(id => getCharacter(id))
          .filter((record): record is NonNullable<typeof record> => Boolean(record)),
        scenes,
        metrics: {
          weakLayouts: [...weakPoseLayouts()],
          poseReport: blendedPoseEngineReport(),
        },
        // Read at Start from this browser's stores, as the run's takes' queue reads them.
        queue: captureRunQueueSettings(),
        page: {
          sceneTool: storedToolSettings as unknown as Record<string, unknown>,
          gallery: plateGalleryEntries(
            [...castIds]
              .map(id => getCharacter(id))
              .filter((record): record is NonNullable<typeof record> => Boolean(record)),
            galleryEntries
          ),
          leanChrome,
          locations: loadLocations(),
          poseLibrary: loadPoseLibrary(),
        },
      };
    },
    [
      galleryEntries,
      leanChrome,
      storedToolSettings,
      character?.id,
      clothingGender,
      hasPlate,
      intimateEnabled,
      plate?.source,
      shared.lockedWardrobeId,
      shared.model,
      shared.modelCheckpointMap,
      toolSettings.allowCompanions,
      toolSettings.bestEnginePerPose,
      toolSettings.dayMood,
      toolSettings.intimateMix,
      toolSettings.partnerCharacterId,
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

  /**
   * One event, moment 2 on: a same-camera edit of the moment before (day-event.ts), so the room,
   * light, camera and clothes carry over and the clips can end on each other. The edit's job is
   * recorded on the slot like any still, and the board picks it up from the gallery.
   */
  /**
   * A shot with nobody in it (`placeOnly`, a script's "Rain streaks down the window"): the empty
   * place, rendered as a location's picture is (location/picture.ts), its action in the words —
   * not the lead posed from the window (2026-11-11).
   */
  const queuePlaceShot = useCallback(
    async (slot: DaySlot): Promise<string | null> => {
      setError(null);
      setActiveSlotId(slot.id);
      actions.resetStatuses();
      const place =
        withCastPlace(slot.location, character, leadNoun)?.trim() ||
        slot.location?.trim() ||
        'the place';
      const where = { name: place, look: slot.sceneHints?.trim() ?? '' };
      const setting = /\boutdoors\b/i.test(place) ? ('EXT' as const) : ('INT' as const);
      const { requeueComfyJob } = await import('@/lib/comfyui/requeue');
      const queued = await requeueComfyJob({
        prompt: locationPicturePrompt({ ...where, setting }),
        negativePrompt: LOCATION_PICTURE_NEGATIVE,
        model: LOCATION_PICTURE_MODEL,
        tool: 'scene',
        workflowJson: JSON.stringify(
          locationPictureGraph({ ...where, setting }, Math.floor(Math.random() * 2 ** 31))
        ),
        workflowFinal: true,
      }).catch(() => null);
      const id = queued?.ok && queued.promptId ? queued.promptId.trim() : '';
      const nextStills = upsertDaySlotStill(stillsRef.current, {
        slotId: slot.id,
        promptId: id || undefined,
        status: id ? 'queued' : 'error',
        imageUrl: undefined,
        clipPromptId: undefined,
        clipRenderPromptId: undefined,
        clipUrl: undefined,
        clipStatus: undefined,
        promptCheck: undefined,
        beatKey: rerollBeatKey(slot.sceneHints) || undefined,
        previousTake: undefined,
        bestOfTwo: undefined,
        twoTakes: undefined,
        redoReason: undefined,
      });
      stillsRef.current = nextStills;
      updateToolSettings(dayStillsCachePatch(nextStills, shared.activeCharacterId));
      if (!id) {
        setError(
          `${slot.label}: the empty place didn't queue (it renders on Qwen-Image 2.1 Turbo)${queued?.error ? ` — ${queued.error}` : ''}.`
        );
      }
      return id || null;
    },
    [actions, character, leadNoun, shared.activeCharacterId, updateToolSettings]
  );

  const queueEventMoment = useCallback(
    async (slot: DaySlot, previous: DaySlot): Promise<string | null> => {
      const prevStill = stillsRef.current.find(entry => entry.slotId === previous.id);
      const prevEntry = prevStill?.promptId
        ? loadComfyGallery().find(entry => entry.promptId === prevStill.promptId)
        : undefined;
      // The gallery can know the take is done before the board has caught up.
      const imageUrl =
        (prevStill?.status === 'completed' ? prevStill.imageUrl?.trim() : '') ||
        (prevEntry?.status === 'completed' ? galleryEntryPrimaryViewUrl(prevEntry)?.trim() : '') ||
        '';
      if (!imageUrl) {
        setError(
          `This moment is made from the one before it — queue ${previous.label} (the moment before) first and wait for its still.`
        );
        return null;
      }
      const words = dayEventMomentWords(slot);
      if (!words) {
        setError('Write what she is doing in this moment first.');
        return null;
      }
      setError(null);
      setActiveSlotId(slot.id);
      actions.resetStatuses();
      // The edit renders at the moment's own shape: on the sidebar's square latent a portrait
      // still came back 1328² and wider, and the clip could not end on it (live, 2026-10-12).
      const size = await probeImageUrlDimensions(imageUrl).catch(() => null);
      const promptId = await actions.sendComfyUi(
        [
          buildDayEndPoseEditPrompt(words, dayPartnerNoun(character ?? {})),
          DAY_EVENT_EDIT_CAMERA_LINE,
          dayEventKeepPropsLine(normalizeDayEvent(toolSettings.dayEvent)?.props),
        ]
          .filter(Boolean)
          .join(' '),
        undefined,
        undefined,
        {
          inputImageUrl: imageUrl,
          identityLock: false,
          queueModel: resolveCastPlatePrepareModel(shared.model),
          queueTool: 'fitting',
          turboEditStrength: 'balanced',
          preserveInputAspect: true,
          ...(size ? { castPlateReference: true, figurePixelSize: size } : {}),
          explicitNegative: DAY_END_POSE_EDIT_NEGATIVE,
          queueHints: '',
          parentGalleryEntryId: prevEntry?.id,
          characterId: shared.activeCharacterId,
          lookId: slot.lookId ?? shared.activeLookId ?? character?.activeLookId,
          sourceImageUrl: imageUrl,
        }
      );
      const id = typeof promptId === 'string' ? promptId.trim() : '';
      const lastTake = stillsRef.current.find(entry => entry.slotId === slot.id);
      const nextStills = upsertDaySlotStill(stillsRef.current, {
        slotId: slot.id,
        promptId: id || undefined,
        status: id ? 'queued' : 'error',
        imageUrl: undefined,
        clipPromptId: undefined,
        clipRenderPromptId: undefined,
        clipUrl: undefined,
        clipStatus: undefined,
        promptCheck: undefined,
        beatKey: rerollBeatKey(slot.sceneHints) || undefined,
        previousTake: undefined,
        bestOfTwo: undefined,
        twoTakes: undefined,
        redoReason: undefined,
      });
      stillsRef.current = nextStills;
      // From the latest slots: an event's moments are queued one after another in one callback.
      const slotsBefore = latestSlotsRef.current;
      const slotsAfter =
        id && lastTake?.status === 'completed' && !scriptLineStays()
          ? slotsBefore.map(entry => (entry.id === slot.id ? clearDaySlotLine(entry) : entry))
          : null;
      const lineCleared = Boolean(slotsAfter?.some((entry, index) => entry !== slotsBefore[index]));
      if (slotsAfter && lineCleared) latestSlotsRef.current = slotsAfter;
      updateToolSettings({
        ...dayStillsCachePatch(nextStills, shared.activeCharacterId),
        ...(slotsAfter && lineCleared ? { slots: slotsAfter } : {}),
      });
      if (!id) setError('ComfyUI did not accept the moment edit — is it running?');
      return id || null;
    },
    [actions, character, shared, toolSettings.dayEvent, updateToolSettings]
  );

  /**
   * One event, last moment: its ending as an end picture — a same-camera edit of the last still,
   * kept as that card's End pose. Ending the last clip on its own still held the framing but
   * froze her for its last seconds (the beach film, 0.03 motion/s); moving into the ending keeps
   * her moving with the camera held.
   */
  const queueEventEnding = useCallback(
    async (slot: DaySlot): Promise<boolean> => {
      const words = dayEventActionWords(slot.eventMove?.trim().replace(/[.\s]+$/, '') ?? '');
      const still = stillsRef.current.find(entry => entry.slotId === slot.id);
      const entry = still?.promptId
        ? loadComfyGallery().find(galleryEntry => galleryEntry.promptId === still.promptId)
        : undefined;
      const imageUrl =
        (still?.status === 'completed' ? still.imageUrl?.trim() : '') ||
        (entry?.status === 'completed' ? galleryEntryPrimaryViewUrl(entry)?.trim() : '') ||
        '';
      if (!words || !imageUrl) return false;
      const size = await probeImageUrlDimensions(imageUrl).catch(() => null);
      const promptId = await actions.sendComfyUi(
        [
          buildDayEndPoseEditPrompt(words, dayPartnerNoun(character ?? {})),
          DAY_EVENT_EDIT_CAMERA_LINE,
          dayEventKeepPropsLine(normalizeDayEvent(toolSettings.dayEvent)?.props),
        ]
          .filter(Boolean)
          .join(' '),
        undefined,
        undefined,
        {
          inputImageUrl: imageUrl,
          identityLock: false,
          queueModel: resolveCastPlatePrepareModel(shared.model),
          queueTool: 'fitting',
          turboEditStrength: 'balanced',
          preserveInputAspect: true,
          ...(size ? { castPlateReference: true, figurePixelSize: size } : {}),
          explicitNegative: DAY_END_POSE_EDIT_NEGATIVE,
          queueHints: '',
          parentGalleryEntryId: entry?.id,
          characterId: shared.activeCharacterId,
          lookId: slot.lookId ?? shared.activeLookId ?? character?.activeLookId,
          sourceImageUrl: imageUrl,
        }
      );
      const id = typeof promptId === 'string' ? promptId.trim() : '';
      if (!id) return false;
      const [done] = await waitForGalleryPromptIds([id], { timeoutMs: 20 * 60_000, pollMs: 3_000 });
      const endUrl = done?.status === 'completed' ? galleryEntryPrimaryViewUrl(done)?.trim() : '';
      if (!endUrl) return false;
      // An ending that rebuilt the place is not kept: the last clip ends on its own still.
      const drift = await pictureGreyDifference(imageUrl, endUrl);
      if (drift !== null && drift > SAME_SHOT_MAX_DIFF) return false;
      const current = stillsRef.current.find(entry => entry.slotId === slot.id);
      const nextStills = upsertDaySlotStill(stillsRef.current, {
        ...(current ?? { slotId: slot.id }),
        slotId: slot.id,
        endPose: {
          imageUrl: endUrl,
          source: 'edit',
          poseWords: words,
          ...(current?.promptId ? { forTake: current.promptId } : {}),
        },
      });
      stillsRef.current = nextStills;
      updateToolSettings(dayStillsCachePatch(nextStills, shared.activeCharacterId));
      return true;
    },
    [actions, character, shared, toolSettings.dayEvent, updateToolSettings]
  );

  // The vision calls (partner plate, slot checks) read the current settings without making queueSlot (which
  // the adult gate's auto-queue effect lists) change on every shared-settings write.
  const sharedRef = useLatestRef(shared);
  const queueSlot = useCallback(
    (slot: DaySlot, options?: DayTakeOptions) =>
      runDayTake(
        {
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
        },
        slot,
        options
      ),
    [
      actions,
      buildSlotPrompt,
      queuePlaceShot,
      scriptSceneRoom,
      storeToolSettings,
      character,
      sceneMode,
      isolatePending,
      isolateSubject,
      leanChrome,
      leadNoun,
      queueEventMoment,
      resolveSlotLook,
      resolveSlotStillModel,
      shared.activeCharacterId,
      shared.activeLookId,
      shared.ipAdapterStrength,
      slots,
      toolSettings.allowCompanions,
      toolSettings.autoReviewStills,
      toolSettings.bestOfTwoHardPoses,
      toolSettings.dayEvent,
      toolSettings.dayMood,
      toolSettings.identityBoost,
      toolSettings.intimateMix,
      toolSettings.partnerCharacterId,
      toolSettings.posePriority,
      toolSettings.twoTakesIntimate,
      intimateEnabled,
      shared.lockedLocation,
      shared.model,
      sharedRef,
      updateShared,
      updateToolSettings,
      wardrobeLabelFor,
      wardrobeOptions,
      clothingGender,
    ]
  );
  const suggestDayScenes = useCallback(() => {
    // New scenes for the whole day leave an event: its labels and moves go with it, or the event's
    // chained edits and flag-only reviews would carry on under the new scenes.
    const whole = slotsForWholeDay(slots, toolSettings.dayEvent, daySlotDefaultLabel);
    // One stretch of time, not a tour of the day: with no time chosen on any moment, they all
    // take the first one's before their scenes are picked (its presets for every moment).
    const timed =
      whole.slots.length && !whole.slots.some(slot => slot.timeOfDay)
        ? slotsAtTime(whole.slots, slotDayPart(whole.slots[0]!))
        : whole.slots;
    const diversified = diversifyDaySlotScenes(timed, {
      forceLocations: true,
      forceBeats: true,
      fillBeats: true,
      allowCompanions: toolSettings.allowCompanions === true,
      dayMood: toolSettings.dayMood,
      intimateMix: toolSettings.intimateMix,
    });
    if (diversified.changed || whole.leaves || timed !== whole.slots) {
      updateToolSettings({
        slots: diversified.slots,
        ...(whole.leaves ? { dayEvent: undefined } : {}),
      });
    }
    return diversified.changed || whole.leaves || timed !== whole.slots;
  }, [
    slots,
    toolSettings.allowCompanions,
    toolSettings.dayEvent,
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
        // Moments at a chosen time of day are written at that time.
        slotTimes: Object.fromEntries(
          slots.flatMap(slot => (slot.timeOfDay ? [[slot.id, slot.timeOfDay]] : []))
        ),
        companions: toolSettings.allowCompanions === true,
        mood: normalizeDayMood(toolSettings.dayMood),
        llmBody: sharedLlmRequestBody(shared),
      });
      // A whole day from an idea leaves an event (the toggle alone left it on underneath).
      const whole = slotsForWholeDay(slots, toolSettings.dayEvent, daySlotDefaultLabel);
      updateToolSettings({
        slots: applyDayPremiseBeats(whole.slots, beats),
        ...(whole.leaves ? { dayEvent: undefined } : {}),
        // Tomorrow keeps following the idea.
        dayThread: normalizeDayThread({
          ...normalizeDayThread(toolSettings.dayThread),
          premise: premise.trim(),
        }),
      });
      return beats.length;
    },
    [
      shared,
      slots,
      toolSettings.allowCompanions,
      toolSettings.dayEvent,
      toolSettings.dayMood,
      toolSettings.dayThread,
      updateToolSettings,
    ]
  );

  // One event: the LLM writes consecutive moments of one event in one place (day-event.ts).
  const writeDayEvent = useCallback(
    async (event: string): Promise<number> => {
      const plan = await requestDayEventPlan({
        event,
        count: slots.length,
        llmBody: sharedLlmRequestBody(shared),
      });
      // The Day's own scenes, for Back to a whole day — kept from before the first event, not
      // from an event written over another.
      const current = normalizeDayEvent(toolSettings.dayEvent);
      updateToolSettings({
        slots: applyDayEventPlan(slots, plan),
        dayEvent: normalizeDayEvent({
          text: event,
          place: plan.place,
          time: plan.time,
          before: current ? current.before : dayEventBefore(slots),
          props: plan.props,
        }),
      });
      return plan.moments.length;
    },
    [shared, slots, toolSettings.dayEvent, updateToolSettings]
  );

  const leaveDayEvent = useCallback(() => {
    // The Day's own scenes come back; a slot that had none is filled the usual way.
    const restored = clearDayEventSlots(
      slots,
      daySlotDefaultLabel,
      normalizeDayEvent(toolSettings.dayEvent)?.before ?? []
    );
    const filled = diversifyDaySlotScenes(restored, {
      forceLocations: false,
      forceBeats: false,
      fillBeats: true,
      allowCompanions: toolSettings.allowCompanions === true,
      dayMood: toolSettings.dayMood,
      intimateMix: toolSettings.intimateMix,
    });
    updateToolSettings({ slots: filled.slots, dayEvent: undefined });
  }, [
    slots,
    toolSettings.allowCompanions,
    toolSettings.dayEvent,
    toolSettings.dayMood,
    toolSettings.intimateMix,
    updateToolSettings,
  ]);

  const rerollActiveSlotScene = useCallback(
    (options?: {
      slotId?: import('@/lib/day/planner').DaySlotId;
      rerollLocation?: boolean;
      rerollBeat?: boolean;
    }) => {
      const slotId = options?.slotId ?? activeSlotId;
      // A whole-day scene on one card leaves an event: kept, that card was still made as an edit
      // of the moment before (a rooftop ledge drawn over the stairs picture, the old props in hand).
      const whole = slotsForWholeDay(slots, toolSettings.dayEvent, daySlotDefaultLabel);
      const next = rerollDaySlotScene(whole.slots, slotId, {
        rerollLocation: options?.rerollLocation !== false,
        rerollBeat: options?.rerollBeat !== false,
        allowCompanions: toolSettings.allowCompanions === true,
        dayMood: toolSettings.dayMood,
        intimateMix: toolSettings.intimateMix,
      });
      if (next.changed || whole.leaves) {
        if (slotId !== activeSlotId) {
          setActiveSlotId(slotId);
        }
        updateToolSettings({
          slots: next.slots,
          ...(whole.leaves ? { dayEvent: undefined } : {}),
        });
      }
      return next.changed || whole.leaves;
    },
    [
      activeSlotId,
      slots,
      toolSettings.allowCompanions,
      toolSettings.dayEvent,
      toolSettings.dayMood,
      toolSettings.intimateMix,
      updateToolSettings,
    ]
  );

  const renderOffline = useRenderBackend().state === 'offline';
  const queueBlockReason = dayQueueBlockReason({
    hasCharacter: Boolean(character),
    hasPlate,
    isolateSubject,
    isolatePending,
    renderOffline,
  });

  // One mood change, flavors included: Intimate and Intimate · Playful are different beat pools,
  // so flipping Playful re-aligns the board exactly as switching Intimate ↔ Raunchy did.
  const applyDayMood = (next: import('@/lib/day/planner').DayMoodSetting) => {
    const theme = dayThemeOf(next);
    const mood: import('@/lib/day/planner').DayMoodSetting =
      theme?.id ?? (isDayAdultMood(next) && !intimateEnabled ? 'everyday' : normalizeDayMood(next));
    const mix = normalizeDayIntimateMix(toolSettings.intimateMix);
    // Date night / Night out beats need a second person — turn companions on with them.
    const allowCompanions = theme?.companions ? true : toolSettings.allowCompanions === true;
    // Another mood is another Day: an event (clothed, one chain) is left, not carried into it.
    const whole =
      mood === normalizeDayMood(toolSettings.dayMood)
        ? { slots, leaves: false }
        : slotsForWholeDay(slots, toolSettings.dayEvent, daySlotDefaultLabel);
    const aligned = ensureDaySlotsMatchMood(whole.slots, {
      dayMood: mood,
      intimateMix: mix,
      allowCompanions,
      keepSettings: sceneMode,
    });
    // A theme dresses from its own pool: kits picked under another mood (a suit on a Cosplay
    // day, overalls on Date night) are dropped so the queue picks a fitting one.
    const baseSlots = aligned.changed ? aligned.slots : whole.slots;
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
      // Intimate ↔ Intimate · Playful: the toggle is part of the mood ('raunchy' flavor is
      // written back as Intimate + Playful on).
      ...(isDayAdultMood(mood) ? { intimatePlayful: mood === 'raunchy' } : {}),
      ...(theme?.companions && toolSettings.allowCompanions !== true
        ? {
            allowCompanions: true,
            ...(normalizeDayIntimateMix(toolSettings.intimateMix) === 'solo'
              ? { intimateMix: 'mixed' as const }
              : {}),
          }
        : {}),
      ...(aligned.changed || kitsChanged || whole.leaves ? { slots: redressed } : {}),
      ...(whole.leaves ? { dayEvent: undefined } : {}),
    });
  };

  return {
    variant,
    sceneMode,
    /** Clip jobs (Copy moves, Sharpen…) are owned per page, so a reload hands each its own. */
    clipJobFeature: sceneMode ? 'scene' : 'day',
    router,
    setBusy,
    setAssemblingFilm,
    setFilmStatus,
    setFilmNeedsCast,
    stillsRef,
    assembledFilmRef,
    rerollNudgeRef,
    wordsOnlyRedoRef,
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
    previewNarration,
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
      // An event's moments are one chain for its count, so another count leaves the event.
      const whole =
        length === slots.length
          ? { slots, leaves: false }
          : slotsForWholeDay(slots, toolSettings.dayEvent, daySlotDefaultLabel);
      const nextSlots = normalizeDaySlots(whole.slots, length);
      updateToolSettings({
        dayLength: length,
        slots: nextSlots,
        ...(whole.leaves ? { dayEvent: undefined } : {}),
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
    // A theme (Date night, Cosplay…) stays as its own id; it renders as Everyday.
    dayMood: (dayThemeOf(toolSettings.dayMood)?.id ??
      normalizeDayMood(
        isDayAdultMood(toolSettings.dayMood) && !intimateEnabled ? 'everyday' : toolSettings.dayMood
      )) as import('@/lib/day/planner').DayMoodSetting,
    // The picker's Intimate keeps the Playful toggle as it was last set.
    setDayMood: (next: import('@/lib/day/planner').DayMoodSetting) =>
      applyDayMood(
        next === 'intimate'
          ? dayMoodWithPlayful('intimate', storedToolSettings.intimatePlayful === true)
          : next
      ),
    intimatePlayful: normalizeDayMood(toolSettings.dayMood) === 'raunchy',
    setIntimatePlayful: (next: boolean) => applyDayMood(next ? 'raunchy' : 'intimate'),
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
      // On a script's Scene the film's partner goes too, or the next shot brings it back.
      const filmScriptId = sceneMode
        ? sceneCacheRef.current.scenes?.find(
            scene => scene.id === sceneCacheRef.current.activeSceneId
          )?.fromScript?.scriptId
        : undefined;
      if (filmScriptId) {
        const { [filmScriptId]: _dropped, ...rest } = sceneScriptPartners(
          sceneCacheRef.current.scriptPartners
        );
        storeToolSettings({ scriptPartners: rest } as Parameters<typeof storeToolSettings>[0]);
      }
    },
    // The invented partner, kept as a Cast member: same face on later Days, and pickable as a
    // lead. Day switches its partner to the new Cast.
    keepPartnerAsCast: (name?: string): string | null => {
      const standIn = toolSettings.partnerStandIn;
      if (!standIn?.filename?.trim()) return null;
      const record = characterFromPartnerStandIn({
        look: standIn.look,
        filename: standIn.filename,
        imageUrl: standIn.imageUrl,
        name,
      });
      upsertCharacter(record);
      partnerStandInRef.current = null;
      updateToolSettings({
        partnerCharacterId: record.id,
        partnerStandIn: undefined,
        partnerSentFace: undefined,
      });
      return record.id;
    },
    // People (Solo / Mixed / Duo) — one control for every mood. Clothed moods: Solo = no
    // companion, Mixed = some stills with a friend / partner, Duo = every still. Adult moods: the
    // Solo / Mixed / Duo mix. Both settings move together so switching mood keeps the choice.
    people: ((): import('@/lib/day/planner').DayIntimateMix => {
      const mix = normalizeDayIntimateMix(toolSettings.intimateMix);
      if (isDayAdultMood(toolSettings.dayMood) && intimateEnabled) return mix;
      if (toolSettings.allowCompanions !== true) return 'solo';
      return mix === 'solo' ? 'mixed' : mix;
    })(),
    setPeople: (next: import('@/lib/day/planner').DayIntimateMix) => {
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
        ? ensureDaySlotsMatchMood(slots, {
            dayMood: rawMood,
            intimateMix: mix,
            allowCompanions,
            keepSettings: sceneMode,
          })
        : alignDaySlotsToPeople(slots, { dayMood: rawMood, people: mix, keepSettings: sceneMode });
      updateToolSettings({
        intimateMix: mix,
        allowCompanions,
        ...(aligned.changed ? { slots: aligned.slots } : {}),
      });
    },
    intimateMix: normalizeDayIntimateMix(toolSettings.intimateMix),
    setIntimateMix: (next: import('@/lib/day/planner').DayIntimateMix) => {
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
        keepSettings: sceneMode,
      });
      updateToolSettings({
        intimateMix: mix,
        ...(aligned.changed ? { slots: aligned.slots } : {}),
      });
    },
    suggestDayScenes,
    writeDayFromIdea,
    writeDayEvent,
    leaveDayEvent,
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
    keeperStandIn: keeperStandIn.status,
    makeStandingPicture: keeperStandIn.makeStandingPicture,
    captureRunBundle,
    wardrobeOptions,
    wardrobeReady,
    wardrobeCategoryFilter,
    filteredWardrobeOptions,
    wardrobeKitCount,
    actions,
    updateSlot,
    latestSlotsRef,
    wardrobeLabelFor,
    queueSlot,
    queueEventMoment,
    queueEventEnding,
    resolveSlotStillModel,
    leanChrome,
  };
}

export type DayPlannerToolOrchestrationCore = ReturnType<typeof useDayPlannerToolOrchestrationCore>;

/** A slot's queued guide, kept for the pose-match check and the pose library. */

/** Image 1 sizes by URL — the plate rarely changes within a Day, so probe once. */
