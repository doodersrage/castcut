export async function fetchEmbeddingRankIds(
  query: string,
  items: Array<{ id: string; text: string }>,
  embedModel?: string
): Promise<string[] | null> {
  const trimmed = query.trim();
  if (!trimmed || items.length === 0) {
    return null;
  }

  try {
    const response = await fetch('/api/search/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: trimmed, items, embedModel }),
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { results?: Array<{ id: string }> };
    return data.results?.map(entry => entry.id) ?? null;
  } catch {
    return null;
  }
}

export function sortByRankIds<T extends { id: string }>(
  items: T[],
  rankIds: string[] | null | undefined
): T[] {
  if (!rankIds?.length) {
    return items;
  }
  const order = new Map(rankIds.map((id, index) => [id, index]));
  const allowed = new Set(rankIds);
  return [...items]
    .filter(item => allowed.has(item.id))
    .sort((left, right) => (order.get(left.id) ?? 9999) - (order.get(right.id) ?? 9999));
}

export function galleryEntryCorpus(entry: {
  prompt: string;
  negativePrompt?: string;
  tool?: string;
  model?: string;
  promptId?: string;
  statusMessage?: string;
  visionTags?: string[];
  userTags?: string[];
  customGroup?: string;
}): string {
  // Return pre-computed corpus when already seeded (hydration path).
  const cached = '_corpus' in entry ? (entry as { _corpus?: string })._corpus : undefined;
  if (cached) return cached;

  return [
    entry.prompt,
    entry.negativePrompt,
    entry.tool,
    entry.model,
    entry.promptId,
    entry.statusMessage,
    entry.visionTags?.join(' '),
    entry.userTags?.join(' '),
    entry.customGroup,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Seed `_corpus` on every entry in a batch (mutates in-place). */
export function seedBatchCorpus(entries: { prompt: string }[]): void {
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!(e as { _corpus?: string })._corpus) {
      (e as { _corpus?: string })._corpus = galleryEntryCorpus(e);
    }
  }
}
