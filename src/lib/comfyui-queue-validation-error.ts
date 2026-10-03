type ComfyUiNodeError = {
  errors?: Array<{
    type?: string;
    message?: string;
    details?: string;
  }>;
  class_type?: string;
};

type ComfyUiValidationPayload = {
  error?: { type?: string; message?: string };
  node_errors?: Record<string, ComfyUiNodeError>;
};

function summarizeNodeError(nodeId: string, nodeError: ComfyUiNodeError): string | null {
  const first = nodeError.errors?.[0];
  if (!first) {
    return null;
  }

  const classType = nodeError.class_type ? `${nodeError.class_type} ` : '';
  const detail = first.details?.trim() || first.message?.trim();
  if (!detail) {
    return null;
  }

  if (
    nodeError.class_type === 'DualCLIPLoader' &&
    /qwen_image/.test(detail) &&
    /not in/i.test(detail)
  ) {
    return `${classType}(node ${nodeId}): Qwen Image must use CLIPLoader (type qwen_image), not DualCLIPLoader — run Settings → Optimize all or queue again to auto-repair.`;
  }

  if (nodeError.class_type === 'TextEncodeBooguEdit' && /^vae$/i.test(detail)) {
    return `${classType}(node ${nodeId}): VAE link missing or invalid — ensure models/vae has flux1_vae_bf16.safetensors or ae.safetensors, then retry. If you only have one of those, restart the app so queue prep picks the installed file.`;
  }

  if (nodeError.class_type === 'VAELoader' && /vae_name|not in/i.test(detail)) {
    return `${classType}(node ${nodeId}): ${detail} — Boogu Edit needs flux1_vae_bf16.safetensors or ae.safetensors in models/vae.`;
  }

  return `${classType}(node ${nodeId}): ${detail}`;
}

export const NO_WORKFLOW_MESSAGE =
  'No ComfyUI workflow is set up for this engine yet. Run Heal & ready (Settings → Overview) or pick a workflow for this model in Settings.';

export function formatComfyUiQueueValidationError(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) {
    return trimmed;
  }

  try {
    const parsed = JSON.parse(trimmed) as ComfyUiValidationPayload;
    // No workflow set up for this engine: the app falls back to a stub graph with nothing to
    // save, and ComfyUI's own words ("Prompt has no outputs") gave no clue what to do.
    if (/no outputs/i.test(parsed.error?.message ?? '')) {
      return NO_WORKFLOW_MESSAGE;
    }
    const nodeErrors = parsed.node_errors;
    if (!nodeErrors || typeof nodeErrors !== 'object') {
      return trimmed;
    }

    const summaries = Object.entries(nodeErrors)
      .map(([nodeId, nodeError]) => summarizeNodeError(nodeId, nodeError))
      .filter((entry): entry is string => Boolean(entry));

    if (summaries.length === 0) {
      return parsed.error?.message?.trim() || trimmed;
    }

    return summaries.join(' · ');
  } catch {
    return trimmed;
  }
}
