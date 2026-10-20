export function tokenizeForAvoidance(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 3);
}

export function promptContainsAvoidedTokensFromList(
  text: string,
  avoided: readonly string[]
): boolean {
  if (!avoided.length || !text.trim()) {
    return false;
  }
  const avoidedSet = new Set(avoided.map(token => token.toLowerCase()));
  return tokenizeForAvoidance(text).some(token => avoidedSet.has(token));
}

export function filterAvoidedCandidatesFromList(
  candidates: string[],
  avoided: readonly string[]
): string[] {
  if (!avoided.length) {
    return candidates;
  }
  const filtered = candidates.filter(entry => !promptContainsAvoidedTokensFromList(entry, avoided));
  return filtered.length > 0 ? filtered : candidates;
}

export function buildAvoidedTokensInstructionFromList(
  tokens: readonly string[] | undefined
): string | undefined {
  const avoided =
    tokens
      ?.map(token => token.trim())
      .filter(Boolean)
      .slice(-20) ?? [];
  if (avoided.length === 0) {
    return undefined;
  }
  return `Avoid these overused or low-rated motifs: ${avoided.join(', ')}.`;
}

export function normalizeAvoidedTokens(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const tokens = raw
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 80);
  return tokens.length > 0 ? tokens : undefined;
}

export function resolveAvoidanceOptions(
  body?: {
    avoidedTokens?: unknown;
    avoidedTokensInstruction?: string;
  } | null
): {
  avoidedTokens?: string[];
  avoidedTokensInstruction?: string;
} {
  const avoidedTokens = normalizeAvoidedTokens(body?.avoidedTokens);
  const avoidedTokensInstruction =
    body?.avoidedTokensInstruction?.trim() || buildAvoidedTokensInstructionFromList(avoidedTokens);

  return {
    ...(avoidedTokens ? { avoidedTokens } : {}),
    ...(avoidedTokensInstruction ? { avoidedTokensInstruction } : {}),
  };
}
