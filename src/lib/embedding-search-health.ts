export type EmbeddingSearchHealth = {
  available: boolean;
  model: string;
  baseUrl: string;
  message: string;
};

/** Client-safe embedding probe via the search API (no server-only imports). */
export async function checkEmbeddingSearchHealth(): Promise<EmbeddingSearchHealth> {
  const model = 'nomic-embed-text';
  try {
    const response = await fetch('/api/search/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'health probe',
        items: [{ id: 'probe', text: 'semantic search health probe' }],
      }),
    });
    // A 200 also comes back when the route fell back to plain word matching (no embed model).
    const probe = response.ok
      ? ((await response
          .clone()
          .json()
          .catch(() => null)) as { results?: Array<{ method?: string }> } | null)
      : null;
    const embedded = probe?.results?.some(result => result.method === 'embedding') ?? false;
    if (response.ok && !embedded) {
      return {
        available: false,
        model,
        baseUrl: '/api/search/embeddings',
        message:
          'Semantic gallery search needs an Ollama embed model (e.g. nomic-embed-text). Text search still works.',
      };
    }
    if (response.ok) {
      return {
        available: true,
        model,
        baseUrl: '/api/search/embeddings',
        message: `Embeddings available (semantic search active).`,
      };
    }
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    return {
      available: false,
      model,
      baseUrl: '/api/search/embeddings',
      message:
        payload.error?.trim() ||
        'Semantic gallery search needs an Ollama embed model (e.g. nomic-embed-text). Text search still works.',
    };
  } catch {
    return {
      available: false,
      model,
      baseUrl: '/api/search/embeddings',
      message:
        'Semantic gallery search needs an Ollama embed model (e.g. nomic-embed-text). Text search still works.',
    };
  }
}
