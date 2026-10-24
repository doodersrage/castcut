import { after } from 'next/server';
import { NextResponse } from 'next/server';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui/config';
import { fetchComfyObjectInfoPayload } from '@/lib/comfyui/object-info';
import {
  cancelComfyAssetDownload,
  getComfyAssetJob,
  listComfyAssetJobs,
  resumeInterruptedComfyAssetDownloads,
  retryComfyAssetDownload,
  runComfyAssetDownloadJob,
  startComfyAssetDownload,
} from '@/lib/comfyui/comfy-asset-download';
import { getComfyUiBaseUrl } from '@/lib/comfyui/client';
import { getComfyUiRoot, isComfyUiRootConfigured } from '@/lib/comfyui/comfy-asset-paths';
import { readComfyInstallReport } from '@/lib/comfyui/install-server';
import { buildComfyAssetStatusRows } from '@/lib/comfyui/comfy-asset-status';

export const runtime = 'nodejs';
/** Large HF weights; keep the route from being treated as a short serverless call. */
export const maxDuration = 300;

export async function GET(request: Request) {
  resumeInterruptedComfyAssetDownloads();

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId')?.trim();

  if (jobId) {
    const job = getComfyAssetJob(jobId);
    if (!job) {
      return apiError('Download job not found.', 404);
    }
    return apiJson({ ok: true, job, jobs: listComfyAssetJobs() });
  }

  const runtime = stripEmptyComfyUiRuntime({
    apiUrl: searchParams.get('comfyUrl') ?? undefined,
  });
  const modelId = searchParams.get('modelId')?.trim() || undefined;
  const forceRefresh = searchParams.get('forceRefresh') === '1';

  let inventory = null;
  try {
    const payload = await fetchComfyObjectInfoPayload(runtime, { forceRefresh });
    inventory = payload?.models ?? null;
  } catch {
    inventory = null;
  }

  // COMFYUI_ROOT unset or gone: look at the ComfyUI this app talks to, which names its own models
  // folder (comfy-asset-paths.ts resolveComfyUiRoot uses what it finds).
  if (!isComfyUiRootConfigured()) {
    try {
      await readComfyInstallReport(getComfyUiBaseUrl(runtime).replace(/\/+$/, ''), fetch, true);
    } catch {
      /* not reachable — the hint below says what to do */
    }
  }

  const status = buildComfyAssetStatusRows({
    inventory,
    modelId,
  });

  const rootConfigured = status.rootConfigured && isComfyUiRootConfigured();
  let rootHint: string | undefined;
  if (!rootConfigured) {
    rootHint =
      'No ComfyUI folder found. Start ComfyUI on this machine so the app can find its models ' +
      'folder, or set COMFYUI_ROOT to the folder that holds models/.';
  } else if (!status.rootWritable) {
    rootHint =
      `COMFYUI_ROOT is set but not writable by this process (${status.rootPath}/models). ` +
      `Grant write access so Install can save weights (e.g. setfacl for your app user).`;
  }

  return apiJson({
    ok: true,
    rootConfigured,
    rootWritable: status.rootWritable,
    rootPath: status.rootPath,
    rootHint,
    rows: status.rows,
    jobs: listComfyAssetJobs(),
  });
}

export async function POST(request: Request) {
  let body: { assetId?: string; modelId?: string; action?: string; jobId?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }

  const action = body.action?.trim().toLowerCase();
  if (action === 'cancel' || action === 'retry') {
    const jobId = body.jobId?.trim();
    if (!jobId) {
      return apiError('jobId is required.', 400);
    }
    if (action === 'cancel') {
      const job = cancelComfyAssetDownload(jobId);
      if (!job) {
        return apiError('Download job not found.', 404);
      }
      return apiJson({ ok: true, job, jobs: listComfyAssetJobs() });
    }
    const job = retryComfyAssetDownload(jobId, { deferStart: true });
    if (!job) {
      return apiError('Download job not found.', 404);
    }
    if (job.status === 'queued') {
      after(() => runComfyAssetDownloadJob(job.id));
    }
    return apiJson({ ok: true, job, jobs: listComfyAssetJobs() });
  }

  const assetId = body.assetId?.trim();
  if (!assetId) {
    return apiError('assetId is required.', 400);
  }

  try {
    const job = startComfyAssetDownload({ assetId, deferStart: true });
    if (job.status === 'queued') {
      // Keep work alive after the HTTP response — fire-and-forget alone is dropped.
      after(() => runComfyAssetDownloadJob(job.id));
    }
    return apiJson({
      ok: true,
      job,
      rootPath: getComfyUiRoot(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start download.';
    const status =
      /not set|does not exist|Unknown asset|no allowlisted|not allowlisted|Permission denied|not writable/i.test(
        message
      )
        ? 400
        : 500;
    return apiError(message, status);
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export function PUT() {
  return apiMethodNotAllowed(['GET', 'POST'], '/api/comfyui/assets');
}
