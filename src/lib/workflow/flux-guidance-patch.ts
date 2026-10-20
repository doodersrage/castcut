import type { WorkflowParamValues } from '../comfyui/config';
import { isFlux1FamilyModel } from '../model-denoise-defaults';

export const FLUX_GUIDANCE_NODE_TYPE = 'FluxGuidance';

/** Official FLUX.1-dev example uses guidance 3.5 with KSampler cfg 1. */
export const DEFAULT_FLUX1_GUIDANCE = 3.5;

/** UltraReal / Civitai author “CFG Scale: 3” is FluxGuidance, not KSampler.cfg.
 * 2.5 cuts glossy plastic overbake while staying near the author tip. */
export const DEFAULT_FLUX_ULTRAREAL_GUIDANCE = 2.5;

type WorkflowNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
};

function isSamplerLikeNode(classType: string, inputs: Record<string, unknown>): boolean {
  const lower = classType.toLowerCase();
  if (lower.includes('ksampler') || lower.includes('samplercustom') || lower.includes('guider')) {
    return true;
  }
  return 'seed' in inputs && ('steps' in inputs || 'cfg' in inputs);
}

function nextNodeId(workflow: Record<string, unknown>): string {
  let max = 0;
  for (const key of Object.keys(workflow)) {
    if (/^\d+$/.test(key)) {
      max = Math.max(max, Number(key));
    }
  }
  return String(max + 1);
}

function linkId(value: unknown): string | null {
  if (!Array.isArray(value) || value.length < 1) {
    return null;
  }
  const id = value[0];
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}

export function resolveFlux1GuidanceValue(
  model?: string,
  params?: Pick<WorkflowParamValues, 'cfg'>
): number {
  if (params?.cfg != null && params.cfg.toString().trim() !== '') {
    const n = Number(params.cfg);
    if (Number.isFinite(n) && n > 0) {
      return n;
    }
  }
  if (String(model ?? '').trim() === 'flux-ultrareal-v4') {
    return DEFAULT_FLUX_ULTRAREAL_GUIDANCE;
  }
  return DEFAULT_FLUX1_GUIDANCE;
}

/**
 * FLUX.1 guidance-distilled models need FluxGuidance on the positive conditioning
 * and KSampler.cfg = 1. Putting “CFG 3–3.5” on KSampler alone fries/plasticizes
 * decode (oversaturated, soft, CGI skin).
 */
export function ensureFluxGuidanceInWorkflow(
  workflow: Record<string, unknown>,
  model?: string,
  params?: Pick<WorkflowParamValues, 'cfg'>
): {
  workflow: Record<string, unknown>;
  inserted: number;
  guidancePatched: number;
  samplerCfgForced: number;
} {
  if (!isFlux1FamilyModel(model)) {
    return {
      workflow,
      inserted: 0,
      guidancePatched: 0,
      samplerCfgForced: 0,
    };
  }

  const next = structuredClone(workflow) as Record<string, WorkflowNode>;
  const guidance = resolveFlux1GuidanceValue(model, params);
  let guidancePatched = 0;
  let inserted = 0;

  const existingGuidanceIds: string[] = [];
  for (const [id, node] of Object.entries(next)) {
    if (node?.class_type === FLUX_GUIDANCE_NODE_TYPE) {
      existingGuidanceIds.push(id);
      if (!node.inputs) {
        node.inputs = {};
      }
      node.inputs.guidance = guidance;
      guidancePatched += 1;
    }
  }

  if (existingGuidanceIds.length === 0) {
    const rewireTargets: Array<{
      nodeId: string;
      field: 'positive' | 'conditioning';
      sourceId: string;
      sourceSlot: number;
    }> = [];

    for (const [nodeId, node] of Object.entries(next)) {
      if (!node?.inputs) {
        continue;
      }
      const classType = node.class_type ?? '';

      if (classType === 'InpaintModelConditioning' || classType === 'ReferenceLatent') {
        const sourceId = linkId(node.inputs.positive);
        if (!sourceId) {
          continue;
        }
        const source = next[sourceId];
        if (
          source?.class_type === 'CLIPTextEncode' ||
          source?.class_type === 'CLIPTextEncodeFlux'
        ) {
          const slot =
            Array.isArray(node.inputs.positive) && typeof node.inputs.positive[1] === 'number'
              ? node.inputs.positive[1]
              : 0;
          rewireTargets.push({
            nodeId,
            field: 'positive',
            sourceId,
            sourceSlot: slot,
          });
        }
        continue;
      }

      if (!isSamplerLikeNode(classType, node.inputs)) {
        continue;
      }
      const sourceId = linkId(node.inputs.positive);
      if (!sourceId) {
        continue;
      }
      const source = next[sourceId];
      const sourceType = source?.class_type ?? '';
      if (sourceType === FLUX_GUIDANCE_NODE_TYPE) {
        continue;
      }
      if (
        sourceType === 'CLIPTextEncode' ||
        sourceType === 'CLIPTextEncodeFlux' ||
        sourceType === 'InpaintModelConditioning'
      ) {
        // For InpaintModelConditioning, guidance should sit before inpaint when possible;
        // if sampler already consumes inpaint outputs, leave that chain alone unless
        // the positive encode itself lacked guidance (handled via InpaintModelConditioning above).
        if (sourceType === 'InpaintModelConditioning') {
          continue;
        }
        const slot =
          Array.isArray(node.inputs.positive) && typeof node.inputs.positive[1] === 'number'
            ? node.inputs.positive[1]
            : 0;
        rewireTargets.push({
          nodeId,
          field: 'positive',
          sourceId,
          sourceSlot: slot,
        });
      }
    }

    // One FluxGuidance per unique encode source.
    const guidanceBySource = new Map<string, string>();
    for (const target of rewireTargets) {
      const key = `${target.sourceId}:${target.sourceSlot}`;
      let guidanceId = guidanceBySource.get(key);
      if (!guidanceId) {
        guidanceId = nextNodeId(next);
        next[guidanceId] = {
          class_type: FLUX_GUIDANCE_NODE_TYPE,
          inputs: {
            conditioning: [target.sourceId, target.sourceSlot],
            guidance,
          },
          _meta: { title: 'FluxGuidance' },
        };
        guidanceBySource.set(key, guidanceId);
        inserted += 1;
        guidancePatched += 1;
      }
      const node = next[target.nodeId];
      if (node?.inputs) {
        node.inputs[target.field] = [guidanceId, 0];
      }
    }
  }

  let samplerCfgForced = 0;
  for (const node of Object.values(next)) {
    if (!node?.inputs) {
      continue;
    }
    if (!isSamplerLikeNode(node.class_type ?? '', node.inputs)) {
      continue;
    }
    if (!('cfg' in node.inputs)) {
      continue;
    }
    if (node.inputs.cfg !== 1) {
      node.inputs.cfg = 1;
      samplerCfgForced += 1;
    }
  }

  return {
    workflow: next as Record<string, unknown>,
    inserted,
    guidancePatched,
    samplerCfgForced,
  };
}
