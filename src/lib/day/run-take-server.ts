/**
 * A run's take on the server (FINISHING_PLAN Phase 3, the runner): the page's own take
 * (runDayTake, day-take-run.ts) given a context made from the run's bundle alone — its Scene
 * opened as the page opens it (openScenePatch) on the run's working copy of the Scene settings,
 * the plates, look and brief resolved by the same functions the page calls (take-helpers.ts),
 * ComfyUI asked directly, records kept for the run. What the take changes is applied to the
 * working copy and kept as patches, for the page to apply (the patch queue): Scenes stay the
 * page's.
 *
 * Not yet on the server (the take says so and the run leaves it to the page): place-only shots
 * and an event's later moments.
 */
import type { CharacterRecord } from '@/lib/character/os';
import type { ComfyUiModelLists } from '@/lib/comfyui/object-info';
import type { ComfyPromptStatus } from '@/lib/comfyui/status';
import { normalizeIsolateSubject } from '@/lib/edit/isolate-subject';
import { serverFacePlateOps } from '@/lib/day/face-plate-ops-server';
import { checkReferenceOnServer } from '@/lib/checks/reference-check-server';
import { renderEmptyPlace } from '@/lib/location/picture-client';
import { serverEmptyPlaceSteps } from '@/lib/location/picture-server';
import { serverPictureIo } from '@/lib/media/picture-io-server';
import { finalizePromptRules } from '@/lib/prompt/finalize';
import { recordPoseGuideOutcome } from '@/lib/pose/guide-status';
import { normalizeStoredPoseGuideStyle, poseGuideStyleForModel } from '@/lib/pose/guide-prompt';
import type { VramSnapshot } from '@/lib/queue/vram-queue-guard';
import {
  DEFAULT_SCENE_TOOL_CACHE,
  type DayToolCache,
  type SceneToolCache,
} from '@/lib/play/settings';
import { migrateDayMoodFields } from '@/lib/settings/day-mood-migration';
import { resolveWardrobeGarmentThumbQueueUrl } from '@/lib/wardrobe/garment-thumbs';
import { humanizeClothingId } from '@/lib/wardrobe/clothing-catalog-client';
import {
  runDayTake,
  type ClothingOption,
  type DayTakeContext,
  type DayTakeOptions,
  type DayTakeSteps,
} from '@/hooks/day-planner/day-take-run';
import type { DressPlateStore } from './dress-plate-client';
import { serverDressPlateDeps } from './dress-plate-server';
import { dayMoodFlavor } from './mood-flavor';
import { dayPartnerNoun } from './partner';
import type { DayPartnerStandIn } from './partner-stand-in';
import { dayMoodReplacesKeepOutfit, normalizeDaySlotStills, type DaySlot } from './planner';
import {
  dayPlateIsolatePending,
  resolveDayPlate,
  resolveDayPlateForIsolate,
  resolveDayQueueIdentityPlate,
} from './plate';
import type { RunBundle, RunBundlePage } from './run-bundle';
import { openScenePatch, sceneScriptRooms, sceneSlotOf, sceneSlotsPatch } from './scenes';
import {
  buildTakeSlotPrompt,
  planTakeStillModel,
  resolveTakeSlotLook,
  takeSceneRoom,
  takeWardrobeLabel,
} from './take-helpers';

type Fetch = typeof fetch;

/** The run's working copy of the Scene settings, and what changed in it (the patch queue). */
export type RunTakeState = {
  sceneTool: SceneToolCache;
  patches: Array<Partial<SceneToolCache>>;
};

export function runTakeState(page: RunBundlePage): RunTakeState {
  return {
    sceneTool: { ...DEFAULT_SCENE_TOOL_CACHE, ...(page.sceneTool as Partial<SceneToolCache>) },
    patches: [],
  };
}

export type ServerTakeDeps = {
  comfyUrl: string;
  /** Where the app's own picture paths are fetched from (the server's own origin). */
  appOrigin?: string;
  /** ComfyUI's models (object_info), for the engine hand-offs and the queue. */
  inventory: ComfyUiModelLists | null;
  /** The wardrobe catalog for the lead (the page's picker options). */
  catalog: ClothingOption[];
  /** The run's own dressed plates (merged back by the patch queue). */
  dressPlateStore: DressPlateStore;
  readVram?: (comfyUrl?: string) => Promise<VramSnapshot | null>;
  fetchImpl?: Fetch;
  status?: (promptId: string) => Promise<ComfyPromptStatus>;
  sleep?: (ms: number) => Promise<void>;
  /** How a take's request reaches ComfyUI (tests record it). */
  queue?: Parameters<typeof serverDressPlateDeps>[0]['queue'];
  /** Tests replace the picture steps (face crops, uploads) wholesale. */
  steps?: Partial<DayTakeSteps>;
};

export type ServerTakeResult = {
  /** Why the take was not queued (the page's error line), or null. */
  error: string | null;
  /** What the take's checks read (run-checks-server.ts). */
  report?: ServerTakeReport;
};

/** What a take decided, for its checks: as the page's after-checks read them from the page. */
export type ServerTakeReport = {
  /** The still's prompt as queued (its gallery entry's). */
  prompt?: string;
  /** People the drawn pose guide had (none drawn: unknown). */
  drawnPeople?: number;
  slot: DaySlot;
  toolSettings: DayToolCache;
  character?: CharacterRecord;
  leadNoun: ReturnType<typeof dayPartnerNoun>;
  plate: { filename?: string; imageUrl?: string } | null;
  wardrobeLabel: (wardrobeId?: string) => string;
};

const noop = () => undefined;

/** Run one Scene's take on the server: opened, put together, queued. */
export async function runServerTake(
  bundle: RunBundle,
  state: RunTakeState,
  sceneId: string,
  deps: ServerTakeDeps,
  options?: DayTakeOptions
): Promise<ServerTakeResult> {
  const { queue, page } = bundle;
  if (!queue || !page) {
    return { error: 'This run was started before the server could render its takes.' };
  }
  const apply = (patch: Partial<SceneToolCache>) => {
    state.sceneTool = { ...state.sceneTool, ...patch };
    state.patches.push(patch);
  };
  const opened = openScenePatch(state.sceneTool, sceneId);
  if (!opened && state.sceneTool.activeSceneId !== sceneId) {
    return { error: 'The Scene is not in the run’s settings.' };
  }
  if (opened) apply(opened);

  const stored = state.sceneTool;
  const flavor = dayMoodFlavor(stored);
  const toolSettings = (
    flavor === stored.dayMood ? stored : { ...stored, dayMood: flavor }
  ) as DayToolCache;
  const shared = queue.shared;
  const castById = new Map(bundle.cast.map(record => [record.id, record]));
  const getCharacter = (id: string | undefined | null) =>
    (id ? castById.get(id) : undefined) as CharacterRecord | undefined;
  const character = getCharacter(shared.activeCharacterId) ?? getCharacter(bundle.castId);
  const leadNoun = dayPartnerNoun(character ?? {});
  const intimateEnabled = bundle.settings.intimateEnabled;

  // The page's plate (useDayPlateIsolate), from the Cast and its keepers.
  const basePlate = resolveDayPlate({ character, gallery: page.gallery });
  const isolateSubject = normalizeIsolateSubject(toolSettings.isolateSubject);
  const isolateCache = {
    isolateSubject: toolSettings.isolateSubject,
    referenceIsolated: toolSettings.referenceIsolated,
    plateIsolateSourceKey: toolSettings.plateIsolateSourceKey,
    plateImageUrl: toolSettings.plateImageUrl,
    plateImageFilename: toolSettings.plateImageFilename,
    plateOriginalUrl: toolSettings.plateOriginalUrl,
    plateOriginalFilename: toolSettings.plateOriginalFilename,
  };
  const plate = resolveDayPlateForIsolate({ basePlate, isolateSubject, cache: isolateCache });
  const isolatePending = dayPlateIsolatePending({ basePlate, isolateSubject, cache: isolateCache });
  const hasPlate = Boolean(plate?.filename?.trim() || plate?.imageUrl?.trim());
  const preferCastPlate = dayMoodReplacesKeepOutfit(toolSettings.dayMood);
  const queuePlate = resolveDayQueueIdentityPlate({
    character,
    displayPlate: plate,
    preferCastPlate,
  });

  // The take's ComfyUI steps, as the dress plate's (queue-request-server.ts).
  const plateDeps = serverDressPlateDeps({
    settings: queue,
    config: { model: shared.model, tool: 'day', hints: toolSettings.notes },
    comfyUrl: deps.comfyUrl,
    ...(deps.appOrigin ? { appOrigin: deps.appOrigin } : {}),
    inventory: deps.inventory,
    ...(character ? { character } : {}),
    store: deps.dressPlateStore,
    ...(deps.readVram ? { readVram: deps.readVram } : {}),
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    ...(deps.status ? { status: deps.status } : {}),
    ...(deps.sleep ? { sleep: deps.sleep } : {}),
    ...(deps.queue ? { queue: deps.queue } : {}),
  });
  const io = serverPictureIo({
    comfyUrl: deps.comfyUrl,
    ...(deps.appOrigin ? { appOrigin: deps.appOrigin } : {}),
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
  });

  const scenesRef = {
    get current() {
      return {
        scenes: state.sceneTool.scenes,
        activeSceneId: state.sceneTool.activeSceneId,
        scriptPartners: state.sceneTool.scriptPartners,
        run: state.sceneTool.run,
      };
    },
  };
  const slots = [sceneSlotOf(state.sceneTool.slots)];
  const stillsRef = { current: normalizeDaySlotStills(state.sceneTool.stills, slots) };
  const latestSlotsRef = { current: slots };
  const partnerStandInRef = {
    current: (state.sceneTool.partnerStandIn as DayPartnerStandIn | undefined) ?? null,
  };
  const storeToolSettings = (partial: Partial<DayToolCache>) =>
    apply(partial as Partial<SceneToolCache>);
  const updateToolSettings = (partial: Partial<DayToolCache>) => {
    const patch = partial.slots
      ? { ...partial, slots: sceneSlotsPatch(partial.slots, state.sceneTool.slots) }
      : partial;
    storeToolSettings(migrateDayMoodFields(patch));
    if (patch.stills) stillsRef.current = normalizeDaySlotStills(state.sceneTool.stills, slots);
  };
  let error: string | null = null;
  const setError = (next: string | null | ((previous: string | null) => string | null)) => {
    error = typeof next === 'function' ? next(error) : next;
  };

  const wardrobeLabelFor = (wardrobeId?: string) =>
    takeWardrobeLabel(wardrobeId, {
      labels: {},
      cached: () => null,
      options: deps.catalog,
      humanize: humanizeClothingId,
    });
  const resolveSlotLook = (slot: Pick<DaySlot, 'lookId'>) =>
    resolveTakeSlotLook(slot, {
      character,
      gallery: page.gallery,
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
      hasPlate,
      queuePlate,
      preferCastPlate,
    });
  const poseGuideStyle = poseGuideStyleForModel(
    normalizeStoredPoseGuideStyle(shared.poseGuideStyle),
    shared.model
  );
  const weakLayouts = () => new Set(bundle.metrics.weakLayouts);
  const oneRoom = state.sceneTool.run?.auto?.oneRoom === true;
  let lastPrompt: string | undefined;
  const poseGuideExpectRef: DayTakeContext['poseGuideExpectRef'] = { current: {} };

  const ctx: DayTakeContext = {
    toolSettings,
    shared,
    sceneCacheRef: scenesRef as DayTakeContext['sceneCacheRef'],
    actions: {
      sendComfyUi: (async (prompt: string, ...rest: unknown[]) => {
        lastPrompt = prompt;
        return (plateDeps.sendComfyUi as (...args: unknown[]) => Promise<unknown>)(prompt, ...rest);
      }) as DayTakeContext['actions']['sendComfyUi'],
      finalizePrompt: async (prompt: string, hints?: string) =>
        finalizePromptRules(prompt, {
          hints: hints ?? toolSettings.notes,
          autoFixRules: shared.autoFixRules !== false,
        }),
      resetStatuses: noop,
    } as DayTakeContext['actions'],
    wardrobeLabelFor,
    stillsRef,
    latestSlotsRef,
    setBusy: noop,
    sceneMode: true,
    intimateEnabled,
    updateToolSettings,
    storeToolSettings,
    setDressPlateStatus: noop,
    partnerStandInRef,
    leadNoun,
    character,
    wardrobeOptions: deps.catalog,
    slots,
    setError: setError as DayTakeContext['setError'],
    scriptLineStays: () =>
      Boolean(
        state.sceneTool.scenes?.find(scene => scene.id === state.sceneTool.activeSceneId)
          ?.fromScript
      ),
    wordsOnlyRedoRef: { current: {} },
    sharedRef: { current: shared },
    rerollNudgeRef: { current: {} },
    poseGuideExpectRef,
    lastPlayerBeatRef: { current: {} },
    buildSlotPrompt: (slot, slotOptions) =>
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
          locations: page.locations,
          notes: toolSettings.notes,
          model: shared.model,
          realismMode: shared.renderRealismMode,
          poseGuideStyle,
        },
        slotOptions
      ),
    setPoseGuideOutcomes: noop,
    setOutput: noop,
    setCopied: noop,
    setActiveSlotId: noop,
    scriptSceneRoom: slot =>
      takeSceneRoom(slot, {
        oneRoom,
        rooms: sceneScriptRooms(state.sceneTool.scriptRooms),
        link: state.sceneTool.scenes?.find(scene => scene.id === state.sceneTool.activeSceneId)
          ?.fromScript,
        character,
        leadNoun,
        render: (place, filename) =>
          renderEmptyPlace(
            place,
            filename,
            serverEmptyPlaceSteps({
              comfyUrl: deps.comfyUrl,
              ...(deps.appOrigin ? { appOrigin: deps.appOrigin } : {}),
              ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
              ...(deps.status ? { status: deps.status } : {}),
              ...(deps.sleep ? { sleep: deps.sleep } : {}),
            })
          ),
        keep: rooms => apply({ scriptRooms: rooms } as Partial<SceneToolCache>),
      }),
    resolveSlotStillModel: queueTarget =>
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
          inventory: async () => deps.inventory,
          weakLayouts,
          poseReport: () => bundle.metrics.poseReport,
        }
      ),
    resolveSlotLook,
    queuePlaceShot: async () => {
      throw new Error('A place-only shot is rendered on the page for now.');
    },
    queueEventMoment: async () => {
      throw new Error('An event’s later moments are rendered on the page for now.');
    },
    poseVariantRef: { current: {} },
    leanChrome: page.leanChrome,
    isolateSubject,
    isolatePending,
    clothingGender: bundle.settings.clothingGender,
    steps: {
      comfyUrl: () => deps.comfyUrl,
      getCharacter: ((id: string) => getCharacter(id)) as DayTakeSteps['getCharacter'],
      locations: () => page.locations,
      poseLibrary: () => page.poseLibrary,
      upload: (file, model) => io.upload(file, model),
      imageSize: async url => {
        if (!url?.trim()) return null;
        try {
          const blob = await io.loadBlob([url]);
          const { orientedImageSize } = await import('@/lib/media/image-size-server');
          return await orientedImageSize(new Uint8Array(await blob.arrayBuffer()));
        } catch {
          return null;
        }
      },
      checkStillReferences: async () => undefined,
      nodeTypes: async () => null,
      metrics: {
        weakLayouts,
        cueLayouts: (() => new Set<string>()) as DayTakeSteps['metrics']['cueLayouts'],
      },
      notify: {
        toast: (() => null) as unknown as DayTakeSteps['notify']['toast'],
        tray: () => null,
      },
      record: {
        // A pure reducer (the page's own): imported from its module, not the take's — a value
        // from a 'use client' module isn't the object on the server.
        poseGuideOutcome: recordPoseGuideOutcome,
        poseTakeQueued: noop,
        castOutfitWorn: noop as DayTakeSteps['record']['castOutfitWorn'],
        syncIdentity: noop,
        takeShadow: noop,
        draftFields: noop,
        playerSlotRender: noop as DayTakeSteps['record']['playerSlotRender'],
      },
      faceOps: serverFacePlateOps({
        comfyUrl: deps.comfyUrl,
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
      }),
      checkReference: checkReferenceOnServer,
      standIn: {
        io,
        waitForPromptIds: plateDeps.waitForPromptIds,
        resultUrl: plateDeps.resultUrl,
      },
      io,
      dressPlate: plateDeps,
      ...deps.steps,
    },
  };
  const slot = slots[0]!;
  await runDayTake(ctx, slot, { manageBusy: false, byPlayer: true, ...options });
  const after = sceneSlotOf(state.sceneTool.slots);
  return {
    error,
    report: {
      ...(lastPrompt ? { prompt: lastPrompt } : {}),
      ...(poseGuideExpectRef.current?.[after.id]
        ? { drawnPeople: poseGuideExpectRef.current[after.id]!.keypoints.length }
        : {}),
      slot: after,
      toolSettings,
      ...(character ? { character } : {}),
      leadNoun,
      plate: plate ? { filename: plate.filename, imageUrl: plate.imageUrl } : null,
      wardrobeLabel: wardrobeLabelFor,
    },
  };
}
