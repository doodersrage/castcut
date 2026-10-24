import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { getComfyUiBaseUrl } from '@/lib/comfyui/client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui/config';
import { canWriteComfyModelsRoot } from '@/lib/comfyui/comfy-asset-paths';
import {
  comfyInstallJob,
  markComfyInstallSetUp,
  readComfyInstallReport,
  startCopyFoldersJob,
  startRestorePicturesJob,
} from '@/lib/comfyui/install-server';
import { loadComfyInstallStore, setSavedComfyRoot } from '@/lib/comfyui/install-store-server';
import fs from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const maxDuration = 60;

function baseUrlFrom(comfyUrl: unknown): string {
  return getComfyUiBaseUrl(
    stripEmptyComfyUiRuntime({ apiUrl: typeof comfyUrl === 'string' ? comfyUrl : undefined })
  ).replace(/\/+$/, '');
}

/**
 * GET ?comfyUrl&brief=1 → the Switching ComfyUI report (comfyui/install-server.ts); ?jobId → a
 * job's progress.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  if (jobId) {
    const job = comfyInstallJob(jobId);
    return job ? apiJson(job) : apiError('No such job.', 404);
  }
  let baseUrl: string;
  try {
    baseUrl = baseUrlFrom(searchParams.get('comfyUrl') ?? undefined);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }
  return apiJson(await readComfyInstallReport(baseUrl, fetch, searchParams.get('brief') === '1'));
}

/**
 * POST { action, comfyUrl? }:
 *   done            — this install is set up (no "new install" notice for it)
 *   use-root {root} — model downloads go under this folder (null: back to COMFYUI_ROOT)
 *   restore-pictures — put the app's kept pictures into this ComfyUI
 *   copy-folders    — copy the previous install's input and output folders into this one's
 * Writes files on this machine or changes where downloads go — admin when sign-in is on.
 */
export async function POST(request: Request) {
  if (isAuthEnabled()) {
    const user = resolveRequestUser(request);
    if (!user?.enabled || user.role !== 'admin') {
      return apiError('Admin sign-in required to set up ComfyUI.', 401);
    }
  }
  let body: { action?: unknown; comfyUrl?: unknown; root?: unknown; identity?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Expected a JSON body.', 400);
  }
  let baseUrl: string;
  try {
    baseUrl = baseUrlFrom(body.comfyUrl);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }
  switch (body.action) {
    case 'done': {
      if (typeof body.identity !== 'string' || !body.identity) {
        return apiError('identity is required.', 400);
      }
      markComfyInstallSetUp(baseUrl, body.identity);
      return apiJson({ ok: true });
    }
    case 'use-root': {
      if (body.root === null) {
        setSavedComfyRoot(null);
        return apiJson({ ok: true, root: null });
      }
      const root = typeof body.root === 'string' ? body.root.trim() : '';
      if (!root || !path.isAbsolute(root)) return apiError('root must be an absolute folder.', 400);
      if (!fs.existsSync(path.join(root, 'models'))) {
        return apiError(`${root} has no models folder.`, 400);
      }
      if (!canWriteComfyModelsRoot(root)) {
        return apiError(`This app cannot write to ${path.join(root, 'models')}.`, 400);
      }
      setSavedComfyRoot(root);
      return apiJson({ ok: true, root });
    }
    case 'restore-pictures':
      return apiJson(startRestorePicturesJob(baseUrl));
    case 'copy-folders': {
      const entry = loadComfyInstallStore().installs[baseUrl];
      const pairs = [
        { from: entry?.previous?.inputDir, to: entry?.current?.inputDir },
        { from: entry?.previous?.outputDir, to: entry?.current?.outputDir },
      ].filter(
        (pair): pair is { from: string; to: string } =>
          Boolean(pair.from && pair.to && pair.from !== pair.to) &&
          fs.existsSync(pair.from!) &&
          fs.existsSync(pair.to!)
      );
      if (!pairs.length) {
        return apiError('No previous install folders to copy from on this machine.', 400);
      }
      return apiJson(startCopyFoldersJob(pairs));
    }
    default:
      return apiError('Unknown action.', 400);
  }
}

export function PUT() {
  return apiMethodNotAllowed(['GET', 'POST'], '/api/comfyui/install');
}
