import type { WorkflowParamValues } from '../comfyui/config';

/** Client-safe: extract sampler/latent params from a Comfy API workflow graph. */
export function extractParamsFromWorkflow(workflow: Record<string, unknown>): WorkflowParamValues {
  const params: WorkflowParamValues = {};

  for (const node of Object.values(workflow)) {
    if (!node || typeof node !== 'object') {
      continue;
    }

    const inputs = (node as { inputs?: Record<string, unknown> }).inputs;
    if (!inputs) {
      continue;
    }

    for (const [key, value] of Object.entries(inputs)) {
      const normalized = key.toLowerCase();
      if (
        normalized === 'seed' ||
        normalized === 'steps' ||
        normalized === 'cfg' ||
        normalized === 'width' ||
        normalized === 'height' ||
        normalized === 'sampler_name' ||
        normalized === 'scheduler'
      ) {
        if (typeof value === 'number' || typeof value === 'string') {
          const paramKey =
            normalized === 'sampler_name'
              ? 'samplerName'
              : (normalized as keyof WorkflowParamValues);
          params[paramKey] = (typeof value === 'number' ? String(value) : value) as never;
        }
      }
    }
  }

  return params;
}
