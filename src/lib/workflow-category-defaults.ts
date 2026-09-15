import { COMFY_IMAGE_MODELS, type ComfyImageModel, type ComfyModelCategory } from './comfy-models';
import { isEditCapableModel, isQwenRapidAioModel } from './model-denoise-defaults';
import type { ComfyWorkflowFile } from './comfyui-workflow-files';
import type { ModelWorkflowMap } from './model-workflow-map';
import { scoreWorkflowStackForModel } from './workflow-stack-fingerprint';
import { workflowHasLoraLoader } from './workflow-lightning-queue';

const CATEGORY_KEYWORDS: Record<ComfyModelCategory, string[]> = {
  'stable-diffusion': ['sd15', 'sd1.5', 'sd-1.5', 'stable-diffusion'],
  sdxl: ['sdxl', 'ssd-1b', 'segmind'],
  sd3: ['sd3', 'sd-3', 'auraflow'],
  flux: ['flux', 'chroma', 'klein', 'ultrareal'],
  qwen: ['qwen'],
  hunyuan: ['hunyuan', 'hidream'],
  'other-dit': [
    'pixart',
    'lumina',
    'z-image',
    'zimage',
    'z_image',
    'boogu',
    'omnigen',
    'kandinsky',
    'cascade',
  ],
  'instruct-edit': ['instruct', 'ip2p', 'lotus', 'edit', 'boogu'],
  video: ['video', 'wan', 'hunyuan-video', 'motion'],
  audio: ['audio', 'stable-audio', 'sound', 'music'],
  mesh: ['mesh', '3d', 'hunyuan3d', 'hunyuan-3d'],
};

const MODEL_WORKFLOW_KEYWORDS: Partial<Record<ComfyImageModel, string[]>> = {
  'flux-2-klein': ['klein', '4b', 'base', 'klein-base', 'klein-4b'],
  'flux-2-klein-4b-distilled': ['klein', '4b', 'distilled', 'klein-4b'],
  'flux-2-klein-9b': ['klein', '9b', 'base', 'klein-base', 'klein-9b'],
  'flux-2-klein-9b-distilled': ['klein', '9b', 'distilled', 'klein-9b'],
  'flux-2-klein-9b-kv': ['klein', '9b', 'kv', 'klein-9b-kv', 'kv-cache'],
  'hunyuan-video': ['hunyuan', 'hyvideo', 'video', 'i2v', 't2v'],
  'hunyuan-video-1.5': ['hunyuan', '1.5', 'hunyuanvideo1.5', 'hyvideo', 'video', 'i2v', 't2v'],
  'ltx-video': ['ltx', 'ltxv', '0.9', 'video', 'i2v', 't2v'],
  'ltx-video-2': ['ltx', 'ltx-2', 'ltx-2.3', '2.3', '22b', 'video', 'i2v', 't2v', 'audio'],
  'flux-inpaint': ['inpaint', 'flux-inpaint', 'mask', 'fill'],
  'flux-ultrareal-v4': [
    'ultrareal',
    'ultra-real',
    'ultrarealistic',
    'danrisi',
    'finetune',
    'fine-tune',
  ],
  'qwen-image-2512-lightning-4': [
    '2512',
    'lightning',
    'lightening',
    'lightx2v',
    '4step',
    '4-step',
    '4steps',
    '4-steps',
  ],
  'qwen-image-2512-lightning-8': [
    '2512',
    'lightning',
    'lightening',
    'lightx2v',
    '8step',
    '8-step',
    '8steps',
    '8-steps',
  ],
  'qwen-image-2512': ['2512', 'vanilla', 'standard', 'base', 'txt2img', 't2i'],
  'qwen-image-edit-2511-lightning-4': [
    '2511',
    'edit',
    'lightning',
    'lightening',
    'lightx2v',
    '4step',
    '4-step',
    '4steps',
    '4-steps',
  ],
  'qwen-image-edit-2511-lightning-8': [
    '2511',
    'edit',
    'lightning',
    'lightening',
    'lightx2v',
    '8step',
    '8-step',
    '8steps',
    '8-steps',
  ],
  'qwen-rapid-aio-edit': ['rapid', 'aio', 'phr00t', 'qwen-rapid', 'rapid-aio', 'checkpoint'],
  'qwen-rapid-aio-sfw': ['rapid', 'aio', 'sfw', 'qwen-rapid', 'rapid-aio'],
  'qwen-rapid-aio-nsfw': ['rapid', 'aio', 'nsfw', 'qwen-rapid', 'rapid-aio'],
  'wan-video': ['wan', 'video', 'i2v', 't2v', 'motion'],
  'wan-video-rapid-aio': [
    'wan',
    'video',
    'rapid',
    'aio',
    'phr00t',
    'phroot',
    'allinone',
    'all-in-one',
    'i2v',
  ],
  'wan-video-lightning-4': [
    'wan',
    'video',
    'lightning',
    'lightening',
    '4step',
    '4-step',
    '4steps',
    'low_noise',
    'low-noise',
  ],
  'z-image-turbo': ['z-image', 'zimage', 'z_image', 'turbo', 't2i', 'txt2img'],
  'z-image': ['z-image', 'zimage', 'z_image', 'base', 't2i', 'txt2img'],
  'boogu-image-turbo': ['boogu', 'boogu-image', 'turbo', 't2i', 'txt2img'],
  'boogu-image': ['boogu', 'boogu-image', 'base', 't2i', 'txt2img'],
  'boogu-image-edit-turbo': ['boogu', 'boogu-image', 'edit', 'turbo', 'ti2i', 'img2img'],
  'boogu-image-edit': ['boogu', 'boogu-image', 'edit', 'ti2i', 'img2img'],
};

/** Penalize workflow labels that clearly target a different model variant. */
const MODEL_WORKFLOW_AVOID_KEYWORDS: Partial<Record<ComfyImageModel, string[]>> = {
  'flux-2-klein': ['distilled', '9b', 'klein-9b'],
  'flux-2-klein-4b-distilled': ['base', 'klein-base', '9b', 'klein-9b', 'inpaint', 'mask', 'fill'],
  'flux-2-klein-9b': ['distilled', '4b', 'klein-4b', 'inpaint', 'mask', 'fill'],
  'flux-2-klein-9b-distilled': ['base', 'klein-base', '4b', 'klein-4b', 'inpaint', 'mask', 'fill'],
  'qwen-image-2512': [
    'edit',
    'inpaint',
    'img2img',
    'mask',
    'fill',
    'lightning',
    'lightening',
    'lightx2v',
    '2511',
  ],
  'qwen-image-2512-lightning-4': ['edit', 'inpaint', 'img2img', 'mask', 'fill', '2511'],
  'qwen-image-2512-lightning-8': ['edit', 'inpaint', 'img2img', 'mask', 'fill', '2511'],
  'flux-dev': ['inpaint', 'mask', 'fill'],
  'flux-ultrareal-v4': ['klein', 'flux2', 'flux-2', 'inpaint', 'mask', 'fill', 'schnell'],
  sdxl: ['inpaint', 'mask', 'fill'],
  'qwen-rapid-aio-edit': ['sfw', 'nsfw'],
  'qwen-rapid-aio-sfw': ['nsfw'],
  'qwen-rapid-aio-nsfw': ['sfw'],
  'wan-video': ['lightning', 'lightening', 'lightx2v', '4step', '4-step', 'rapid', 'aio', 'phr00t'],
  'wan-video-rapid-aio': [
    'lightning',
    'lightening',
    'lightx2v',
    '4step',
    '4-step',
    'hunyuan',
    'ltx',
  ],
  'wan-video-lightning-4': ['hunyuan', 'ltx', 'rapid', 'aio', 'phr00t'],
  'z-image-turbo': ['base', 'z_image_bf16', 'edit', 'inpaint', 'controlnet'],
  'z-image': ['turbo', 'z_image_turbo', 'edit', 'inpaint', 'controlnet'],
  'boogu-image-turbo': ['edit', 'boogu_image_edit', 'ti2i', 'img2img', 'base'],
  'boogu-image': ['turbo', 'boogu_image_turbo', 'edit', 'ti2i', 'img2img'],
  'boogu-image-edit-turbo': ['base', 'boogu_image_base', 't2i', 'txt2img', 'turbo_t2i'],
  'boogu-image-edit': ['turbo', 'boogu_image_turbo', 't2i', 'txt2img', 'base'],
};

/** Word-aware match so "sfw" does not hit inside "nsfw". */
function haystackHasKeyword(haystack: string, keyword: string): boolean {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.length <= 4 || /^(sfw|nsfw|4b|9b|8step|4step)$/i.test(normalized)) {
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, 'i').test(haystack);
  }
  return haystack.includes(normalized);
}

export function workflowRequiresInputImage(workflowJson?: string): boolean {
  if (!workflowJson?.trim()) {
    return false;
  }
  if (workflowJson.includes('{{INPUT_IMAGE}}')) {
    return true;
  }
  if (workflowJson.includes('{{MASK_IMAGE}}')) {
    return true;
  }
  if (workflowJson.includes('LoadImageMask')) {
    return true;
  }
  if (workflowJson.includes('InpaintModelConditioning')) {
    return true;
  }
  // TextEncodeQwenImageEdit* can run T2I with empty refs — do not block Generate auto-select.
  return false;
}

function scoreWorkflowForCategory(
  file: Pick<ComfyWorkflowFile, 'name' | 'filename'>,
  category: ComfyModelCategory
): number {
  const haystack = `${file.name} ${file.filename ?? ''}`.toLowerCase();
  const keywords = CATEGORY_KEYWORDS[category] ?? [];
  let score = 0;
  for (const keyword of keywords) {
    if (haystackHasKeyword(haystack, keyword)) {
      score += 2;
    }
  }
  if (haystackHasKeyword(haystack, category)) {
    score += 3;
  }
  return score;
}

function scoreWorkflowForModel(
  file: Pick<ComfyWorkflowFile, 'name' | 'filename'> &
    Partial<Pick<ComfyWorkflowFile, 'workflowJson'>>,
  modelId: ComfyImageModel,
  category: ComfyModelCategory
): number {
  let score = scoreWorkflowForCategory(file, category);
  const haystack = `${file.name} ${file.filename ?? ''}`.toLowerCase();
  const modelKeywords = MODEL_WORKFLOW_KEYWORDS[modelId];
  if (modelKeywords) {
    for (const keyword of modelKeywords) {
      if (haystackHasKeyword(haystack, keyword)) {
        score += 3;
      }
    }
  }

  const avoidKeywords = MODEL_WORKFLOW_AVOID_KEYWORDS[modelId];
  if (avoidKeywords) {
    for (const keyword of avoidKeywords) {
      if (haystackHasKeyword(haystack, keyword)) {
        // Version / family mismatches (2511 vs 2512, sfw vs nsfw) must zero out the match.
        score -= 20;
      }
    }
  }

  const requiresInput = workflowRequiresInputImage(file.workflowJson);
  if (requiresInput && !isEditCapableModel(modelId)) {
    score -= 25;
  } else if (!requiresInput && isEditCapableModel(modelId)) {
    score -= 2;
  }

  if (workflowLabelImpliesLightning(file)) {
    const steps = inferLightningStepCount(file);
    if (steps === 4) {
      if (modelId.includes('lightning-8')) {
        score -= 4;
      }
      if (modelId.includes('lightning-4')) {
        score += 4;
      }
    }
    if (steps === 8) {
      if (modelId.includes('lightning-4')) {
        score -= 4;
      }
      if (modelId.includes('lightning-8')) {
        score += 4;
      }
    }
    // Vanilla / non-Lightning Qwen must not claim Lightning LoRA graphs.
    if (!modelId.includes('lightning')) {
      score -= 10;
    }
  } else if (modelId.includes('lightning')) {
    // Prefer labeled Lightning workflows for Lightning model ids.
    score -= 3;
  }

  score += scoreWorkflowStackForModel(file.workflowJson, modelId);
  score += scoreWorkflowGraphStructure(file.workflowJson, modelId);

  if (modelId.includes('lightning') && file.workflowJson?.trim()) {
    try {
      const parsed = JSON.parse(file.workflowJson) as Record<string, unknown>;
      if (workflowHasLoraLoader(parsed)) {
        score += 6;
      }
    } catch {
      // ignore invalid workflow JSON during ranking
    }
  }

  return score;
}

/**
 * Bonus from node-class / graph shape (not filenames). Lets poorly labeled
 * official packs still rank above scaffolds when the graph is clearly for the model.
 */
export function scoreWorkflowGraphStructure(
  workflowJson: string | undefined,
  modelId: ComfyImageModel
): number {
  if (!workflowJson?.trim()) {
    return 0;
  }
  const def = COMFY_IMAGE_MODELS.find(entry => entry.id === modelId);
  const category = def?.category;
  let score = 0;

  if (category === 'qwen') {
    if (/TextEncodeQwenImageEdit(?:Plus)?/.test(workflowJson)) {
      score += isEditCapableModel(modelId) ? 6 : -4;
    } else if (/TextEncodeQwenImage/.test(workflowJson)) {
      score += isEditCapableModel(modelId) ? 2 : 5;
    }
    if (/ModelSamplingAuraFlow|ModelSamplingSD3/.test(workflowJson)) {
      score += 1;
    }
    if (isQwenRapidAioModel(modelId)) {
      if (/CheckpointLoader(?:Simple)?/.test(workflowJson)) {
        score += 4;
      }
      if (
        /UNETLoader|UnetLoaderGGUF/.test(workflowJson) &&
        !/CheckpointLoader(?:Simple)?/.test(workflowJson)
      ) {
        score -= 6;
      }
    }
  }

  if (category === 'flux') {
    if (/FluxGuidance|ModelSamplingFlux|FluxKontext/.test(workflowJson)) {
      score += 4;
    }
    if (/flux-2-klein/i.test(modelId)) {
      if (/CLIPLoader[\s\S]{0,120}"type"\s*:\s*"flux2"|flux2-klein/i.test(workflowJson)) {
        score += 3;
      }
    } else if (/DualCLIPLoader|clip_l|t5xxl/i.test(workflowJson)) {
      score += 2;
    }
  }

  if (/z-image/i.test(modelId)) {
    if (/z_image|z-image|zimage/i.test(workflowJson)) {
      score += 5;
    }
    if (/ModelSamplingAuraFlow/.test(workflowJson)) {
      score += 2;
    }
    if (/CLIPLoader[\s\S]{0,160}"type"\s*:\s*"lumina2"/i.test(workflowJson)) {
      score += 3;
    }
    if (/qwen_3_4b/i.test(workflowJson)) {
      score += 2;
    }
    if (modelId.includes('turbo')) {
      if (/turbo/i.test(workflowJson)) {
        score += 4;
      }
      if (!/turbo/i.test(workflowJson) && /z_image_bf16/i.test(workflowJson)) {
        score -= 4;
      }
    } else if (/turbo/i.test(workflowJson)) {
      score -= 6;
    }
  }

  if (/boogu-image-edit/i.test(modelId)) {
    if (/boogu|TextEncodeBooguEdit/i.test(workflowJson)) {
      score += 5;
    }
    if (/ModelSamplingAuraFlow/.test(workflowJson)) {
      score += 2;
    }
    if (/CLIPLoader[\s\S]{0,160}"type"\s*:\s*"boogu"/i.test(workflowJson)) {
      score += 3;
    }
    if (/qwen3vl_8b/i.test(workflowJson)) {
      score += 2;
    }
    if (modelId.includes('turbo')) {
      if (/edit_turbo|edit turbo/i.test(workflowJson)) {
        score += 4;
      }
      if (!/turbo/i.test(workflowJson) && /boogu_image_edit_bf16/i.test(workflowJson)) {
        score -= 4;
      }
    } else if (/edit_turbo|edit turbo/i.test(workflowJson)) {
      score -= 6;
    }
  }

  if (/^boogu-image(?!-edit)/i.test(modelId)) {
    if (/boogu|CLIPLoader[\s\S]{0,160}"type"\s*:\s*"boogu"/i.test(workflowJson)) {
      score += 5;
    }
    if (/ModelSamplingAuraFlow/.test(workflowJson)) {
      score += 2;
    }
    if (/qwen3vl_8b/i.test(workflowJson)) {
      score += 2;
    }
    if (!/TextEncodeBooguEdit/i.test(workflowJson)) {
      score += 2;
    }
    if (modelId.includes('turbo')) {
      if (/turbo/i.test(workflowJson) && !/edit/i.test(workflowJson)) {
        score += 4;
      }
      if (/boogu_image_base/i.test(workflowJson)) {
        score -= 4;
      }
    } else if (/edit/i.test(workflowJson) || /boogu_image_edit/i.test(workflowJson)) {
      score -= 6;
    } else if (/turbo/i.test(workflowJson) && !/base/i.test(workflowJson)) {
      score -= 4;
    }
  }

  if (category === 'video') {
    if (
      /WanImageToVideo|WanCameraImageToVideo|HunyuanImageToVideo|LTXVImgToVideo/.test(workflowJson)
    ) {
      score += 6;
    }
    if (
      /EmptyHunyuanLatentVideo|EmptyLTXVLatentVideo|WanVideo|HunyuanVideoTextEncode|LTXVConditioning|LTXVScheduler/.test(
        workflowJson
      )
    ) {
      score += 3;
    }
  }

  // Generic: concrete sampler + latent/empty image is a runnable graph signal.
  if (
    /KSampler(?:Advanced)?/.test(workflowJson) &&
    /EmptyLatentImage|EmptySD3LatentImage|EmptyHunyuanLatentVideo|EmptyLTXVLatentVideo/.test(
      workflowJson
    )
  ) {
    score += 1;
  }

  return score;
}

export function rankWorkflowFilesForModel(
  model: ComfyImageModel,
  files: ComfyWorkflowFile[]
): Array<{ file: ComfyWorkflowFile; score: number }> {
  const def = COMFY_IMAGE_MODELS.find(entry => entry.id === model);
  const category = def?.category ?? 'other-dit';
  return files
    .map(file => ({
      file,
      score: scoreWorkflowForModel(file, model, category),
    }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function suggestWorkflowDefaultsByCategory(files: ComfyWorkflowFile[]): ModelWorkflowMap {
  const map: ModelWorkflowMap = {};

  for (const model of COMFY_IMAGE_MODELS) {
    const ranked = [...files]
      .map(file => ({
        file,
        score: scoreWorkflowForModel(file, model.id, model.category),
      }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    if (ranked.length === 0) {
      continue;
    }

    map[model.id] = ranked[0]!.file.id;
  }

  return map;
}

/** Guess compatible models from workflow name/filename when no assignment map entry exists. */
export function inferModelsFromWorkflowLabel(input: {
  name: string;
  filename?: string;
}): ComfyImageModel[] {
  const scored = COMFY_IMAGE_MODELS.map(model => ({
    model: model.id,
    score: scoreWorkflowForModel(input, model.id, model.category),
  }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return [];
  }

  const topScore = scored[0]!.score;
  return scored.filter(entry => entry.score >= topScore - 1).map(entry => entry.model);
}

export function mergeModelWorkflowMap(
  current: ModelWorkflowMap | undefined,
  suggested: ModelWorkflowMap,
  overwrite = false
): ModelWorkflowMap {
  const next: ModelWorkflowMap = { ...(current ?? {}) };
  for (const [modelId, workflowId] of Object.entries(suggested)) {
    if (overwrite || !next[modelId]) {
      next[modelId as ComfyImageModel] = workflowId;
    }
  }
  return next;
}

export function countMappedModels(map: ModelWorkflowMap): number {
  return Object.keys(map).length;
}

/** True when the workflow label looks like a Lightning LoRA pipeline. */
export function workflowLabelImpliesLightning(input: { name: string; filename?: string }): boolean {
  const haystack = `${input.name} ${input.filename ?? ''}`.toLowerCase();
  return (
    haystack.includes('lightning') ||
    haystack.includes('lightening') ||
    haystack.includes('lightx2v')
  );
}

/** Infer 4- vs 8-step Lightning from workflow filename when possible. */
export function inferLightningStepCount(input: {
  name: string;
  filename?: string;
}): 4 | 8 | undefined {
  const haystack = `${input.name} ${input.filename ?? ''}`.toLowerCase();
  if (
    /(?:lightning|lightening|lightx2v)[\s_-]*4\b/.test(haystack) ||
    /(^|[^0-9])4[\s-]?step/.test(haystack) ||
    haystack.includes('4steps')
  ) {
    return 4;
  }
  if (
    /(?:lightning|lightening|lightx2v)[\s_-]*8\b/.test(haystack) ||
    /(^|[^0-9])8[\s-]?step/.test(haystack) ||
    haystack.includes('8steps')
  ) {
    return 8;
  }
  return undefined;
}
