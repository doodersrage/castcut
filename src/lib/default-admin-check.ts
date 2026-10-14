import { getDefaultAdminUsername, isAuthExplicitlyEnabled } from './auth/config';

/**
 * True when PROMPT_AUTH_ENABLED is on and PROMPT_ADMIN_PASSWORD is the well-known "admin". An
 * unset password is fine now: no account exists until the first admin is made on the sign-in
 * page (auth/store.ts createFirstAdmin, 2026-10-14) — there is no built-in password any more.
 */
export function isUsingDefaultAdminCredentials(): boolean {
  if (!isAuthExplicitlyEnabled()) {
    return false;
  }
  return process.env.PROMPT_ADMIN_PASSWORD?.trim().toLowerCase() === 'admin';
}

export function getDefaultAdminCredentialsWarning(): string {
  return (
    `PROMPT_AUTH_ENABLED is true and PROMPT_ADMIN_PASSWORD is "admin", so the ` +
    `"${getDefaultAdminUsername()}" account has the well-known default password. Set a strong ` +
    `PROMPT_ADMIN_PASSWORD, or leave it empty and create the admin on the sign-in page - see ` +
    `docs/configuration.md.`
  );
}
