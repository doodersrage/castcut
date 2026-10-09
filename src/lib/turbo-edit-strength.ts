import {
  INPAINT_STRENGTH_DENOISE,
  isBooguEditModel,
  isBooguEditTurboModel,
  isEditQueueTool,
  isFluxKleinModel,
  isMaskedPaintStrengthContext,
  isQwenEditModel,
  isQwenRapidAioModel,
  isSoftImg2imgStrengthContext,
  isZImageTurboModel,
  OUTPAINT_STRENGTH_DENOISE,
  SOFT_IMG2IMG_STRENGTH_DENOISE,
  Z_IMAGE_TURBO_IMG2IMG_DENOISE,
  type ZImageTurboImg2imgStrength,
} from './model-denoise-defaults';
import { KLEIN_SPOON_RECIPE_MARK } from './prompt-recipe-mark';
import { isKleinDistilledModel } from './model-sampler-defaults';
import { isQwenLightningModel } from './model-sampling-patch';

export type TurboEditStrength = ZImageTurboImg2imgStrength;

export const DEFAULT_TURBO_EDIT_STRENGTH: TurboEditStrength = 'balanced';

export const TURBO_EDIT_STRENGTH_OPTIONS: {
  id: TurboEditStrength;
  label: string;
  hint: string;
}[] = [
  {
    id: 'gentle',
    label: 'Gentle',
    hint: 'Barely touch the frame. Lighting, color, or a small polish only.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    hint: 'Apply the edit. Hold face and framing.',
  },
  {
    id: 'strong',
    label: 'Strong',
    hint: 'Obvious rewrite. Face stays; lighting, clothes, or background may change.',
  },
];

const STRENGTH_IDS = new Set<string>(TURBO_EDIT_STRENGTH_OPTIONS.map(option => option.id));

/**
 * Instruction-edit distilled stacks (Boogu Edit Turbo, Klein Distilled).
 * Denoise stays 1 — strength is the prompt structure, not a soft slider.
 * User text sits immediately after a short opener so 4-step CFG 1 actually sees it.
 */
const INSTRUCTION_EDIT_OPENER: Record<TurboEditStrength, string> = {
  gentle: 'Do not restyle Image 1. Only this change:',
  balanced: 'Edit Image 1:',
  strong:
    'Carry out this change on Image 1 even if lighting, wardrobe, or background must change. Keep facial likeness only:',
};

const INSTRUCTION_EDIT_CLOSER: Record<TurboEditStrength, string> = {
  gentle: 'Everything else stays the same — pose, framing, lighting, wardrobe, and background.',
  balanced: 'Keep facial identity and camera framing.',
  strong: 'The requested change is required — do not return an unchanged photo.',
};

const Z_IMAGE_OPENER: Record<TurboEditStrength, string> = {
  gentle: 'Light img2img on Image 1. Only this change:',
  balanced: 'Edit Image 1 via img2img:',
  strong: 'Stronger img2img on Image 1. Apply this change clearly. Keep facial likeness only:',
};

const Z_IMAGE_CLOSER: Record<TurboEditStrength, string> = {
  gentle: 'Keep face, pose, clothes, lighting, and background.',
  balanced: 'Keep facial identity and framing.',
  strong: 'Lighting, wardrobe, or background may change.',
};

/** Legacy wraps + Compose keep-prefixes that used to cancel the strength chips. */
const STRIP_PREFIXES = [
  'Carry out this change on Image 1 even if lighting, wardrobe, or background must change. Keep facial likeness only:',
  'Do not restyle Image 1. Only this change:',
  'Stronger img2img on Image 1. Apply this change clearly. Keep facial likeness only:',
  'Light img2img on Image 1. Only this change:',
  'Edit Image 1 via img2img. Preserve facial identity, gender presentation, and likeness from Image 1. Keep pose and framing unless the prompt says otherwise.',
  'Edit Image 1 via img2img. Preserve facial identity, gender presentation, and likeness from Image 1.',
  'Edit Image 1 via img2img. Change as little as possible. Preserve facial identity, gender presentation, likeness, pose, and framing.',
  'Edit Image 1 via img2img. Preserve facial identity, gender presentation, and likeness from Image 1. Keep pose and framing unless the prompt says otherwise.',
  'Edit Image 1 via img2img. Preserve facial identity from Image 1. Lighting, wardrobe, or background may change more freely.',
  'Make only the requested change. Keep identity, pose, framing, lighting, wardrobe, and background from Image 1 unchanged unless the prompt names them.',
  'Apply the requested edit. Keep facial identity and overall composition from Image 1.',
  'Apply the edit fully. Keep facial likeness from Image 1; other details may change as needed.',
  'Keep the subject’s pose and framing unchanged unless asked otherwise.',
  "Keep the subject's pose and framing unchanged unless asked otherwise.",
  'Minimal edit of Image 1. Change only the named detail. Copy pose, framing, lighting, wardrobe, background, and color grade exactly.',
  'Edit Image 1 as requested. Keep facial identity and the same camera framing. Other details may shift only if the request needs it.',
  'Priority instruction: carry out the following change on Image 1. Lighting, wardrobe, background, and color may all change. Keep facial likeness only.',
  'Edit Image 1 via img2img:',
  'Edit Image 1:',
].sort((a, b) => b.length - a.length);

const STRIP_CLOSERS = [
  'Everything else stays the same — pose, framing, lighting, wardrobe, and background.',
  'The requested change is required — do not return an unchanged photo.',
  'Keep face, pose, clothes, lighting, and background.',
  'Keep facial identity and camera framing.',
  'Keep facial identity and framing.',
  'Lighting, wardrobe, or background may change.',
  'Do not restyle or reinterpret the rest of the photo.',
  'Do not leave the requested change out.',
].sort((a, b) => b.length - a.length);

export function normalizeTurboEditStrength(value: unknown): TurboEditStrength {
  const id = String(value ?? '')
    .trim()
    .toLowerCase();
  if (STRENGTH_IDS.has(id)) {
    return id as TurboEditStrength;
  }
  return DEFAULT_TURBO_EDIT_STRENGTH;
}

export function usesTurboEditStrengthUi(model?: string | null, tool?: string): boolean {
  if (!model?.toString().trim()) {
    return false;
  }
  if (/-(video)$/i.test(String(model)) || /(?:wan|hunyuan|ltx)[-_]?video/i.test(String(model))) {
    return false;
  }
  return isEditQueueTool(tool);
}

/** True when chips move sampler denoise (classic img2img), not just the prompt wrap. */
export function editStrengthUsesDenoiseBands(model?: string | null, tool?: string): boolean {
  if (!model?.toString().trim() || !isEditQueueTool(tool)) {
    return false;
  }
  return isSoftImg2imgStrengthContext(model, { tool, hasInputImage: true });
}

function usesInstructionEditWrap(model?: string | null): boolean {
  if (!model?.toString().trim()) {
    return false;
  }
  return (
    isBooguEditModel(model) ||
    isFluxKleinModel(model) ||
    isQwenEditModel(model) ||
    isQwenLightningModel(model) ||
    isQwenRapidAioModel(model)
  );
}

export function skipsCfg1T2iSteeringForTurboEdit(model?: string | null, tool?: string): boolean {
  if (!model?.toString().trim()) {
    return false;
  }
  if (isBooguEditTurboModel(model)) {
    return true;
  }
  if (isKleinDistilledModel(String(model))) {
    return isEditQueueTool(tool);
  }
  return isZImageTurboModel(model) && isEditQueueTool(tool);
}

export function resolveZImageTurboImg2imgDenoise(strength?: unknown): number {
  return Z_IMAGE_TURBO_IMG2IMG_DENOISE[normalizeTurboEditStrength(strength)];
}

export function resolveEditStrengthDenoise(
  model?: string | null,
  strength?: unknown,
  tool?: string
): number {
  const normalized = normalizeTurboEditStrength(strength);
  if (tool === 'outpaint') {
    return OUTPAINT_STRENGTH_DENOISE[normalized];
  }
  if (isMaskedPaintStrengthContext(model, { tool, hasMaskImage: tool === 'inpaint' })) {
    return INPAINT_STRENGTH_DENOISE[normalized];
  }
  if (isZImageTurboModel(model)) {
    return Z_IMAGE_TURBO_IMG2IMG_DENOISE[normalized];
  }
  return SOFT_IMG2IMG_STRENGTH_DENOISE[normalized];
}

function strengthLabel(strength: string): string {
  return strength.charAt(0).toUpperCase() + strength.slice(1);
}

export function formatTurboEditStrengthHint(
  model?: string | null,
  strength?: unknown,
  tool?: string
): string | null {
  const normalized = normalizeTurboEditStrength(strength);
  if (editStrengthUsesDenoiseBands(model, tool ?? 'refine')) {
    const denoise = resolveEditStrengthDenoise(model, normalized, tool);
    if (tool === 'outpaint') {
      return `${strengthLabel(normalized)}: denoise ${denoise.toFixed(2)} on the new border — higher invents more around the frame.`;
    }
    if (isMaskedPaintStrengthContext(model, { tool, hasMaskImage: tool === 'inpaint' })) {
      return `${strengthLabel(normalized)}: denoise ${denoise.toFixed(2)} inside the mask — Gentle keeps more of what is there, Strong repaints it.`;
    }
    if (isZImageTurboModel(model)) {
      return `${strengthLabel(normalized)}: denoise ${denoise.toFixed(2)} — Gentle keeps the frame, Strong lets it change.`;
    }
    return `${strengthLabel(normalized)}: denoise ${denoise.toFixed(2)} — Gentle keeps the frame, Strong lets it change.`;
  }
  if (isBooguEditTurboModel(model)) {
    return `Boogu Edit Turbo stays at denoise 1 (instruction + reference latents). ${normalized} rewrites the instruction so the 4-step stack actually holds or lets go of the frame.`;
  }
  if (isKleinDistilledModel(String(model ?? ''))) {
    return `Klein Distilled stays at denoise 1 (ReferenceLatent, 4-step CFG 1). ${normalized} rewrites the instruction — a keep-everything prefix is stripped so Strong can change lighting and background.`;
  }
  if (usesInstructionEditWrap(model)) {
    return `This model stays at denoise 1 (instruction / reference latents). ${normalized} rewrites the instruction so Gentle holds the frame and Strong lets lighting, wardrobe, or background change.`;
  }
  return `${normalized} rewrites the instruction. Use a sidebar KSampler denoise override if you need a custom value.`;
}

function startsWithIgnoreCase(text: string, prefix: string): boolean {
  return text.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase();
}

function endsWithIgnoreCase(text: string, suffix: string): boolean {
  if (text.length < suffix.length) {
    return false;
  }
  return text.slice(-suffix.length).toLowerCase() === suffix.toLowerCase();
}

/** Remove a previous strength wrap (and Compose keep-prefixes) so chips can swap. */
export function stripTurboEditStrengthWrap(prompt: string): string {
  let text = prompt.trim();
  let changed = true;
  while (changed && text) {
    changed = false;
    for (const closer of STRIP_CLOSERS) {
      if (endsWithIgnoreCase(text, closer)) {
        text = text.slice(0, -closer.length).trim();
        changed = true;
        break;
      }
    }
    for (const prefix of STRIP_PREFIXES) {
      if (startsWithIgnoreCase(text, prefix)) {
        text = text.slice(prefix.length).trim();
        changed = true;
        break;
      }
    }
  }
  return text;
}

function wrapInstruction(text: string, strength: TurboEditStrength): string {
  const opener = INSTRUCTION_EDIT_OPENER[strength];
  const closer = INSTRUCTION_EDIT_CLOSER[strength];
  return `${opener} ${text} ${closer}`;
}

function wrapZImage(text: string, strength: TurboEditStrength): string {
  const opener = Z_IMAGE_OPENER[strength];
  const closer = Z_IMAGE_CLOSER[strength];
  return `${opener} ${text} ${closer}`;
}

export function applyTurboEditStrengthToPrompt(
  prompt: string,
  model?: string | null,
  strength?: unknown
): string {
  // The Klein spoon recipe is front-loaded on purpose; the edit opener/closer around it cut
  // two-person stills from 7/8 to 5/8 on the real Day graph.
  if (prompt.includes(KLEIN_SPOON_RECIPE_MARK)) {
    return stripTurboEditStrengthWrap(prompt);
  }
  const stripped = stripTurboEditStrengthWrap(prompt);
  if (!stripped) {
    return prompt;
  }
  const normalized = normalizeTurboEditStrength(strength);
  if (usesInstructionEditWrap(model)) {
    return wrapInstruction(stripped, normalized);
  }
  return wrapZImage(stripped, normalized);
}
