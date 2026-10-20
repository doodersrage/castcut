import { rankImagesWithVision } from '@/lib/best-of-n/rank-server';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';

export const runtime = 'nodejs';

type RankImagesBody = {
  candidates?: Array<{ id?: string; prompt?: string; imageDataUrl?: string }>;
  keep?: number;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RankImagesBody;
    const candidates = Array.isArray(body.candidates)
      ? body.candidates
          .map((entry, index) => ({
            id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `c-${index}`,
            prompt: typeof entry.prompt === 'string' ? entry.prompt : '',
            imageDataUrl:
              typeof entry.imageDataUrl === 'string' && entry.imageDataUrl.trim()
                ? entry.imageDataUrl.trim()
                : '',
          }))
          .filter(entry => entry.imageDataUrl)
      : [];
    const keep = Number.isFinite(body.keep) ? Math.max(1, Math.floor(body.keep!)) : 1;

    if (candidates.length === 0) {
      return apiError('candidates array with imageDataUrl entries is required.', 400);
    }

    const ranked = await rankImagesWithVision(candidates, keep);
    return apiJson({ candidates: ranked });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Best-of-N vision rank failed.', 500);
  }
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/best-of-n/rank-images');
}
