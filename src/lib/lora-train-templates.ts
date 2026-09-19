/**
 * First-party sd-scripts / kohya argv templates for LoRA training.
 * TRAINER_URL / TRAINER_COMMAND remain the power-user escape hatch.
 */

import { clampTrainProgress } from './lora-train-job';

export type LoraTrainTemplateId = 'kohya-sdxl' | 'kohya-sd15' | 'kohya-flux';

export type LoraTrainTemplateInfo = {
  id: LoraTrainTemplateId;
  label: string;
  description: string;
  defaultRank: number;
  defaultSteps: number;
  defaultResolution: number;
};

export const LORA_TRAIN_TEMPLATES: readonly LoraTrainTemplateInfo[] = [
  {
    id: 'kohya-sdxl',
    label: 'Kohya SDXL',
    description: 'sd-scripts train_network.py for SDXL / Illustrious-family bases',
    defaultRank: 16,
    defaultSteps: 1500,
    defaultResolution: 1024,
  },
  {
    id: 'kohya-sd15',
    label: 'Kohya SD 1.5',
    description: 'sd-scripts train_network.py for SD 1.5 bases',
    defaultRank: 16,
    defaultSteps: 1200,
    defaultResolution: 512,
  },
  {
    id: 'kohya-flux',
    label: 'Kohya FLUX',
    description: 'sd-scripts train_network.py for FLUX.1 (networks.lora_flux)',
    defaultRank: 16,
    defaultSteps: 1000,
    defaultResolution: 1024,
  },
] as const;

export type KohyaTrainArgvParams = {
  /** Absolute path to train_network.py (or a wrapper). */
  scriptPath: string;
  datasetPath: string;
  outputDir: string;
  /** Stem without .safetensors — kohya --output_name. */
  outputName: string;
  pretrainedModel: string;
  networkRank?: number;
  maxTrainSteps?: number;
  resolution?: number;
  learningRate?: number;
  /** Passed as --output_name / captions already include the trigger. */
  trigger?: string;
  /** Extra argv appended after the template (power-user). */
  extraArgs?: string[];
};

export function normalizeLoraTrainTemplateId(value: unknown): LoraTrainTemplateId | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const id = value.trim() as LoraTrainTemplateId;
  return LORA_TRAIN_TEMPLATES.some(entry => entry.id === id) ? id : undefined;
}

export function getLoraTrainTemplate(
  id: LoraTrainTemplateId | string | undefined
): LoraTrainTemplateInfo {
  const normalized = normalizeLoraTrainTemplateId(id) ?? 'kohya-sdxl';
  return LORA_TRAIN_TEMPLATES.find(entry => entry.id === normalized) ?? LORA_TRAIN_TEMPLATES[0]!;
}

function clampPositiveInt(value: unknown, fallback: number, max = 100_000): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(1, Math.floor(value)));
}

function networkModuleForTemplate(id: LoraTrainTemplateId): string {
  return id === 'kohya-flux' ? 'networks.lora_flux' : 'networks.lora';
}

/**
 * Build argv for `python train_network.py …` (no shell).
 * Dataset folder should contain `{repeats}_{token}/` image+caption pairs
 * (see persistLoraDatasetFiles).
 */
export function buildKohyaTrainArgv(
  templateId: LoraTrainTemplateId | string | undefined,
  params: KohyaTrainArgvParams
): string[] {
  const template = getLoraTrainTemplate(templateId);
  const script = params.scriptPath.trim();
  if (!script) {
    throw new Error('Kohya script path is required (TRAINER_KOHYA_SCRIPT or Settings).');
  }
  const datasetPath = params.datasetPath.trim();
  const outputDir = params.outputDir.trim();
  const outputName = params.outputName.trim().replace(/\.safetensors$/i, '');
  const pretrained = params.pretrainedModel.trim();
  if (!datasetPath || !outputDir || !outputName || !pretrained) {
    throw new Error('datasetPath, outputDir, outputName, and pretrainedModel are required.');
  }

  const rank = clampPositiveInt(params.networkRank, template.defaultRank, 256);
  const steps = clampPositiveInt(params.maxTrainSteps, template.defaultSteps, 50_000);
  const resolution = clampPositiveInt(params.resolution, template.defaultResolution, 2048);
  const lr =
    typeof params.learningRate === 'number' &&
    Number.isFinite(params.learningRate) &&
    params.learningRate > 0
      ? params.learningRate
      : 1e-4;

  const argv = [
    script,
    `--pretrained_model_name_or_path=${pretrained}`,
    `--train_data_dir=${datasetPath}`,
    `--output_dir=${outputDir}`,
    `--output_name=${outputName}`,
    `--resolution=${resolution}`,
    `--network_module=${networkModuleForTemplate(template.id)}`,
    `--network_dim=${rank}`,
    `--network_alpha=${rank}`,
    `--max_train_steps=${steps}`,
    `--learning_rate=${lr}`,
    '--lr_scheduler=cosine',
    '--lr_warmup_steps=0',
    '--train_batch_size=1',
    '--save_model_as=safetensors',
    '--mixed_precision=fp16',
    '--save_every_n_epochs=1',
    '--caption_extension=.txt',
    '--shuffle_caption',
    '--cache_latents',
    '--seed=42',
  ];

  for (const extra of params.extraArgs ?? []) {
    const part = extra.trim();
    if (part) {
      argv.push(part);
    }
  }

  return argv;
}

/**
 * Parse a progress fraction (0–1) from kohya / tqdm stdout lines.
 * Returns null when the line has no recognizable step counter.
 */
export function parseKohyaTrainProgress(line: string): number | null {
  const text = line.trim();
  if (!text) {
    return null;
  }

  const stepsMatch =
    /(?:steps?|iter(?:ation)?s?)\s*[:=]?\s*(\d+)\s*\/\s*(\d+)/i.exec(text) ??
    /(?:epoch|global_step)\s*[:=]?\s*(\d+)\s*\/\s*(\d+)/i.exec(text);
  if (stepsMatch) {
    const current = Number(stepsMatch[1]);
    const total = Number(stepsMatch[2]);
    if (total > 0 && Number.isFinite(current)) {
      return clampTrainProgress(current / total);
    }
  }

  // tqdm: "45%|████| 450/1000 […]"
  const tqdmMatch = /(\d+)\s*\/\s*(\d+)\s*\[/.exec(text);
  if (tqdmMatch) {
    const current = Number(tqdmMatch[1]);
    const total = Number(tqdmMatch[2]);
    if (total > 0 && Number.isFinite(current)) {
      return clampTrainProgress(current / total);
    }
  }

  const pctMatch = /\b(\d{1,3}(?:\.\d+)?)\s*%/.exec(text);
  if (pctMatch) {
    const pct = Number(pctMatch[1]);
    if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
      return clampTrainProgress(pct / 100);
    }
  }

  return null;
}

/** Basename stem for kohya --output_name from a path or filename. */
export function loraOutputStem(outputPath: string): string {
  const trimmed = outputPath.trim() || 'lora';
  const base = trimmed.split(/[/\\]/).pop() || 'lora';
  return base.replace(/\.safetensors$/i, '') || 'lora';
}

/** Suggest a repeats-prefixed subfolder name for kohya train_data_dir. */
export function kohyaDatasetBucketName(trigger: string, repeats = 10): string {
  const token =
    trigger
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'subject';
  const n = clampPositiveInt(repeats, 10, 100);
  return `${n}_${token}`;
}
