/**
 * Server-only: run the Anatomy finish pass (see anatomy-finish.ts) in ComfyUI and return the
 * finished still as a ComfyUI input ref.
 */

import sharp from 'sharp';
import {
  ANATOMY_FINISH_LORA_RE,
  ANATOMY_FINISH_SAVE_NODE,
  ANATOMY_FINISH_SIZE,
  anatomyBoxFromPose,
  buildAnatomyFinishGraph,
  colourMatch,
  firstPersonKeypoints,
} from '@/lib/anatomy-finish';
import { castcutPoseJson } from '@/lib/castcut-routes-server';
import { uploadComfyInputContent } from '@/lib/comfy-input-upload-server';
import {
  comfyBaseUrl,
  parseComfyViewRef,
  resolveComfyNode,
  runComfyUtilityGraph,
  type ComfyImageRef,
  type ComfyNodeInfo,
} from '@/lib/comfy-utility-graph-server';
import {
  QWEN_IMAGE_21_FILES,
  QWEN_IMAGE_21_TURBO_LORA,
  QWEN_IMAGE_21_TURBO_UNET,
} from '@/lib/qwen-image-21-renderer';

export type AnatomyFinishResult =
  { available: true; image: ComfyImageRef } | { available: false; reason: string };

/** A loader's file options (`[[…]]` on older ComfyUI, `["COMBO", { options }]` on newer). */
function fileOptions(info: ComfyNodeInfo | undefined, input: string): string[] {
  const spec = (info?.input?.required as Record<string, unknown> | undefined)?.[input];
  if (!Array.isArray(spec)) return [];
  const [type, config] = spec as [unknown, unknown];
  if (Array.isArray(type)) return type.filter((v): v is string => typeof v === 'string');
  const options = (config as { options?: unknown } | undefined)?.options;
  return Array.isArray(options) ? options.filter((v): v is string => typeof v === 'string') : [];
}

const has = (options: string[], name: string) =>
  options.some(
    option => option === name || option.endsWith(`/${name}`) || option.endsWith(`\\${name}`)
  );

async function readComfyImage(baseUrl: string, ref: ComfyImageRef): Promise<Buffer> {
  const params = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder ?? '',
    type: ref.type || 'output',
  });
  const view = await fetch(`${baseUrl}/view?${params.toString()}`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!view.ok) throw new Error(`Could not read the image from ComfyUI (HTTP ${view.status}).`);
  return Buffer.from(await view.arrayBuffer());
}

async function channelStats(image: Buffer): Promise<{ mean: number[]; std: number[] }> {
  const stats = await sharp(image).removeAlpha().stats();
  return {
    mean: stats.channels.slice(0, 3).map(channel => channel.mean),
    std: stats.channels.slice(0, 3).map(channel => channel.stdev),
  };
}

/** A soft oval mask (one channel) of `size`: opaque in the middle, faded to the square's edge. */
async function softOval(size: number): Promise<Buffer> {
  const r = size * 0.38;
  const blur = Math.max(4, size * 0.07);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="black"/><ellipse cx="${size / 2}" cy="${size / 2}" rx="${r}" ry="${r}" fill="white"/></svg>`;
  return sharp(Buffer.from(svg)).blur(blur).extractChannel(0).raw().toBuffer();
}

export async function runAnatomyFinishInComfy(input: {
  imageUrl: string;
  comfyUrl?: string;
  seed?: number;
  timeoutMs?: number;
}): Promise<AnatomyFinishResult> {
  const stillRef = parseComfyViewRef(input.imageUrl);
  if (!stillRef) return { available: false, reason: 'The still is not a ComfyUI image.' };
  const baseUrl = comfyBaseUrl(input.comfyUrl);

  const [lora, unet, clip, vae] = await Promise.all([
    resolveComfyNode(baseUrl, ['LoraLoaderModelOnly']),
    resolveComfyNode(baseUrl, ['UNETLoader']),
    resolveComfyNode(baseUrl, ['CLIPLoader']),
    resolveComfyNode(baseUrl, ['VAELoader']),
  ]);
  const loras = fileOptions(lora?.info, 'lora_name');
  const anatomyLora = loras.find(name => ANATOMY_FINISH_LORA_RE.test(name));
  if (!anatomyLora) {
    return {
      available: false,
      reason:
        'the anatomy LoRA (FemaledVaginus-NSFW for Qwen-Image 2.1, Civitai 2986844) is not in ComfyUI models/loras.',
    };
  }
  const unets = fileOptions(unet?.info, 'unet_name');
  const turboCheckpoint = has(unets, QWEN_IMAGE_21_TURBO_UNET);
  const turboOnBase =
    !turboCheckpoint &&
    has(unets, QWEN_IMAGE_21_FILES.unet) &&
    has(loras, QWEN_IMAGE_21_TURBO_LORA);
  if (!turboCheckpoint && !turboOnBase) {
    return { available: false, reason: 'Qwen-Image 2.1 Turbo is not installed.' };
  }
  if (
    !has(fileOptions(clip?.info, 'clip_name'), QWEN_IMAGE_21_FILES.clip) ||
    !has(fileOptions(vae?.info, 'vae_name'), QWEN_IMAGE_21_FILES.vae)
  ) {
    return { available: false, reason: "Qwen-Image 2.1's text encoder or VAE is missing." };
  }

  const pose = await castcutPoseJson(baseUrl, { image: stillRef });
  const keypoints = pose ? firstPersonKeypoints(pose) : null;
  const still = await readComfyImage(baseUrl, stillRef);
  const meta = await sharp(still).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const box = keypoints && width && height ? anatomyBoxFromPose(keypoints, width, height) : null;
  if (!box) return { available: false, reason: 'could not find her hips in the still.' };

  const original = await sharp(still)
    .extract({ left: box.x, top: box.y, width: box.size, height: box.size })
    .removeAlpha()
    .png()
    .toBuffer();
  const crop = await sharp(original)
    .resize(ANATOMY_FINISH_SIZE, ANATOMY_FINISH_SIZE, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
  const staged = await uploadComfyInputContent({
    baseUrl,
    bytes: new Uint8Array(crop),
    filename: 'anatomy-finish-crop.png',
    mimeType: 'image/png',
    timeoutMs: 30000,
  });
  const cropName = staged.subfolder ? `${staged.subfolder}/${staged.name}` : staged.name;

  const run = await runComfyUtilityGraph({
    baseUrl,
    label: 'anatomy-finish',
    timeoutMs: input.timeoutMs ?? 240_000,
    prompt: buildAnatomyFinishGraph({
      cropName,
      unet: turboCheckpoint ? QWEN_IMAGE_21_TURBO_UNET : QWEN_IMAGE_21_FILES.unet,
      turboLora: turboCheckpoint ? null : QWEN_IMAGE_21_TURBO_LORA,
      clip: QWEN_IMAGE_21_FILES.clip,
      vae: QWEN_IMAGE_21_FILES.vae,
      anatomyLora,
      seed: input.seed,
    }),
    read: entry => {
      const image = (
        entry.outputs?.[ANATOMY_FINISH_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined
      )?.images?.[0];
      return image?.filename ? image : undefined;
    },
  });
  if (!run.result) return { available: false, reason: 'Anatomy finish produced no image.' };

  const rendered = await readComfyImage(baseUrl, {
    filename: run.result.filename,
    subfolder: run.result.subfolder ?? '',
    type: run.result.type ?? 'output',
  });
  const patch = await sharp(rendered)
    .resize(box.size, box.size, { kernel: 'lanczos3' })
    .removeAlpha()
    .png()
    .toBuffer();
  const { gain, offset } = colourMatch(await channelStats(patch), await channelStats(original));
  const matched = await sharp(patch).linear(gain, offset).removeAlpha().raw().toBuffer();
  const mask = await softOval(box.size);
  const withAlpha = await sharp(matched, {
    raw: { width: box.size, height: box.size, channels: 3 },
  })
    .joinChannel(mask, { raw: { width: box.size, height: box.size, channels: 1 } })
    .png()
    .toBuffer();
  const finished = await sharp(still)
    .removeAlpha()
    .composite([{ input: withAlpha, left: box.x, top: box.y }])
    .png()
    .toBuffer();
  const uploaded = await uploadComfyInputContent({
    baseUrl,
    bytes: new Uint8Array(finished),
    filename: 'anatomy-finish.png',
    mimeType: 'image/png',
    timeoutMs: 30000,
  });
  return {
    available: true,
    image: { filename: uploaded.name, subfolder: uploaded.subfolder ?? '', type: 'input' },
  };
}
