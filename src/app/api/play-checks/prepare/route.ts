import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { describePrepareResult, preparePlayChecks } from '@/lib/play-checks-prepare-server';

export const runtime = 'nodejs';
// First use can download several hundred MB of check models.
export const maxDuration = 1200;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/play-checks/prepare');
}

/** Run the face and pose checks once on the bundled sample (see play-checks-prepare-server). */
export async function POST(request: Request) {
  let body: { comfyUrl?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  try {
    const result = await preparePlayChecks({
      comfyUrl:
        typeof body.comfyUrl === 'string' && body.comfyUrl.trim() ? body.comfyUrl : undefined,
    });
    return apiJson({ ...result, summary: describePrepareResult(result) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Preparing the checks failed.';
    return apiError(message, /not allowed|Invalid URL|allowlist/i.test(message) ? 400 : 502);
  }
}
