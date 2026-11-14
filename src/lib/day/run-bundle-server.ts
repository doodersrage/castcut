/**
 * The server's side of a run's bundle (FINISHING_PLAN Phase 3, step 2; run-bundle.ts): a take's
 * decisions made again from the bundle alone, with the catalog, packshots and installed models
 * the server reads itself, and the difference from the page's recorded. Shadow mode: nothing is
 * rendered from it yet.
 */
import { fetchComfyObjectInfoPayload } from '@/lib/comfyui/object-info';
import { readRunBundle, recordRunShadow } from '@/lib/sqlite/scene-run-bundles';
import { getClothingSelectOptions } from '@/lib/wardrobe/clothing-catalog';
import { getClothingCatalogFieldCategories } from '@/lib/wardrobe/clothing-catalog-fields';
import {
  loadWardrobeGarmentThumbManifest,
  resolveWardrobeGarmentThumbQueueUrl,
} from '@/lib/wardrobe/garment-thumbs';
import {
  normalizeRunBundle,
  takeDecisionDiffs,
  takeInputDiffs,
  takeInputsFromBundle,
  takeDecisionsFromBundle,
  type TakeDecisions,
  type TakeShadowReport,
} from './run-bundle';
import { takeModelNeedsInventory } from './take-plan';

export type TakeShadowResult =
  { ok: true; diffs: string[]; server: TakeDecisions } | { ok: false; error: string };

export async function shadowTakeDecisions(
  scope: string,
  report: TakeShadowReport,
  now = Date.now()
): Promise<TakeShadowResult> {
  const bundle = normalizeRunBundle(readRunBundle(scope, report.runId));
  if (!bundle) return { ok: false, error: 'No bundle for that run.' };
  await loadWardrobeGarmentThumbManifest().catch(() => null);
  const catalog = getClothingSelectOptions(getClothingCatalogFieldCategories('wardrobeCatalog'), {
    gender: bundle.settings.clothingGender,
  });
  const derived = takeInputsFromBundle(bundle, report.sceneId);
  // Installed models asked only when the page would have asked too (takeModelNeedsInventory).
  const needs = takeModelNeedsInventory({
    slot: report.slot,
    pickedModel: bundle.settings.model,
    modelCheckpointMap: bundle.settings.modelCheckpointMap,
    dayMood: derived.settings.dayMood,
    intimateEnabled: bundle.settings.intimateEnabled,
    intimateMix: derived.settings.intimateMix,
    allowCompanions: derived.settings.allowCompanions,
    bestEnginePerPose: bundle.settings.bestEnginePerPose,
    hasPlate: derived.look.hasPlate,
  });
  const inventory = needs
    ? ((await fetchComfyObjectInfoPayload().catch(() => null))?.models ?? null)
    : null;
  const server = takeDecisionsFromBundle(bundle, report, {
    catalog,
    hasPackshot: id => Boolean(resolveWardrobeGarmentThumbQueueUrl(id)),
    inventory,
  });
  // The bundle's settings and look against the page's, then the decisions made from them.
  const diffs = [
    ...takeInputDiffs({ settings: report.settings, look: report.look }, derived),
    ...takeDecisionDiffs(report.decisions, server),
  ];
  recordRunShadow(scope, {
    runId: report.runId,
    sceneId: report.sceneId,
    at: now,
    diffs,
    page: report.decisions,
    server,
  });
  if (diffs.length)
    console.warn(`[run-shadow] ${report.runId} ${report.sceneId}: ${diffs.join('; ')}`);
  return { ok: true, diffs, server };
}
