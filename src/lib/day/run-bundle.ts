/**
 * A run's inputs, frozen at Start (FINISHING_PLAN Phase 3, step 2): what a take's plan reads from
 * the page — the settings, the Cast, each Scene's look, the play metrics — recorded on the server
 * so the server can make the same decisions without a page (take-plan.ts).
 *
 * Shadow mode first (2026-11-13): while the page still renders, each of a run's takes reports what
 * it decided and the few things that change during a run (the slot as rendered, the outfits its
 * script's Scenes wear so far); the server decides again from the bundle alone and records any
 * difference. A run with none is a bundle that is enough. Pure.
 */
import type { CharacterRecord } from '../character/os';
import type { ComfyImageModel } from '../comfy-models/client';
import type { ComfyUiModelLists } from '../comfyui/object-info';
import type { ModelCheckpointMap } from '../model/checkpoint-map';
import type { PoseEngineReport } from '../pose/pose-engine-report';
import type { ServerQueueSettings } from '../queue/queue-request-server';
import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery';
import { normalizeLocations, type LocationRecord } from '../location/records';
import type { PoseLibraryEntry } from '../pose/library';
import type { DaySlot } from './planner';
import { planTakeModel, planTakeOutfit, planTakePartner, planTakePoseGuide } from './take-plan';
import type { DayAutoKitOption } from './auto-kit';
import { dayPartnerNoun } from './partner';

export const RUN_BUNDLE_VERSION = 1;

/** A take's look: whose plate, from where, and what dresses her (day-slot-look.ts). */
export type RunTakeLook = {
  lookCharacterId?: string;
  hasPlate: boolean;
  plateSource?: string;
  lockedWardrobeId?: string;
  customGarment: boolean;
};

/** A take's settings: the page's, with its Scene's own over them. */
export type RunTakeSettings = {
  dayMood?: string;
  intimateMix?: unknown;
  allowCompanions: boolean;
  partnerCharacterId?: string;
};

/** A run's Scene as the bundle keeps it: what its takes read (not its takes). */
export type RunBundleScene = {
  id: string;
  slot: DaySlot;
  dayMood?: string;
  intimateMix?: unknown;
  allowCompanions?: boolean;
  partnerCharacterId?: string;
  outfit?: Record<string, string>;
  fromScript?: { scriptId: string; sceneId?: string; shotId?: string };
};

export type RunBundle = {
  version: typeof RUN_BUNDLE_VERSION;
  runId: string;
  castId: string;
  capturedAt: number;
  /** The page's settings at Start (a Scene's own are over them). */
  settings: RunTakeSettings & {
    model: ComfyImageModel;
    modelCheckpointMap?: ModelCheckpointMap;
    intimateEnabled: boolean;
    bestEnginePerPose: boolean;
    lockedWardrobeId?: string;
    /** The lead's catalog (wardrobe kits are filtered to it). */
    clothingGender: 'women' | 'men' | 'any';
  };
  /** The lead's plate on the page (a Scene's own plate is over it). */
  pagePlate: { hasPlate: boolean; plateSource?: string };
  /** The lead, and every Cast a take may name (the partner). */
  cast: CharacterRecord[];
  scenes: RunBundleScene[];
  metrics: { weakLayouts: string[]; poseReport?: PoseEngineReport };
  /**
   * What the page's queue reads from this browser, as it read it at Start (FINISHING_PLAN Phase 3):
   * the shared settings (no credentials — the server's environment has those), ComfyUI's settings,
   * the workflow files, the pinned queue params, the sampler memory. The server builds a take's
   * ComfyUI request from these (queue-request-server.ts). Absent in bundles saved before
   * 2026-11-14: the server cannot render such a run itself.
   */
  queue?: ServerQueueSettings;
  /**
   * The rest of what a take reads from the page (FINISHING_PLAN Phase 3, the take on the
   * server): the Scene tool's stored settings as they were at Start (its Scenes, their takes so
   * far, the stand-ins and rooms), the gallery entries the Cast's plates come from (their looks'
   * keepers), and whether the workspace is lean (a lean page skips the prompt lint). Absent in
   * bundles saved before 2026-11-14.
   */
  page?: RunBundlePage;
};

export type RunBundlePage = {
  sceneTool: Record<string, unknown>;
  gallery: ComfyGalleryEntry[];
  leanChrome: boolean;
  /** The saved locations (a shot set in one) and the pose library (photo poses). */
  locations: LocationRecord[];
  poseLibrary: PoseLibraryEntry[];
};

/** The page section from untrusted JSON, or null. */
export function normalizeRunBundlePage(raw: unknown): RunBundlePage | null {
  if (!isRec(raw) || !isRec(raw.sceneTool)) return null;
  return {
    sceneTool: raw.sceneTool,
    gallery: Array.isArray(raw.gallery)
      ? (raw.gallery.filter(
          entry => isRec(entry) && typeof entry.id === 'string'
        ) as unknown as ComfyGalleryEntry[])
      : [],
    leanChrome: raw.leanChrome === true,
    locations: normalizeLocations(raw.locations),
    poseLibrary: Array.isArray(raw.poseLibrary)
      ? (raw.poseLibrary.filter(
          entry => isRec(entry) && typeof entry.id === 'string'
        ) as unknown as PoseLibraryEntry[])
      : [],
  };
}

/** The gallery entries the Cast's plates are read from: every look's keepers. */
export function plateGalleryEntries(
  cast: ReadonlyArray<CharacterRecord>,
  gallery: ReadonlyArray<ComfyGalleryEntry>
): ComfyGalleryEntry[] {
  const ids = new Set<string>();
  for (const record of cast) {
    for (const look of record.looks ?? []) {
      for (const id of look.keeperEntryIds ?? []) if (id?.trim()) ids.add(id.trim());
    }
  }
  return gallery.filter(entry => ids.has(entry.id));
}

/** What a take decided, as compared. */
export type TakeDecisions = {
  wardrobeId?: string;
  stillModel: string;
  queueModel: string;
  partner: 'none' | 'stand-in' | 'cast';
  partnerId?: string;
  /** The drawn guide left out by the plan's own checks (the identity route aside). */
  poseGuideSkip: boolean;
};

type OutfitScene = Parameters<typeof planTakeOutfit>[0] extends { scene?: infer S }
  ? S extends { scenes: ReadonlyArray<infer E> }
    ? E
    : never
  : never;

/** What a run's take sends the server: its decisions and what changed during the run. */
export type TakeShadowReport = {
  runId: string;
  sceneId: string;
  /** The slot as this take rendered it. */
  slot: DaySlot;
  /** The script's Scenes as the outfit choice read them (their kits so far). */
  outfitScenes: OutfitScene[];
  workingSlots: DaySlot[];
  latestSlots: DaySlot[];
  scriptShot: boolean;
  filmScriptId?: string;
  /** The settings and look the page's take read. */
  settings: RunTakeSettings;
  look: RunTakeLook;
  decisions: TakeDecisions;
};

const isRec = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * A bundle's queue settings from untrusted JSON, or null: the shared and ComfyUI settings as
 * objects, the workflow files that have an id and a graph; the queue params and sampler memory
 * when they are objects.
 */
export function normalizeRunQueueSettings(raw: unknown): ServerQueueSettings | null {
  if (!isRec(raw) || !isRec(raw.shared) || !isRec(raw.comfyUi)) return null;
  const files = Array.isArray(raw.workflowFiles)
    ? raw.workflowFiles.filter(
        file => isRec(file) && typeof file.id === 'string' && typeof file.json === 'string'
      )
    : [];
  return {
    shared: raw.shared as ServerQueueSettings['shared'],
    comfyUi: raw.comfyUi as ServerQueueSettings['comfyUi'],
    workflowFiles: files as unknown as ServerQueueSettings['workflowFiles'],
    ...(isRec(raw.queueParams)
      ? { queueParams: raw.queueParams as NonNullable<ServerQueueSettings['queueParams']> }
      : {}),
    ...(isRec(raw.samplerMemory)
      ? { samplerMemory: raw.samplerMemory as NonNullable<ServerQueueSettings['samplerMemory']> }
      : {}),
  };
}

/** A bundle from untrusted JSON, or null. */
export function normalizeRunBundle(raw: unknown): RunBundle | null {
  if (!isRec(raw) || raw.version !== RUN_BUNDLE_VERSION) return null;
  if (typeof raw.runId !== 'string' || !raw.runId || typeof raw.castId !== 'string') return null;
  if (!isRec(raw.settings) || typeof raw.settings.model !== 'string') return null;
  const gender = raw.settings.clothingGender;
  const queue = normalizeRunQueueSettings(raw.queue);
  const page = normalizeRunBundlePage(raw.page);
  return {
    version: RUN_BUNDLE_VERSION,
    runId: raw.runId,
    castId: raw.castId,
    capturedAt: typeof raw.capturedAt === 'number' ? raw.capturedAt : 0,
    settings: {
      ...(raw.settings as RunBundle['settings']),
      intimateEnabled: raw.settings.intimateEnabled === true,
      allowCompanions: raw.settings.allowCompanions === true,
      bestEnginePerPose: raw.settings.bestEnginePerPose === true,
      clothingGender: gender === 'women' || gender === 'men' ? gender : 'any',
    },
    cast: Array.isArray(raw.cast)
      ? (raw.cast.filter(
          entry => isRec(entry) && typeof entry.id === 'string'
        ) as unknown as CharacterRecord[])
      : [],
    pagePlate: isRec(raw.pagePlate)
      ? {
          hasPlate: raw.pagePlate.hasPlate === true,
          ...(typeof raw.pagePlate.plateSource === 'string'
            ? { plateSource: raw.pagePlate.plateSource }
            : {}),
        }
      : { hasPlate: false },
    scenes: Array.isArray(raw.scenes)
      ? (raw.scenes.filter(
          entry => isRec(entry) && typeof entry.id === 'string' && isRec(entry.slot)
        ) as unknown as RunBundleScene[])
      : [],
    ...(queue ? { queue } : {}),
    ...(page ? { page } : {}),
    metrics: {
      weakLayouts: Array.isArray((raw.metrics as RunBundle['metrics'] | undefined)?.weakLayouts)
        ? (raw.metrics as RunBundle['metrics']).weakLayouts.filter(
            (entry): entry is string => typeof entry === 'string'
          )
        : [],
      ...(isRec((raw.metrics as RunBundle['metrics'] | undefined)?.poseReport)
        ? { poseReport: (raw.metrics as RunBundle['metrics']).poseReport }
        : {}),
    },
  };
}

/**
 * A take's settings and look from the bundle alone: its Scene's own over the page's, its Scene's
 * plate over the page's, its Scene's own clothing photo.
 */
export function takeInputsFromBundle(
  bundle: RunBundle,
  sceneId: string
): { settings: RunTakeSettings; look: RunTakeLook } {
  const run = bundle.settings;
  const scene = bundle.scenes.find(entry => entry.id === sceneId);
  const outfit = scene?.outfit ?? {};
  const scenePlate = Boolean(outfit.plateImageUrl?.trim() || outfit.plateImageFilename?.trim());
  return {
    // A Scene's take reads its Scene's own settings — the page's are the open Scene's working
    // copy, which a Scene never opened has none of (shadow e2e, 2026-11-13). Without its Scene
    // in the bundle, the page's.
    settings: scene
      ? {
          dayMood: scene.dayMood,
          intimateMix: scene.intimateMix,
          allowCompanions: scene.allowCompanions === true,
          partnerCharacterId: scene.partnerCharacterId,
        }
      : {
          dayMood: run.dayMood,
          intimateMix: run.intimateMix,
          allowCompanions: run.allowCompanions,
          partnerCharacterId: run.partnerCharacterId,
        },
    look: {
      lookCharacterId: bundle.castId,
      hasPlate: scenePlate || bundle.pagePlate.hasPlate,
      ...(scenePlate
        ? {}
        : bundle.pagePlate.plateSource
          ? { plateSource: bundle.pagePlate.plateSource }
          : {}),
      ...(run.lockedWardrobeId ? { lockedWardrobeId: run.lockedWardrobeId } : {}),
      customGarment: Boolean(
        outfit.customGarmentImageUrl?.trim() || outfit.customGarmentImageFilename?.trim()
      ),
    },
  };
}

/**
 * A take's decisions made from the bundle and the take's report alone — as the server would
 * make them. `catalog` and `hasPackshot`: the wardrobe catalog for the bundle's gender and its
 * packshot manifest (the server reads both); `inventory`: what ComfyUI has installed.
 */
export function takeDecisionsFromBundle(
  bundle: RunBundle,
  report: Omit<TakeShadowReport, 'decisions'>,
  deps: {
    catalog: ReadonlyArray<DayAutoKitOption>;
    hasPackshot: (wardrobeId: string) => boolean;
    inventory: ComfyUiModelLists | null;
  }
): TakeDecisions {
  const { settings: run } = bundle;
  const { settings: take, look } = takeInputsFromBundle(bundle, report.sceneId);
  const settings = { ...run, ...take };
  const castById = new Map(bundle.cast.map(record => [record.id, record]));
  const lead = castById.get(look.lookCharacterId ?? bundle.castId) ?? castById.get(bundle.castId);
  const outfit = planTakeOutfit({
    target: report.slot,
    lockedWardrobeId: look.lockedWardrobeId,
    catalog: deps.catalog,
    lookHasPlate: look.hasPlate,
    plateSource: look.plateSource,
    customGarment: look.customGarment,
    dayMood: settings.dayMood,
    scene: { scenes: report.outfitScenes, activeSceneId: report.sceneId },
    workingSlots: report.workingSlots,
    latestSlots: report.latestSlots,
    salt: lead?.id,
    hasPackshot: deps.hasPackshot,
  });
  const model = planTakeModel({
    slot: outfit.target,
    pickedModel: settings.model,
    modelCheckpointMap: settings.modelCheckpointMap,
    dayMood: settings.dayMood,
    intimateEnabled: settings.intimateEnabled,
    intimateMix: settings.intimateMix,
    allowCompanions: settings.allowCompanions,
    bestEnginePerPose: settings.bestEnginePerPose,
    hasPlate: look.hasPlate,
    inventory: deps.inventory,
    weakLayouts: () => new Set(bundle.metrics.weakLayouts),
    poseReport: () => bundle.metrics.poseReport,
  });
  const leadNoun = dayPartnerNoun(lead ?? {});
  const partner = planTakePartner({
    slot: outfit.target,
    partnerCharacterId: settings.partnerCharacterId,
    scriptShot: report.scriptShot,
    leadNoun,
    lead,
    getCharacter: id => castById.get(id) ?? null,
    lookHasPlate: look.hasPlate,
    dayMood: settings.dayMood,
    intimateEnabled: settings.intimateEnabled,
    intimateMix: settings.intimateMix,
    allowCompanions: settings.allowCompanions,
    stillModel: model.stillModel,
    filmScriptId: report.filmScriptId,
  });
  const poseGuide = planTakePoseGuide({
    slot: outfit.target,
    stillModel: model.stillModel,
    dayMood: settings.dayMood,
    intimateEnabled: settings.intimateEnabled,
    intimateMix: settings.intimateMix,
    allowCompanions: settings.allowCompanions,
    skippedForIdentity: false,
    wordsOnlyRedo: false,
    partnerNoun: partner.kind === 'none' ? null : partner.candidate.noun,
    leadNoun,
  });
  return {
    ...(outfit.wardrobeId ? { wardrobeId: outfit.wardrobeId } : {}),
    stillModel: model.stillModel,
    queueModel: model.queueModel,
    partner: partner.kind,
    ...(partner.kind === 'cast' ? { partnerId: partner.character.id } : {}),
    poseGuideSkip: poseGuide.skip,
  };
}

/** Where two takes' decisions differ ("stillModel: a ≠ b"); empty when they agree. */
export function takeDecisionDiffs(page: TakeDecisions, server: TakeDecisions): string[] {
  const keys = [
    'wardrobeId',
    'stillModel',
    'queueModel',
    'partner',
    'partnerId',
    'poseGuideSkip',
  ] as const;
  return keys
    .filter(key => (page[key] ?? null) !== (server[key] ?? null))
    .map(key => `${key}: ${String(page[key] ?? '—')} ≠ ${String(server[key] ?? '—')}`);
}

/** Where the page's settings and look for a take differ from the bundle's ("look.hasPlate: …"). */
export function takeInputDiffs(
  page: { settings: RunTakeSettings; look: RunTakeLook },
  bundle: { settings: RunTakeSettings; look: RunTakeLook }
): string[] {
  const out: string[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  for (const key of ['dayMood', 'intimateMix', 'allowCompanions', 'partnerCharacterId'] as const)
    if (!same(page.settings[key], bundle.settings[key]))
      out.push(
        `settings.${key}: ${JSON.stringify(page.settings[key] ?? null)} ≠ ${JSON.stringify(bundle.settings[key] ?? null)}`
      );
  for (const key of [
    'lookCharacterId',
    'hasPlate',
    'plateSource',
    'lockedWardrobeId',
    'customGarment',
  ] as const)
    if (!same(page.look[key], bundle.look[key]))
      out.push(
        `look.${key}: ${JSON.stringify(page.look[key] ?? null)} ≠ ${JSON.stringify(bundle.look[key] ?? null)}`
      );
  return out;
}
