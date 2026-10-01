import type { WorkflowParamValues } from './comfyui-config';
import {
  COMFY_MODEL_IDS,
  DEFAULT_COMFY_MODEL,
  getComfyModelDefinition,
  type ComfyImageModel,
  type ComfyModelCategory,
} from './comfy-models';
import {
  normalizeModelSamplerPresetTier,
  type ModelSamplerPresetTier,
} from './model-sampler-defaults';

export const MODEL_SAMPLING_SHIFT_NODE_TYPES = [
  'ModelSamplingAuraFlow',
  'ModelSamplingSD3',
  'ModelSamplingStableCascade',
] as const;

export const MODEL_SAMPLING_FLUX_NODE_TYPE = 'ModelSamplingFlux';

export type ModelSamplingShiftNodeType = (typeof MODEL_SAMPLING_SHIFT_NODE_TYPES)[number];

export type ModelSamplingPatchValues = {
  samplingShift?: number;
  fluxMaxShift?: number;
  fluxBaseShift?: number;
};

const SHIFT_NODE_SET = new Set<string>(MODEL_SAMPLING_SHIFT_NODE_TYPES);

const CATEGORY_SHIFT_DEFAULTS: Partial<Record<ComfyModelCategory, number>> = {
  sd3: 3,
  qwen: 3.1,
};

/** Official Qwen-Image AuraFlow shift (not the generic AuraFlow 1.73 default). */
export const QWEN_IMAGE_AURA_SHIFT = 3.1;

/** Official LightX2V Lightning workflows use shift 3 (not the vanilla Qwen 3.1). */
export const QWEN_LIGHTNING_SHIFT_DEFAULT = 3;

export function isQwenLightningModel(model: ComfyImageModel | string | undefined): boolean {
  if (!model?.trim()) {
    return false;
  }
  const id = model.trim();
  // 2.1 fast engines are Fun-Acc 4-step / Pruna 8-step, not Qwen-Image Lightning LoRAs.
  if (id.toLowerCase().startsWith('qwen-image-2.1')) {
    return false;
  }
  if (COMFY_MODEL_IDS.has(id)) {
    const category = getComfyModelDefinition(id)?.category;
    return category === 'qwen' && id.includes('lightning-');
  }
  return /qwen.*lightning-(4|8)\b/i.test(id);
}

/** WAN Video Lightning (4/8-step LoRA) — keep separate from Qwen Lightning paths. */
export function isWanLightningModel(model: ComfyImageModel | string | undefined): boolean {
  if (!model?.trim()) {
    return false;
  }
  const id = model.trim();
  if (COMFY_MODEL_IDS.has(id)) {
    const category = getComfyModelDefinition(id)?.category;
    return category === 'video' && /wan/i.test(id) && id.includes('lightning-');
  }
  return /wan.*lightning-(4|8)\b/i.test(id);
}

/** Any registered Lightning distilled model (Qwen or WAN). */
export function isLightningDistilledModel(model: ComfyImageModel | string | undefined): boolean {
  return isQwenLightningModel(model) || isWanLightningModel(model);
}

const MODEL_SHIFT_OVERRIDES: Partial<Record<ComfyImageModel, number>> = {
  auraflow: 1.73,
  'stable-cascade-b': 2,
  'qwen-image-2512': QWEN_IMAGE_AURA_SHIFT,
  'qwen-image-2.0': QWEN_IMAGE_AURA_SHIFT,
  'z-image': 3,
  'z-image-turbo': 3,
  'boogu-image': 3,
  'boogu-image-edit': 3,
};

const FLUX_SAMPLING_DEFAULTS: Pick<ModelSamplingPatchValues, 'fluxMaxShift' | 'fluxBaseShift'> = {
  fluxMaxShift: 1.15,
  fluxBaseShift: 0.5,
};

const NODE_SHIFT_DEFAULTS: Partial<Record<ModelSamplingShiftNodeType, number>> = {
  ModelSamplingAuraFlow: 1.73,
  ModelSamplingSD3: 3,
  ModelSamplingStableCascade: 2,
};

function isUnresolvedWorkflowPlaceholder(value: unknown): boolean {
  return typeof value === 'string' && /^\{\{[A-Z0-9_]+\}\}$/.test(value.trim());
}

function isQwenAuraFlowModel(model?: string): boolean {
  if (!model?.trim() || isQwenLightningModel(model)) {
    return false;
  }
  const id = model.trim();
  if (COMFY_MODEL_IDS.has(id)) {
    return getComfyModelDefinition(id).category === 'qwen';
  }
  return /qwen/i.test(id);
}

/** Comfy AuraFlow default (~1.73) or otherwise outside the healthy Qwen band. */
function shouldRepairQwenAuraShift(current: number): boolean {
  return !Number.isFinite(current) || current < 2.5 || current > 4.5;
}

function resolveShiftForNode(
  classType: ModelSamplingShiftNodeType,
  params: WorkflowParamValues,
  model?: string
): number | undefined {
  if (isQwenLightningModel(model)) {
    return QWEN_LIGHTNING_SHIFT_DEFAULT;
  }
  if (params.samplingShift != null && params.samplingShift.toString().trim() !== '') {
    const parsed = Number(params.samplingShift);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (isQwenAuraFlowModel(model) && classType === 'ModelSamplingAuraFlow') {
    return QWEN_IMAGE_AURA_SHIFT;
  }
  return NODE_SHIFT_DEFAULTS[classType];
}

function resolveFluxShiftForNode(
  field: 'max_shift' | 'base_shift',
  params: WorkflowParamValues
): number | undefined {
  const paramValue = field === 'max_shift' ? params.fluxMaxShift : params.fluxBaseShift;
  if (paramValue != null && paramValue.toString().trim() !== '') {
    const parsed = Number(paramValue);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return field === 'max_shift'
    ? FLUX_SAMPLING_DEFAULTS.fluxMaxShift
    : FLUX_SAMPLING_DEFAULTS.fluxBaseShift;
}

function shouldPatchNumericInput(
  current: unknown,
  params: WorkflowParamValues,
  paramKey: keyof WorkflowParamValues
): boolean {
  if (
    paramKey in params &&
    params[paramKey] != null &&
    params[paramKey]?.toString().trim() !== ''
  ) {
    return true;
  }
  return isUnresolvedWorkflowPlaceholder(current);
}

function patchNumericInput(
  inputs: Record<string, unknown>,
  field: string,
  value: number | undefined
): boolean {
  if (value == null || !Number.isFinite(value) || !(field in inputs)) {
    return false;
  }
  inputs[field] = value;
  return true;
}

export function isModelSamplingPatchNode(classType: string): boolean {
  return SHIFT_NODE_SET.has(classType) || classType === MODEL_SAMPLING_FLUX_NODE_TYPE;
}

export function isModelSamplingShiftNode(classType: string): boolean {
  return SHIFT_NODE_SET.has(classType);
}

export function isModelSamplingFluxNode(classType: string): boolean {
  return classType === MODEL_SAMPLING_FLUX_NODE_TYPE;
}

export function modelUsesFluxSamplingPatch(model: ComfyImageModel | string): boolean {
  if (!COMFY_MODEL_IDS.has(model)) {
    return false;
  }
  return getComfyModelDefinition(model).category === 'flux';
}

export function modelUsesShiftSamplingPatch(model: ComfyImageModel | string): boolean {
  if (isQwenLightningModel(model)) {
    return false;
  }
  if (!COMFY_MODEL_IDS.has(model)) {
    return false;
  }
  const normalized = model as ComfyImageModel;
  if (MODEL_SHIFT_OVERRIDES[normalized] != null) {
    return true;
  }
  const category = getComfyModelDefinition(normalized).category;
  return category === 'sd3' || category === 'qwen';
}

export function getModelSamplingPatchDefaults(
  model: ComfyImageModel | string = DEFAULT_COMFY_MODEL,
  tier: ModelSamplerPresetTier = 'base'
): ModelSamplingPatchValues {
  normalizeModelSamplerPresetTier(tier);
  const normalized = COMFY_MODEL_IDS.has(model) ? model : DEFAULT_COMFY_MODEL;
  if (isQwenLightningModel(normalized)) {
    return {};
  }
  const definition = getComfyModelDefinition(normalized);
  const patch: ModelSamplingPatchValues = {};

  // Always apply official Qwen AuraFlow shift (3.1), including Base/followSettings.
  // Native templates use ~3.1; leaving Base on Comfy's 1.73 undercooks structure.
  const shiftOverride = MODEL_SHIFT_OVERRIDES[normalized as ComfyImageModel];
  if (shiftOverride != null) {
    patch.samplingShift = shiftOverride;
    return patch;
  }

  const categoryShift = CATEGORY_SHIFT_DEFAULTS[definition.category];
  if (categoryShift != null) {
    patch.samplingShift = categoryShift;
    return patch;
  }

  if (definition.category === 'flux') {
    return {
      ...FLUX_SAMPLING_DEFAULTS,
      samplingShift: NODE_SHIFT_DEFAULTS.ModelSamplingAuraFlow,
    };
  }

  return patch;
}

export function modelSamplingPatchToParams(patch: ModelSamplingPatchValues): WorkflowParamValues {
  const params: WorkflowParamValues = {};
  if (patch.samplingShift != null) {
    params.samplingShift = patch.samplingShift;
  }
  if (patch.fluxMaxShift != null) {
    params.fluxMaxShift = patch.fluxMaxShift;
  }
  if (patch.fluxBaseShift != null) {
    params.fluxBaseShift = patch.fluxBaseShift;
  }
  return params;
}

export function resolveModelSamplingParams(
  model?: ComfyImageModel | string,
  tier: ModelSamplerPresetTier = 'base'
): WorkflowParamValues {
  if (!model) {
    return {};
  }
  return modelSamplingPatchToParams(getModelSamplingPatchDefaults(model, tier));
}

export function formatModelSamplingHint(
  model: ComfyImageModel | string,
  tier: ModelSamplerPresetTier = 'base'
): string | null {
  const patch = getModelSamplingPatchDefaults(model, tier);
  const definition = COMFY_MODEL_IDS.has(model)
    ? getComfyModelDefinition(model)
    : getComfyModelDefinition(DEFAULT_COMFY_MODEL);
  if (definition.category === 'flux' && patch.fluxMaxShift != null && patch.fluxBaseShift != null) {
    return `Model sampling · Flux max ${patch.fluxMaxShift} · base ${patch.fluxBaseShift} · syncs width/height on queue`;
  }
  if (patch.samplingShift != null) {
    return `Model sampling · shift ${patch.samplingShift}`;
  }
  if (patch.fluxMaxShift != null && patch.fluxBaseShift != null) {
    return `Model sampling · Flux max ${patch.fluxMaxShift} · base ${patch.fluxBaseShift} · syncs width/height on queue`;
  }
  return null;
}

const FLUX_ONLY_SAMPLING_INPUTS = ['max_shift', 'base_shift', 'width', 'height'] as const;

export function patchModelSamplingInWorkflow(
  workflow: Record<string, unknown>,
  params: WorkflowParamValues,
  model?: string,
  options?: { mutateInPlace?: boolean }
): {
  workflow: Record<string, unknown>;
  patched: Partial<
    Record<'samplingShift' | 'fluxMaxShift' | 'fluxBaseShift' | 'width' | 'height', number>
  >;
} {
  const next = options?.mutateInPlace ? workflow : structuredClone(workflow);
  const patched: Partial<
    Record<'samplingShift' | 'fluxMaxShift' | 'fluxBaseShift' | 'width' | 'height', number>
  > = {};

  for (const node of Object.values(next)) {
    if (!node || typeof node !== 'object') {
      continue;
    }

    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    const classType = record.class_type ?? '';
    const inputs = record.inputs;
    if (!inputs) {
      continue;
    }

    if (isModelSamplingShiftNode(classType)) {
      if (isQwenLightningModel(model) && 'shift' in inputs) {
        if (isUnresolvedWorkflowPlaceholder(inputs.shift)) {
          if (patchNumericInput(inputs, 'shift', QWEN_LIGHTNING_SHIFT_DEFAULT)) {
            patched.samplingShift = (patched.samplingShift ?? 0) + 1;
          }
        } else {
          const current = Number(inputs.shift);
          // Recover bad defaults (1 / 1.73). Official LightX2V uses ~3.
          if (!Number.isFinite(current) || current < 2.5 || current > 4) {
            if (patchNumericInput(inputs, 'shift', QWEN_LIGHTNING_SHIFT_DEFAULT)) {
              patched.samplingShift = (patched.samplingShift ?? 0) + 1;
            }
          }
        }
      } else if (isQwenAuraFlowModel(model) && 'shift' in inputs) {
        const target =
          params.samplingShift != null && params.samplingShift.toString().trim() !== ''
            ? Number(params.samplingShift)
            : QWEN_IMAGE_AURA_SHIFT;
        if (isUnresolvedWorkflowPlaceholder(inputs.shift)) {
          if (patchNumericInput(inputs, 'shift', target)) {
            patched.samplingShift = (patched.samplingShift ?? 0) + 1;
          }
        } else if (shouldRepairQwenAuraShift(Number(inputs.shift))) {
          // Repair concrete Comfy defaults (~1.73) on imported graphs toward official 3.1.
          if (
            patchNumericInput(
              inputs,
              'shift',
              Number.isFinite(target) ? target : QWEN_IMAGE_AURA_SHIFT
            )
          ) {
            patched.samplingShift = (patched.samplingShift ?? 0) + 1;
          }
        }
      } else if ('shift' in inputs && isUnresolvedWorkflowPlaceholder(inputs.shift)) {
        const resolved = isQwenLightningModel(model)
          ? QWEN_LIGHTNING_SHIFT_DEFAULT
          : params.samplingShift != null && params.samplingShift.toString().trim() !== ''
            ? Number(params.samplingShift)
            : resolveShiftForNode(classType as ModelSamplingShiftNodeType, params, model);
        if (patchNumericInput(inputs, 'shift', resolved)) {
          patched.samplingShift = (patched.samplingShift ?? 0) + 1;
        }
      }
      // Shift-only samplers (AuraFlow, SD3…) take `shift` alone. Some imported Qwen graphs carry
      // ModelSamplingFlux inputs on them; ComfyUI ignores those, but they stay as unfilled
      // placeholders in every queued graph.
      for (const stray of FLUX_ONLY_SAMPLING_INPUTS) delete inputs[stray];
      continue;
    }

    if (!isModelSamplingFluxNode(classType)) {
      continue;
    }

    if (shouldPatchNumericInput(inputs.width, params, 'width')) {
      const width = Number(params.width);
      if (patchNumericInput(inputs, 'width', Number.isFinite(width) ? width : undefined)) {
        patched.width = (patched.width ?? 0) + 1;
      }
    }
    if (shouldPatchNumericInput(inputs.height, params, 'height')) {
      const height = Number(params.height);
      if (patchNumericInput(inputs, 'height', Number.isFinite(height) ? height : undefined)) {
        patched.height = (patched.height ?? 0) + 1;
      }
    }
    if (shouldPatchNumericInput(inputs.max_shift, params, 'fluxMaxShift')) {
      if (patchNumericInput(inputs, 'max_shift', resolveFluxShiftForNode('max_shift', params))) {
        patched.fluxMaxShift = (patched.fluxMaxShift ?? 0) + 1;
      }
    }
    if (shouldPatchNumericInput(inputs.base_shift, params, 'fluxBaseShift')) {
      if (patchNumericInput(inputs, 'base_shift', resolveFluxShiftForNode('base_shift', params))) {
        patched.fluxBaseShift = (patched.fluxBaseShift ?? 0) + 1;
      }
    }
  }

  return { workflow: next, patched };
}
