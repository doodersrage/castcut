import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { getComfyUiBaseUrl } from '@/lib/comfyui-client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui-config';
import { scanLoraFiles } from '@/lib/lora-scan-server';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/comfyui/lora-scan');
}

/** What each LoRA file was trained for (family + trigger), read from the file itself. */
export async function POST(request: Request) {
  let body: { filenames?: unknown; comfyUrl?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('JSON body is required.', 400);
  }
  const filenames = Array.isArray(body.filenames)
    ? body.filenames.filter((name): name is string => typeof name === 'string').slice(0, 500)
    : [];
  if (filenames.length === 0) {
    return apiError('filenames is required.', 400);
  }
  let baseUrl: string;
  try {
    baseUrl = getComfyUiBaseUrl(stripEmptyComfyUiRuntime({ apiUrl: body.comfyUrl })).replace(
      /\/+$/,
      ''
    );
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }
  return apiJson({ results: await scanLoraFiles({ filenames, comfyBaseUrl: baseUrl }) });
}
