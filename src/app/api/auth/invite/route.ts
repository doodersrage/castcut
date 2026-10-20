import { publicAppOrigin } from '@/lib/server/public-app-origin';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { appendAuditLog } from '@/lib/auth/audit-log';
import type { AppFeatureId } from '@/lib/auth/features';
import { createPasswordResetToken } from '@/lib/auth/password-reset-store';
import { readSessionFromRequest } from '@/lib/auth/session';
import { findUserById, isAuthEnabled, upsertUser } from '@/lib/auth/store';
import type { UserScheduledCampaign } from '@/lib/auth/types';
import { notifyUserInvite } from '@/lib/email/notifications';
import { isEmailConfigured } from '@/lib/email/mailer';

export const runtime = 'nodejs';

function requireAdmin(request: Request) {
  if (!isAuthEnabled()) {
    return apiError('Authentication is disabled.', 400);
  }

  const session = readSessionFromRequest(request);
  const user = session ? findUserById(session.userId) : null;
  if (!user || user.role !== 'admin' || !user.enabled) {
    return apiError('Admin access required.', 403);
  }

  return { user };
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (admin instanceof Response) {
    return admin;
  }
  if (!isEmailConfigured()) {
    return apiError('SMTP is not configured. Save SMTP settings first, then send a test.', 503);
  }

  let body: {
    id?: string;
    username?: string;
    role?: 'admin' | 'user' | 'viewer';
    groupIds?: string[];
    blockedFeatures?: AppFeatureId[];
    enabled?: boolean;
    comfyUiUrl?: string;
    quotaMaxPerMinute?: number;
    scheduledCampaign?: UserScheduledCampaign;
    exportEnabled?: boolean;
    email?: string;
    emailNotifyBatch?: boolean;
    emailNotifySecurity?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }

  const existing = body.id?.trim() ? findUserById(body.id.trim()) : null;
  const email = body.email?.trim() || existing?.email?.trim();
  if (!email) {
    return apiError('An email address is required to send an invite.', 400);
  }
  const username = (body.username ?? existing?.username ?? '').trim();
  if (!username) {
    return apiError('Username is required.', 400);
  }

  try {
    const user = upsertUser({
      id: existing?.id ?? body.id,
      username,
      role:
        body.role === 'admin'
          ? 'admin'
          : body.role === 'viewer'
            ? 'viewer'
            : (existing?.role ?? 'user'),
      groupIds: body.groupIds ?? existing?.groupIds ?? [],
      blockedFeatures: body.blockedFeatures ?? existing?.blockedFeatures ?? [],
      enabled: body.enabled ?? existing?.enabled ?? true,
      comfyUiUrl: body.comfyUiUrl ?? existing?.comfyUiUrl,
      quotaMaxPerMinute: body.quotaMaxPerMinute ?? existing?.quotaMaxPerMinute,
      scheduledCampaign: body.scheduledCampaign ?? existing?.scheduledCampaign,
      exportEnabled: body.exportEnabled ?? existing?.exportEnabled,
      email,
      emailNotifyBatch: body.emailNotifyBatch ?? existing?.emailNotifyBatch,
      emailNotifySecurity: body.emailNotifySecurity ?? existing?.emailNotifySecurity,
      inviteWithoutPassword: !existing,
    });

    const token = createPasswordResetToken(user.id);
    const origin = publicAppOrigin();
    const resetUrl = `${origin}/login?reset=${encodeURIComponent(token)}`;
    const sent = await notifyUserInvite({
      to: email,
      username: user.username,
      resetUrl,
      adminUsername: admin.user.username,
    });
    if (!sent.ok) {
      return apiError(sent.error ?? 'Invite email failed to send.', 502, { user });
    }

    appendAuditLog({
      actorUserId: admin.user.id,
      actorUsername: admin.user.username,
      action: existing ? 'user.invite_resent' : 'user.invited',
      target: user.id,
      details: user.username,
    });

    return apiJson({
      ok: true,
      user,
      message: existing
        ? `Invite email sent to ${email}.`
        : `Account created and invite sent to ${email}.`,
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Failed to send invite.', 400);
  }
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/auth/invite');
}
