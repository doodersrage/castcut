/**
 * Server-only: run the Day Face finish pass (see face-finish.ts) in ComfyUI and return the
 * finished image as a ComfyUI view ref.
 */

import {
  comfyBaseUrl,
  parseComfyViewRef,
  readComfyImageGraph,
  resolveComfyNode,
  runComfyUtilityGraph,
  stageComfyImageAsInput,
  type ComfyHistoryEntry,
  type ComfyImageRef,
} from '@/lib/comfy-utility-graph-server';
import {
  buildFaceFinishGraph,
  buildLeadFaceProbeGraph,
  FACE_FINISH_SAVE_NODE,
  LEAD_FACE_PROBE_NODES,
  leadFaceDistance,
  pickLeadFace,
  readStillCheckpoint,
  resolveFaceFinisher,
  soleFaceIsLead,
  type FaceFinisher,
  type LeadFaceProbe,
} from '@/lib/face-finish';

export type FaceFinishResult =
  | { available: true; image: ComfyImageRef; finisher: FaceFinisher['kind'] }
  | { available: false; reason: string };

/** Distance and x of the two largest faces in a staged image, against the Cast face crop. */
async function probeLeadFace(
  baseUrl: string,
  stillName: string,
  faceName: string
): Promise<LeadFaceProbe | null> {
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
      timeoutMs: 60_000,
      prompt: buildLeadFaceProbeGraph({ stillName, faceName }),
      read: entry =>
        LEAD_FACE_PROBE_NODES.map(ids => ({
          x: number(entry, ids.x),
          distance: number(entry, ids.distance),
        })),
    });
    return run.result ?? null;
  } catch {
    // No face found, or the probe failed: treated as "cannot tell who is who".
    return null;
  }
}

export async function runFaceFinishInComfy(input: {
  imageUrl: string;
  faceUrl: string;
  comfyUrl?: string;
  seed?: number;
  timeoutMs?: number;
  /** People in the still. Two: only the lead's face is finished, and only kept when closer. */
  people?: number;
}): Promise<FaceFinishResult> {
  const stillRef = parseComfyViewRef(input.imageUrl);
  const faceRef = parseComfyViewRef(input.faceUrl);
  if (!stillRef || !faceRef) {
    return { available: false, reason: 'Still or face crop is not a ComfyUI image.' };
  }
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const [detailer, detector, unetNode, loraNode, clipNode, vaeNode] = await Promise.all([
    resolveComfyNode(baseUrl, ['FaceDetailer']),
    resolveComfyNode(baseUrl, ['UltralyticsDetectorProvider']),
    resolveComfyNode(baseUrl, ['UNETLoader']),
    resolveComfyNode(baseUrl, ['LoraLoaderModelOnly']),
    resolveComfyNode(baseUrl, ['CLIPLoader']),
    resolveComfyNode(baseUrl, ['VAELoader']),
  ]);
  if (!detailer || !detector) {
    return { available: false, reason: 'Face finish needs ComfyUI Impact Pack + Subpack.' };
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
      available: false,
      reason:
        'Face finish needs Qwen Edit 2511 + its Lightning LoRA or FLUX.2 Klein 9B Distilled in ComfyUI.',
    };
  }
  const [stillName, faceName] = await Promise.all([
    stageComfyImageAsInput(baseUrl, stillRef, 'face-finish'),
    stageComfyImageAsInput(baseUrl, faceRef, 'face-finish-ref'),
  ]);
  // Two people: find which face is hers, finish only that one, and keep it only if it is closer.
  const duo = (input.people ?? 1) >= 2;
  let lead: ReturnType<typeof pickLeadFace> = null;
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
    const probe = await probeLeadFace(baseUrl, stillName, faceName);
    lead = probe ? pickLeadFace(probe) : null;
    // One visible face that is plausibly hers: still the one-face pass (the largest detected
    // face), never the all-faces detailer — its own detector may find a partner this probe
    // missed, and would give them her face.
    if (!lead && probe && soleFaceIsLead(probe)) {
      lead = { side: 'largest', distance: probe[0]?.distance ?? 100 };
    }
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
  if (lead) {
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
    const closest = (after ? leadFaceDistance(after, lead.side) : null) ?? 100;
    if (!(closest < lead.distance)) {
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
