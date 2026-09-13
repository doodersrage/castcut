import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { readSessionFromRequest } from '@/lib/auth/session';
import { findUserById, isAuthEnabled } from '@/lib/auth/store';
import { brandedEmailHtml, emailParagraphs } from '@/lib/email/brand';
import { sendEmail, isEmailConfigured } from '@/lib/email/mailer';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isEmailConfigured()) {
    return apiError('Email is not configured on the server.', 503);
  }

  const body = (await request.json().catch(() => ({}))) as { to?: string };
  const session = readSessionFromRequest(request);
  const user = session ? findUserById(session.userId) : null;

  if (isAuthEnabled()) {
    if (!user?.enabled) {
      return apiError('Sign in required.', 401);
    }
  }

  const to = body.to?.trim() || user?.email?.trim();
  if (!to) {
    return apiError(
      isAuthEnabled()
        ? 'Add an email on Profile or pass { to } in the request body.'
        : 'Enter a test recipient. Authentication is off, so a To address is required.',
      400
    );
  }

  const origin = process.env.PROMPT_API_URL?.trim() || 'http://127.0.0.1:47832';
  const greeting = user?.username ?? 'there';
  const textLines = [
    `Hello ${greeting},`,
    '',
    'This is a test message from your Castcut server.',
    '',
    `Sent: ${new Date().toLocaleString()}`,
  ];

  const result = await sendEmail({
    to,
    subject: 'Castcut — test email',
    text: textLines.join('\n'),
    html: brandedEmailHtml({
      title: 'Test email',
      preheader: 'Castcut mail is configured correctly.',
      footerUrl: origin,
      bodyHtml: emailParagraphs(textLines),
    }),
  });

  if (!result.ok) {
    return apiError(result.error ?? 'Failed to send test email.', 502);
  }

  return apiJson({ ok: true, to });
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/email/test');
}
