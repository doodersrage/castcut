import 'server-only';

import nodemailer from 'nodemailer';
import { getEmailConfig, isEmailConfigured } from './config';

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type Transporter = ReturnType<typeof nodemailer.createTransport>;

let transporter: Transporter | null = null;
let transporterSignature = '';

function smtpSignature(): string {
  const config = getEmailConfig();
  return JSON.stringify({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    user: config.smtp.user ?? '',
    pass: config.smtp.pass ?? '',
    from: config.from,
    enabled: config.enabled,
  });
}

export function invalidateEmailTransporter(): void {
  transporter = null;
  transporterSignature = '';
}

function getTransporter(): Transporter {
  const config = getEmailConfig();
  const signature = smtpSignature();
  if (!transporter || transporterSignature !== signature) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth:
        config.smtp.user && config.smtp.pass
          ? { user: config.smtp.user, pass: config.smtp.pass }
          : undefined,
    });
    transporterSignature = signature;
  }
  return transporter;
}

export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { ok: false, error: 'Email is not configured.' };
  }

  const config = getEmailConfig();
  const to = input.to.trim();
  if (!to) {
    return { ok: false, error: 'Recipient address is required.' };
  }

  try {
    await getTransporter().sendMail({
      from: config.from,
      to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? input.text.replace(/\n/g, '<br>'),
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email send failed.';
    console.error('[email]', message);
    return { ok: false, error: message };
  }
}

export { isEmailConfigured };
