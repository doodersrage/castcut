import { getComfyModelDefinition } from './comfy-models/client';
import { resolveModelStackFamily } from './workflow/stack-fingerprint';

/** SD / SDXL CLIP textual inversion — not Qwen/FLUX. */
export function modelSupportsTextualInversion(model?: string): boolean {
  const modelId = model?.trim() ?? '';
  if (!modelId) {
    return false;
  }
  const family = resolveModelStackFamily(modelId);
  if (family === 'sdxl' || family === 'stable-diffusion') {
    return true;
  }
  const def = getComfyModelDefinition(modelId);
  return def.category === 'sdxl' || def.category === 'stable-diffusion';
}

export function embeddingPromptToken(name: string): string {
  const stem = name.trim().replace(/^embedding:/i, '');
  return stem ? `embedding:${stem}` : '';
}

export function embeddingStem(name: string): string {
  return name.trim().replace(/^embedding:/i, '');
}

export function appendEmbeddingTokens(positive: string, names: string[]): string {
  let next = positive.trim();
  const lower = next.toLowerCase();
  for (const name of names) {
    const token = embeddingPromptToken(name);
    if (!token) {
      continue;
    }
    if (lower.includes(token.toLowerCase()) || lower.includes(embeddingStem(name).toLowerCase())) {
      continue;
    }
    next = next ? `${next}, ${token}` : token;
  }
  return next;
}

export function toggleEmbeddingName(selected: string[], name: string): string[] {
  const stem = embeddingStem(name);
  if (!stem) {
    return selected;
  }
  const exists = selected.some(item => embeddingStem(item).toLowerCase() === stem.toLowerCase());
  if (exists) {
    return selected.filter(item => embeddingStem(item).toLowerCase() !== stem.toLowerCase());
  }
  return [...selected, stem];
}
