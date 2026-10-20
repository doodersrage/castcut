import { loadAvoidedTokens } from './avoided-tokens';

export type AvoidancePreview = {
  original: string;
  filtered: string;
  removedTokens: string[];
  instructionLine: string;
};

function buildAvoidanceInstruction(tokens: string[]): string {
  if (tokens.length === 0) {
    return '';
  }
  return `Avoid these motifs entirely: ${tokens.join(', ')}.`;
}

/** Show which avoided tokens appear in a prompt and what the LLM instruction looks like. */
export function previewAvoidance(prompt: string, extraTokens: string[] = []): AvoidancePreview {
  const tokens = [
    ...new Set([...loadAvoidedTokens(), ...extraTokens.map(t => t.trim()).filter(Boolean)]),
  ];
  const lower = prompt.toLowerCase();
  const removedTokens = tokens.filter(token => lower.includes(token.toLowerCase()));
  let filtered = prompt;
  for (const token of removedTokens) {
    filtered = filtered.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
  }
  filtered = filtered
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*,/g, ',')
    .trim();
  return {
    original: prompt,
    filtered,
    removedTokens,
    instructionLine: buildAvoidanceInstruction(tokens),
  };
}
