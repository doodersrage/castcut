import path from 'node:path';

/**
 * Default on-disk studio data root (auth, presets, etc.).
 * Always mark `process.cwd()` with turbopackIgnore — otherwise Turbopack NFT
 * walks the whole project tree and panics on Python `.venv` symlinks that
 * point outside the repo (e.g. `python -> /usr/bin/python3.xx`).
 */
export function defaultPromptStudioDataDir(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), '.prompt-studio-data');
}

/** Resolve PROMPT_DATA_DIR / PROMPT_AUTH_DIR / default data root. */
export function resolvePromptDataDir(options?: { preferAuthDir?: boolean }): string {
  if (options?.preferAuthDir) {
    const auth = process.env.PROMPT_AUTH_DIR?.trim();
    if (auth) {
      return path.resolve(/* turbopackIgnore: true */ auth);
    }
  }
  const data = process.env.PROMPT_DATA_DIR?.trim();
  if (data) {
    return path.resolve(/* turbopackIgnore: true */ data);
  }
  return defaultPromptStudioDataDir();
}

/** Auth JSON directory under the resolved data root. */
export function resolvePromptAuthDir(): string {
  return path.join(resolvePromptDataDir({ preferAuthDir: true }), 'auth');
}
