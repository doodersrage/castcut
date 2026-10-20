import { getComfyUiBaseUrl } from './client';
import type { ComfyUiRuntimeConfig } from './config';
import { parseComfyExperimentModelFiles, type ComfyExperimentModelFile } from './experiment-models';
import { readStringNameList } from './features';

export const COMFY_MODEL_FOLDERS = [
  'loras',
  'checkpoints',
  'vae',
  'unet',
  'diffusion_models',
  'clip',
  'clip_vision',
  'controlnet',
  'upscale_models',
  'embeddings',
  'hypernetworks',
  'text_encoders',
] as const;

export type ComfyModelFolder = (typeof COMFY_MODEL_FOLDERS)[number];

const FOLDER_SET = new Set<string>(COMFY_MODEL_FOLDERS);

export function isComfyModelFolder(value: string): value is ComfyModelFolder {
  return FOLDER_SET.has(value);
}

export async function fetchComfyModelFolders(
  runtime?: ComfyUiRuntimeConfig
): Promise<string[] | null> {
  const baseUrl = getComfyUiBaseUrl(runtime).replace(/\/+$/, '');
  try {
    const response = await fetch(`${baseUrl}/models`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      redirect: 'manual',
    });
    if (!response.ok) {
      return null;
    }
    return readStringNameList(await response.json()).filter(
      folder => folder !== 'configs' && folder !== 'custom_nodes'
    );
  } catch {
    return null;
  }
}

export async function isAllowedComfyModelFolder(
  folder: string,
  runtime?: ComfyUiRuntimeConfig
): Promise<boolean> {
  if (isComfyModelFolder(folder)) {
    return true;
  }
  if (folder.includes('..') || folder.includes('/') || folder.includes('\\')) {
    return false;
  }
  const live = await fetchComfyModelFolders(runtime);
  return Boolean(live?.includes(folder));
}

/** Live folder listing from ComfyUI `GET /models/{folder}` (cheaper than object_info). */
export async function fetchComfyModelFilenames(
  folder: string,
  runtime?: ComfyUiRuntimeConfig
): Promise<string[] | null> {
  const baseUrl = getComfyUiBaseUrl(runtime).replace(/\/+$/, '');
  try {
    const response = await fetch(`${baseUrl}/models/${encodeURIComponent(folder)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      redirect: 'manual',
    });
    if (!response.ok) {
      return null;
    }
    return readStringNameList(await response.json());
  } catch {
    return null;
  }
}

export async function fetchComfyExperimentModelFiles(
  folder: string,
  runtime?: ComfyUiRuntimeConfig
): Promise<ComfyExperimentModelFile[] | null> {
  const baseUrl = getComfyUiBaseUrl(runtime).replace(/\/+$/, '');
  try {
    const response = await fetch(`${baseUrl}/experiment/models/${encodeURIComponent(folder)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      redirect: 'manual',
    });
    if (!response.ok) {
      return null;
    }
    const files = parseComfyExperimentModelFiles(await response.json());
    return files.length > 0 ? files : null;
  } catch {
    return null;
  }
}
