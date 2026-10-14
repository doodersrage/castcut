import { generatedSecret } from './generated-secrets';

export function getDefaultAdminUsername(): string {
  return process.env.PROMPT_ADMIN_USERNAME?.trim() || 'admin';
}

/** PROMPT_ADMIN_PASSWORD, or null: then the first admin is made on the sign-in page (no built-in password). */
export function getDefaultAdminPassword(): string | null {
  return process.env.PROMPT_ADMIN_PASSWORD?.trim() || null;
}

export function isAuthExplicitlyEnabled(): boolean {
  const raw = process.env.PROMPT_AUTH_ENABLED?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function getSessionSecret(): string {
  return (
    process.env.PROMPT_SESSION_SECRET?.trim() ||
    process.env.PROMPT_API_TOKEN?.trim() ||
    generatedSecret('session-secret') ||
    'prompt-studio-dev-session-secret'
  );
}

export const SESSION_COOKIE_NAME = 'prompt-studio-session';
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 14;
