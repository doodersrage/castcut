/**
 * What a LoRA file was trained for, read from the file itself — its safetensors training
 * metadata, else its tensor names. The filename guess (lora-model-compat.ts) called anything it
 * couldn't place "unknown" and allowed it on every model; on a real 76-file library that let 20
 * SD 1.5 / SDXL LoRAs pile onto a Qwen model (22 active at once). Reading headers placed 75/76.
 */

import { getComfyModelDefinition } from './comfy-models/client';
import { resolveModelStackFamily } from './workflow-stack-fingerprint';

export type LoraFamily =
  | 'qwen'
  | 'flux-klein'
  | 'flux'
  | 'sdxl'
  | 'sd15'
  | 'wan'
  | 'ltx'
  | 'z-image'
  | 'other'
  | 'unknown';

export const LORA_FAMILY_LABELS: Record<LoraFamily, string> = {
  qwen: 'Qwen',
  'flux-klein': 'FLUX.2 Klein',
  flux: 'FLUX.1',
  sdxl: 'SDXL',
  sd15: 'SD 1.5',
  wan: 'Wan video',
  ltx: 'LTX video',
  'z-image': 'Z-Image',
  other: 'Other model',
  unknown: 'Unknown',
};

export type LoraFamilySource = 'metadata' | 'keys';

export type LoraFamilyDetection = {
  family: LoraFamily;
  source: LoraFamilySource;
  /** First training tag, when the metadata has one. */
  trigger?: string;
};

function fromBaseModel(base: string): LoraFamily | null {
  const b = base.toLowerCase();
  if (!b) return null;
  if (/klein|flux[-_. ]?2/.test(b)) return 'flux-klein';
  if (/flux/.test(b)) return 'flux';
  if (/qwen/.test(b)) return 'qwen';
  if (/wan/.test(b)) return 'wan';
  if (/ltx/.test(b)) return 'ltx';
  if (/z[-_ ]?image|lumina/.test(b)) return 'z-image';
  if (/sdxl|stable-diffusion-xl|\bxl\b|pony|illustrious/.test(b)) return 'sdxl';
  if (/sd[-_ ]?v?1|sd1\.5|stable-diffusion-v1/.test(b)) return 'sd15';
  if (/anima|cosmos|hunyuan|sd3|chroma/.test(b)) return 'other';
  return null;
}

function maxIndex(keys: readonly string[], pattern: RegExp): number {
  let max = -1;
  for (const key of keys) {
    const match = key.match(pattern);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max;
}

function fromKeys(keys: readonly string[]): LoraFamily {
  const has = (pattern: RegExp) => keys.some(key => pattern.test(key));
  // FLUX (kohya `double_blocks_N_` or native `double_blocks.N.`): Klein 9B has 8 double blocks.
  const doubleMax = maxIndex(keys, /double_blocks[._](\d+)[._]/);
  if (doubleMax >= 0) return doubleMax <= 7 ? 'flux-klein' : 'flux';
  if (has(/\battn1\b|\battn2\b/) && has(/transformer_blocks/)) return 'ltx';
  if (has(/context_refiner|noise_refiner|layers\.\d+\.(attention|feed_forward|adaLN)/i)) {
    return 'z-image';
  }
  if (has(/adaln_modulation_cross_attn/)) return 'other';
  // Qwen: 60 transformer blocks and no single-stream blocks (FLUX diffusers has both kinds).
  if (!has(/single_transformer_blocks|single_blocks/)) {
    const blocks = maxIndex(keys, /transformer_blocks[._](\d+)[._]/);
    if (blocks >= 40) return 'qwen';
  }
  if (has(/\bblocks\.\d+\.(cross_attn|self_attn|ffn)\b/)) return 'wan';
  if (has(/lora_te2_|lora_unet_(input|output)_blocks_\d/)) return 'sdxl';
  if (has(/lora_unet_(down|up)_blocks_|lora_te_text_model/)) {
    // SD 1.5 attention has one transformer block per layer; SDXL stacks up to ten.
    const depth = maxIndex(keys, /attentions_\d+_transformer_blocks_(\d+)_/);
    return depth >= 1 || has(/text_encoder_2|lora_te2/) ? 'sdxl' : 'sd15';
  }
  return 'unknown';
}

function firstTrainingTag(metadata: Record<string, unknown>): string | undefined {
  const raw = metadata.ss_tag_frequency;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, Record<string, number>>;
    const tags = Object.values(parsed)[0];
    if (!tags) return undefined;
    // Booru boilerplate is never the trigger — take the most frequent real tag.
    const top = Object.entries(tags)
      .filter(
        ([tag]) => tag.trim() && !/^(1girl|1boy|solo|nsfw|realistic|portrait)$/i.test(tag.trim())
      )
      .sort((a, b) => b[1] - a[1])[0];
    return top?.[0]?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** Family of a LoRA from its safetensors `__metadata__` and (when readable) tensor names. */
export function detectLoraFamily(input: {
  metadata?: Record<string, unknown> | null;
  keys?: readonly string[] | null;
}): LoraFamilyDetection {
  const metadata = input.metadata ?? {};
  const base = [
    metadata.ss_base_model_version,
    metadata['modelspec.architecture'],
    metadata.base_model,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
  const trigger = firstTrainingTag(metadata);
  const withTrigger = trigger ? { trigger } : {};
  const fromMeta = fromBaseModel(base);
  const fromTensors = input.keys?.length ? fromKeys(input.keys) : 'unknown';
  // Tensor names are the structure itself; metadata is often a trainer default ("sd_v1" on
  // Qwen LoRAs). Trust the tensors when they are definite — except Klein vs FLUX.1, which the
  // double-block count can't always tell apart.
  if (fromTensors !== 'unknown' && fromTensors !== 'other') {
    if (fromMeta === 'flux-klein' && fromTensors === 'flux') {
      return { family: 'flux-klein', source: 'metadata', ...withTrigger };
    }
    return { family: fromTensors, source: 'keys', ...withTrigger };
  }
  if (fromMeta) return { family: fromMeta, source: 'metadata', ...withTrigger };
  return { family: fromTensors, source: 'keys', ...withTrigger };
}

/** LoRA family a queue model takes, or null when the model is not in the registry. */
export function loraFamilyForModel(model?: string | null): LoraFamily | null {
  const id = model?.trim() ?? '';
  if (!id) return null;
  const def = getComfyModelDefinition(id);
  if (def.id !== id) return null;
  if (/ltx/i.test(id)) return 'ltx';
  if (def.category === 'video') return /hunyuan/i.test(id) ? 'other' : 'wan';
  if (/^z-image|^boogu-image(?!-edit)/i.test(id)) return 'z-image';
  switch (resolveModelStackFamily(id)) {
    case 'flux-klein':
      return 'flux-klein';
    case 'flux':
      return 'flux';
    case 'qwen-t2i':
    case 'qwen-edit':
      return 'qwen';
    case 'sdxl':
      return 'sdxl';
    case 'stable-diffusion':
      return 'sd15';
    case 'unknown':
      return null;
    default:
      return 'other';
  }
}
