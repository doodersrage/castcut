import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { readSessionFromRequest } from '@/lib/auth/session';
import { findUserById, isAuthEnabled } from '@/lib/auth/store';
import { clearTextModelCache } from '@/lib/llm-text-model-auto';
import {
  ensureLocalLlm,
  localLlmStatus,
  setLocalLlmUse,
  startLocalLlmInstall,
  stopLocalLlm,
} from '@/lib/llm-local-server';
import { clearVisionModelCache } from '@/lib/vision-model-auto';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** The built-in LLM: installed, on, running, which model, an install in progress. */
export async function GET() {
  return apiJson(await localLlmStatus());
}

type Body = { action?: string; model?: string; enabled?: boolean; context?: number };

/** install · use (on/off, context) · start · stop — admin only: it runs a program on the server. */
export async function POST(request: Request) {
  if (isAuthEnabled()) {
    const session = readSessionFromRequest(request);
    const user = session ? findUserById(session.userId) : null;
    if (!user?.enabled || user.role !== 'admin') return apiError('Admin sign-in required.', 401);
  }
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    return apiError('JSON body is required.', 400);
  }
  try {
    switch (body.action) {
      case 'install': {
        const job = startLocalLlmInstall(body.model ?? '');
        if (job.phase === 'failed') return apiError(job.error ?? 'Install failed.', 400);
        break;
      }
      case 'use':
        setLocalLlmUse(body.enabled !== false, body.context);
        // A new context only applies when it starts again.
        if (body.context) await stopLocalLlm();
        break;
      case 'start':
        await ensureLocalLlm();
        break;
      case 'stop':
        await stopLocalLlm();
        break;
      default:
        return apiError('action must be install, use, start or stop.', 400);
    }
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Failed.', 500);
  }
  // Which model the app writes and reads with just changed.
  clearTextModelCache();
  clearVisionModelCache();
  return apiJson(await localLlmStatus());
}

export function PUT() {
  return apiMethodNotAllowed(['GET', 'POST'], '/api/llm/local');
}
