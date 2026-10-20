import { checkComfyUiHealth } from '@/lib/service-health';
import { normalizeComfyPoolUrlList } from '@/lib/comfyui/pool';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { normalizeSafeHttpUrl } from '@/lib/url-safety';
import { parseComfyGpuUrl } from '@/lib/comfyui/gpu-env-snippet';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { url?: string };
    const raw = typeof body.url === 'string' ? body.url : '';
    const parsed = parseComfyGpuUrl(raw);
    if (!parsed) {
      return apiError('Enter a valid http(s) ComfyUI URL.', 400);
    }

    const [url] = normalizeComfyPoolUrlList([parsed.url]);
    if (!url) {
      try {
        normalizeSafeHttpUrl(parsed.url, { allowPrivate: true });
      } catch (error) {
        return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
      }
      return apiError(
        `Host ${parsed.hostname} is not on COMFYUI_ALLOWED_HOSTS. Copy the .env snippet, restart, then test again.`,
        400,
        {
          code: 'allowlist',
          hostname: parsed.hostname,
          url: parsed.url,
        }
      );
    }

    const health = await checkComfyUiHealth({ apiUrl: url });
    return apiJson({ ...health, hostname: parsed.hostname });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Probe failed.', 500);
  }
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/comfyui/probe');
}
