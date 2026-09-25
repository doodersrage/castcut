/**
 * Pick a vision-capable chat model from an LLM provider's catalog when none is configured,
 * so Auto-review, Look tile roles and the other image checks work without hand-picking one.
 * Pure — no fetch.
 */

import type { LlmCatalogEntry } from './llm-providers';

/** Catalog "vision" also catches image *generators*; those can't describe a still. */
const NOT_A_READER =
  /gpt-image|dall-?e|imagen|flux|stable-?diffusion|sdxl|sd3|image-gen|tts|whisper/i;

/** Text-only sizes of otherwise multimodal families. */
const TEXT_ONLY_SIZE = /gemma-?3n?[:-]1b|gemma-?3[:-]270m/i;

/** Preference order: strongest local readers first, then any other vision model. */
const RANK: readonly RegExp[] = [
  /qwen[\d.]*-?vl/i,
  /gemma-?3/i,
  /llama-?3\.2-?vision|llama-?4/i,
  /minicpm-?v/i,
  /internvl/i,
  /pixtral/i,
  /llava/i,
  /moondream/i,
  /gpt-4o|gpt-4\.1|gpt-5/i,
  /claude/i,
  /gemini/i,
];

function rank(id: string): number {
  const index = RANK.findIndex(pattern => pattern.test(id));
  return index === -1 ? RANK.length : index;
}

/** Best vision model in the catalog, or undefined when there is none. */
export function pickVisionCapableModel(
  entries: ReadonlyArray<Pick<LlmCatalogEntry, 'id' | 'kind'>>
): string | undefined {
  const candidates = entries
    .filter(entry => entry.kind === 'vision')
    .map(entry => entry.id.trim())
    .filter(id => id && !NOT_A_READER.test(id) && !TEXT_ONLY_SIZE.test(id));
  if (candidates.length === 0) return undefined;
  // Stable: best rank first, then catalog order.
  return [...candidates]
    .map((id, index) => ({ id, index, rank: rank(id) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)[0]!.id;
}
