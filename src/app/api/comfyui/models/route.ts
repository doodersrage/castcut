import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { getComfyUiBaseUrl } from '@/lib/comfyui/client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui/config';
import {
  fetchComfyExperimentModelFiles,
  fetchComfyModelFilenames,
  fetchComfyModelFolders,
  isAllowedComfyModelFolder,
} from '@/lib/comfyui/models';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const folder = searchParams.get('folder')?.trim();
  const runtime = stripEmptyComfyUiRuntime({
    apiUrl: searchParams.get('comfyUrl') ?? undefined,
  });

  try {
    getComfyUiBaseUrl(runtime);
    if (!folder) {
      const folders = await fetchComfyModelFolders(runtime);
      if (!folders) {
        return apiError('ComfyUI /models returned no data.', 502);
      }
      return apiJson({ ok: true, folders });
    }

    if (!(await isAllowedComfyModelFolder(folder, runtime))) {
      return apiError(`Unknown ComfyUI model folder "${folder}".`, 400);
    }

    const experiment = await fetchComfyExperimentModelFiles(folder, runtime);
    if (experiment) {
      return apiJson({
        ok: true,
        folder,
        files: experiment.map(file => file.name),
        models: experiment,
      });
    }

    const files = await fetchComfyModelFilenames(folder, runtime);
    if (!files) {
      return apiError(`ComfyUI /models/${folder} returned no data.`, 502);
    }
    return apiJson({ ok: true, folder, files });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ComfyUI models list failed.';
    const status = /not allowed|Invalid URL|URL is required|allowlist/i.test(message) ? 400 : 502;
    return apiError(message, status);
  }
}

export async function POST() {
  return apiMethodNotAllowed(['GET'], '/api/comfyui/models');
}
