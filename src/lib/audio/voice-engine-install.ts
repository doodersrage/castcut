/**
 * Castcut's voice engine ships in Castcut (addons/voice: server.py, install.sh, run.sh) and is set
 * up on demand: Settings → Voice engine → Install copies it into the data folder and runs its
 * install.sh (its own Python venv — Qwen3-TTS pins transformers 4.57, which ComfyUI's 5.x can't
 * take — about 7 GB with CUDA torch, plus the ~5 GB model on first use). Then it is started on
 * 127.0.0.1:8191 when a line needs it. VOICE_ENGINE_DIR points at one installed elsewhere on this
 * machine; VOICE_ENGINE_URL at one on another machine (no autostart).
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { resolvePromptDataDir } from '@/lib/prompt/data-paths';

const VERSION_FILE = '.castcut-version';
const LOG_LINES = 40;

export type VoiceInstallPhase = 'idle' | 'copying' | 'installing' | 'done' | 'failed';

export type VoiceInstallJob = {
  phase: VoiceInstallPhase;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  /** The last lines install.sh printed. */
  log: string[];
};

export type VoiceEngineAvailability = {
  installed: boolean;
  dir: string | null;
  version: string | null;
  /** The version this Castcut ships (addons/voice/VERSION). */
  wantedVersion: string | null;
  /** VOICE_ENGINE_URL set: an engine elsewhere, used as it is. */
  configuredUrl: boolean;
  python?: string | null;
  job: VoiceInstallJob;
};

/** The engine's source as Castcut ships it (traced into the build for the install route). */
export function bundledVoiceEngineDir(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), 'addons', 'voice');
}

export function installedVoiceEngineDir(): string {
  return path.join(resolvePromptDataDir(), 'voice-engine');
}

function readVersion(file: string): string | null {
  try {
    return fs.readFileSync(/* turbopackIgnore: true */ file, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

/** Where the engine is on this machine (install.sh finished: its version file), else null. */
export function resolveVoiceEngineDir(): string | null {
  const fromEnv = process.env.VOICE_ENGINE_DIR?.trim();
  const dir = fromEnv
    ? path.resolve(/* turbopackIgnore: true */ fromEnv)
    : installedVoiceEngineDir();
  return fs.existsSync(/* turbopackIgnore: true */ path.join(dir, 'run.sh')) &&
    fs.existsSync(/* turbopackIgnore: true */ path.join(dir, VERSION_FILE))
    ? dir
    : null;
}

function findPython(): string | null {
  for (const command of [process.env.PYTHON?.trim(), 'python3', 'python'].filter(Boolean)) {
    const result = spawnSync(
      command!,
      ['-c', 'import sys; print(sys.version_info[:2] >= (3, 10))'],
      { encoding: 'utf8', timeout: 5000 }
    );
    if (result.status === 0 && result.stdout.trim() === 'True') return command!;
  }
  return null;
}

let job: VoiceInstallJob = { phase: 'idle', log: [] };

export function voiceEngineAvailability(options?: {
  checkPython?: boolean;
}): VoiceEngineAvailability {
  const dir = resolveVoiceEngineDir();
  return {
    installed: Boolean(dir),
    dir,
    version: dir ? readVersion(path.join(dir, VERSION_FILE)) : null,
    wantedVersion: readVersion(path.join(bundledVoiceEngineDir(), 'VERSION')),
    configuredUrl: Boolean(process.env.VOICE_ENGINE_URL?.trim()),
    ...(options?.checkPython ? { python: findPython() } : {}),
    job,
  };
}

function note(line: string) {
  const lines = line.split(/\r?\n/).filter(text => text.trim());
  job = { ...job, log: [...job.log, ...lines].slice(-LOG_LINES) };
}

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ command, args, { cwd, env: process.env });
    child.stdout.on('data', chunk => note(String(chunk)));
    child.stderr.on('data', chunk => note(String(chunk)));
    child.on('error', reject);
    child.on('exit', code =>
      code === 0 ? resolve() : reject(new Error(`${path.basename(command)} exited with ${code}`))
    );
  });
}

const ENGINE_FILES = ['server.py', 'install.sh', 'run.sh', 'requirements.txt', 'VERSION'];

/** Copy the shipped engine into the data folder and set it up. One install at a time. */
export function startVoiceEngineInstall(): VoiceInstallJob {
  if (job.phase === 'copying' || job.phase === 'installing') return job;
  if (!findPython()) {
    job = {
      phase: 'failed',
      log: [],
      error:
        'This server has no Python 3.10+, so the voice engine cannot be installed here. Lines are read with LTX in ComfyUI instead.',
      finishedAt: Date.now(),
    };
    return job;
  }
  job = { phase: 'copying', log: [], startedAt: Date.now() };
  void (async () => {
    const source = bundledVoiceEngineDir();
    const target = installedVoiceEngineDir();
    try {
      fs.mkdirSync(/* turbopackIgnore: true */ target, { recursive: true });
      // The venv stays (a re-install updates it in place); its version file goes until done.
      fs.rmSync(/* turbopackIgnore: true */ path.join(target, VERSION_FILE), { force: true });
      for (const file of ENGINE_FILES) {
        fs.copyFileSync(
          /* turbopackIgnore: true */ path.join(source, file),
          /* turbopackIgnore: true */ path.join(target, file)
        );
      }
      fs.chmodSync(/* turbopackIgnore: true */ path.join(target, 'install.sh'), 0o755);
      fs.chmodSync(/* turbopackIgnore: true */ path.join(target, 'run.sh'), 0o755);
      job = { ...job, phase: 'installing' };
      await run('bash', [path.join(target, 'install.sh')], target);
      job = { ...job, phase: 'done', finishedAt: Date.now() };
    } catch (error) {
      job = {
        ...job,
        phase: 'failed',
        error: error instanceof Error ? error.message : 'Install failed.',
        finishedAt: Date.now(),
      };
    }
  })();
  return job;
}

let child: ChildProcess | null = null;

/**
 * Start the installed engine on `port` (same machine only), once: the caller waits for its
 * health. False when there's nothing installed, or it's already been started.
 */
export function startVoiceEngine(port: number): boolean {
  if (child && child.exitCode === null) return false;
  const dir = resolveVoiceEngineDir();
  if (!dir) return false;
  child = spawn(/* turbopackIgnore: true */ path.join(dir, 'run.sh'), [], {
    cwd: dir,
    // It exits when idle (GPU and all — ComfyUI gets it back); the next line starts it again.
    env: {
      ...process.env,
      VOICE_ENGINE_PORT: String(port),
      VOICE_ENGINE_HOST: '127.0.0.1',
      VOICE_ENGINE_EXIT_IDLE: '1',
    },
    stdio: 'ignore',
  });
  child.on('exit', () => {
    child = null;
  });
  child.unref();
  return true;
}
