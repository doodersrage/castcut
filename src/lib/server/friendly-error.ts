/**
 * Turns an unknown error into a short sentence a person can act on, while
 * keeping the full detail (message, cause, stack) for the server log.
 *
 * Pure: no Node built-ins, no config reads. Callers that know which service
 * they were talking to pass `service` and `url`; without them the helper
 * guesses from the text and falls back to naming both local services.
 */

export type FriendlyService = 'comfyui' | 'llm';

export interface FriendlyErrorOptions {
  /** Which service the failing call was talking to, when the caller knows. */
  service?: FriendlyService;
  /** That service's address, shown in the message. */
  url?: string;
  /** Used when the error carries no message at all. */
  fallback?: string;
  /** Cap for the user message. Default 300. */
  maxLength?: number;
}

export interface FriendlyError {
  /** Short, plain-language text for the person. */
  message: string;
  /** Everything we know, for console.error. */
  detail: string;
  /** Set when the failure was "could not reach the service". */
  unreachable?: FriendlyService | 'unknown';
}

export const FRIENDLY_ERROR_MAX_LENGTH = 300;

const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_TIMEOUT',
]);

const NETWORK_TEXT =
  /\bfetch failed\b|\b(?:ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT)\b|socket hang up|connect timeout/i;

export function comfyUnreachableMessage(url?: string): string {
  return `Can't reach ComfyUI${url ? ` at ${url}` : ''} — is it running?`;
}

export function llmUnreachableMessage(url?: string): string {
  return `Can't reach the language model (LM Studio${url ? ` at ${url}` : ''}) — start it or turn the LLM off in Settings.`;
}

const UNKNOWN_UNREACHABLE_MESSAGE =
  "Can't reach ComfyUI or the language model (LM Studio) — check they're running.";

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const own = (error as { code?: unknown }).code;
  if (typeof own === 'string') return own;
  const cause = (error as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const code = (cause as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    // AggregateError from happy-eyeballs: first inner error's code.
    const errors = (cause as { errors?: unknown }).errors;
    if (Array.isArray(errors)) return errorCode(errors[0]);
  }
  return undefined;
}

const NETWORK_REASONS: Record<string, string> = {
  ECONNREFUSED: 'connection refused (nothing listening at that address and port)',
  EHOSTUNREACH: 'host unreachable (wrong address, or the network is down)',
  ENETUNREACH: 'network unreachable',
  ENOTFOUND: 'that host name does not resolve',
  EAI_AGAIN: 'that host name does not resolve (DNS)',
  ETIMEDOUT: 'connection timed out (firewall, or the address is wrong)',
  ECONNRESET: 'connection reset',
};

/**
 * Why a connection failed, in words ("fetch failed" names no cause), or
 * undefined when the error isn't a network failure we can name.
 */
export function networkErrorReason(error: unknown, timeoutSeconds?: number): string | undefined {
  if (!(error instanceof Error)) return undefined;
  if (error.name === 'TimeoutError' || error.name === 'AbortError') {
    return timeoutSeconds
      ? `no answer within ${timeoutSeconds} seconds (busy, or the address is wrong)`
      : 'no answer in time (busy, or the address is wrong)';
  }
  const code = errorCode(error);
  if (!code) return undefined;
  return NETWORK_REASONS[code] || `${error.message} (${code})`;
}

/** Whether the error means "couldn't connect", not "connected and it said no". */
export function isUnreachableError(error: unknown): boolean {
  const code = errorCode(error);
  if (code && NETWORK_CODES.has(code)) return true;
  if (error instanceof Error) {
    return NETWORK_TEXT.test(error.message);
  }
  return typeof error === 'string' && NETWORK_TEXT.test(error);
}

function guessService(text: string): FriendlyService | undefined {
  if (/\bcomfy(?:ui)?\b|:8188\b|\/prompt\b|\/object_info\b/i.test(text)) return 'comfyui';
  if (
    /\bLLM\b|LM Studio|language model|chat\/completions|:1234\b|ollama|vision model/i.test(text)
  ) {
    return 'llm';
  }
  return undefined;
}

const STACK_FRAME = /^\s*at\s+(?:.+\(.+\)|\S+:\d+(?::\d+)?|<anonymous>|async\s.+|new\s.+|\S+)\s*$/;

/** Drops `    at foo (file:1:2)` frames and "a | b | at x" joined stacks. */
export function stripStackFrames(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .flatMap(line => line.split(/\s\|\s(?=\s*at\s)/))
    .filter(line => !STACK_FRAME.test(line));
  return lines
    .join('\n')
    .replace(/\s·\s*$/, '')
    .trim();
}

const FFMPEG_NOISE =
  /^(?:ffmpeg version|ffprobe version|\s*built with|\s*configuration:|\s*lib(?:av|sw|postproc)\w*\s|Input #|Output #|\s+Metadata:|\s+Duration:|\s+Stream #|\s+Side data:|Stream mapping:|Press \[q\]|\s{2,}\S|frame=|size=|video:|\[out#)/i;
const MEANINGFUL =
  /error|invalid|no such|not found|failed|unable|could not|cannot|can't|unknown|does not|unsupported|denied|too (?:large|small|many)|missing|out of memory|empty/i;
const GENERIC_TAIL = /^(?:Conversion failed!?|Error while filtering\.?|Exiting\.?)$/i;

function looksLikeToolDump(text: string, lines: string[]): boolean {
  if (lines.length < 2) return false;
  return /ffmpeg version|ffprobe version|^\[[\w-]+ @ 0x[0-9a-f]+\]|Conversion failed|Input #\d|Stream mapping:|Error while filtering/im.test(
    text
  );
}

/** First meaningful line of a multi-line stderr dump; untouched for short text. */
export function firstMeaningfulLine(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.replace(/\s+$/, ''))
    .filter(line => line.trim());
  if (!looksLikeToolDump(text, lines)) return text.trim();
  const candidates = lines.filter(line => !FFMPEG_NOISE.test(line));
  const pick =
    candidates.find(line => MEANINGFUL.test(line) && !GENERIC_TAIL.test(line.trim())) ||
    candidates.find(line => !GENERIC_TAIL.test(line.trim())) ||
    candidates[candidates.length - 1] ||
    lines[lines.length - 1] ||
    '';
  // "[h264 @ 0x55d…] Invalid data" → "Invalid data (h264)"
  const tagged = pick.trim().match(/^\[([\w-]+) @ 0x[0-9a-f]+\]\s*(.+)$/i);
  return tagged ? `${tagged[2]} (${tagged[1]})` : pick.trim();
}

export function capLength(text: string, max = FRIENDLY_ERROR_MAX_LENGTH): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const flat = trimmed.replace(/\s+/g, ' ');
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const atWord = cut.replace(/\s+\S*$/, '');
  return `${atWord.length > max * 0.6 ? atWord : cut}…`;
}

/**
 * Text-only clean-up, for places that only have the message string
 * (e.g. `apiError(error.message, 500)`): unreachable → plain sentence,
 * stack frames dropped, tool dumps cut to one line, length capped.
 */
export function friendlyErrorText(text: string, options: FriendlyErrorOptions = {}): string {
  const raw = (text ?? '').toString();
  if (!raw.trim()) return options.fallback || 'Something went wrong.';
  if (NETWORK_TEXT.test(raw)) {
    const service = options.service ?? guessService(raw);
    if (service === 'comfyui') return comfyUnreachableMessage(options.url);
    if (service === 'llm') return llmUnreachableMessage(options.url);
    // Bare "fetch failed" with nothing else worth keeping.
    if (/^(?:TypeError: )?fetch failed\.?$/i.test(raw.trim())) return UNKNOWN_UNREACHABLE_MESSAGE;
  }
  const cleaned = firstMeaningfulLine(stripStackFrames(raw));
  return capLength(cleaned || options.fallback || 'Something went wrong.', options.maxLength);
}

function describeForLog(error: unknown): string {
  if (error instanceof Error) {
    const parts = [error.stack || `${error.name}: ${error.message}`];
    const code = errorCode(error);
    if (code) parts.push(`code: ${code}`);
    const cause = (error as { cause?: unknown }).cause;
    if (cause !== undefined && cause !== null) {
      parts.push(
        `cause: ${cause instanceof Error ? cause.stack || cause.message : safeString(cause)}`
      );
    }
    return parts.join('\n');
  }
  return safeString(error);
}

function safeString(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function friendlyError(error: unknown, options: FriendlyErrorOptions = {}): FriendlyError {
  const detail = describeForLog(error);
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : (error as { message?: unknown } | null)?.message;
  const text = typeof message === 'string' ? message : '';

  if (error instanceof Error && error.name === 'TimeoutError') {
    const service = options.service ?? guessService(text);
    const who =
      service === 'comfyui' ? 'ComfyUI' : service === 'llm' ? 'The language model' : 'The service';
    return {
      message: `${who}${options.url ? ` at ${options.url}` : ''} didn't answer in time — it may be busy; try again.`,
      detail,
    };
  }

  if (isUnreachableError(error)) {
    const service = options.service ?? guessService(text);
    if (service === 'comfyui') {
      return { message: comfyUnreachableMessage(options.url), detail, unreachable: 'comfyui' };
    }
    if (service === 'llm') {
      return { message: llmUnreachableMessage(options.url), detail, unreachable: 'llm' };
    }
    return { message: UNKNOWN_UNREACHABLE_MESSAGE, detail, unreachable: 'unknown' };
  }

  return { message: friendlyErrorText(text, options), detail };
}
