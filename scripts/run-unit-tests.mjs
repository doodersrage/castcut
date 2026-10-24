#!/usr/bin/env node
/**
 * Recursively collects every `*.test.ts` file under src/lib, adds the
 * desktop test target file, and runs them all through Node's built-in
 * test runner (via tsx for TS support).
 *
 * Replaces a hand-maintained list of test file paths in package.json's
 * `test` script: that list silently stopped growing at some point, so
 * newly added test files (51 of them, as of 2026-08-31, including
 * workflow-lightning-queue.test.ts) were never actually run in `npm test`
 * or CI. This script always reflects what's on disk.
 *
 * Any extra CLI args (e.g. --test-name-pattern=foo) are forwarded to
 * `node --test`.
 */

import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const LIB_DIR = join(ROOT, 'src', 'lib');

function collectTestFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectTestFiles(full));
    } else if (entry.endsWith('.test.ts')) {
      results.push(full);
    }
  }
  return results;
}

const libTestFiles = collectTestFiles(LIB_DIR).sort();
const desktopTestFile = join(ROOT, 'desktop', 'scripts', 'targets.test.mjs');
const allTestFiles = [desktopTestFile, ...libTestFiles];

console.log(
  `Running ${allTestFiles.length} test files (${libTestFiles.length} under src/lib + 1 desktop target).`
);

const extraArgs = process.argv.slice(2);
// Secrets the server generates on first start (auth/generated-secrets.ts) go to a throwaway
// folder, not the checkout's .prompt-studio-data.
const secretsDir = mkdtempSync(join(tmpdir(), 'castcut-test-secrets-'));
// Same for the app's copies of ComfyUI input pictures (comfyui/input-store-server.ts).
const inputStoreDir = mkdtempSync(join(tmpdir(), 'castcut-test-inputs-'));
const result = spawnSync(
  process.execPath,
  [
    '--import',
    'tsx',
    '--experimental-test-module-mocks',
    '--test',
    ...extraArgs,
    ...allTestFiles.map(f => relative(ROOT, f)),
  ],
  {
    stdio: 'inherit',
    cwd: ROOT,
    env: {
      ...process.env,
      CASTCUT_SECRETS_DIR: secretsDir,
      CASTCUT_INPUT_STORE_DIR: inputStoreDir,
    },
  }
);
rmSync(secretsDir, { recursive: true, force: true });
rmSync(inputStoreDir, { recursive: true, force: true });

process.exit(result.status ?? 1);
