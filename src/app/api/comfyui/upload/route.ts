import { getComfyUiBaseUrl } from '@/lib/comfyui-client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui-config';
import { uploadComfyInputContent } from '@/lib/comfy-input-upload-server';
import { parseEngineUploadRequest } from '@/lib/engine-upload-parse';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/comfyui/upload');
}

export async function POST(request: Request) {
  try {
    const incoming = await parseEngineUploadRequest(request);
    const image = incoming.file;

    const runtime = stripEmptyComfyUiRuntime({
      apiUrl: incoming.comfyUrl,
    });

    let comfyUrl: string;
    try {
      comfyUrl = getComfyUiBaseUrl(runtime).replace(/\/+$/, '');
    } catch (error) {
      return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
    }

    let uploaded;
    try {
      // Named by content: the same picture is not sent (or stored) twice.
      uploaded = await uploadComfyInputContent({
        baseUrl: comfyUrl,
        bytes: new Uint8Array(await image.arrayBuffer()),
        filename: image.name,
        mimeType: image.type,
        kind: incoming.kind,
        originalRef: incoming.originalRef,
        keepName: incoming.keepName,
      });
    } catch (error) {
      if (typeof (error as { status?: unknown }).status === 'number') {
        return apiError((error as Error).message, 502);
      }
      throw error;
    }

    return apiJson({
      name: uploaded.name,
      subfolder: uploaded.subfolder,
      type: uploaded.type,
      comfyUrl,
      reused: uploaded.reused,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ComfyUI upload failed.';
    const status = /required|must be|could not read|upload must|too large|25mb|invalid/i.test(
      message
    )
      ? 400
      : 502;
    return apiError(message, status);
  }
}
