import { apiError, apiJson } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import {
  detectLmStudio,
  startVisionModelDownload,
  VISION_MODEL_CHOICES,
  visionModelDownloadStatus,
} from '@/lib/vision-model-download-server';

export const runtime = 'nodejs';

/** `?job=<id>`: a download's progress. Without it: whether LM Studio can download, and the choices. */
export async function GET(request: Request) {
  const job = new URL(request.url).searchParams.get('job')?.trim();
  try {
    if (job) return apiJson(await visionModelDownloadStatus(job));
    return apiJson({ lmStudio: Boolean(await detectLmStudio()), choices: VISION_MODEL_CHOICES });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'LM Studio did not answer.', 502);
  }
}

/** `{ choice }`: download one of the curated vision models into LM Studio (several GB). */
export async function POST(request: Request) {
  if (isAuthEnabled()) {
    const user = resolveRequestUser(request);
    if (!user?.enabled || user.role !== 'admin') {
      return apiError('Admin sign-in required to download models.', 401);
    }
  }
  let body: { choice?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Expected a JSON body.', 400);
  }
  if (typeof body.choice !== 'string') return apiError('choice is required.', 400);
  try {
    return apiJson(await startVisionModelDownload(body.choice));
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'The download did not start.', 502);
  }
}
