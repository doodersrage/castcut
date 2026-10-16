/**
 * The built-in LLM (llama.cpp run by Castcut, llm-local-server.ts) as llm-client sees it: when it
 * is installed and switched on, LLM calls go to it instead of LLM_API_BASE_URL, and each call makes
 * sure it is running first. The server module registers these hooks on globalThis when it loads
 * (at startup, instrumentation-node.ts), so every bundle's copy of llm-client finds them.
 * Client-safe: no Node built-ins here.
 */

/** The model name the built-in server answers to. */
export const LOCAL_LLM_ALIAS = 'castcut-local';

export type LocalLlmModelChoice = {
  id: string;
  label: string;
  /** Hugging Face repo. */
  repo: string;
  file: string;
  /** Vision projector. */
  mmproj: string;
  sizeGb: number;
  note: string;
};

export type LocalLlmStatus = {
  supported: boolean;
  unsupportedReason?: string;
  installed: boolean;
  /** Installed and switched on: LLM calls use it. */
  enabled: boolean;
  running: boolean;
  modelId?: string;
  /** The context it is started with. */
  context: number;
  /** What the running server reports. */
  contextLength?: number;
  release?: string;
  baseUrl: string;
  models: (LocalLlmModelChoice & { onDisk: boolean })[];
  job?: {
    phase: 'server' | 'model' | 'done' | 'failed';
    file?: string;
    done?: number;
    total?: number;
    error?: string;
  };
};

export type LocalLlmHooks = {
  /** The built-in server's endpoint when it is installed and on, else null. */
  config(): { baseUrl: string; model: string } | null;
  ensure(): Promise<void>;
  stop(): Promise<boolean>;
};

const KEY = '__castcutLocalLlm';

export function registerLocalLlmHooks(hooks: LocalLlmHooks): void {
  (globalThis as Record<string, unknown>)[KEY] = hooks;
}

export function localLlmHooks(): LocalLlmHooks | null {
  return ((globalThis as Record<string, unknown>)[KEY] as LocalLlmHooks | undefined) ?? null;
}

/** The built-in server's endpoint, when LLM calls should use it. */
export function localLlmEndpoint(): { baseUrl: string; model: string } | null {
  if (typeof window !== 'undefined') return null;
  return localLlmHooks()?.config() ?? null;
}

/** Before a call to `baseUrl`: start the built-in server when that is where it goes. */
export async function ensureLocalLlmFor(baseUrl: string): Promise<void> {
  const local = localLlmEndpoint();
  if (local && baseUrl.replace(/\/$/, '') === local.baseUrl) await localLlmHooks()!.ensure();
}
