import { getComfyModelDefinition } from './comfy-models/client';
import { SUGGESTED_MODEL_CHECKPOINT_MAP } from './model-checkpoint-map';

function exactInventoryMatch(
  preferred: string | undefined,
  inventory: string[]
): string | undefined {
  const trimmed = preferred?.trim();
  if (!trimmed || inventory.length === 0) {
    return undefined;
  }
  const exact = inventory.find(entry => entry === trimmed);
  if (exact) {
    return exact;
  }
  const lower = trimmed.toLowerCase();
  return inventory.find(entry => entry.toLowerCase() === lower);
}

/** Score WAN/Hunyuan/LTX candidates so 2.2 / Rapid AIO beat older 2.1 defaults. */
export function scoreVideoWeightFilename(model: string, filename: string): number {
  const lower = filename.toLowerCase();
  let score = 0;
  if (model === 'hunyuan-video') {
    if (/hunyuan|hy[-_]?video/.test(lower)) score += 100;
  } else if (model === 'ltx-video') {
    if (/ltx/.test(lower)) score += 100;
  } else if (/wan/.test(lower)) {
    score += 100;
  }
  const version = /(?:wan|ltx|hunyuan)[^\d]*(\d+(?:\.\d+)?)/i.exec(filename);
  if (version?.[1]) {
    score += Number.parseFloat(version[1]) * 20;
  }
  const billions = /(\d+(?:\.\d+)?)\s*b\b/i.exec(filename);
  if (billions?.[1]) {
    score += Number.parseFloat(billions[1]);
  }
  // Castcut video scaffolds are I2V/AIO-oriented; prefer Rapid AIO packs
  // over official dual-noise T2V weights when both are installed.
  if (/rapid|aio/i.test(filename)) score += 20;
  if (/i2v/i.test(filename)) score += 8;
  if (/high[_\s-]?noise/i.test(filename)) score += 2;
  if (/t2v/i.test(filename)) score += 1;
  if (/fp8/i.test(filename)) score -= 0.5;
  return score;
}

/** Prefer installed WAN/Hunyuan/LTX weights for the video scaffold loader. */
export function pickVideoCheckpointFromInventory(
  model: string,
  inventory: string[]
): string | undefined {
  if (inventory.length === 0) {
    return undefined;
  }
  // Same family only — a Hunyuan UNET is not a WAN Rapid AIO stand-in, and
  // CheckpointLoaderSimple cannot load diffusion_models files.
  const preferredPatterns =
    model === 'hunyuan-video'
      ? [/hunyuan/i, /hy[-_]?video/i]
      : model === 'ltx-video'
        ? [/ltx/i]
        : [/wan/i];

  const matched = inventory.filter(name => preferredPatterns.some(pattern => pattern.test(name)));
  if (matched.length > 0) {
    return matched
      .slice()
      .sort((a, b) => scoreVideoWeightFilename(model, b) - scoreVideoWeightFilename(model, a))[0];
  }

  const hinted =
    getComfyModelDefinition(model)?.checkpointHint ?? SUGGESTED_MODEL_CHECKPOINT_MAP[model];
  // Only return a suggested name when that exact weight is installed.
  return exactInventoryMatch(hinted, inventory);
}

export function isVideoCheckpointMapKey(model: string): boolean {
  return (
    model === 'wan-video' ||
    model === 'wan-video-rapid-aio' ||
    model === 'wan-video-lightning-4' ||
    model === 'hunyuan-video' ||
    model === 'ltx-video'
  );
}
