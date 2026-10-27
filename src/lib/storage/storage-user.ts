import { readSessionFromRequest } from '@/lib/auth/session';
import { findUserById, isAuthEnabled } from '@/lib/auth/store';

/** The signed-in user a storage request is for (null with sign-in off, or none signed in). */
export function resolveStorageUser(request: Request): string | null {
  if (!isAuthEnabled()) {
    return null;
  }
  const session = readSessionFromRequest(request);
  if (!session) {
    return null;
  }
  const user = findUserById(session.userId);
  if (!user?.enabled) {
    return null;
  }
  return user.id;
}
