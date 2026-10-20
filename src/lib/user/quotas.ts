import type { AuthGroup, AuthUser } from '../auth/types';
import { checkRateLimit, type RateLimitResult } from '../server/api-rate-limit';

export function resolveUserQuotaMax(user: AuthUser | null, groups: AuthGroup[]): number {
  const envDefault = Number(process.env.API_RATE_LIMIT_MAX ?? '120');
  const fallback = Number.isFinite(envDefault) && envDefault > 0 ? Math.floor(envDefault) : 120;

  if (!user) {
    return fallback;
  }

  if (user.quotaMaxPerMinute && user.quotaMaxPerMinute > 0) {
    return user.quotaMaxPerMinute;
  }

  for (const groupId of user.groupIds) {
    const group = groups.find(entry => entry.id === groupId);
    if (group?.quotaMaxPerMinute && group.quotaMaxPerMinute > 0) {
      return group.quotaMaxPerMinute;
    }
  }

  return fallback;
}

export function checkUserRateLimit(input: {
  user: AuthUser | null;
  groups: AuthGroup[];
  clientKey: string;
  path: string;
}): RateLimitResult {
  const max = resolveUserQuotaMax(input.user, input.groups);
  return checkRateLimit(input.user?.id ?? input.clientKey, input.path, max);
}
