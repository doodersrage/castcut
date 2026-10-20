import { getLlmConfig } from '../llm/client';
import { semanticRelevanceScore } from './semantic-search';

export type EmbeddingVector = number[];

const cache = new Map<string, EmbeddingVector>();

function ollamaEmbedBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/v1\/?$/, '');
}

export async function embedText(
  text: string,
  modelOverride?: string
): Promise<EmbeddingVector | null> {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const cached = cache.get(trimmed);
  if (cached) {
    return cached;
  }

  const { baseUrl, apiKey } = getLlmConfig();
  const model =
    modelOverride?.trim() ||
    process.env.LLM_EMBED_MODEL?.trim() ||
    process.env.OLLAMA_EMBED_MODEL?.trim() ||
    'nomic-embed-text';

  try {
    const response = await fetch(`${ollamaEmbedBaseUrl(baseUrl)}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ model, prompt: trimmed }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { embedding?: number[] };
    if (!Array.isArray(data.embedding) || data.embedding.length === 0) {
      return null;
    }

    cache.set(trimmed, data.embedding);
    return data.embedding;
  } catch {
    return null;
  }
}

function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let index = 0; index < len; index += 1) {
    dot += a[index]! * b[index]!;
    normA += a[index]! * a[index]!;
    normB += b[index]! * b[index]!;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function rankByEmbedding<T>(
  items: T[],
  query: string,
  toCorpus: (item: T) => string,
  modelOverride?: string
): Promise<Array<{ item: T; score: number; method: 'embedding' | 'token' }>> {
  const trimmed = query.trim();
  if (!trimmed) {
    return items.map(item => ({ item, score: 0, method: 'token' as const }));
  }

  const queryVector = await embedText(trimmed, modelOverride);
  if (!queryVector) {
    return items
      .map(item => ({
        item,
        score: semanticRelevanceScore(trimmed, toCorpus(item)),
        method: 'token' as const,
      }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  const scored: Array<{ item: T; score: number; method: 'embedding' | 'token' }> = [];
  for (const item of items) {
    const corpus = toCorpus(item);
    const vector = await embedText(corpus, modelOverride);
    const score = vector
      ? cosineSimilarity(queryVector, vector)
      : semanticRelevanceScore(trimmed, corpus);
    if (score > 0.05) {
      scored.push({ item, score, method: vector ? 'embedding' : 'token' });
    }
  }

  return scored.sort((a, b) => b.score - a.score);
}
