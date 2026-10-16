import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { readSessionFromRequest } from '@/lib/auth/session';
import { findUserById, isAuthEnabled } from '@/lib/auth/store';
import {
  diffusersEngineAvailability,
  startDiffusersEngineInstall,
} from '@/lib/diffusers-engine-install';

export const runtime = 'nodejs';

/** Is the Diffusers engine installed or configured here, and how is an install going. */
export function GET() {
  return apiJson(diffusersEngineAvailability({ checkPython: true }));
}

/** Download and set up the engine release (admin only: it runs install.sh on the server). */
export function POST(request: Request) {
  if (isAuthEnabled()) {
    const session = readSessionFromRequest(request);
    const user = session ? findUserById(session.userId) : null;
    if (!user?.enabled || user.role !== 'admin') {
      return apiError('Admin sign-in required.', 401);
    }
  }
  const job = startDiffusersEngineInstall();
  if (job.phase === 'failed') return apiError(job.error ?? 'Install failed.', 400);
  return apiJson({ ok: true, job });
}

export function PUT() {
  return apiMethodNotAllowed(['GET', 'POST'], '/api/diffusers/install');
}
