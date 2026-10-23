/**
 * Pose-bench page drivers: sign in when the app has auth on, with .env.local's admin (the API
 * token rides along, as e2e/helpers/auth.ts sends it). A no-op when auth is off.
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

function envLocal(): Record<string, string> {
  let text = '';
  try {
    text = readFileSync('.env.local', 'utf8');
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const at = line.indexOf('=');
    if (!line || line.startsWith('#') || at <= 0) continue;
    out[line.slice(0, at).trim()] = line
      .slice(at + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

export async function signInIfNeeded(page: Page): Promise<void> {
  const env = { ...envLocal(), ...process.env } as Record<string, string | undefined>;
  const token = env.PROMPT_API_TOKEN?.trim();
  const response = await page.request.post('/api/auth/login', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    data: {
      username: env.PROMPT_ADMIN_USERNAME?.trim() || 'admin',
      password: env.PROMPT_ADMIN_PASSWORD?.trim() || 'admin',
    },
  });
  if (!response.ok()) console.warn(`sign-in: HTTP ${response.status()} (auth may be off)`);
}
