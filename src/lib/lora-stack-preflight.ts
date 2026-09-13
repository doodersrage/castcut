import { resolveSharedEffectiveSessionLoraIds } from './comfyui-settings';
import { resolveActiveLoraStack, type LoraLibraryEntry } from './lora-stack';
import { isKleinBaseModel } from './model-sampler-defaults';
import { isFluxFineTuneCheckpointModel } from './model-checkpoint-map';
import { hasSessionLoraIdsForModel, resolveModelDefaultLoraIds } from './model-lora-map';
import { loadSettingsCache } from './settings-cache';
import type { WorkflowPreflightIssue } from './workflow-preflight';
import { loraNameIsLightningSlot } from './workflow-lora-patch';
import { loraFilenameLooksLikeUltraRealAmplifier } from './ultrareal-amplifier-lora';
import { loraFilenameLooksLikeKleinRealisticDetail } from './klein-realistic-detail-lora';

type WorkflowNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
};

export type ActiveWorkflowLoraNode = {
  nodeId: string;
  classType: string;
  filename: string;
  strengthModel: number;
};

function parseWorkflowJson(workflowJson: string | undefined): Record<string, WorkflowNode> | null {
  if (!workflowJson?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(workflowJson) as Record<string, WorkflowNode>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function isLoraLoaderClass(classType: string | undefined): boolean {
  const base = (classType ?? '').split('|')[0]?.trim() ?? '';
  return base === 'LoraLoader' || base === 'LoraLoaderModelOnly';
}

function loraStrengthActive(value: unknown): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return true;
  }
  return value > 0;
}

/** Active (strength > 0) non-Lightning LoRA loader nodes in a prepared workflow graph. */
export function collectActiveLoraNodesInWorkflow(
  workflowJson: string | undefined
): ActiveWorkflowLoraNode[] {
  const workflow = parseWorkflowJson(workflowJson);
  if (!workflow) {
    return [];
  }

  const nodes: ActiveWorkflowLoraNode[] = [];
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node?.inputs || !isLoraLoaderClass(node.class_type)) {
      continue;
    }
    const filename = String(node.inputs.lora_name ?? '').trim();
    if (!filename || loraNameIsLightningSlot(filename, {})) {
      continue;
    }
    const strengthModel = Number(node.inputs.strength_model ?? 1);
    if (!loraStrengthActive(strengthModel)) {
      continue;
    }
    nodes.push({
      nodeId,
      classType: node.class_type ?? 'LoraLoader',
      filename,
      strengthModel: Number.isFinite(strengthModel) ? strengthModel : 1,
    });
  }
  return nodes;
}

function hasSessionOverride(
  model: string,
  shared: ReturnType<typeof loadSettingsCache>['shared']
): boolean {
  return hasSessionLoraIdsForModel(shared.sessionActiveLoraIdsByModel, model);
}

export function auditLoraStackAtQueueTime(input: {
  model?: string;
  workflowJson?: string;
  loraLibrary?: LoraLibraryEntry[];
}): WorkflowPreflightIssue[] {
  const model = input.model?.trim();
  if (!model) {
    return [];
  }

  const shared = loadSettingsCache().shared;
  const library = input.loraLibrary ?? [];
  const sessionIds = resolveSharedEffectiveSessionLoraIds(model);
  // runtime.loraLibrary is already session-filtered at queue resolve time.
  const expectedStack = resolveActiveLoraStack(library);
  const activeNodes = collectActiveLoraNodesInWorkflow(input.workflowJson);
  const issues: WorkflowPreflightIssue[] = [];

  if (expectedStack.length === 0) {
    const mapped = resolveModelDefaultLoraIds(model, shared.modelLoraMap);
    const hasMappedDefaults = Boolean(mapped && mapped.length > 0);
    const sessionExplicitEmpty = sessionIds !== undefined && sessionIds.length === 0;
    const hasMappedButOverridden =
      hasMappedDefaults && sessionExplicitEmpty && hasSessionOverride(model, shared);

    if (hasMappedButOverridden) {
      issues.push({
        severity: 'warn',
        message:
          'Model LoRA map assigns LoRAs for this model, but the sidebar stack is explicitly empty — clear the empty session override or re-check LoRAs in Advanced → LoRA stack.',
      });
    } else if (hasMappedDefaults || (sessionIds?.length ?? 0) > 0) {
      issues.push({
        severity: 'warn',
        message:
          'LoRAs are selected for this model but none are active — check Settings → LoRA library filenames and enabled strengths.',
      });
    } else if (isKleinBaseModel(model)) {
      issues.push({
        severity: 'warn',
        message:
          'Klein Base realism is tuned (Detail ~0.7 + Ultra Real v4 ~0.8, CFG ~4, plastic negatives) but scenic photoreal plateaus — switch to UltraReal Fine-Tune v4 for people/scene photos.',
      });
    } else if (isFluxFineTuneCheckpointModel(model)) {
      issues.push({
        severity: 'warn',
        message:
          'UltraReal Fine-Tune works best with Danrisi Realism Amplifier LoRA (~0.55, trigger d1g1cam) — install it under models/loras/, keep UltraRealPhoto off, then re-queue (Castcut auto-maps Realistic Amplifier for UltraReal Fine-Tune.safetensors when present).',
      });
    }
    return issues;
  }

  if (
    isFluxFineTuneCheckpointModel(model) &&
    !expectedStack.some(entry => loraFilenameLooksLikeUltraRealAmplifier(entry.filename))
  ) {
    issues.push({
      severity: 'warn',
      message:
        'UltraReal queue LoRA stack is missing Realism Amplifier — enable ultrareal-amplifier (or Realistic Amplifier for UltraReal Fine-Tune.safetensors) for less plastic skin.',
    });
  }

  if (
    isKleinBaseModel(model) &&
    !expectedStack.some(entry => loraFilenameLooksLikeKleinRealisticDetail(entry.filename))
  ) {
    issues.push({
      severity: 'warn',
      message:
        'Klein Base queue LoRA stack is missing Realistic Detail — enable klein-realistic-detail (or Flux2 Klein 9B Realistic Detail LoRA.safetensors) for less plastic skin.',
    });
  }

  if (activeNodes.length === 0) {
    issues.push({
      severity: 'warn',
      message: `LoRA stack lists ${expectedStack.length} active entr${expectedStack.length === 1 ? 'y' : 'ies'} (${expectedStack.map(entry => entry.label).join(', ')}) but the prepared workflow has no active LoRA loaders — check Direct workflow patching is on and re-run workflow preview.`,
    });
    return issues;
  }

  const expectedFilenames = new Set(expectedStack.map(entry => entry.filename.toLowerCase()));
  const unmatched = activeNodes.filter(node => !expectedFilenames.has(node.filename.toLowerCase()));
  if (unmatched.length > 0 && activeNodes.length < expectedStack.length) {
    issues.push({
      severity: 'warn',
      message: `Only ${activeNodes.length}/${expectedStack.length} queued LoRA(s) appear active in the workflow graph — missing: ${expectedStack
        .filter(
          entry =>
            !activeNodes.some(node => node.filename.toLowerCase() === entry.filename.toLowerCase())
        )
        .map(entry => entry.label)
        .join(', ')}.`,
    });
  }

  return issues;
}
