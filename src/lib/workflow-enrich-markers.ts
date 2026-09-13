/** New enrich titles use this prefix. */
export const PROMPT_STUDIO_META_PREFIX = 'Castcut —';

/** Legacy enrich titles from Prompt Studio builds. */
const LEGACY_META_PREFIX = 'Prompt Studio —';

type WorkflowNodeMeta = {
  class_type?: string;
  _meta?: { title?: string };
  inputs?: Record<string, unknown>;
};

export function isCastcutEnrichedNode(meta?: { title?: string }): boolean {
  const title = meta?.title?.trim() ?? '';
  return title.startsWith(PROMPT_STUDIO_META_PREFIX) || title.startsWith(LEGACY_META_PREFIX);
}

export function isCastcutProtectedSampler(node: WorkflowNodeMeta): boolean {
  if (!isCastcutEnrichedNode(node._meta)) {
    return false;
  }
  const title = node._meta?.title?.toLowerCase() ?? '';
  return (
    title.includes('refiner pass') ||
    title.includes('refiner ksampler') ||
    title.includes('hires pass') ||
    title.includes('lightning hires') ||
    title.includes('latent detail')
  );
}

/** Skip global queue sampler patch on enriched refiner passes and low-denoise stages. */
export function shouldSkipGlobalSamplerPatch(node: WorkflowNodeMeta): boolean {
  if (isCastcutProtectedSampler(node)) {
    return true;
  }

  const inputs = node.inputs;
  if (!inputs || !('denoise' in inputs)) {
    return false;
  }

  const denoise = Number(inputs.denoise);
  return Number.isFinite(denoise) && denoise > 0 && denoise < 0.95;
}

export function isCastcutOutputUpscaleNode(node: WorkflowNodeMeta): boolean {
  if (!isCastcutEnrichedNode(node._meta)) {
    return false;
  }
  const title = node._meta?.title?.toLowerCase() ?? '';
  return title.includes('upscale') || title.includes('sharpen') || title.includes('polish');
}

/** True when Final/Max enrich markers are already present (safe to skip re-enrich in batch). */
export function workflowHasCastcutQueueEnrich(workflow: Record<string, unknown>): boolean {
  for (const node of Object.values(workflow)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const record = node as WorkflowNodeMeta;
    if (isCastcutOutputUpscaleNode(record) || isCastcutProtectedSampler(record)) {
      return true;
    }
    const title = record._meta?.title?.toLowerCase() ?? '';
    if (title.includes('sdxl refiner') || title.includes('latent upscale')) {
      return true;
    }
  }
  return false;
}
