// Bounded per-string token cache to avoid unbounded growth across large galleries.
const _tokenCacheMaxSize = 4096;
const _tokenCache = new Map<string, string[]>();

export function tokenize(text: string): Set<string> {
  const cached = _tokenCache.get(text);
  if (cached) return new Set(cached);
  // Normalize once.
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/);
  const result = normalized.filter(token => token.length > 2);
  _tokenCache.set(text, result);
  // Evict oldest entries if cache is full — avoids memory leaks on large galleries.
  if (_tokenCache.size > _tokenCacheMaxSize) {
    const half = Math.floor(_tokenCacheMaxSize / 2);
    let evicted = 0;
    for (const key of _tokenCache.keys()) {
      if (evicted >= half) break;
      _tokenCache.delete(key);
      evicted += 1;
    }
  }
  return new Set(result);
}

export function bigrams(text: string): string[] {
  // Re-tokenize (tokenize already caches).
  const list = [...tokenize(text)];
  const pairs: string[] = [];
  for (let index = 0; index < list.length - 1; index += 1) {
    pairs.push(`${list[index]} ${list[index + 1]}`);
  }
  return pairs;
}

export function semanticRelevanceScore(query: string, corpus: string): number {
  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) {
    return 0;
  }
  const corpusTokens = tokenize(corpus);
  const corpusLower = corpus.toLowerCase();
  let overlap = 0;
  for (const token of queryTokens) {
    if (corpusTokens.has(token)) {
      overlap += 1;
    }
  }
  let score = overlap / queryTokens.size;

  const phrase = query.trim().toLowerCase();
  if (phrase.length > 4 && corpusLower.includes(phrase)) {
    score += 0.35;
  }

  for (const pair of bigrams(query)) {
    if (corpusLower.includes(pair)) {
      score += 0.08;
    }
  }

  return Math.min(1, score);
}

export function rankBySemanticQuery<T>(
  items: T[],
  query: string,
  toCorpus: (item: T) => string
): Array<{ item: T; score: number }> {
  const trimmed = query.trim();
  if (!trimmed) {
    return items.map(item => ({ item, score: 0 }));
  }
  return items
    .map(item => ({
      item,
      score: semanticRelevanceScore(trimmed, toCorpus(item)),
    }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function rankSimilarToCorpus<T>(
  items: T[],
  reference: string,
  toCorpus: (item: T) => string
): Array<{ item: T; score: number }> {
  const trimmed = reference.trim();
  if (!trimmed) {
    return items.map(item => ({ item, score: 0 }));
  }
  return items
    .map(item => ({
      item,
      score: semanticRelevanceScore(trimmed, toCorpus(item)),
    }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function filterBySemanticQuery<T>(
  items: T[],
  query: string,
  toCorpus: (item: T) => string,
  minScore = 0.15
): T[] {
  const ranked = rankBySemanticQuery(items, query, toCorpus);
  if (ranked.length === 0) {
    return items.filter(item => toCorpus(item).toLowerCase().includes(query.trim().toLowerCase()));
  }
  return ranked.filter(entry => entry.score >= minScore).map(entry => entry.item);
}
