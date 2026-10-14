import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { renderOutfit3d } from '@/lib/outfit-3d-server';

export const runtime = 'nodejs';
export const maxDuration = 800;

/** An outfit picture as a 3D model: { imageUrl (a ComfyUI view URL), comfyUrl? } → { url } (GLB). */
export async function POST(request: Request) {
  let body: { imageUrl?: unknown; comfyUrl?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
  if (!imageUrl) return apiError('imageUrl is required.', 400);
  try {
    return apiJson(
      await renderOutfit3d({
        imageUrl,
        ...(typeof body.comfyUrl === 'string' ? { comfyUrl: body.comfyUrl } : {}),
      })
    );
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'The 3D model failed.', 502);
  }
}

export function GET() {
  return apiMethodNotAllowed(['POST'], '/api/outfit-3d');
}
