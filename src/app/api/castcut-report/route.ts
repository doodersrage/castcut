import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { readCastcutBestOfTwoReport } from '@/lib/castcut-report-server';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/castcut-report');
}

/**
 * The Castcut node pack's report for a finished job (Best of two in one job): both takes' pose
 * scores and the other take's file, read from the job's ComfyUI history. `report: null` when the
 * job ran no Castcut report (the pack is missing, or the graph wasn't rewritten).
 */
export async function POST(request: Request) {
  let body: { promptId?: string; comfyUrl?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('JSON body is required.', 400);
  }
  const promptId = body.promptId?.trim();
  if (!promptId) {
    return apiError('promptId is required.', 400);
  }
  try {
    const report = await readCastcutBestOfTwoReport({ promptId, comfyUrl: body.comfyUrl });
    return apiJson({ report });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Castcut report failed.';
    const status = /not allowed|Invalid URL|allowlist/i.test(message) ? 400 : 502;
    return apiError(message, status);
  }
}
