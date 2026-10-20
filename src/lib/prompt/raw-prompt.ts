/** Metadata key for the pre-optimize LLM/template draft. */
export const RAW_PROMPT_METADATA_KEY = 'rawPrompt';

export function readRawPrompt(metadata?: Record<string, unknown> | null): string | undefined {
  const value = metadata?.[RAW_PROMPT_METADATA_KEY];
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function withRawPrompt(
  metadata: Record<string, unknown> | undefined,
  rawPrompt: string | undefined | null
): Record<string, unknown> | undefined {
  const trimmed = typeof rawPrompt === 'string' ? rawPrompt.trim() : '';
  if (!trimmed) {
    return metadata;
  }
  return {
    ...(metadata ?? {}),
    [RAW_PROMPT_METADATA_KEY]: trimmed,
  };
}

/** True when the raw draft differs from the optimized/displayed prompt. */
export function rawPromptDiffers(rawPrompt: string | undefined, optimizedPrompt: string): boolean {
  if (!rawPrompt?.trim()) {
    return false;
  }
  return rawPrompt.trim() !== optimizedPrompt.trim();
}
