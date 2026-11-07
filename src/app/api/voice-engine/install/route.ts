import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { readSessionFromRequest } from '@/lib/auth/session';
import { findUserById, isAuthEnabled } from '@/lib/auth/store';
import { voiceEngineReady } from '@/lib/audio/voice-engine-server';
import { startVoiceEngineInstall, voiceEngineAvailability } from '@/lib/audio/voice-engine-install';

export const runtime = 'nodejs';

/** Is the voice engine installed here, is it answering, and how is an install going. */
export async function GET() {
  const availability = voiceEngineAvailability({ checkPython: true });
  return apiJson({
    ...availability,
    running:
      availability.installed || availability.configuredUrl ? await voiceEngineReady() : false,
  });
}

/** Set up the engine Castcut ships (admin only: it runs install.sh on the server). */
export function POST(request: Request) {
  if (isAuthEnabled()) {
    const session = readSessionFromRequest(request);
    const user = session ? findUserById(session.userId) : null;
    if (!user?.enabled || user.role !== 'admin') {
      return apiError('Admin sign-in required.', 401);
    }
  }
  const job = startVoiceEngineInstall();
  if (job.phase === 'failed') return apiError(job.error ?? 'Install failed.', 400);
  return apiJson({ ok: true, job });
}

export function PUT() {
  return apiMethodNotAllowed(['GET', 'POST'], '/api/voice-engine/install');
}
