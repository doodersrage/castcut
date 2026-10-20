import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { getComfyUiBaseUrl } from '@/lib/comfyui/client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui/config';
import { parseComfyJobList } from '@/lib/comfyui/jobs';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runtime = stripEmptyComfyUiRuntime({
    apiUrl: searchParams.get('comfyUrl') ?? undefined,
  });

  let baseUrl: string;
  try {
    baseUrl = getComfyUiBaseUrl(runtime).replace(/\/+$/, '');
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }

  const promptId = searchParams.get('promptId')?.trim() || searchParams.get('id')?.trim();
  if (promptId) {
    const { fetchComfyJobImportItem, getComfyUiPromptStatus } =
      await import('@/lib/comfyui/status');
    const [item, status] = await Promise.all([
      fetchComfyJobImportItem(promptId, baseUrl),
      getComfyUiPromptStatus(promptId, runtime),
    ]);
    return apiJson({
      ok: true,
      promptId,
      comfyUrl: baseUrl,
      item,
      status,
      found: Boolean(item || status),
    });
  }

  const params = new URLSearchParams();
  const status = searchParams.get('status')?.trim();
  const limit = searchParams.get('limit')?.trim();
  if (status) {
    params.set('status', status);
  }
  if (limit) {
    params.set('limit', limit);
  }
  const query = params.toString() ? `?${params.toString()}` : '';

  try {
    const response = await fetch(`${baseUrl}/api/jobs${query}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      redirect: 'manual',
    });
    if (response.status === 404) {
      return apiJson({ ok: true, jobs: [], unsupported: true });
    }
    if (!response.ok) {
      return apiError(`ComfyUI jobs failed: HTTP ${response.status}`, 502);
    }
    const jobs = parseComfyJobList(await response.json());
    return apiJson({ ok: true, jobs, comfyUrl: baseUrl });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'ComfyUI jobs failed.', 502);
  }
}

export async function POST() {
  return apiMethodNotAllowed(['GET'], '/api/comfyui/jobs');
}
