export function readVariationSeedFromMetadata(
  metadata?: Record<string, unknown>
): string | undefined {
  const seed = metadata?.seed;
  if (typeof seed !== 'string') {
    return undefined;
  }

  const trimmed = seed.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readVariationSeedFromResult(input: {
  seed?: string;
  metadata?: Record<string, unknown>;
}): string | undefined {
  if (input.seed?.trim()) {
    return input.seed.trim();
  }
  return readVariationSeedFromMetadata(input.metadata);
}
