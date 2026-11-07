/**
 * Server: Castcut's voice engine (addons/voice — Qwen3-TTS Base, ~4 GB, in its own venv) reads a
 * line in a kept voice. LTX-2.5's audio-only reading needs a 20 GB transformer and a 14.6 GB text
 * encoder: on a 24 GB GPU beside an LLM it streamed weights every step, 45–105 s a line
 * (2026-11-07). Used for a line with a kept voice sample when the engine answers; otherwise the
 * line goes to LTX as before (narration-server.ts).
 *
 * The engine: VOICE_ENGINE_URL, else the one Settings installed and autostart runs
 * (voice-engine-install.ts) on 127.0.0.1:8191.
 */

import { uploadComfyInputContent } from '../comfyui/comfy-input-upload-server';

export const VOICE_ENGINE_DEFAULT_URL = 'http://127.0.0.1:8191';
const HEALTH_TTL_MS = 30_000;
/** First line loads the model (~10–30 s); a line itself is seconds. */
const SPEAK_TIMEOUT_MS = 180_000;

let health: { url: string; ok: boolean; at: number } | null = null;

export function voiceEngineUrl(): string {
  return (process.env.VOICE_ENGINE_URL?.trim() || VOICE_ENGINE_DEFAULT_URL).replace(/\/+$/, '');
}

async function answers(url: string, fetchImpl: typeof fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(`${url}/health`, { signal: AbortSignal.timeout(2000) });
    return response.ok && ((await response.json()) as { ok?: boolean }).ok === true;
  } catch {
    return false;
  }
}

/**
 * Whether the engine answers — the installed one started first when it doesn't (same machine,
 * no VOICE_ENGINE_URL). Remembered for half a minute; never with VOICE_ENGINE_URL=off.
 */
export async function voiceEngineReady(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const configured = process.env.VOICE_ENGINE_URL?.trim();
  if (configured?.toLowerCase() === 'off') return false;
  const url = voiceEngineUrl();
  if (health && health.url === url && Date.now() - health.at < HEALTH_TTL_MS) return health.ok;
  let ok = await answers(url, fetchImpl);
  if (!ok && !configured) {
    const { startVoiceEngine } = await import('./voice-engine-install');
    if (startVoiceEngine(Number(new URL(url).port) || 8191)) {
      // The server is up in seconds; the model loads on the first line.
      for (let tries = 0; tries < 30 && !ok; tries += 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        ok = await answers(url, fetchImpl);
      }
    }
  }
  health = { url, ok, at: Date.now() };
  return ok;
}

/** Forget the last health answer (the engine just started, or a line failed). */
export function forgetVoiceEngineHealth(): void {
  health = null;
}

/**
 * Read `line` in the kept voice `voiceSample` (a ComfyUI input file): the sample sent to the
 * engine, its WAV kept in ComfyUI's input folder like a voice sample. Returns its view URL.
 */
export async function readLineWithVoiceEngine(input: {
  line: string;
  voiceSample: string;
  /** What the sample says, when known: it's copied closer. */
  sampleWords?: string;
  /** How the line is said ("teasing, a smile in her voice"), read with the kept voice. */
  delivery?: string;
  /** The read WAV reshaped before it's kept (a scene line's sound, scene-line-sound.ts). */
  shape?: (bytes: Uint8Array) => Promise<{ bytes: Uint8Array; seconds: number | null }>;
  seed?: number;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<{ url: string; seconds: number | null; lineSeconds: number | null }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const params = new URLSearchParams({ filename: input.voiceSample, type: 'input' });
  const sample = await fetchImpl(`${input.baseUrl}/view?${params.toString()}`);
  if (!sample.ok) throw new Error('That voice sample is gone from ComfyUI — keep a voice again.');
  const ref = Buffer.from(await sample.arrayBuffer()).toString('base64');
  const response = await fetchImpl(`${voiceEngineUrl()}/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: input.line,
      ref_audio: ref,
      ...(input.sampleWords?.trim() ? { ref_text: input.sampleWords.trim() } : {}),
      ...(input.delivery?.trim() ? { instruct: input.delivery.trim() } : {}),
      ...(Number.isInteger(input.seed) ? { seed: input.seed } : {}),
    }),
    signal: AbortSignal.timeout(SPEAK_TIMEOUT_MS),
  });
  if (!response.ok) {
    forgetVoiceEngineHealth();
    const error = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      `The voice engine couldn't read that line${error.error ? `: ${error.error}` : '.'}`
    );
  }
  const seconds = Number(response.headers.get('x-voice-seconds'));
  let bytes: Uint8Array = new Uint8Array(await response.arrayBuffer());
  let lineSeconds: number | null = null;
  if (input.shape) ({ bytes, seconds: lineSeconds } = await input.shape(bytes));
  const uploaded = await uploadComfyInputContent({
    baseUrl: input.baseUrl,
    bytes,
    filename: 'castcut-line.wav',
    mimeType: 'audio/wav',
    keepCopy: true,
    fetchImpl,
  });
  const view = new URLSearchParams({
    filename: uploaded.name,
    subfolder: uploaded.subfolder,
    type: uploaded.type || 'input',
  });
  return {
    url: `/api/comfyui/view?${view.toString()}`,
    seconds: Number.isFinite(seconds) ? seconds : null,
    lineSeconds,
  };
}
