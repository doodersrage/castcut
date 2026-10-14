import { apiJson } from '@/lib/api/response';
import { readSessionFromRequest } from '@/lib/auth/session';
import { announceSetupCode, setupCodeRequired } from '@/lib/auth/first-admin-setup';
import {
  findUserById,
  getAuthBootstrapInfo,
  isAuthEnabled,
  listAllowedFeatures,
  needsFirstAdmin,
  toPublicUser,
} from '@/lib/auth/store';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authEnabled = isAuthEnabled();
  const session = readSessionFromRequest(request);
  const user = session ? findUserById(session.userId) : null;
  const impersonator = session?.impersonatorId ? findUserById(session.impersonatorId) : null;
  const firstAdmin = authEnabled && !user && needsFirstAdmin();
  if (firstAdmin) announceSetupCode();

  return apiJson({
    authEnabled,
    // Signed out, the admin username only helped a password guesser (security audit, 2026-10-11).
    ...(user?.enabled || !authEnabled
      ? { defaultAdminUsername: getAuthBootstrapInfo().defaultAdminUsername }
      : {}),
    user: user && user.enabled ? toPublicUser(user) : null,
    allowedFeatures: user && user.enabled ? listAllowedFeatures(user) : authEnabled ? [] : 'all',
    impersonating: Boolean(session?.impersonatorId),
    impersonatorUsername: impersonator?.username,
    ...(firstAdmin ? { needsFirstAdmin: true, setupCodeRequired: setupCodeRequired() } : {}),
  });
}
