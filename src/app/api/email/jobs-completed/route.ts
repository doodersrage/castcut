import { publicAppOrigin } from '@/lib/server/public-app-origin';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { readSessionFromRequest } from '@/lib/auth/session';
import { findUserById, isAuthEnabled } from '@/lib/auth/store';
import { brandedEmailHtml, emailParagraphs } from '@/lib/email/brand';
import { sendEmail, isEmailConfigured } from '@/lib/email/mailer';
import { getEmailConfig } from '@/lib/email/config';
import { PRODUCT_NAME } from '@/lib/app/brand';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    return apiError('Authentication is disabled.', 400);
  }
  const config = getEmailConfig();
  if (!isEmailConfigured() || !config.notifyBatch) {
    return apiJson({ ok: false, skipped: true });
  }

  const session = readSessionFromRequest(request);
  const user = session ? findUserById(session.userId) : null;
  if (!user?.enabled || user.emailNotifyBatch === false) {
    return apiJson({ ok: false, skipped: true });
  }

  const to = user.email?.trim() || config.adminEmail;
  if (!to) {
    return apiJson({ ok: false, skipped: true });
  }

  let body: {
    completed?: number;
    failed?: number;
    lastPrompt?: string;
    lastStatus?: string;
    /** A batch's name ("Your Day"): one email when its last job lands. */
    title?: string;
    /** The page the email opens (an app path), default the Gallery. */
    path?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }

  const completed = Math.max(0, Math.round(body.completed ?? 1));
  const failed = Math.max(0, Math.round(body.failed ?? 0));
  const title = body.title?.trim().slice(0, 60) || '';
  const path = /^\/[A-Za-z0-9/_-]{0,60}$/.test(body.path ?? '') ? body.path! : '/gallery';
  const origin = publicAppOrigin();
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const counts = [
    plural(completed, title ? 'still' : 'job') + ' finished',
    failed ? `${failed} failed` : '',
  ]
    .filter(Boolean)
    .join(', ');
  const headline = title ? `${title} is ready — ${counts}.` : `${counts}.`;
  const textLines = [
    `Hello ${user.username},`,
    '',
    headline,
    body.lastPrompt ? `Latest: ${body.lastPrompt}` : '',
    '',
    `Open it: ${origin}${path}`,
  ].filter(Boolean);

  await sendEmail({
    to,
    subject: title ? `${PRODUCT_NAME} — ${title} is ready` : `${PRODUCT_NAME} — ${counts}`,
    text: textLines.join('\n'),
    html: brandedEmailHtml({
      title: title ? `${title} is ready` : 'Jobs finished',
      preheader: headline,
      footerUrl: `${origin}${path}`,
      bodyHtml: emailParagraphs(textLines),
    }),
  });

  return apiJson({ ok: true });
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/email/jobs-completed');
}
