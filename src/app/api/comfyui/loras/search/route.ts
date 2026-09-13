import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import {
  buildCivitaiSearchUrl,
  mapCivitaiSearchItems,
  sanitizeCivitaiBaseModel,
} from '@/lib/civitai-lora';

export const runtime = 'nodejs';

function civitaiSearchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'Castcut/1.0 (+local; LoRA search)',
  };
  const token = process.env.CIVITAI_API_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim() ?? '';
  if (query.length < 2) {
    return apiError('Search query must be at least 2 characters.', 400);
  }

  let searchUrl: string;
  try {
    searchUrl = buildCivitaiSearchUrl({
      query,
      baseModel: sanitizeCivitaiBaseModel(searchParams.get('baseModel')),
      nsfw: searchParams.get('nsfw') === '1' || searchParams.get('nsfw') === 'true',
      limit: Number(searchParams.get('limit') ?? 20) || 20,
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid search.', 400);
  }

  try {
    const response = await fetch(searchUrl, {
      headers: civitaiSearchHeaders(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return apiError(`Civitai search failed: HTTP ${response.status}`, 502);
    }
    const payload: unknown = await response.json();
    const items = mapCivitaiSearchItems(payload, {
      includeNsfw: searchParams.get('nsfw') === '1' || searchParams.get('nsfw') === 'true',
    });
    return apiJson({
      ok: true,
      query,
      baseModel: sanitizeCivitaiBaseModel(searchParams.get('baseModel')) ?? null,
      items,
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Civitai search failed.', 502);
  }
}

export async function POST() {
  return apiMethodNotAllowed(['GET'], '/api/comfyui/loras/search');
}
