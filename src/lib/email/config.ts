import { overlayEmailConfig, readStoredEmailConfig } from './store';
import type { EmailConfig } from './types';

export type { EmailConfig } from './types';

function flag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export function getEmailConfig(): EmailConfig {
  const host = process.env.PROMPT_SMTP_HOST?.trim() ?? '';
  const from = process.env.PROMPT_EMAIL_FROM?.trim() || (host ? 'Castcut <noreply@localhost>' : '');
  const enabled = flag(process.env.PROMPT_EMAIL_ENABLED) || (Boolean(host) && Boolean(from));

  const envConfig: EmailConfig = {
    enabled,
    from,
    adminEmail: process.env.PROMPT_ADMIN_EMAIL?.trim() || undefined,
    smtp: {
      host,
      port: Number(process.env.PROMPT_SMTP_PORT ?? '587'),
      secure: flag(process.env.PROMPT_SMTP_SECURE),
      user: process.env.PROMPT_SMTP_USER?.trim() || undefined,
      pass: process.env.PROMPT_SMTP_PASS?.trim() || undefined,
    },
    notifyBatch: process.env.PROMPT_EMAIL_NOTIFY_BATCH?.trim() !== 'false',
    notifyPassword: process.env.PROMPT_EMAIL_NOTIFY_PASSWORD?.trim() !== 'false',
  };
  return overlayEmailConfig(envConfig, readStoredEmailConfig());
}

export function isEmailConfigured(): boolean {
  const config = getEmailConfig();
  return config.enabled && Boolean(config.smtp.host) && Boolean(config.from);
}
