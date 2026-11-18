/**
 * Server-only: run the Day Face finish pass (see face-finish.ts) in ComfyUI and return the
 * finished image as a ComfyUI view ref.
 */

import {
  castcutCanAnalyze,
  castcutFaceProbe,
  castcutRoutes,
  recordCastcutFallback,
} from '@/lib/castcut/routes-server';
import {
  comfyBaseUrl,
  parseComfyViewRef,
  readComfyImageGraph,
  resolveComfyNode,
  runComfyUtilityGraph,
  stageComfyImageAsInput,
  type ComfyHistoryEntry,
  type ComfyImageRef,
} from '@/lib/comfyui/comfy-utility-graph-server';
import {
  buildFaceFinishGraph,
  buildLeadFaceProbeGraph,
  FACE_FINISH_SAVE_NODE,
  LEAD_FACE_PROBE_NODES,
  decideFaceFinish,
  decidePartnerFinish,
  faceFinishKeeps,
  PARTNER_FINISH_DENOISE,
  partnerFinishKeeps,
  FACE_FINISH_SKIP_DISTANCE,
  leadFaceDistance,
  readStillCheckpoint,
  resolveFaceFinisher,
  type FaceFinisher,
  type FaceFinishProbeDecision,
  type LeadFaceProbe,
  type LeadFaceSide,
} from '@/lib/face/finish';
import { normalizeModelKey } from '@/lib/comfyui/comfy-model-batch';
import { faceSimilarityFromDistance } from '@/lib/face/match';

export type FaceFinishResult =
  | { available: true; image: ComfyImageRef; finisher: FaceFinisher['kind'] }
  | { available: false; reason: string };

/** The probe could not read a face in the Cast face crop itself (FaceEmbedDistance says so). */
const NO_REFERENCE_FACE = 'no-reference-face' as const;

/** A staged input name ("sub/name.png" or "name.png") as a ComfyUI ref. */
function inputRef(name: string): ComfyImageRef {
  const slash = name.lastIndexOf('/');
  return {
    filename: slash >= 0 ? name.slice(slash + 1) : name,
    subfolder: slash >= 0 ? name.slice(0, slash) : '',
    type: 'input',
  };
}

/**
 * Distance and x of the two largest faces in a staged image, against the Cast face crop. Null
 * when no face was read; `no-reference-face` when the crop itself shows no face.
 */
async function probeLeadFace(
  baseUrl: string,
  stillName: string,
  faceName: string
): Promise<LeadFaceProbe | null | typeof NO_REFERENCE_FACE> {
  // The Castcut pack answers the same probe without waiting for the render in progress.
  if (castcutCanAnalyze(await castcutRoutes(baseUrl), 'face-probe')) {
    try {
      const faces = await castcutFaceProbe(baseUrl, {
        image: inputRef(stillName),
        reference: inputRef(faceName),
        paddingPercent: 0.3,
        count: LEAD_FACE_PROBE_NODES.length,
      });
      if (faces === null) return NO_REFERENCE_FACE;
      return faces.length ? faces.map(face => ({ x: face.x, distance: face.distance })) : null;
    } catch (error) {
      console.warn('Castcut face probe failed; queueing the probe graph instead:', error);
      recordCastcutFallback('face-probe');
    }
  }
  const number = (entry: ComfyHistoryEntry, node: string): number | null => {
    const raw = (entry.outputs?.[node] as { text?: unknown[] } | undefined)?.text?.[0];
    try {
      const value = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
      const first = Array.isArray(value) ? value[0] : value;
      return typeof first === 'number' && Number.isFinite(first) ? first : null;
    } catch {
      return null;
    }
  };
  try {
    const run = await runComfyUtilityGraph({
      baseUrl,
      label: 'face-finish-probe',
      priority: 'check',
      timeoutMs: 60_000,
      prompt: buildLeadFaceProbeGraph({ stillName, faceName }),
      read: entry =>
        LEAD_FACE_PROBE_NODES.map(ids => ({
          x: number(entry, ids.x),
          distance: number(entry, ids.distance),
        })),
    });
    return run.result ?? null;
  } catch (error) {
    // The crop shows no face (a crop of hair off a lying plate): the pass would be conditioned
    // on no face at all.
    if (error instanceof Error && /no face detected in reference/i.test(error.message)) {
      return NO_REFERENCE_FACE;
    }
    // No face found, or the probe failed: treated as "cannot tell who is who".
    return null;
  }
}

/** The finisher a still would get (installed packs + the still's own checkpoint). */
async function resolveFinisherForStill(
  baseUrl: string,
  stillRef: ComfyImageRef
): Promise<{ finisher: FaceFinisher } | { reason: string }> {
  const [detailer, detector, unetNode, loraNode, clipNode, vaeNode] = await Promise.all([
    resolveComfyNode(baseUrl, ['FaceDetailer']),
    resolveComfyNode(baseUrl, ['UltralyticsDetectorProvider']),
    resolveComfyNode(baseUrl, ['UNETLoader']),
    resolveComfyNode(baseUrl, ['LoraLoaderModelOnly']),
    resolveComfyNode(baseUrl, ['CLIPLoader']),
    resolveComfyNode(baseUrl, ['VAELoader']),
  ]);
  if (!detailer || !detector) {
    return { reason: 'Face finish needs ComfyUI Impact Pack + Subpack.' };
  }
  const options = (node: typeof unetNode, input: string): string[] => {
    const spec = node?.info.input?.required?.[input]?.[0];
    return Array.isArray(spec)
      ? spec.filter((name): name is string => typeof name === 'string')
      : [];
  };
  const finisher = resolveFaceFinisher(
    {
      unets: options(unetNode, 'unet_name'),
      loras: options(loraNode, 'lora_name'),
      clips: options(clipNode, 'clip_name'),
      vaes: options(vaeNode, 'vae_name'),
    },
    readStillCheckpoint(await readComfyImageGraph(baseUrl, stillRef))
  );
  if (!finisher) {
    return {
      reason:
        'Face finish needs Qwen Edit 2511 + its Lightning LoRA or FLUX.2 Klein 9B Distilled in ComfyUI.',
    };
  }
  return { finisher };
}

/** The FaceAnalysis nodes the lead-face probe needs. */
async function probeNodesInstalled(baseUrl: string): Promise<boolean> {
  const nodes = await Promise.all(
    ['FaceBoundingBox', 'FaceEmbedDistance', 'FaceAnalysisModels'].map(name =>
      resolveComfyNode(baseUrl, [name])
    )
  );
  return nodes.every(Boolean);
}

/**
 * Which finisher (and main model) a still would get, without running the pass — Day holds the
 * pass back while the app's stills on another model still wait (comfy-model-batch.ts). Given the
 * Cast face crop it also probes the faces first (a check-priority job, a few seconds) and says
 * whether the pass is worth running at all (decideFaceFinish).
 */
export async function planFaceFinishInComfy(input: {
  imageUrl: string;
  comfyUrl?: string;
  faceUrl?: string;
  people?: number;
}): Promise<
  | {
      available: true;
      finisher: FaceFinisher['kind'];
      modelKey: string | null;
      /** The lead-face probe (null: no face read); absent when no probe ran. */
      probe?: LeadFaceProbe | null;
      decision?: FaceFinishProbeDecision;
    }
  | { available: false; reason: string }
> {
  const stillRef = parseComfyViewRef(input.imageUrl);
  if (!stillRef) return { available: false, reason: 'Still is not a ComfyUI image.' };
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const resolved = await resolveFinisherForStill(baseUrl, stillRef);
  if ('reason' in resolved) return { available: false, reason: resolved.reason };
  const { finisher } = resolved;
  const modelKey =
    normalizeModelKey('unet' in finisher ? finisher.unet : finisher.checkpoint) || null;
  const faceRef = input.faceUrl ? parseComfyViewRef(input.faceUrl) : null;
  if (!faceRef || !(await probeNodesInstalled(baseUrl))) {
    return { available: true, finisher: finisher.kind, modelKey };
  }
  const [stillName, faceName] = await Promise.all([
    stageComfyImageAsInput(baseUrl, stillRef, 'face-finish'),
    stageComfyImageAsInput(baseUrl, faceRef, 'face-finish-ref'),
  ]);
  const probed = await probeLeadFace(baseUrl, stillName, faceName);
  const probe = probed === NO_REFERENCE_FACE ? null : probed;
  return {
    available: true,
    finisher: finisher.kind,
    modelKey,
    probe,
    decision: decideFaceFinish({
      probe,
      people: input.people ?? 1,
      skipWithin: FACE_FINISH_SKIP_DISTANCE,
      referenceHasFace: probed !== NO_REFERENCE_FACE,
    }),
  };
}

export async function runFaceFinishInComfy(input: {
  imageUrl: string;
  faceUrl: string;
  comfyUrl?: string;
  seed?: number;
  timeoutMs?: number;
  /** People in the still. Two: only the lead's face is finished, and only kept when closer. */
  people?: number;
  /** The lead-face probe the plan already took on this still (two people: not probed again). */
  probe?: LeadFaceProbe | null;
}): Promise<FaceFinishResult> {
  const stillRef = parseComfyViewRef(input.imageUrl);
  const faceRef = parseComfyViewRef(input.faceUrl);
  if (!stillRef || !faceRef) {
    return { available: false, reason: 'Still or face crop is not a ComfyUI image.' };
  }
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const resolved = await resolveFinisherForStill(baseUrl, stillRef);
  if ('reason' in resolved) {
    return { available: false, reason: resolved.reason };
  }
  const { finisher } = resolved;
  const [stillName, faceName] = await Promise.all([
    stageComfyImageAsInput(baseUrl, stillRef, 'face-finish'),
    stageComfyImageAsInput(baseUrl, faceRef, 'face-finish-ref'),
  ]);
  // Two people: find which face is hers, finish only that one, and keep it only if it is closer.
  const duo = (input.people ?? 1) >= 2;
  let lead: { side: LeadFaceSide; distance: number } | null = null;
  if (duo) {
    const nodes = await Promise.all(
      [
        'FaceBoundingBox',
        'FaceEmbedDistance',
        'FaceAnalysisModels',
        'BboxDetectorSEGS',
        'ImpactSEGSOrderedFilter',
        'DetailerForEach',
      ].map(name => resolveComfyNode(baseUrl, [name]))
    );
    if (nodes.some(node => !node)) {
      return {
        available: false,
        reason:
          'Face finish on a two-person still needs the ComfyUI FaceAnalysis nodes and Impact Pack.',
      };
    }
    // The plan's probe when Day sent it — the same still is not probed twice.
    const probed =
      input.probe !== undefined ? input.probe : await probeLeadFace(baseUrl, stillName, faceName);
    const probe = probed === NO_REFERENCE_FACE ? null : probed;
    // One visible face that is plausibly hers: still the one-face pass (the largest detected
    // face), never the all-faces detailer — its own detector may find a partner this probe
    // missed, and would give them her face. Never skipped for closeness here (the plan does).
    const decision = decideFaceFinish({ probe, people: 2, skipWithin: -1 });
    lead = decision.finish ? decision.lead : null;
    if (!lead) {
      return {
        available: false,
        reason: 'could not tell which face is the lead — the still is unchanged.',
      };
    }
  }
  const run = await runComfyUtilityGraph({
    baseUrl,
    label: 'face-finish',
    timeoutMs: input.timeoutMs ?? 240_000,
    prompt: buildFaceFinishGraph({
      stillName,
      faceName,
      finisher,
      seed: input.seed,
      ...(lead ? { onlyFace: lead.side } : {}),
    }),
    read: entry => {
      const image = (
        entry.outputs?.[FACE_FINISH_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined
      )?.images?.[0];
      return image?.filename ? image : undefined;
    },
  });
  if (!run.result) {
    return { available: false, reason: 'Face finish produced no image.' };
  }
  // Her face's distance before the pass: the lead's on two people; on one person the plan's probe
  // (one person was always finished blind before — 18 of 61 of the user's solo passes came out
  // further from her face, 7 of 10 that started under 0.35).
  const before = lead
    ? lead.distance
    : input.probe
      ? decideFaceFinish({ probe: input.probe, people: 1, skipWithin: -1 }).distance
      : null;
  if (before !== null) {
    const finished: ComfyImageRef = {
      filename: run.result.filename,
      subfolder: run.result.subfolder ?? '',
      type: run.result.type ?? 'output',
    };
    const after = await probeLeadFace(
      baseUrl,
      await stageComfyImageAsInput(baseUrl, finished, 'face-finish-check'),
      faceName
    );
    const closest =
      after && after !== NO_REFERENCE_FACE
        ? leadFaceDistance(after, lead?.side ?? 'largest')
        : null;
    if (!faceFinishKeeps(before, closest)) {
      return {
        available: false,
        reason: 'the pass did not bring her face closer — the original still is kept.',
      };
    }
  }
  return {
    available: true,
    image: {
      filename: run.result.filename,
      subfolder: run.result.subfolder ?? '',
      type: run.result.type ?? 'output',
    },
    finisher: finisher.kind,
  };
}

export type PartnerFaceFinishResult =
  | { finished: true; image: ComfyImageRef; before: number; after: number }
  | { finished: false; reason: string; before?: number };

/**
 * The partner's face on a two-person still, finished like the lead's (buildFaceFinishGraph with
 * `partner`): the two largest faces probed against both crops, the partner's re-rendered against
 * their crop, the result kept only when they came out closer and she no further. The partner sent
 * as Image 2 alone came out another person on every s24 final (finish.ts decidePartnerFinish).
 */
export async function runPartnerFaceFinishInComfy(input: {
  imageUrl: string;
  /** The lead's face (her plate or face crop): which face is hers. */
  leadFaceUrl: string;
  /** The partner's face crop the take was sent. */
  partnerFaceUrl: string;
  noun: 'man' | 'woman';
  comfyUrl?: string;
  seed?: number;
  timeoutMs?: number;
}): Promise<PartnerFaceFinishResult> {
  const stillRef = parseComfyViewRef(input.imageUrl);
  const leadRef = parseComfyViewRef(input.leadFaceUrl);
  const partnerRef = parseComfyViewRef(input.partnerFaceUrl);
  if (!stillRef || !leadRef || !partnerRef) {
    return { finished: false, reason: 'a picture is not a ComfyUI image' };
  }
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const resolved = await resolveFinisherForStill(baseUrl, stillRef);
  if ('reason' in resolved) return { finished: false, reason: resolved.reason };
  const [stillName, leadName, partnerName] = await Promise.all([
    stageComfyImageAsInput(baseUrl, stillRef, 'partner-finish'),
    stageComfyImageAsInput(baseUrl, leadRef, 'face-finish-ref'),
    stageComfyImageAsInput(baseUrl, partnerRef, 'partner-finish-ref'),
  ]);
  const probe = async (still: string, face: string) => {
    const read = await probeLeadFace(baseUrl, still, face);
    return read === NO_REFERENCE_FACE ? null : read;
  };
  const decision = decidePartnerFinish({
    lead: await probe(stillName, leadName),
    partner: await probe(stillName, partnerName),
  });
  if (!decision.finish) {
    return {
      finished: false,
      reason:
        decision.reason === 'close'
          ? 'the partner is already close to their face'
          : decision.reason === 'twinned'
            ? 'both faces read as the lead'
            : 'one face in the still',
      ...(decision.before !== undefined ? { before: decision.before } : {}),
    };
  }
  const run = await runComfyUtilityGraph({
    baseUrl,
    label: 'partner-face-finish',
    timeoutMs: input.timeoutMs ?? 240_000,
    prompt: buildFaceFinishGraph({
      stillName,
      faceName: partnerName,
      finisher: resolved.finisher,
      seed: input.seed,
      onlyFace: decision.side,
      partner: { noun: input.noun, denoise: PARTNER_FINISH_DENOISE },
    }),
    read: entry => {
      const image = (
        entry.outputs?.[FACE_FINISH_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined
      )?.images?.[0];
      return image?.filename ? image : undefined;
    },
  });
  if (!run.result)
    return { finished: false, reason: 'the pass made no image', before: decision.before };
  const image: ComfyImageRef = {
    filename: run.result.filename,
    subfolder: run.result.subfolder ?? '',
    type: run.result.type ?? 'output',
  };
  const finishedName = await stageComfyImageAsInput(baseUrl, image, 'partner-finish-check');
  const kept = partnerFinishKeeps({
    decision,
    lead: await probe(finishedName, leadName),
    partner: await probe(finishedName, partnerName),
  });
  if (!kept.keep || kept.after === null) {
    return {
      finished: false,
      reason: 'the pass did not bring the partner closer',
      before: decision.before,
    };
  }
  return { finished: true, image, before: decision.before, after: kept.after };
}

/**
 * Her face in a still of two (FINISHING_PLAN, the flagship's hardware store, 2026-11-18: the
 * scene's master drew someone else in her place, and every shot cut from it showed her). The
 * face on her side, against her Cast face: its similarity, or null when it can't be read (one
 * face, no face, no probe) — no reading is no verdict.
 */
export async function measureLeadFaceInComfy(input: {
  imageUrl: string;
  referenceUrl: string;
  side: Exclude<LeadFaceSide, 'largest'>;
  comfyUrl?: string;
}): Promise<{ similarity: number; distance: number } | null> {
  const stillRef = parseComfyViewRef(input.imageUrl);
  const faceRef = parseComfyViewRef(input.referenceUrl);
  if (!stillRef || !faceRef) return null;
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const [stillName, faceName] = await Promise.all([
    stageComfyImageAsInput(baseUrl, stillRef, 'lead-face-check'),
    stageComfyImageAsInput(baseUrl, faceRef, 'lead-face-check-ref'),
  ]);
  const probe = await probeLeadFace(baseUrl, stillName, faceName);
  if (!probe || probe === NO_REFERENCE_FACE) return null;
  // Two faces seen: hers is the one on her side. One: the other person faces away — no verdict.
  const seen = probe.filter(
    face => typeof face.x === 'number' && typeof face.distance === 'number'
  );
  if (new Set(seen.map(face => face.x)).size < 2) return null;
  const distance = leadFaceDistance(probe, input.side);
  if (distance === null) return null;
  return { similarity: faceSimilarityFromDistance(distance, 'cosine'), distance };
}
