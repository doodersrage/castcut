import {
  normalizeQueueQualityProfile,
  profileSkipsOutputUpscaleForModel,
  profileUsesUpscaleEnrich,
  upscaleMethodForProfile,
  upscaleScaleForProfile,
  type QueueQualityProfile,
} from '../queue/quality-profile';

/** Output polish applied after Diffusers decode (mirrors Comfy ImageScaleBy enrich). */
export type DiffusersOutputPost = {
  scale: number;
  method: 'lanczos' | 'area' | 'bilinear' | 'bicubic';
  /** Soft Gaussian before upscale — Diffusers Lightning rings harder than Comfy. */
  moireBlurSigma: number;
  /** Max-only mild bicubic↓ factor; 1 = skip resample restore. */
  moireDownscale: number;
};

function isLightningStudioModel(model?: string): boolean {
  return Boolean(model && /lightning-(4|8)\b/i.test(model));
}

function isVanillaQwenStudioModel(model?: string): boolean {
  return Boolean(model && (/^qwen-image-2512$/i.test(model) || /^qwen-image-2\.0$/i.test(model)));
}

/**
 * Resolve Final/Max size + anti-moiré polish for native Diffusers txt2img.
 * Draft / followSettings → no post.
 */
export function resolveDiffusersOutputPost(options: {
  qualityProfile?: QueueQualityProfile | string | null;
  /** Studio model id (e.g. qwen-image-2512-lightning-8), not the weight filename. */
  studioModel?: string | null;
  hasInputImage?: boolean;
}): DiffusersOutputPost | null {
  const profile = normalizeQueueQualityProfile(options.qualityProfile);
  if (!profileUsesUpscaleEnrich(profile)) {
    return null;
  }
  const model = options.studioModel?.trim() || undefined;
  const scaleOpts = {
    model,
    hasInputImage: options.hasInputImage,
  };
  if (profileSkipsOutputUpscaleForModel(profile, scaleOpts)) {
    return null;
  }
  const scale = upscaleScaleForProfile(profile, scaleOpts);
  if (!(scale > 1.001)) {
    return null;
  }

  const lightning = isLightningStudioModel(model);
  const vanillaQwen = isVanillaQwenStudioModel(model);

  // Diffusers Lightning: bicubic rings less than Lanczos on VAE screen-door;
  // keep Comfy's scale targets. Soft blur σ matches Rapid AIO Final/Max.
  let method: DiffusersOutputPost['method'] = upscaleMethodForProfile(profile, {
    model,
  });
  let moireBlurSigma = 0;
  let moireDownscale = 1;
  if (lightning) {
    method = 'bicubic';
    moireBlurSigma = profile === 'max' ? 0.5 : 0.4;
    moireDownscale = profile === 'max' ? 0.92 : 1;
  } else if (vanillaQwen) {
    moireBlurSigma = profile === 'max' ? 0.4 : 0.3;
  }

  return {
    scale,
    method,
    moireBlurSigma,
    moireDownscale,
  };
}
