import type { ComfyImageModel } from './comfy-models/client';
import { isFluxFineTuneCheckpointModel } from './model-checkpoint-map';
import { isKleinBaseModel } from './model-sampler-defaults';
import { modelUsesNegativePrompt } from './prompt-pair';

export type RenderRealismMode = 'off' | 'realistic' | 'hyper-realistic' | 'anime';

export const DEFAULT_RENDER_REALISM_MODE: RenderRealismMode = 'realistic';

export const RENDER_REALISM_OPTIONS: {
  id: RenderRealismMode;
  label: string;
  description: string;
}[] = [
  {
    id: 'off',
    label: 'Off',
    description: 'Use prompts as generated — no style steering.',
  },
  {
    id: 'realistic',
    label: 'Realistic',
    description: 'Photoreal cues and artifact guards for natural renders.',
  },
  {
    id: 'hyper-realistic',
    label: 'Hyper-realistic',
    description: 'Maximum detail, texture, and DSLR-style fidelity.',
  },
  {
    id: 'anime',
    label: 'Anime',
    description: 'Cel-shaded animation look — stylized, not photographic.',
  },
];

const REALISM_POSITIVE_SUFFIX: Record<Exclude<RenderRealismMode, 'off'>, string> = {
  realistic:
    'photorealistic, natural lighting, realistic skin texture with subtle pores, soft highlight rolloff, not airbrushed, accurate anatomy, fine surface detail, cinematic depth of field',
  'hyper-realistic':
    'hyperrealistic photography, natural skin micro-texture and pores, lifelike materials, studio-grade lighting, clean focus without oversharpening, professional DSLR quality',
  anime:
    'anime illustration, cel shading, clean line art, vibrant color palette, expressive character design, dynamic composition, studio animation quality',
};

const REALISM_NEGATIVE_EXTRA: Record<Exclude<RenderRealismMode, 'off'>, string> = {
  realistic:
    'cartoon, anime, illustration, painting, CGI look, plastic skin, oversaturated, doll-like, blurry, low quality, watermark, text, deformed anatomy, extra limbs, extra fingers, stick figure, stickman, wireframe, pose diagram, schematic, skeleton line art',
  'hyper-realistic':
    'cartoon, anime, illustration, painting, 3D render, CGI, plastic skin, waxy skin, airbrushed, oversharpened halos, uncanny valley, blurry, low quality, watermark, text, deformed anatomy, extra fingers, stick figure, stickman, wireframe, pose diagram, schematic, skeleton line art',
  anime:
    'photorealistic, realistic photo, live action, 3D render, CGI, plastic skin, waxy skin, oversaturated, blurry, low quality, watermark, text, western cartoon, bad anatomy, extra limbs, stick figure, stickman, wireframe, pose diagram, schematic',
};

const FLUX_REALISM_AVOID: Record<Exclude<RenderRealismMode, 'off'>, string> = {
  realistic:
    'Avoid cartoon, illustration, and obvious CGI artifacts. Keep natural skin texture and believable lighting.',
  'hyper-realistic':
    'Avoid cartoon, illustration, CGI, plastic or waxy skin, and uncanny artifacts. Preserve lifelike micro-detail and clean optics.',
  anime:
    'Avoid photorealistic, photographic, and live-action looks. Keep stylized anime and animation aesthetics with clean cel shading.',
};

const KLEIN_BASE_FLUX_PHOTO_POSITIVE: Record<
  Exclude<RenderRealismMode, 'off' | 'anime'>,
  string
> = {
  realistic:
    'candid unretouched RAW photograph, full rectangular camera frame, true-color neutral white balance, visible film grain and mild sensor noise, matte skin with visible pores freckles soft peach fuzz and subtle blotchy undertones, mild under-eye texture, broken specular highlights, single motivated outdoor key light with soft contact shadows, irregular real-world clouds, chaotic non-repeating water and foam, weathered imperfect materials with dirt and wear, photographic depth of field',
  'hyper-realistic':
    'candid unretouched RAW photograph, full rectangular camera frame, true-color neutral white balance, visible film grain and mild sensor noise, matte skin micro-texture pores freckles soft peach fuzz and subtle blotchy undertones, mild under-eye texture, broken specular highlights, single motivated outdoor key light with soft shadow falloff, irregular real-world clouds, chaotic non-repeating water and foam, weathered imperfect materials with dirt and wear, documentary realism',
};

/** Klein Base uses KSampler CFG — plastic/CGI/scene-fake terms belong in the negative slot. */
const KLEIN_BASE_PLASTIC_NEGATIVE: Record<Exclude<RenderRealismMode, 'off' | 'anime'>, string> = {
  realistic:
    'plastic skin, waxy skin, shiny doll skin, porcelain skin, airbrushed beauty skin, oversmoothed skin, CGI, 3D render, luxury product render, illustration, video-game art, ornamental floral frame, decorative graphic border, circular vignette, fisheye distortion, barrel distortion, extra fingers, fused fingers, malformed hands, monochromatic pink wash, dreamcore glow, beauty filter, studio softbox beauty lighting, flat even outdoor lighting, perfect texture-mapped sand, glossy helmet hair, identical clone flowers, puffy identical blob clouds, repeating foam lines, procedural tiled textures, perfect clean CGI architecture, surreal prop artifacts',
  'hyper-realistic':
    'plastic skin, waxy skin, shiny doll skin, porcelain skin, airbrushed beauty skin, oversmoothed skin, CGI, 3D render, luxury product render, illustration, painting, video-game art, ornamental floral frame, decorative graphic border, circular vignette, fisheye distortion, barrel distortion, extra fingers, fused fingers, malformed hands, monochromatic pink wash, dreamcore glow, beauty filter, editorial fashion CGI, studio softbox beauty lighting, flat even outdoor lighting, perfect texture-mapped sand, glossy helmet hair, identical clone flowers, puffy identical blob clouds, repeating foam lines, procedural tiled textures, perfect clean CGI architecture, surreal prop artifacts',
};

/** Skin harden alone still leaves CGI skies/water — require scene material cues too. */
function kleinPromptHasStrongPhotoHarden(prompt: string): boolean {
  const hasSkin =
    /\b(matte skin|unretouched|visible pores|broken specular|peach fuzz|skin unevenness)\b/i.test(
      prompt
    );
  const hasScene =
    /\b(irregular (?:real-world )?clouds|chaotic non-repeating|weathered imperfect|film grain|sensor noise)\b/i.test(
      prompt
    );
  return hasSkin && hasScene;
}

export function normalizeRenderRealismMode(value: unknown): RenderRealismMode {
  if (value === 'animation') {
    return 'anime';
  }
  if (
    value === 'realistic' ||
    value === 'hyper-realistic' ||
    value === 'anime' ||
    value === 'off'
  ) {
    return value;
  }
  return DEFAULT_RENDER_REALISM_MODE;
}

function mergeCommaList(base: string | undefined, extra: string): string {
  const parts = `${base ?? ''}, ${extra}`
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(part);
  }
  return merged.join(', ');
}

function promptAlreadyHasRealismCue(prompt: string, mode: RenderRealismMode): boolean {
  const lower = prompt.toLowerCase();
  if (mode === 'hyper-realistic') {
    return /\b(hyper[- ]?realistic|ultra[- ]?detailed|8k|dslr|micro-texture)\b/i.test(lower);
  }
  if (mode === 'realistic') {
    // "natural lighting" / "lifelike" alone are too weak — LLMs put them on CGI scenes
    // and we skip the photograph suffix that actually pulls Klein/Flux toward photo.
    return /\b(photorealistic|photo[- ]?realistic|raw\s+photo|photograph|dslr|matte skin)\b/i.test(
      lower
    );
  }
  if (mode === 'anime') {
    return /\b(anime|cel[- ]?shad(?:ed|ing)?|animation style|studio animation)\b/i.test(lower);
  }
  return false;
}

function clipSuffixToBudget(suffix: string, maxAppendChars: number): string {
  if (suffix.length <= maxAppendChars) {
    return suffix;
  }
  const clipped = suffix
    .slice(0, maxAppendChars)
    .replace(/,\s*[^,]*$/, '')
    .replace(/[.!?]\s*$/, '')
    .trim();
  return clipped;
}

const ULTRAREAL_FLUX_PHOTO_POSITIVE: Record<Exclude<RenderRealismMode, 'off' | 'anime'>, string> = {
  realistic:
    'candid natural photograph, matte skin with visible pores and soft peach fuzz, broken specular highlights, soft subsurface scatter, motivated daylight with gentle contact shadows, believable fabric weight, not airbrushed',
  'hyper-realistic':
    'natural photograph, matte skin micro-texture and pores, soft subsurface scatter, broken specular highlights, directional light with soft shadow falloff, lifelike fabric weave, documentary realism',
};

const ULTRAREAL_FLUX_PHOTO_AVOID: Record<Exclude<RenderRealismMode, 'off' | 'anime'>, string> = {
  realistic:
    'Avoid illustration, CGI, plastic or waxy skin, oily glossy skin, airbrushed doll-like faces, flat shadowless beauty lighting, neon oversaturation, candy-colored props, and synthetic beauty-filter glow.',
  'hyper-realistic':
    'Avoid 3D render, plastic or waxy skin, oily glossy skin, uncanny smoothness, flat shadowless beauty lighting, oversaturated carnival palettes, heavy makeup glow, and synthetic CGI lighting.',
};

function applyUltraRealRenderRealism(input: {
  positive: string;
  mode: Exclude<RenderRealismMode, 'off' | 'anime'>;
  maxPositiveAppendChars?: number;
}): { positive: string; negative?: string } {
  let positive = input.positive.trim();
  const maxAppend = input.maxPositiveAppendChars;
  let remaining = typeof maxAppend === 'number' ? Math.max(0, maxAppend) : undefined;

  if (!promptAlreadyHasRealismCue(positive, input.mode)) {
    if (typeof remaining !== 'number' || remaining >= 48) {
      let suffix = ULTRAREAL_FLUX_PHOTO_POSITIVE[input.mode];
      if (typeof remaining === 'number') {
        suffix = clipSuffixToBudget(suffix, remaining);
      }
      if (suffix) {
        const separator = /[.!?]$/.test(positive) ? ' ' : '. ';
        const before = positive.length;
        positive = `${positive}${separator}${suffix}`;
        if (typeof remaining === 'number') {
          remaining = Math.max(0, remaining - (positive.length - before));
        }
      }
    }
  }

  if (!/\bavoid\b/i.test(positive)) {
    if (typeof remaining !== 'number' || remaining >= 48) {
      let avoid = ULTRAREAL_FLUX_PHOTO_AVOID[input.mode];
      if (typeof remaining === 'number') {
        avoid = clipSuffixToBudget(avoid, remaining);
      }
      if (avoid) {
        const separator = /[.!?]$/.test(positive) ? ' ' : '. ';
        positive = `${positive}${separator}${avoid}`;
      }
    }
  }

  return { positive, negative: undefined };
}

function applyKleinBaseRenderRealism(input: {
  positive: string;
  negative?: string;
  mode: Exclude<RenderRealismMode, 'off' | 'anime'>;
  maxPositiveAppendChars?: number;
}): { positive: string; negative?: string } {
  let positive = input.positive.trim();
  const maxAppend = input.maxPositiveAppendChars;
  const remaining = typeof maxAppend === 'number' ? Math.max(0, maxAppend) : undefined;

  // Always harden when the LLM only said "photograph" — that still yields artsy CGI.
  if (!kleinPromptHasStrongPhotoHarden(positive)) {
    if (typeof remaining !== 'number' || remaining >= 48) {
      let suffix = KLEIN_BASE_FLUX_PHOTO_POSITIVE[input.mode];
      if (typeof remaining === 'number') {
        suffix = clipSuffixToBudget(suffix, remaining);
      }
      if (suffix) {
        const separator = /[.!?]$/.test(positive) ? ' ' : '. ';
        positive = `${positive}${separator}${suffix}`;
      }
    }
  }

  // Klein Base CFG uses the negative slot (authentic skin workflows rely on this).
  return {
    positive,
    negative: mergeCommaList(input.negative, KLEIN_BASE_PLASTIC_NEGATIVE[input.mode]),
  };
}

export function applyRenderRealismToPositive(
  prompt: string,
  mode: RenderRealismMode = DEFAULT_RENDER_REALISM_MODE,
  options?: { maxAppendChars?: number }
): string {
  const trimmed = prompt.trim();
  if (!trimmed || mode === 'off' || promptAlreadyHasRealismCue(trimmed, mode)) {
    return trimmed;
  }

  const maxAppend = options?.maxAppendChars;
  if (typeof maxAppend === 'number' && maxAppend < 48) {
    return trimmed;
  }

  let suffix = REALISM_POSITIVE_SUFFIX[mode];
  if (typeof maxAppend === 'number') {
    suffix = clipSuffixToBudget(suffix, maxAppend);
    if (!suffix) {
      return trimmed;
    }
  }
  const separator = /[.!?]$/.test(trimmed) ? ' ' : '. ';
  return `${trimmed}${separator}${suffix}`;
}

export function applyRenderRealismToNegative(
  negative: string | undefined,
  mode: RenderRealismMode = DEFAULT_RENDER_REALISM_MODE
): string | undefined {
  if (mode === 'off') {
    return negative?.trim() || undefined;
  }

  const extra = REALISM_NEGATIVE_EXTRA[mode];
  const merged = mergeCommaList(negative, extra);
  return merged || undefined;
}

export function applyRenderRealismForModel(input: {
  positive: string;
  negative?: string;
  model: ComfyImageModel | string;
  mode?: RenderRealismMode;
  maxPositiveAppendChars?: number;
}): { positive: string; negative?: string } {
  const resolvedMode = input.mode ?? DEFAULT_RENDER_REALISM_MODE;
  if (resolvedMode === 'off') {
    return {
      positive: input.positive.trim(),
      negative: input.negative?.trim() || undefined,
    };
  }

  if (
    isKleinBaseModel(input.model) &&
    (resolvedMode === 'realistic' || resolvedMode === 'hyper-realistic')
  ) {
    return applyKleinBaseRenderRealism({
      positive: input.positive,
      negative: input.negative,
      mode: resolvedMode,
      maxPositiveAppendChars: input.maxPositiveAppendChars,
    });
  }

  if (
    isFluxFineTuneCheckpointModel(input.model) &&
    (resolvedMode === 'realistic' || resolvedMode === 'hyper-realistic')
  ) {
    return applyUltraRealRenderRealism({
      positive: input.positive,
      mode: resolvedMode,
      maxPositiveAppendChars: input.maxPositiveAppendChars,
    });
  }

  let positive = applyRenderRealismToPositive(input.positive, resolvedMode, {
    maxAppendChars: input.maxPositiveAppendChars,
  });
  const usedAppend = Math.max(0, positive.length - input.positive.trim().length);
  const remaining =
    typeof input.maxPositiveAppendChars === 'number'
      ? Math.max(0, input.maxPositiveAppendChars - usedAppend)
      : undefined;

  if (modelUsesNegativePrompt(input.model)) {
    return {
      positive,
      negative: applyRenderRealismToNegative(input.negative, resolvedMode),
    };
  }

  const avoid = FLUX_REALISM_AVOID[resolvedMode];
  const avoidAlreadyPresent =
    resolvedMode === 'anime'
      ? /\bavoid photorealistic\b/i.test(positive)
      : /\bavoid\b/i.test(positive);
  if (!avoidAlreadyPresent) {
    if (typeof remaining === 'number' && remaining < 48) {
      return { positive, negative: undefined };
    }
    const avoidText = typeof remaining === 'number' ? clipSuffixToBudget(avoid, remaining) : avoid;
    if (avoidText) {
      const separator = /[.!?]$/.test(positive) ? ' ' : '. ';
      positive = `${positive}${separator}${avoidText}`;
    }
  }

  return { positive, negative: undefined };
}

export function formatRenderRealismHint(
  mode: RenderRealismMode = DEFAULT_RENDER_REALISM_MODE
): string {
  if (mode === 'off') {
    return 'Off — prompts queue unchanged.';
  }
  const option =
    RENDER_REALISM_OPTIONS.find(entry => entry.id === mode) ?? RENDER_REALISM_OPTIONS[0];
  return `${option.label} — ${option.description}`;
}
