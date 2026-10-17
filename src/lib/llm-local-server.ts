/**
 * Server-only: the built-in LLM. Castcut downloads llama.cpp's server (a pinned release, the
 * engine inside LM Studio) and one vision-language model into the data folder, starts it when a
 * request needs it, and stops it when it has been idle or when ComfyUI needs the GPU memory. It
 * speaks the same OpenAI-style API every LLM call already uses, so the rest of the app only sees a
 * different base URL (llm-local.ts registers the hooks llm-client reads).
 *
 * One model does both jobs: Qwen3-VL 8B writes Story and reads stills for the checks, as the
 * NSFWVision model did in LM Studio.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolvePromptDataDir } from '@/lib/prompt-data-paths';
import {
  LOCAL_LLM_ALIAS,
  registerLocalLlmHooks,
  type LocalLlmModelChoice,
  type LocalLlmStatus,
} from '@/lib/llm-local';

/** The llama.cpp release Castcut installs (its numbered builds carry every platform's binaries). */
export const LOCAL_LLM_RELEASE = 'b11696';
const PORT = Number(process.env.LOCAL_LLM_PORT) || 8191;
const DEFAULT_CONTEXT = 8192;
/** Free the GPU for ComfyUI after this long without a request. */
const IDLE_STOP_MS = (Number(process.env.LOCAL_LLM_IDLE_MINUTES) || 15) * 60_000;

export const LOCAL_LLM_MODELS: readonly LocalLlmModelChoice[] = [
  {
    id: 'nsfwvision-qwen3-vl-8b',
    label: 'NSFWVision Qwen3-VL 8B',
    repo: 'GitMylo/nsfwvision-qwen3-vl-8b-v3-gguf',
    file: 'nsfwvision_v3-Q4_K_M.gguf',
    mmproj: 'mmproj-nsfwvision_v3-f16.gguf',
    sizeGb: 6.2,
    note: 'What the checks were tuned on; writes Story and reads adult stills too.',
  },
  {
    id: 'qwen3-vl-8b-instruct-abliterated',
    label: 'Qwen3-VL 8B Instruct (abliterated)',
    repo: 'mradermacher/Qwen3-VL-8B-Instruct-abliterated-GGUF',
    file: 'Qwen3-VL-8B-Instruct-abliterated.IQ4_XS.gguf',
    mmproj: 'Qwen3-VL-8B-Instruct-abliterated.mmproj-Q8_0.gguf',
    sizeGb: 5.3,
    note: 'Smaller and a stricter judge (wrong outfits passed 0/40, extra people 7/8); not yet checked on the gesture, posture and shoe checks.',
  },
  {
    id: 'qwen3-vl-8b-instruct',
    label: 'Qwen3-VL 8B Instruct',
    repo: 'lmstudio-community/Qwen3-VL-8B-Instruct-GGUF',
    file: 'Qwen3-VL-8B-Instruct-Q4_K_M.gguf',
    mmproj: 'mmproj-Qwen3-VL-8B-Instruct-F16.gguf',
    sizeGb: 6.2,
    note: 'General purpose; may refuse to describe adult stills.',
  },
];

type State = {
  enabled: boolean;
  modelId?: string;
  modelPath?: string;
  mmprojPath?: string;
  serverPath?: string;
  release?: string;
  context?: number;
  pid?: number;
};

type Job = NonNullable<LocalLlmStatus['job']>;

const root = () => path.join(resolvePromptDataDir(), 'llm');
const statePath = () => path.join(root(), 'state.json');

function readState(): State {
  try {
    return JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ statePath(), 'utf8')) as State;
  } catch {
    return { enabled: false };
  }
}

function writeState(next: State): void {
  fs.mkdirSync(/* turbopackIgnore: true */ root(), { recursive: true });
  fs.writeFileSync(/* turbopackIgnore: true */ statePath(), JSON.stringify(next, null, 2));
}

/** The llama.cpp build for this machine, or why there is none. */
export function localLlmAsset(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  glibc: boolean = isGlibc()
): { name: string } | { unsupported: string } {
  const tag = LOCAL_LLM_RELEASE;
  if (platform === 'linux') {
    if (!glibc) {
      return {
        unsupported:
          "This server's system (musl, e.g. the Alpine Docker image) can't run llama.cpp's builds. Run the llama.cpp server container next to it and set LLM_API_BASE_URL — step by step: https://doodersrage.github.io/castcut/configuration/#llm-in-docker",
      };
    }
    if (arch === 'x64') return { name: `llama-${tag}-bin-ubuntu-vulkan-x64.tar.gz` };
    if (arch === 'arm64') return { name: `llama-${tag}-bin-ubuntu-vulkan-arm64.tar.gz` };
  }
  if (platform === 'win32' && arch === 'x64')
    return { name: `llama-${tag}-bin-win-vulkan-x64.zip` };
  if (platform === 'darwin') {
    return { name: `llama-${tag}-bin-macos-${arch === 'arm64' ? 'arm64' : 'x64'}.tar.gz` };
  }
  return { unsupported: `No llama.cpp build for ${platform}/${arch}.` };
}

function isGlibc(): boolean {
  if (process.platform !== 'linux') return true;
  const report = process.report?.getReport?.() as { header?: { glibcVersionRuntime?: string } };
  return Boolean(report?.header?.glibcVersionRuntime);
}

/** A copy LM Studio already downloaded (same repo layout), so nothing has to download. */
export function lmStudioCopy(choice: LocalLlmModelChoice, home = os.homedir()) {
  const dir = path.join(home, '.lmstudio', 'models', ...choice.repo.split('/'));
  const model = path.join(dir, choice.file);
  const mmproj = path.join(dir, choice.mmproj);
  return fs.existsSync(/* turbopackIgnore: true */ model) &&
    fs.existsSync(/* turbopackIgnore: true */ mmproj)
    ? { model, mmproj }
    : null;
}

// ── Install ────────────────────────────────────────────────────────────────────────────────

let job: Job | null = null;

async function download(
  url: string,
  target: string,
  onBytes: (done: number, total: number) => void
) {
  const partial = `${target}.partial`;
  const have = fs.existsSync(/* turbopackIgnore: true */ partial)
    ? fs.statSync(/* turbopackIgnore: true */ partial).size
    : 0;
  const response = await fetch(url, {
    redirect: 'follow',
    headers: have ? { Range: `bytes=${have}-` } : {},
  });
  if (!response.ok || !response.body)
    throw new Error(`Download failed (HTTP ${response.status}): ${url}`);
  const resumed = response.status === 206;
  const length = Number(response.headers.get('content-length')) || 0;
  const total = (resumed ? have : 0) + length;
  let done = resumed ? have : 0;
  const out = fs.createWriteStream(/* turbopackIgnore: true */ partial, {
    flags: resumed ? 'a' : 'w',
  });
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      if (!out.write(value)) await new Promise<void>(resolve => out.once('drain', () => resolve()));
      done += value.byteLength;
      onBytes(done, total);
    }
  } finally {
    await new Promise<void>(resolve => out.end(resolve));
  }
  fs.renameSync(/* turbopackIgnore: true */ partial, target);
}

function findServerBinary(dir: string): string | null {
  const name = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
  for (const entry of fs.readdirSync(/* turbopackIgnore: true */ dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return full;
    if (entry.isDirectory()) {
      const found = findServerBinary(full);
      if (found) return found;
    }
  }
  return null;
}

function extract(archive: string, into: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // tar reads .tar.gz everywhere and .zip on Windows (bsdtar).
    const child = spawn(/* turbopackIgnore: true */ 'tar', ['-xf', archive, '-C', into], {
      stdio: 'ignore',
    });
    child.on('error', reject);
    child.on('exit', code =>
      code === 0 ? resolve() : reject(new Error(`tar exited with ${code}`))
    );
  });
}

/** Download the server and the model (or reuse LM Studio's copy). One install at a time. */
export function startLocalLlmInstall(modelId: string): Job {
  if (job && (job.phase === 'server' || job.phase === 'model')) return job;
  const choice = LOCAL_LLM_MODELS.find(model => model.id === modelId) ?? LOCAL_LLM_MODELS[0]!;
  const asset = localLlmAsset();
  if ('unsupported' in asset) {
    job = { phase: 'failed', error: asset.unsupported };
    return job;
  }
  job = { phase: 'server', done: 0, total: 0 };
  void (async () => {
    try {
      const binDir = path.join(root(), 'bin', LOCAL_LLM_RELEASE);
      let serverPath = fs.existsSync(/* turbopackIgnore: true */ binDir)
        ? findServerBinary(binDir)
        : null;
      if (!serverPath) {
        fs.mkdirSync(/* turbopackIgnore: true */ binDir, { recursive: true });
        const archive = path.join(root(), asset.name);
        await download(
          `https://github.com/ggml-org/llama.cpp/releases/download/${LOCAL_LLM_RELEASE}/${asset.name}`,
          archive,
          (done, total) => (job = { phase: 'server', done, total })
        );
        await extract(archive, binDir);
        fs.rmSync(/* turbopackIgnore: true */ archive, { force: true });
        serverPath = findServerBinary(binDir);
        if (!serverPath) throw new Error('The llama.cpp download has no llama-server.');
        if (process.platform !== 'win32')
          fs.chmodSync(/* turbopackIgnore: true */ serverPath, 0o755);
      }
      let files = lmStudioCopy(choice);
      if (!files) {
        const dir = path.join(root(), 'models', choice.id);
        fs.mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });
        const model = path.join(dir, choice.file);
        const mmproj = path.join(dir, choice.mmproj);
        for (const [file, target] of [
          [choice.mmproj, mmproj],
          [choice.file, model],
        ] as const) {
          if (fs.existsSync(/* turbopackIgnore: true */ target)) continue;
          await download(
            `https://huggingface.co/${choice.repo}/resolve/main/${file}`,
            target,
            (done, total) => (job = { phase: 'model', file, done, total })
          );
        }
        files = { model, mmproj };
      }
      writeState({
        ...readState(),
        enabled: true,
        modelId: choice.id,
        modelPath: files.model,
        mmprojPath: files.mmproj,
        serverPath,
        release: LOCAL_LLM_RELEASE,
      });
      job = { phase: 'done' };
    } catch (error) {
      job = { phase: 'failed', error: error instanceof Error ? error.message : 'Install failed.' };
    }
  })();
  return job;
}

// ── Run ────────────────────────────────────────────────────────────────────────────────────

let child: ChildProcess | null = null;
let starting: Promise<void> | null = null;
let lastUsed = 0;
let idleTimer: ReturnType<typeof setInterval> | null = null;

const baseUrl = () => `http://127.0.0.1:${PORT}`;

function installed(state = readState()): boolean {
  return Boolean(
    state.serverPath &&
    state.modelPath &&
    fs.existsSync(/* turbopackIgnore: true */ state.serverPath) &&
    fs.existsSync(/* turbopackIgnore: true */ state.modelPath)
  );
}

async function healthy(): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl()}/health`, { signal: AbortSignal.timeout(1_500) });
    return response.ok;
  } catch {
    return false;
  }
}

function watchIdle(): void {
  if (idleTimer) return;
  idleTimer = setInterval(() => {
    if (lastUsed && Date.now() - lastUsed > IDLE_STOP_MS) void stopLocalLlm();
  }, 60_000);
  idleTimer.unref?.();
}

/** Start the server if it isn't running, and wait until its model is loaded. */
export async function ensureLocalLlm(): Promise<void> {
  lastUsed = Date.now();
  if (await healthy()) return;
  if (starting) return starting;
  const state = readState();
  if (!installed(state)) throw new Error('The built-in LLM is not installed (Settings → LLM).');
  starting = (async () => {
    const args = [
      '-m',
      state.modelPath!,
      ...(state.mmprojPath ? ['--mmproj', state.mmprojPath] : []),
      '--host',
      '127.0.0.1',
      '--port',
      String(PORT),
      '-c',
      String(state.context || DEFAULT_CONTEXT),
      '-ngl',
      // All layers on the GPU; LOCAL_LLM_GPU_LAYERS=0 runs it on the CPU.
      process.env.LOCAL_LLM_GPU_LAYERS?.trim() || '99',
      '--jinja',
      '--alias',
      LOCAL_LLM_ALIAS,
    ];
    child = spawn(/* turbopackIgnore: true */ state.serverPath!, args, {
      cwd: path.dirname(state.serverPath!),
      stdio: 'ignore',
    });
    child.on('exit', () => {
      child = null;
    });
    // Don't leave it running (and holding GPU memory) when Castcut itself stops.
    const owned = child;
    process.once('exit', () => owned.kill());
    writeState({ ...readState(), pid: child.pid });
    // Loading an 8B model and its projector takes a few seconds to a minute.
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      if (await healthy()) {
        watchIdle();
        return;
      }
      if (!child) throw new Error('The built-in LLM stopped while loading (see Settings → LLM).');
      await new Promise(resolve => setTimeout(resolve, 1_000));
    }
    throw new Error('The built-in LLM did not finish loading in 3 minutes.');
  })().finally(() => {
    starting = null;
  });
  return starting;
}

/** Stop the server (frees its GPU memory); the next request starts it again. */
export async function stopLocalLlm(): Promise<boolean> {
  lastUsed = 0;
  const pid = child?.pid ?? readState().pid;
  if (!pid) return false;
  try {
    process.kill(pid);
  } catch {
    // already gone
  }
  child = null;
  writeState({ ...readState(), pid: undefined });
  return true;
}

export function setLocalLlmUse(enabled: boolean, context?: number): void {
  const state = readState();
  writeState({
    ...state,
    enabled: enabled && installed(state),
    ...(context ? { context: Math.max(2048, Math.min(131072, Math.round(context))) } : {}),
  });
}

export async function localLlmStatus(): Promise<LocalLlmStatus> {
  const state = readState();
  const asset = localLlmAsset();
  const running = await healthy();
  let contextLength: number | undefined;
  if (running) {
    try {
      const props = (await (await fetch(`${baseUrl()}/props`)).json()) as {
        default_generation_settings?: { n_ctx?: number };
      };
      contextLength = props.default_generation_settings?.n_ctx;
    } catch {
      contextLength = undefined;
    }
  }
  return {
    supported: !('unsupported' in asset),
    ...('unsupported' in asset ? { unsupportedReason: asset.unsupported } : {}),
    installed: installed(state),
    enabled: Boolean(state.enabled && installed(state)),
    running,
    modelId: state.modelId,
    context: state.context || DEFAULT_CONTEXT,
    ...(contextLength ? { contextLength } : {}),
    release: state.release,
    baseUrl: `${baseUrl()}/v1`,
    models: LOCAL_LLM_MODELS.map(model => ({ ...model, onDisk: Boolean(lmStudioCopy(model)) })),
    ...(job ? { job } : {}),
  };
}

registerLocalLlmHooks({
  config() {
    const state = readState();
    return state.enabled && installed(state)
      ? { baseUrl: `${baseUrl()}/v1`, model: LOCAL_LLM_ALIAS }
      : null;
  },
  ensure: ensureLocalLlm,
  stop: stopLocalLlm,
});
