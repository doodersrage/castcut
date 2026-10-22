import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The PROMPT_DATA_DIR of the server a local run starts. Tests seed Cast records, settings and
 * gallery entries and reset settings to their defaults — never in the studio's real data dir
 * (.env.local's). The server's copy also flowed back into the tests: a real Cast and settings
 * where CI has none.
 */
export function e2eDataDir(): string {
  return process.env.PROMPT_E2E_DATA_DIR?.trim() || join(tmpdir(), 'castcut-e2e-data');
}
