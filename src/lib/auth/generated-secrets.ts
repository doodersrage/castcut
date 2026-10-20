import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { resolvePromptAuthDir } from '@/lib/prompt/data-paths';

/**
 * Secrets the server makes itself on first start and keeps in the data folder, so a new install
 * (Docker especially) needs no `openssl rand` lines in its env file (2026-10-14). An env value
 * always wins; these are only the fallback.
 */
const cache = new Map<string, string | null>();

function secretPath(name: string): string {
  // CASTCUT_SECRETS_DIR: somewhere else (the unit-test runner points it at a temp folder).
  const dir = process.env.CASTCUT_SECRETS_DIR?.trim() || resolvePromptAuthDir();
  return path.join(dir, name);
}

function readSecret(file: string): string | null {
  try {
    const value = fs.readFileSync(file, 'utf8').trim();
    return value || null;
  } catch {
    return null;
  }
}

/** The stored secret, made (random, owner-only file) when there is none; null when the data folder can't be written. */
export function generatedSecret(name: 'session-secret' | 'setup-code', bytes = 32): string | null {
  const file = secretPath(name);
  const cached = cache.get(file);
  if (cached) return cached;
  let value = readSecret(file);
  if (!value) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      // 'wx': two workers starting together keep whichever wrote first.
      fs.writeFileSync(file, `${randomBytes(bytes).toString('hex')}\n`, {
        mode: 0o600,
        flag: 'wx',
      });
    } catch {
      // Exists already (the other worker won) or the folder is read-only.
    }
    value = readSecret(file);
  }
  cache.set(file, value);
  return value;
}

/** Removes a stored secret (the setup code once the first account exists). */
export function forgetGeneratedSecret(name: 'setup-code'): void {
  const file = secretPath(name);
  cache.delete(file);
  try {
    fs.rmSync(file, { force: true });
  } catch {
    // Best effort.
  }
}

/** Tests only. */
export function resetGeneratedSecretCache(): void {
  cache.clear();
}
