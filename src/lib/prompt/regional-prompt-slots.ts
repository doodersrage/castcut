/**
 * Multi-slot regional edit — masks + prompts for Refine/Compose/Inpaint.
 * Text segments remain compatible with {{REGION_*}} token injection.
 */

import { DEFAULT_REGIONAL_REGIONS, type RegionalPromptSegment } from './regional-prompt-builder';

export const MAX_REGIONAL_PROMPT_SLOTS = 4;

export type RegionalPromptSlot = {
  id: string;
  label: string;
  prompt: string;
  /** 0–1 weight when regional/attention nodes honor it. */
  strength: number;
  /** Comfy LoadImage filename after upload (queue time). */
  maskFilename?: string;
};

export function normalizeRegionalSlotStrength(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    return 1;
  }
  return Math.min(1, Math.max(0.05, Math.round(n * 100) / 100));
}

export function createDefaultRegionalSlots(): RegionalPromptSlot[] {
  return DEFAULT_REGIONAL_REGIONS.slice(0, MAX_REGIONAL_PROMPT_SLOTS).map(region => ({
    id: region.id,
    label: region.label,
    prompt: '',
    strength: 1,
  }));
}

export function normalizeRegionalPromptSlots(value: unknown): RegionalPromptSlot[] {
  if (!Array.isArray(value) || value.length === 0) {
    return createDefaultRegionalSlots();
  }
  const slots: RegionalPromptSlot[] = [];
  for (const entry of value.slice(0, MAX_REGIONAL_PROMPT_SLOTS)) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const id =
      typeof record.id === 'string' && record.id.trim()
        ? record.id.trim().slice(0, 32)
        : `region-${slots.length + 1}`;
    const label =
      typeof record.label === 'string' && record.label.trim()
        ? record.label.trim().slice(0, 48)
        : id;
    const prompt = typeof record.prompt === 'string' ? record.prompt.slice(0, 4000) : '';
    const maskFilename =
      typeof record.maskFilename === 'string' && record.maskFilename.trim()
        ? record.maskFilename.trim()
        : undefined;
    slots.push({
      id,
      label,
      prompt,
      strength: normalizeRegionalSlotStrength(record.strength),
      maskFilename,
    });
  }
  return slots.length > 0 ? slots : createDefaultRegionalSlots();
}

/** Map slots → legacy labeled segments for {{REGION_*}} token fill. */
export function regionalSlotsToSegments(slots: RegionalPromptSlot[]): RegionalPromptSegment[] {
  return slots
    .filter(slot => slot.prompt.trim())
    .map(slot => ({
      regionId: slot.id,
      prompt: slot.prompt.trim(),
    }));
}

export function regionalSlotsHaveContent(slots: RegionalPromptSlot[]): boolean {
  return slots.some(slot => slot.prompt.trim().length > 0);
}

export function regionalSlotsHaveMasks(slots: RegionalPromptSlot[]): boolean {
  return slots.some(slot => Boolean(slot.maskFilename?.trim()));
}

export function formatRegionalSlotsHint(slots: RegionalPromptSlot[]): string {
  const filled = slots.filter(slot => slot.prompt.trim());
  if (filled.length === 0) {
    return 'No regional prompts';
  }
  const masked = filled.filter(slot => slot.maskFilename?.trim()).length;
  return `${filled.length} region${filled.length === 1 ? '' : 's'}${
    masked > 0 ? ` · ${masked} mask${masked === 1 ? '' : 's'}` : ''
  }`;
}
