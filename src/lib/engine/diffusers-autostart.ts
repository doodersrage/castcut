/**
 * Same-machine Diffusers engine autostart (localhost only).
 * Spawns the installed engine (diffusers-engine-install.ts) via run.sh / venv uvicorn when
 * health fails.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { checkDiffusersHealth } from '../server/service-health';
import { getDiffusersBaseUrl } from './diffusers-client';
import { resolveDiffusersEngineDir } from './diffusers-engine-install';

export type DiffusersEnsureResult = {
  ok: boolean;
  url: string;
  /** True when this call spawned (or waited on) a new process. */
  started: boolean;
  alreadyRunning?: boolean;
  error?: string;
  device?: string;
  model?: string;
};

let spawnInflight: Promise<DiffusersEnsureResult> | null = null;
let spawnedChild: ChildProcess | null = null;

function envAutostartEnabled(): boolean {
  const raw = process.env.DIFFUSERS_AUTOSTART?.trim().toLowerCase();
  if (!raw) {
    return true;
  }
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no';
}

/** Autostart only spawns for same-machine engines. */
export function isLoopbackDiffusersUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

function listenPort(url: string): number {
  try {
    const parsed = new URL(url);
    if (parsed.port) {
      return Number(parsed.port);
    }
    return parsed.protocol === 'https:' ? 443 : 80;
  } catch {
    return 8190;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

function externalVenvUvicorn(): string | null {
  const fromEnv = process.env.DIFFUSERS_VENV?.trim();
  if (fromEnv) {
    const candidate = path.join(
      /* turbopackIgnore: true */ path.resolve(fromEnv),
      'bin',
      'uvicorn'
    );
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  const home = process.env.HOME?.trim() || process.env.USERPROFILE?.trim();
  const xdg = process.env.XDG_CACHE_HOME?.trim();
  const cacheRoot = xdg
    ? /* turbopackIgnore: true */ path.resolve(xdg)
    : home
      ? path.join(/* turbopackIgnore: true */ path.resolve(home), '.cache')
      : null;
  if (!cacheRoot) {
    return null;
  }
  const candidate = path.join(
    cacheRoot,
    'comfyui-prompt-studio',
    'diffusers-engine',
    '.venv',
    'bin',
    'uvicorn'
  );
  return fs.existsSync(candidate) ? candidate : null;
}

function resolveSpawnCommand(
  engineDir: string,
  port: number
): { command: string; args: string[]; cwd: string } | null {
  // Prefer run.sh — it resolves an external cache venv before any in-tree .venv.
  const runSh = path.join(engineDir, 'run.sh');
  if (fs.existsSync(runSh) && fs.statSync(runSh).isFile()) {
    return {
      command: runSh,
      args: ['--port', String(port)],
      cwd: engineDir,
    };
  }
  const external = externalVenvUvicorn();
  if (external) {
    return {
      command: external,
      args: ['app.main:app', '--host', '127.0.0.1', '--port', String(port)],
      cwd: engineDir,
    };
  }
  // Legacy in-tree venv (avoid when possible — Turbopack NFT panics on its symlinks).
  const venvUvicorn = path.join(engineDir, '.venv', 'bin', 'uvicorn');
  if (fs.existsSync(venvUvicorn)) {
    return {
      command: venvUvicorn,
      args: ['app.main:app', '--host', '127.0.0.1', '--port', String(port)],
      cwd: engineDir,
    };
  }
  return null;
}

async function waitUntilHealthy(url: string, timeoutMs: number): Promise<DiffusersEnsureResult> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'Diffusers did not become healthy in time.';
  while (Date.now() < deadline) {
    const health = await checkDiffusersHealth(url);
    if (health.ok) {
      return {
        ok: true,
        url: health.url,
        started: true,
        device: health.device,
        model: health.model,
      };
    }
    lastError = health.error || lastError;
    await sleep(500);
  }
  return { ok: false, url, started: true, error: lastError };
}

function spawnEngine(url: string): ChildProcess {
  const engineDir = resolveDiffusersEngineDir();
  if (!engineDir) {
    throw new Error(
      'The Diffusers engine is not installed — Settings → Inference engine → Install engine, or set DIFFUSERS_API_URL to an engine running elsewhere.'
    );
  }
  const port = listenPort(url);
  const resolved = resolveSpawnCommand(engineDir, port);
  if (!resolved) {
    throw new Error(
      `Diffusers engine not found under ${engineDir} (need run.sh, DIFFUSERS_VENV, or cache venv).`
    );
  }

  const child = spawn(/* turbopackIgnore: true */ resolved.command, resolved.args, {
    cwd: resolved.cwd,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      COMFYUI_ROOT:
        process.env.COMFYUI_ROOT?.trim() ||
        process.env.DIFFUSERS_COMFYUI_ROOT?.trim() ||
        '/opt/comfyui',
      DIFFUSERS_LISTEN_HOST: '127.0.0.1',
      DIFFUSERS_LISTEN_PORT: String(port),
    },
  });
  child.unref();
  spawnedChild = child;
  child.on('exit', () => {
    if (spawnedChild === child) {
      spawnedChild = null;
    }
  });
  return child;
}

/**
 * Ensure the local Diffusers engine is reachable. Spawns it when allowed.
 * @param clientAutoStart Browser setting; false blocks spawn. Env DIFFUSERS_AUTOSTART=0 also blocks.
 */
export async function ensureDiffusersRunning(options?: {
  engineUrl?: string;
  /** From Settings; default true when omitted. */
  autoStart?: boolean;
  waitMs?: number;
}): Promise<DiffusersEnsureResult> {
  let url: string;
  try {
    url = getDiffusersBaseUrl(options?.engineUrl);
  } catch (error) {
    return {
      ok: false,
      url: options?.engineUrl?.trim() || '',
      started: false,
      error: error instanceof Error ? error.message : 'Invalid Diffusers URL.',
    };
  }

  const health = await checkDiffusersHealth(url);
  if (health.ok) {
    return {
      ok: true,
      url: health.url,
      started: false,
      alreadyRunning: true,
      device: health.device,
      model: health.model,
    };
  }

  const clientWants = options?.autoStart !== false;
  if (!clientWants) {
    return {
      ok: false,
      url,
      started: false,
      error: health.error || 'Diffusers is down (autostart off in Settings → Inference engine).',
    };
  }
  if (!envAutostartEnabled()) {
    return {
      ok: false,
      url,
      started: false,
      error: health.error || 'Diffusers is down (DIFFUSERS_AUTOSTART=0 on the server).',
    };
  }
  if (!isLoopbackDiffusersUrl(url)) {
    return {
      ok: false,
      url,
      started: false,
      error: `Autostart only supports localhost engines (got ${url}).`,
    };
  }

  if (!spawnInflight) {
    spawnInflight = (async () => {
      try {
        spawnEngine(url);
      } catch (error) {
        return {
          ok: false,
          url,
          started: false,
          error: error instanceof Error ? error.message : 'Failed to spawn Diffusers engine.',
        };
      }
      return waitUntilHealthy(url, options?.waitMs ?? 45_000);
    })().finally(() => {
      spawnInflight = null;
    });
  }

  return spawnInflight;
}
