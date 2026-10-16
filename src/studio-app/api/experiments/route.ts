import { groupGalleryExperiments } from '@/lib/experiment-groups';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { entries?: ComfyGalleryEntry[] };
    const entries = body.entries ?? [];
    return apiJson({
      groups: groupGalleryExperiments(entries),
      count: entries.length,
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Experiment grouping failed.', 500);
  }
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/experiments');
}
