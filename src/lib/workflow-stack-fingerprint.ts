import { getComfyModelDefinition, type ComfyImageModel } from './comfy-models/client';
import { findUnresolvedPlaceholderTokens } from './workflow-placeholder-audit';

export type WorkflowStackFamily =
  | 'flux-klein'
  | 'flux'
  | 'qwen-t2i'
  | 'qwen-edit'
  | 'sdxl'
  | 'sd3'
  | 'stable-diffusion'
  | 'hunyuan'
  | 'other'
  | 'unknown';

export type WorkflowStackFingerprint = {
  family: WorkflowStackFamily;
  unetFamilies: WorkflowStackFamily[];
  clipFamilies: WorkflowStackFamily[];
  vaeFamilies: WorkflowStackFamily[];
  checkpointFamilies: WorkflowStackFamily[];
  unetFilenames: string[];
  clipFilenames: string[];
  isMixed: boolean;
  unresolvedPlaceholders: string[];
  hasUnresolvedModelSamplingShift: boolean;
};

export type WorkflowStackAuditIssue = {
  severity: 'error' | 'warn';
  message: string;
};

const PLACEHOLDER_PATTERN = /^\{\{[A-Z0-9_]+\}\}$/;

const CHECKPOINT_LOADER_TYPES = new Set(['CheckpointLoaderSimple', 'CheckpointLoader']);
const UNET_LOADER_TYPES = new Set(['UNETLoader', 'UnetLoaderGGUF']);
const VAE_LOADER_TYPES = new Set(['VAELoader']);
const CLIP_LOADER_TYPES = new Set(['CLIPLoader', 'DualCLIPLoader']);

const COMPATIBLE_STACK_FAMILIES: Partial<
  Record<WorkflowStackFamily, ReadonlySet<WorkflowStackFamily>>
> = {
  'flux-klein': new Set(['flux-klein', 'flux']),
  flux: new Set(['flux', 'flux-klein']),
  'qwen-t2i': new Set(['qwen-t2i']),
  'qwen-edit': new Set(['qwen-edit', 'qwen-t2i']),
  sdxl: new Set(['sdxl']),
  sd3: new Set(['sd3']),
  'stable-diffusion': new Set(['stable-diffusion']),
  hunyuan: new Set(['hunyuan']),
};

function isBindablePlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERN.test(value.trim());
}

function coerceLoaderFilename(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim() || null;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0].trim() || null;
  }
  return null;
}

export function classifyLoaderFilenameFamily(filename: string): WorkflowStackFamily {
  const trimmed = filename.trim();
  if (!trimmed || isBindablePlaceholder(trimmed)) {
    return 'unknown';
  }

  const lower = trimmed.toLowerCase();

  if (/klein|flux2-klein|flux-2-klein/.test(lower)) {
    return 'flux-klein';
  }
  if (/qwen.*edit|edit.*qwen|qwen_image_edit/.test(lower)) {
    return 'qwen-edit';
  }
  if (/boogu/.test(lower)) {
    return 'qwen-edit';
  }
  if (/qwen/.test(lower)) {
    return 'qwen-t2i';
  }
  if (/flux/.test(lower)) {
    return 'flux';
  }
  if (/sdxl|ssd-1b|segmind/.test(lower)) {
    return 'sdxl';
  }
  if (/sd3|sd_3|auraflow/.test(lower)) {
    return 'sd3';
  }
  if (/sd15|sd1\.5|v1-5|stable-diffusion/.test(lower)) {
    return 'stable-diffusion';
  }
  if (/hunyuan|hidream/.test(lower)) {
    return 'hunyuan';
  }

  return 'other';
}

export function resolveModelStackFamily(model: ComfyImageModel | string): WorkflowStackFamily {
  const def = getComfyModelDefinition(model);
  if (!def) {
    return 'unknown';
  }

  if (def.profile === 'flux_klein') {
    return 'flux-klein';
  }
  if (/^boogu-image(?!-edit)/i.test(String(model))) {
    return 'other';
  }
  if (/^boogu-image-edit/i.test(String(model))) {
    return 'qwen-edit';
  }
  if (def.category === 'flux') {
    return 'flux';
  }
  if (def.profile === 'qwen_edit' || def.profile === 'qwen_edit_instruction') {
    return 'qwen-edit';
  }
  if (def.category === 'qwen') {
    return 'qwen-t2i';
  }
  if (def.category === 'sdxl') {
    return 'sdxl';
  }
  if (def.category === 'sd3') {
    return 'sd3';
  }
  if (def.category === 'stable-diffusion') {
    return 'stable-diffusion';
  }
  if (def.category === 'hunyuan') {
    return 'hunyuan';
  }

  return 'other';
}

function dominantFamily(families: WorkflowStackFamily[]): WorkflowStackFamily {
  const counts = new Map<WorkflowStackFamily, number>();
  for (const family of families) {
    if (family === 'unknown') {
      continue;
    }
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }

  let best: WorkflowStackFamily = 'unknown';
  let bestCount = 0;
  for (const [family, count] of counts) {
    if (count > bestCount) {
      best = family;
      bestCount = count;
    }
  }
  return best;
}

function uniqueConcreteFamilies(families: WorkflowStackFamily[]): WorkflowStackFamily[] {
  return [...new Set(families.filter(family => family !== 'unknown' && family !== 'other'))];
}

export function extractWorkflowStackFingerprint(
  workflowJson?: string,
  workflow?: Record<string, unknown> | null
): WorkflowStackFingerprint {
  const empty: WorkflowStackFingerprint = {
    family: 'unknown',
    unetFamilies: [],
    clipFamilies: [],
    vaeFamilies: [],
    checkpointFamilies: [],
    unetFilenames: [],
    clipFilenames: [],
    isMixed: false,
    unresolvedPlaceholders: [],
    hasUnresolvedModelSamplingShift: false,
  };

  let graph = workflow ?? null;
  if (!graph) {
    if (!workflowJson?.trim()) {
      return empty;
    }
    try {
      graph = JSON.parse(workflowJson) as Record<string, unknown>;
    } catch {
      return empty;
    }
  }
  const workflowGraph = graph;

  const unetFilenames: string[] = [];
  const clipFilenames: string[] = [];
  const vaeFilenames: string[] = [];
  const checkpointFilenames: string[] = [];
  let hasUnresolvedModelSamplingShift = false;

  for (const node of Object.values(workflowGraph)) {
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

    if (UNET_LOADER_TYPES.has(classType)) {
      const filename = coerceLoaderFilename(inputs.unet_name);
      if (filename) {
        unetFilenames.push(filename);
      }
    }

    if (CHECKPOINT_LOADER_TYPES.has(classType)) {
      const filename = coerceLoaderFilename(inputs.ckpt_name);
      if (filename) {
        checkpointFilenames.push(filename);
      }
    }

    if (VAE_LOADER_TYPES.has(classType)) {
      const filename = coerceLoaderFilename(inputs.vae_name);
      if (filename) {
        vaeFilenames.push(filename);
      }
    }

    if (CLIP_LOADER_TYPES.has(classType)) {
      for (const field of ['clip_name', 'clip_name1', 'clip_name2'] as const) {
        const filename = coerceLoaderFilename(inputs[field]);
        if (filename) {
          clipFilenames.push(filename);
        }
      }
    }

    if (
      classType === 'ModelSamplingFlux' ||
      classType === 'ModelSamplingSD3' ||
      classType === 'ModelSamplingAuraFlow'
    ) {
      for (const field of ['shift', 'max_shift', 'base_shift'] as const) {
        const value = coerceLoaderFilename(inputs[field]);
        if (value && isBindablePlaceholder(value)) {
          hasUnresolvedModelSamplingShift = true;
          break;
        }
      }
    }
  }

  const unetFamilies = unetFilenames.map(classifyLoaderFilenameFamily);
  const clipFamilies = clipFilenames.map(classifyLoaderFilenameFamily);
  const vaeFamilies = vaeFilenames.map(classifyLoaderFilenameFamily);
  const checkpointFamilies = checkpointFilenames.map(classifyLoaderFilenameFamily);

  const unetConcrete = uniqueConcreteFamilies(unetFamilies);
  const clipConcrete = uniqueConcreteFamilies(clipFamilies);
  const dominantUnet = dominantFamily(unetFamilies);
  const dominantClip = dominantFamily(clipFamilies);
  const isMixed =
    unetConcrete.length > 0 &&
    clipConcrete.length > 0 &&
    dominantUnet !== 'unknown' &&
    dominantClip !== 'unknown' &&
    dominantUnet !== dominantClip &&
    !(COMPATIBLE_STACK_FAMILIES[dominantUnet]?.has(dominantClip) ?? false) &&
    !(COMPATIBLE_STACK_FAMILIES[dominantClip]?.has(dominantUnet) ?? false);

  const dominant = dominantFamily([
    ...unetFamilies,
    ...clipFamilies,
    ...checkpointFamilies,
    ...vaeFamilies,
  ]);

  const jsonForPlaceholders = workflowJson?.trim() || JSON.stringify(workflowGraph);
  const unresolvedPlaceholders = findUnresolvedPlaceholderTokens(jsonForPlaceholders).filter(
    token =>
      token.includes('UNET') ||
      token.includes('CHECKPOINT') ||
      token.includes('VAE') ||
      token.includes('SHIFT') ||
      token.includes('CLIP')
  );

  return {
    family: isMixed ? 'other' : dominant,
    unetFamilies,
    clipFamilies,
    vaeFamilies,
    checkpointFamilies,
    unetFilenames,
    clipFilenames,
    isMixed,
    unresolvedPlaceholders,
    hasUnresolvedModelSamplingShift,
  };
}

export function workflowStackMatchesModel(
  fingerprint: WorkflowStackFingerprint,
  model: ComfyImageModel | string
): boolean {
  const modelFamily = resolveModelStackFamily(model);
  if (modelFamily === 'unknown') {
    return true;
  }
  if (fingerprint.isMixed) {
    return false;
  }
  if (fingerprint.family === 'unknown' || fingerprint.family === 'other') {
    return true;
  }

  const compatible = COMPATIBLE_STACK_FAMILIES[modelFamily];
  return compatible?.has(fingerprint.family) ?? fingerprint.family === modelFamily;
}

export function scoreWorkflowStackForModel(
  workflowJson: string | undefined,
  model: ComfyImageModel | string
): number {
  const fingerprint = extractWorkflowStackFingerprint(workflowJson);
  const modelFamily = resolveModelStackFamily(model);

  if (fingerprint.isMixed) {
    return -20;
  }
  if (fingerprint.family === 'unknown' || fingerprint.family === 'other') {
    return 0;
  }
  if (fingerprint.family === modelFamily) {
    return 8;
  }
  if (COMPATIBLE_STACK_FAMILIES[modelFamily]?.has(fingerprint.family)) {
    return 3;
  }
  if (modelFamily !== 'unknown' && fingerprint.family !== modelFamily) {
    return -12;
  }
  return 0;
}

function formatStackFamilyLabel(family: WorkflowStackFamily): string {
  switch (family) {
    case 'flux-klein':
      return 'Flux Klein';
    case 'flux':
      return 'Flux';
    case 'qwen-t2i':
      return 'Qwen txt2img';
    case 'qwen-edit':
      return 'Qwen edit';
    case 'sdxl':
      return 'SDXL';
    case 'sd3':
      return 'SD3';
    case 'stable-diffusion':
      return 'SD 1.5';
    case 'hunyuan':
      return 'Hunyuan';
    default:
      return 'mixed/unknown';
  }
}

export function auditWorkflowStackCompatibility(input: {
  workflowJson?: string;
  workflow?: Record<string, unknown> | null;
  model: ComfyImageModel | string;
  syncWorkflowLoadersToModel?: boolean;
}): WorkflowStackAuditIssue[] {
  const fingerprint = extractWorkflowStackFingerprint(input.workflowJson, input.workflow);
  const issues: WorkflowStackAuditIssue[] = [];
  const modelFamily = resolveModelStackFamily(input.model);

  if (fingerprint.hasUnresolvedModelSamplingShift) {
    issues.push({
      severity: 'warn',
      message:
        'ModelSampling still has unresolved {{SHIFT}} or Flux shift placeholders — Castcut resolves these when you queue; run Optimize all to save concrete values in the library.',
    });
  }

  if (fingerprint.isMixed) {
    const unetLabel = formatStackFamilyLabel(dominantFamily(fingerprint.unetFamilies));
    const clipLabel = formatStackFamilyLabel(dominantFamily(fingerprint.clipFamilies));
    const message = `Workflow mixes loader stacks (${unetLabel} UNET/checkpoint with ${clipLabel} CLIP) — this often crashes KSampler. Pick a single-family workflow or enable Sync loaders to model in Settings.`;
    issues.push({
      severity: input.syncWorkflowLoadersToModel ? 'warn' : 'error',
      message,
    });
  } else if (
    modelFamily !== 'unknown' &&
    fingerprint.family !== 'unknown' &&
    fingerprint.family !== 'other' &&
    !workflowStackMatchesModel(fingerprint, input.model)
  ) {
    issues.push({
      severity: input.syncWorkflowLoadersToModel ? 'warn' : 'error',
      message: `Workflow stack looks like ${formatStackFamilyLabel(fingerprint.family)} but target model is ${formatStackFamilyLabel(modelFamily)} — pick a matching workflow${input.syncWorkflowLoadersToModel ? ' or confirm Sync loaders to model will rewrite loaders' : ''}.`,
    });
  }

  return issues;
}
