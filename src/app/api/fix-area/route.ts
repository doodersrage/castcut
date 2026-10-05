import { apiError, apiJson } from '@/lib/api/response';
import { cancelFixAreaJobs, queueFixAreaInComfy, readFixAreaJob } from '@/lib/fix-area-server';

export const runtime = 'nodejs';

/** Where one fix candidate is: `?promptId=…` (`&comfyUrl=…`). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const promptId = url.searchParams.get('promptId')?.trim();
  if (!promptId) return apiError('promptId is required.', 400);
  try {
    return apiJson(
      await readFixAreaJob({
        promptId,
        comfyUrl: url.searchParams.get('comfyUrl')?.trim() || undefined,
      })
    );
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Fix status failed.', 502);
  }
}

/**
 * "Fix an area" (fix-area.ts): queue the masked candidates for a still, or `cancel` ones that
 * have not started. `available: false` + reason when the still can't be fixed this way.
 */
export async function POST(request: Request) {
  let body: {
    imageUrl?: string;
    graphUrl?: string;
    workflow?: unknown;
    mask?: string;
    text?: string;
    reference?: unknown;
    denoise?: unknown;
    seeds?: unknown;
    candidates?: unknown;
    comfyUrl?: string;
    clientId?: string;
    cancel?: unknown;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('JSON body is required.', 400);
  }
  const comfyUrl = body.comfyUrl?.trim() || undefined;
  if (Array.isArray(body.cancel)) {
    await cancelFixAreaJobs({
      promptIds: body.cancel.filter((id): id is string => typeof id === 'string'),
      comfyUrl,
    });
    return apiJson({ cancelled: true });
  }
  const imageUrl = body.imageUrl?.trim();
  if (!imageUrl || typeof body.mask !== 'string' || !body.mask) {
    return apiError('imageUrl and mask are required.', 400);
  }
  if (body.mask.length > 12_000_000) return apiError('The mask is too large.', 413);
  try {
    return apiJson(
      await queueFixAreaInComfy({
        imageUrl,
        graphUrl: body.graphUrl?.trim() || undefined,
        workflow: body.workflow,
        mask: body.mask,
        text: typeof body.text === 'string' ? body.text : undefined,
        reference: body.reference,
        denoise: body.denoise,
        seeds: Array.isArray(body.seeds)
          ? body.seeds.filter((seed): seed is number => typeof seed === 'number')
          : undefined,
        candidates: typeof body.candidates === 'number' ? body.candidates : undefined,
        comfyUrl,
        clientId: typeof body.clientId === 'string' ? body.clientId : undefined,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fix an area failed.';
    const status = /not allowed|Invalid URL|allowlist/i.test(message) ? 400 : 502;
    return apiError(message, status);
  }
}
