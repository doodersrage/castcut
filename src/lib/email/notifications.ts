import 'server-only';

import { findUserById } from '@/lib/auth/store';
import type { AuthUser } from '@/lib/auth/types';
import { brandedEmailHtml, emailParagraphs } from './brand';
import { getEmailConfig } from './config';
import { sendEmail } from './mailer';

export type BatchCompletionKind = 'server-scheduled' | 'user-campaign' | 'client-scheduled';

function resolveRecipient(user: AuthUser | null | undefined): string | null {
  const config = getEmailConfig();
  const userEmail = user?.email?.trim();
  if (userEmail) {
    return userEmail;
  }
  return config.adminEmail ?? null;
}

function appOrigin(): string {
  return process.env.PROMPT_API_URL?.trim() || 'http://127.0.0.1:47832';
}

export async function notifyUserInvite(input: {
  to: string;
  username: string;
  resetUrl: string;
  adminUsername: string;
}): Promise<{ ok: boolean; error?: string }> {
  const textLines = [
    `Hello ${input.username},`,
    '',
    `${input.adminUsername} invited you to Castcut.`,
    '',
    'Set your password with this link (valid for 1 hour):',
    input.resetUrl,
    '',
    'If you were not expecting this, ignore the email.',
    '',
    appOrigin(),
  ];

  return sendEmail({
    to: input.to,
    subject: 'Castcut — you are invited',
    text: textLines.join('\n'),
    html: brandedEmailHtml({
      title: 'You are invited',
      preheader: 'Set your Castcut password to get started.',
      footerUrl: appOrigin(),
      bodyHtml: emailParagraphs(textLines),
    }),
  });
}

export async function notifyPasswordChanged(input: {
  userId: string;
  username: string;
  changedBy: 'self' | 'admin';
  adminUsername?: string;
}): Promise<void> {
  const config = getEmailConfig();
  if (!config.enabled || !config.notifyPassword) {
    return;
  }

  const user = findUserById(input.userId);
  if (user?.emailNotifySecurity === false) {
    return;
  }

  const to = resolveRecipient(user);
  if (!to) {
    return;
  }

  const when = new Date().toLocaleString();
  const actorLine =
    input.changedBy === 'admin'
      ? `An administrator${input.adminUsername ? ` (${input.adminUsername})` : ''} reset your password.`
      : 'Your password was changed from your profile.';

  const textLines = [
    `Hello ${input.username},`,
    '',
    actorLine,
    '',
    `Time: ${when}`,
    '',
    'If you did not make this change, contact your administrator immediately.',
    '',
    appOrigin(),
  ];

  await sendEmail({
    to,
    subject: 'Castcut — password updated',
    text: textLines.join('\n'),
    html: brandedEmailHtml({
      title: 'Password updated',
      preheader: 'Your Castcut password was changed.',
      footerUrl: appOrigin(),
      bodyHtml: emailParagraphs(textLines),
    }),
  });
}

export async function notifyBatchCompleted(input: {
  userId?: string;
  username?: string;
  kind: BatchCompletionKind;
  promptCount: number;
  queued?: number;
  ranked?: boolean;
  message?: string;
}): Promise<void> {
  const config = getEmailConfig();
  if (!config.enabled || !config.notifyBatch) {
    return;
  }

  const user = input.userId ? findUserById(input.userId) : null;
  if (user?.emailNotifyBatch === false) {
    return;
  }

  const to = resolveRecipient(user);
  if (!to) {
    return;
  }

  const label =
    input.kind === 'user-campaign'
      ? 'Scheduled campaign'
      : input.kind === 'client-scheduled'
        ? 'Scheduled batch'
        : 'Server batch';

  const lines = [
    `Hello ${user?.username ?? input.username ?? 'there'},`,
    '',
    `Your ${label.toLowerCase()} finished.`,
    '',
    `Prompts generated: ${input.promptCount}`,
  ];

  if (typeof input.queued === 'number') {
    lines.push(`Queued to ComfyUI: ${input.queued}`);
  }
  if (input.ranked) {
    lines.push('Best-of-N ranking was applied.');
  }
  if (input.message?.trim()) {
    lines.push('', input.message.trim());
  }

  lines.push(
    '',
    `Completed: ${new Date().toLocaleString()}`,
    '',
    `Open studio: ${appOrigin()}/studio`
  );

  await sendEmail({
    to,
    subject: `Castcut — ${label} complete`,
    text: lines.join('\n'),
    html: brandedEmailHtml({
      title: `${label} complete`,
      preheader: `${input.promptCount} prompts finished in Castcut.`,
      footerUrl: `${appOrigin()}/studio`,
      bodyHtml: emailParagraphs(lines),
    }),
  });
}
