import {
  fluxIgnoresNegative,
  getComfyModelDefinition,
  type ComfyImageModel,
} from '../comfy-models';

export function modelUsesNegativePrompt(model: ComfyImageModel): boolean {
  // Klein Base uses KSampler CFG (not FluxGuidance) — plastic-skin negatives work.
  // Distilled Klein stays CFG-1 and still ignores long negatives.
  if (model === 'flux-2-klein' || model === 'flux-2-klein-9b') {
    return true;
  }
  return !fluxIgnoresNegative(getComfyModelDefinition(model).profile);
}

export function formatPromptPair(input: {
  positive: string;
  negative?: string | null;
  model: ComfyImageModel;
  preserve?: string;
}): string {
  const lines = [
    `# Positive (${getComfyModelDefinition(input.model).comfyNode})`,
    input.positive.trim(),
  ];

  if (input.preserve?.trim()) {
    lines.push('', '# Preserve', input.preserve.trim());
  } else if (input.negative?.trim() && modelUsesNegativePrompt(input.model)) {
    lines.push('', '# Negative', input.negative.trim());
  } else if (input.negative?.trim()) {
    lines.push(
      '',
      '# Note: target model ignores negatives — fold into positive phrasing',
      input.negative.trim()
    );
  }

  return lines.join('\n');
}

export function downloadPromptPairTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
