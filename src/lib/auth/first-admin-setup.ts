import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { isNetworkExposedDeployment } from '@/lib/bind-exposure-check';
import { resolvePromptAuthDir } from '@/lib/prompt-data-paths';
import { forgetGeneratedSecret, generatedSecret } from './generated-secrets';

/**
 * Making the first admin on the sign-in page. On a server other machines can reach (Docker's
 * 0.0.0.0 bind, PROMPT_EXPOSED, a public PROMPT_API_URL) whoever opened it first would own it,
 * so there it also asks for a one-time code the server prints in its log and keeps in the data
 * folder; a local-only server (pnpm / pm2 on 127.0.0.1) asks for none.
 */
export function setupCodeRequired(): boolean {
  return isNetworkExposedDeployment();
}

let announced = false;

/** The code, printed once per process so `docker compose logs` shows it. */
export function announceSetupCode(): void {
  if (announced || !setupCodeRequired()) return;
  const code = generatedSecret('setup-code', 4);
  if (!code) return;
  announced = true;
  console.log(
    `[castcut] No account yet. Create the admin on the sign-in page with setup code ${code} ` +
      `(also in ${path.join(resolvePromptAuthDir(), 'setup-code')}).`
  );
}

export function setupCodeMatches(provided: string | undefined): boolean {
  if (!setupCodeRequired()) return true;
  const expected = generatedSecret('setup-code', 4);
  const given = (provided ?? '').trim().toLowerCase();
  if (!expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export function finishSetup(): void {
  forgetGeneratedSecret('setup-code');
  announced = false;
}
