import { scoreGalleryEntryHeuristic } from '@/lib/aesthetic-score';
import { scoreGalleryEntryVision } from '@/lib/aesthetic-score-vision';
import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';

export const runtime = 'nodejs';

type AestheticScoreBody = Partial<ComfyGalleryEntry> & {
  method?: 'heuristic' | 'vision';
  imageDataUrl?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AestheticScoreBody;
    if (!body.prompt?.trim()) {
      return apiError('prompt is required.', 400);
    }

    const entry: ComfyGalleryEntry = {
      id: body.id ?? 'score-request',
      promptId: body.promptId ?? 'score-request',
      prompt: body.prompt,
      negativePrompt: body.negativePrompt,
      model: body.model,
      tool: body.tool,
      status: body.status ?? 'completed',
      queuedAt: body.queuedAt ?? Date.now(),
      comfyUrl: body.comfyUrl ?? '',
      images: body.images ?? [],
      reviewRating: body.reviewRating,
      favorite: body.favorite,
      projectId: body.projectId,
      historyId: body.historyId,
      queueParams: body.queueParams,
    };

    if (body.method === 'vision' && body.imageDataUrl?.trim()) {
      try {
        const vision = await scoreGalleryEntryVision({
          entry,
          imageDataUrl: body.imageDataUrl.trim(),
        });
        return apiJson(vision);
      } catch (error) {
        const fallback = scoreGalleryEntryHeuristic(entry);
        return apiJson({
          ...fallback,
          notes: [
            `Vision scoring failed — used heuristic (${
              error instanceof Error ? error.message : 'unknown error'
            })`,
            ...fallback.notes,
          ],
        });
      }
    }

    return apiJson(scoreGalleryEntryHeuristic(entry));
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Aesthetic score failed.', 500);
  }
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/aesthetic/score');
}
