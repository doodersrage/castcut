import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { getComfyUiBaseUrl } from '@/lib/comfyui/client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui/config';
import { isComfyModelFolder } from '@/lib/comfyui/models';
import { extractSafetensorsTriggerPhrase } from '@/lib/comfyui/view-metadata';

export const runtime = 'nodejs';

function sanitizeMetadataFilename(filename: string): string | null {
  const trimmed = filename.trim();
  if (!trimmed || trimmed.includes('..') || trimmed.startsWith('/') || trimmed.includes('\\')) {
    return null;
  }
  return trimmed;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const folder = searchParams.get('folder')?.trim() || 'loras';
  const filename = sanitizeMetadataFilename(searchParams.get('filename') ?? '');
  if (!isComfyModelFolder(folder)) {
    return apiError(`Unknown ComfyUI model folder "${folder}".`, 400);
  }
  if (!filename) {
    return apiError('filename is required.', 400);
  }

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
    const url = new URL(`${baseUrl}/view_metadata/${encodeURIComponent(folder)}`);
    url.searchParams.set('filename', filename);
    const response = await fetch(url.toString(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      redirect: 'manual',
    });
    if (!response.ok) {
      return apiError(`ComfyUI view_metadata failed: HTTP ${response.status}`, 502);
    }
    const metadata = (await response.json().catch(() => null)) as unknown;
    return apiJson({
      ok: true,
      folder,
      filename,
      metadata,
      triggerPhrase: extractSafetensorsTriggerPhrase(metadata),
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'ComfyUI view_metadata failed.', 502);
  }
}

export async function POST() {
  return apiMethodNotAllowed(['GET'], '/api/comfyui/view-metadata');
}
