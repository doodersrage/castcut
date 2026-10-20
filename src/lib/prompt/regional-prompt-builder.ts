export type RegionalPromptRegion = {
  id: string;
  label: string;
  description: string;
};

export type RegionalPromptSegment = {
  regionId: string;
  prompt: string;
};

export const DEFAULT_REGIONAL_REGIONS: RegionalPromptRegion[] = [
  { id: 'subject', label: 'Subject', description: 'Main figure or focal object' },
  { id: 'background', label: 'Background', description: 'Environment behind the subject' },
  { id: 'foreground', label: 'Foreground', description: 'Objects closest to camera' },
  { id: 'lighting', label: 'Lighting', description: 'Light direction, color, mood' },
];

export function buildRegionalPrompt(
  segments: RegionalPromptSegment[],
  regions: RegionalPromptRegion[] = DEFAULT_REGIONAL_REGIONS
): string {
  const labelById = Object.fromEntries(regions.map(region => [region.id, region.label]));
  return segments
    .filter(segment => segment.prompt.trim())
    .map(segment => `${labelById[segment.regionId] ?? segment.regionId}: ${segment.prompt.trim()}`)
    .join('. ');
}

/** Compact `(region: text)` form useful for attention/weighted prompt packs. */
export function buildRegionalPromptParenForm(
  segments: RegionalPromptSegment[],
  regions: RegionalPromptRegion[] = DEFAULT_REGIONAL_REGIONS
): string {
  const labelById = Object.fromEntries(regions.map(region => [region.id, region.label]));
  return segments
    .filter(segment => segment.prompt.trim())
    .map(
      segment =>
        `(${(labelById[segment.regionId] ?? segment.regionId).toLowerCase()}: ${segment.prompt.trim()})`
    )
    .join(' ');
}

export function buildInpaintInstruction(
  maskDescription: string,
  changeDescription: string
): string {
  return `In the masked region (${maskDescription.trim()}), ${changeDescription.trim()}. Keep all unmasked areas unchanged.`;
}

export function parseRegionalSegments(raw: string): RegionalPromptSegment[] {
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^([^:]+):\s*(.+)$/);
      if (!match) {
        return { regionId: 'subject', prompt: line };
      }
      const label = match[1].trim().toLowerCase();
      const region =
        DEFAULT_REGIONAL_REGIONS.find(entry => entry.label.toLowerCase() === label)?.id ??
        label.replace(/\s+/g, '-');
      return { regionId: region, prompt: match[2].trim() };
    });
}

/** Portable tokens for imported regional / attention-mask packs. */
export const REGIONAL_PROMPT_TOKENS = {
  subject: '{{REGION_SUBJECT}}',
  background: '{{REGION_BACKGROUND}}',
  foreground: '{{REGION_FOREGROUND}}',
  lighting: '{{REGION_LIGHTING}}',
} as const;

export type RegionalCustomToken = { token: string; value: string };

/** Build {{REGION_*}} custom tokens from panel segments for queue injection. */
export function regionalPromptCustomTokens(
  segments: RegionalPromptSegment[]
): RegionalCustomToken[] {
  const byId = new Map<string, string>();
  for (const segment of segments) {
    const prompt = segment.prompt.trim();
    if (!prompt) {
      continue;
    }
    byId.set(segment.regionId, prompt);
  }
  const tokens: RegionalCustomToken[] = [];
  for (const [regionId, token] of Object.entries(REGIONAL_PROMPT_TOKENS)) {
    const value = byId.get(regionId)?.trim();
    if (value) {
      tokens.push({ token, value });
    }
  }
  return tokens;
}

/**
 * Replace unresolved {{REGION_*}} placeholders in a workflow JSON string.
 * Packs that already expose these tokens get filled at queue time.
 */
export function patchRegionalTokensInWorkflow(
  workflow: Record<string, unknown>,
  segments: RegionalPromptSegment[]
): { workflow: Record<string, unknown>; patched: number } {
  const tokens = regionalPromptCustomTokens(segments);
  if (tokens.length === 0) {
    return { workflow, patched: 0 };
  }
  let json = JSON.stringify(workflow);
  let patched = 0;
  for (const entry of tokens) {
    if (!json.includes(entry.token)) {
      continue;
    }
    const before = json;
    json = json.split(entry.token).join(entry.value);
    if (json !== before) {
      patched += 1;
    }
  }
  if (patched === 0) {
    return { workflow, patched: 0 };
  }
  try {
    return { workflow: JSON.parse(json) as Record<string, unknown>, patched };
  } catch {
    return { workflow, patched: 0 };
  }
}
