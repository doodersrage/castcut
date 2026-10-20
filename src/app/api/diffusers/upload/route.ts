import { getDiffusersBaseUrl } from '@/lib/engine/diffusers-client';
import { parseEngineUploadRequest } from '@/lib/engine/upload-parse';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/diffusers/upload');
}

export async function POST(request: Request) {
  try {
    const incoming = await parseEngineUploadRequest(request);
    const image = incoming.file;

    const engineUrlHint = incoming.engineUrl || incoming.comfyUrl || undefined;

    let engineUrl: string;
    try {
      engineUrl = getDiffusersBaseUrl(engineUrlHint);
    } catch (error) {
      return apiError(error instanceof Error ? error.message : 'Invalid Diffusers URL.', 400);
    }

    const uploadForm = new FormData();
    uploadForm.append('image', image, image.name);

    const response = await fetch(`${engineUrl}/v1/upload`, {
      method: 'POST',
      body: uploadForm,
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const text = await response.text();
      return apiError(text || `Diffusers upload returned HTTP ${response.status}`, 502);
    }

    const data = (await response.json()) as {
      name?: string;
      subfolder?: string;
      type?: string;
    };

    if (!data.name?.trim()) {
      return apiError('Diffusers upload did not return a filename.', 502);
    }

    return apiJson({
      name: data.name.trim(),
      subfolder: data.subfolder?.trim() || '',
      type: data.type?.trim() || 'input',
      engineUrl,
      comfyUrl: engineUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Diffusers upload failed.';
    const status = /required|must be|could not read|upload must|too large|25mb|invalid/i.test(
      message
    )
      ? 400
      : 502;
    return apiError(message, status);
  }
}
