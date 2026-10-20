import { after } from 'next/server';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import {
  civitaiAssetId,
  civitaiLoraDownloadUrl,
  parseCivitaiVersionId,
  sanitizeLoraFilename,
} from '@/lib/lora/civitai-lora';
import {
  listComfyAssetJobs,
  runComfyAssetDownloadJob,
  startAdhocAssetDownload,
} from '@/lib/comfyui/comfy-asset-download';
import { getComfyUiRoot } from '@/lib/comfyui/comfy-asset-paths';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  let body: { versionId?: unknown; filename?: unknown; label?: unknown; bytes?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }

  const versionId = parseCivitaiVersionId(body.versionId);
  if (versionId == null) {
    return apiError('versionId must be a positive integer.', 400);
  }

  let filename: string;
  try {
    filename = sanitizeLoraFilename(
      typeof body.filename === 'string' && body.filename.trim()
        ? body.filename
        : `civitai-${versionId}.safetensors`
    );
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid LoRA filename.', 400);
  }

  const label =
    typeof body.label === 'string' && body.label.trim()
      ? body.label.trim().slice(0, 160)
      : filename;
  const bytes =
    typeof body.bytes === 'number' && Number.isFinite(body.bytes) && body.bytes > 0
      ? Math.round(body.bytes)
      : undefined;

  try {
    const job = startAdhocAssetDownload({
      assetId: civitaiAssetId(versionId),
      label,
      filename,
      kind: 'lora',
      url: civitaiLoraDownloadUrl(versionId),
      bytes,
      deferStart: true,
    });
    if (job.status === 'queued') {
      after(() => runComfyAssetDownloadJob(job.id));
    }
    return apiJson({
      ok: true,
      job,
      rootPath: getComfyUiRoot(),
      jobs: listComfyAssetJobs(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start download.';
    const status =
      /not set|does not exist|not allowlisted|Permission denied|not writable|Invalid LoRA/i.test(
        message
      )
        ? 400
        : 500;
    return apiError(message, status);
  }
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/comfyui/loras/download');
}
