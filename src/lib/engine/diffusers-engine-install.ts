/**
 * The Diffusers engine is its own repo (github.com/doodersrage/castcut-diffusers) and isn't part
 * of a Castcut install. Settings → Inference engine → Install downloads a pinned release into the
 * data folder and runs its install.sh (a Python venv + requirements); autostart then runs it
 * from there. An engine elsewhere is used through DIFFUSERS_ENGINE_DIR (same machine) or
 * DIFFUSERS_API_URL (another machine).
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { resolvePromptDataDir } from '@/lib/prompt/data-paths';

export const DIFFUSERS_ENGINE_REPO = 'doodersrage/castcut-diffusers';
/** The engine release this Castcut installs. */
export const DIFFUSERS_ENGINE_VERSION = 'v1.0.1';
const VERSION_FILE = '.castcut-version';
const LOG_LINES = 40;

export type DiffusersInstallPhase =
  'idle' | 'downloading' | 'unpacking' | 'installing' | 'done' | 'failed';

export type DiffusersInstallJob = {
  phase: DiffusersInstallPhase;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  /** The last lines install.sh printed. */
  log: string[];
};

export type DiffusersEngineAvailability = {
  /** Installed (or pointed at) on this machine: autostart can run it. */
  installed: boolean;
  dir: string | null;
  version: string | null;
  /** An engine URL set on the server (DIFFUSERS_API_URL) — maybe another machine. */
  configuredUrl: boolean;
  available: boolean;
  /** Python 3.10+ on this server — Install needs it (only looked up when asked). */
  python?: string | null;
  wantedVersion: string;
  job: DiffusersInstallJob;
};

export function installedDiffusersEngineDir(): string {
  return path.join(resolvePromptDataDir(), 'diffusers-engine');
}

function hasEngine(dir: string): boolean {
  return fs.existsSync(/* turbopackIgnore: true */ path.join(dir, 'run.sh'));
}

/** Where the engine is on this machine, or null when it isn't installed. */
export function resolveDiffusersEngineDir(): string | null {
  const fromEnv = process.env.DIFFUSERS_ENGINE_DIR?.trim();
  if (fromEnv) return path.resolve(/* turbopackIgnore: true */ fromEnv);
  // Ours counts once install.sh finished (it writes the version file last): during an install
  // run.sh is already unpacked but the venv isn't ready.
  const installed = installedDiffusersEngineDir();
  return hasEngine(installed) &&
    fs.existsSync(/* turbopackIgnore: true */ path.join(installed, VERSION_FILE))
    ? installed
    : null;
}

function findPython(): string | null {
  for (const command of [process.env.PYTHON?.trim(), 'python3', 'python'].filter(Boolean)) {
    const result = spawnSync(
      command!,
      ['-c', 'import sys; print(sys.version_info[:2] >= (3, 10))'],
      {
        encoding: 'utf8',
        timeout: 5000,
      }
    );
    if (result.status === 0 && result.stdout.trim() === 'True') return command!;
  }
  return null;
}

let job: DiffusersInstallJob = { phase: 'idle', log: [] };

export function diffusersEngineAvailability(options?: {
  checkPython?: boolean;
}): DiffusersEngineAvailability {
  const dir = resolveDiffusersEngineDir();
  let version: string | null = null;
  if (dir) {
    try {
      version =
        fs.readFileSync(/* turbopackIgnore: true */ path.join(dir, VERSION_FILE), 'utf8').trim() ||
        null;
    } catch {
      version = null;
    }
  }
  const configuredUrl = Boolean(
    process.env.DIFFUSERS_API_URL?.trim() || process.env.NEXT_PUBLIC_DIFFUSERS_API_URL?.trim()
  );
  return {
    installed: Boolean(dir),
    dir,
    version,
    configuredUrl,
    available: Boolean(dir) || configuredUrl,
    ...(options?.checkPython ? { python: findPython() } : {}),
    wantedVersion: DIFFUSERS_ENGINE_VERSION,
    job,
  };
}

function note(line: string) {
  const lines = line.split(/\r?\n/).filter(text => text.trim());
  job = { ...job, log: [...job.log, ...lines].slice(-LOG_LINES) };
}

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ command, args, {
      cwd,
      env: { ...process.env, DIFFUSERS_VENV: '' },
    });
    child.stdout.on('data', chunk => note(String(chunk)));
    child.stderr.on('data', chunk => note(String(chunk)));
    child.on('error', reject);
    child.on('exit', code =>
      code === 0 ? resolve() : reject(new Error(`${path.basename(command)} exited with ${code}`))
    );
  });
}

/**
 * Download the pinned release into the data folder and set it up. One install at a time; the
 * returned job is the one running (poll {@link diffusersEngineAvailability}).
 */
export function startDiffusersEngineInstall(): DiffusersInstallJob {
  if (['downloading', 'unpacking', 'installing'].includes(job.phase)) return job;
  const python = findPython();
  if (!python) {
    job = {
      phase: 'failed',
      log: [],
      error:
        'This server has no Python 3.10+, so the engine cannot be installed here. Run it on a machine with Python and a GPU (see the castcut-diffusers README) and set DIFFUSERS_API_URL.',
      finishedAt: Date.now(),
    };
    return job;
  }
  job = { phase: 'downloading', log: [], startedAt: Date.now() };
  void (async () => {
    const target = installedDiffusersEngineDir();
    const archive = `${target}.download.tar.gz`;
    try {
      fs.mkdirSync(/* turbopackIgnore: true */ path.dirname(target), { recursive: true });
      const url = `https://github.com/${DIFFUSERS_ENGINE_REPO}/archive/refs/tags/${DIFFUSERS_ENGINE_VERSION}.tar.gz`;
      note(`Downloading ${url}`);
      const response = await fetch(url, { redirect: 'follow' });
      if (!response.ok) throw new Error(`Download failed (HTTP ${response.status}).`);
      fs.writeFileSync(
        /* turbopackIgnore: true */ archive,
        Buffer.from(await response.arrayBuffer())
      );
      job = { ...job, phase: 'unpacking' };
      // The venv is made in place (its scripts carry absolute paths), so a re-install replaces
      // the folder before unpacking rather than moving a finished one into place.
      fs.rmSync(/* turbopackIgnore: true */ target, { recursive: true, force: true });
      fs.mkdirSync(/* turbopackIgnore: true */ target, { recursive: true });
      await run('tar', ['-xzf', archive, '--strip-components=1', '-C', target], target);
      job = { ...job, phase: 'installing' };
      await run('bash', [path.join(target, 'install.sh')], target);
      fs.writeFileSync(
        /* turbopackIgnore: true */ path.join(target, VERSION_FILE),
        DIFFUSERS_ENGINE_VERSION
      );
      job = { ...job, phase: 'done', finishedAt: Date.now() };
    } catch (error) {
      job = {
        ...job,
        phase: 'failed',
        error: error instanceof Error ? error.message : 'Install failed.',
        finishedAt: Date.now(),
      };
    } finally {
      fs.rmSync(/* turbopackIgnore: true */ archive, { force: true });
    }
  })();
  return job;
}
