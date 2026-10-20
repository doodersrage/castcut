import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { getComfyUiBaseUrl } from '@/lib/comfyui/client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui/config';

export const runtime = 'nodejs';

type LogEntry = { t?: number; m?: string };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get('limit') ?? '40');
  const limit = Number.isFinite(limitRaw) ? Math.min(80, Math.max(1, Math.floor(limitRaw))) : 40;
  const runtime = stripEmptyComfyUiRuntime({
    apiUrl: searchParams.get('comfyUrl') ?? undefined,
  });

  let baseUrl: string;
  try {
    baseUrl = getComfyUiBaseUrl(runtime).replace(/\/+$/, '');
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }

  try {
    const response = await fetch(`${baseUrl}/internal/logs/raw`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
      redirect: 'manual',
    });
    if (response.status === 404) {
      return apiJson({ ok: true, lines: [], unsupported: true });
    }
    if (!response.ok) {
      return apiError(`ComfyUI logs failed: HTTP ${response.status}`, 502);
    }
    const payload = (await response.json().catch(() => null)) as { entries?: LogEntry[] } | null;
    const entries = Array.isArray(payload?.entries) ? payload.entries : [];
    const lines = entries
      .slice(-limit)
      .map(entry => (typeof entry.m === 'string' ? entry.m.trim() : ''))
      .filter(Boolean);
    return apiJson({ ok: true, lines });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'ComfyUI logs failed.', 502);
  }
}

export async function POST() {
  return apiMethodNotAllowed(['GET'], '/api/comfyui/logs');
}
