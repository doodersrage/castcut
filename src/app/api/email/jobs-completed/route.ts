import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { readSessionFromRequest } from '@/lib/auth/session';
import { findUserById, isAuthEnabled } from '@/lib/auth/store';
import { brandedEmailHtml, emailParagraphs } from '@/lib/email/brand';
import { sendEmail, isEmailConfigured } from '@/lib/email/mailer';
import { getEmailConfig } from '@/lib/email/config';

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

  let body: { completed?: number; lastPrompt?: string; lastStatus?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }

  const completed = body.completed ?? 1;
  const origin = process.env.PROMPT_API_URL?.trim() || 'http://127.0.0.1:47832';
  const textLines = [
    `Hello ${user.username},`,
    '',
    `${completed} gallery job(s) finished.`,
    body.lastPrompt ? `Latest: ${body.lastPrompt}` : '',
    body.lastStatus ? `Status: ${body.lastStatus}` : '',
    '',
    `Open gallery: ${origin}/gallery`,
  ].filter(Boolean);

  await sendEmail({
    to,
    subject: `Castcut — ${completed} ComfyUI job(s) finished`,
    text: textLines.join('\n'),
    html: brandedEmailHtml({
      title: 'Jobs finished',
      preheader: `${completed} ComfyUI job(s) finished in Castcut.`,
      footerUrl: `${origin}/gallery`,
      bodyHtml: emailParagraphs(textLines),
    }),
  });

  return apiJson({ ok: true });
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/email/jobs-completed');
}
