import 'server-only';

import { getComfyUiBaseUrl } from './comfyui-client';
import { stripEmptyComfyUiRuntime } from './comfyui-config';
import { executingPhaseMessage } from './comfyui-loader-phase';
import { parseComfyPreviewBinary } from './comfyui-preview-binary';

const CLIENT_FEATURE_FLAGS = {
  supports_preview_metadata: true,
  supports_progress_text_metadata: true,
} as const;

export type ComfyLiveBridgeEvent =
  | { type: 'ready'; comfyUrl: string; clientId: string }
  | {
      type: 'preview';
      mimeType: 'image/jpeg' | 'image/png';
      base64: string;
      promptId?: string;
    }
  | {
      type: 'progress';
      promptId?: string;
      node?: string | null;
      value?: number;
      max?: number;
      message?: string;
      status: 'executing' | 'progress' | 'finished' | 'error';
    }
  | { type: 'error'; message: string };

type Subscriber = (event: ComfyLiveBridgeEvent) => void;

type BridgeSession = {
  key: string;
  clientId: string;
  comfyUrl: string;
  socket: WebSocket;
  subscribers: Set<Subscriber>;
  ready: boolean;
  /** Graphs of jobs seen executing (null = not found), for "Loading <engine>…" vs "Rendering". */
  graphs: Map<string, unknown | null>;
  lastExecuting?: { promptId?: string; node: string };
};

const MAX_SESSION_GRAPHS = 8;

/** The running job's graph from ComfyUI's `/queue`, once per prompt; republishes the phase. */
async function loadExecutingGraph(session: BridgeSession, promptId: string): Promise<void> {
  session.graphs.set(promptId, null);
  while (session.graphs.size > MAX_SESSION_GRAPHS) {
    session.graphs.delete(session.graphs.keys().next().value!);
  }
  try {
    const response = await fetch(`${session.comfyUrl.replace(/\/+$/, '')}/queue`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return;
    const queue = (await response.json()) as {
      queue_running?: unknown[];
      queue_pending?: unknown[];
    };
    const entry = [...(queue.queue_running ?? []), ...(queue.queue_pending ?? [])].find(
      item => Array.isArray(item) && item[1] === promptId
    ) as unknown[] | undefined;
    if (!entry?.[2]) return;
    session.graphs.set(promptId, entry[2]);
    const last = session.lastExecuting;
    if (last && last.promptId === promptId) {
      const phase = executingPhaseMessage(entry[2], last.node);
      if (phase) publishExecuting(session, promptId, last.node);
    }
  } catch {
    // stays "Running node N"
  }
}

/** An `executing` event, worded by phase when the job's graph is known. */
function publishExecuting(
  session: BridgeSession,
  promptId: string | undefined,
  node: string | null
): void {
  if (!node) {
    session.lastExecuting = undefined;
    publish(session, {
      type: 'progress',
      status: 'finished',
      promptId,
      node,
      message: 'Execution finished',
    });
    return;
  }
  session.lastExecuting = { promptId, node };
  const graph = promptId ? session.graphs.get(promptId) : undefined;
  const phase = graph ? executingPhaseMessage(graph, node) : null;
  publish(session, {
    type: 'progress',
    status: 'executing',
    promptId,
    node,
    message: phase === 'Rendering' ? `Rendering · node ${node}` : (phase ?? `Running node ${node}`),
  });
  if (promptId && graph === undefined) void loadExecutingGraph(session, promptId);
}

const sessions = new Map<string, BridgeSession>();

function sessionKey(clientId: string): string {
  return clientId.trim();
}

function toComfyWsUrl(comfyUrl: string, clientId: string): string {
  const trimmed = comfyUrl.replace(/\/+$/, '');
  const wsBase = trimmed.startsWith('https://')
    ? trimmed.replace(/^https:/, 'wss:')
    : trimmed.startsWith('http://')
      ? trimmed.replace(/^http:/, 'ws:')
      : `ws://${trimmed}`;
  return `${wsBase}/ws?clientId=${encodeURIComponent(clientId)}`;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function formatStepMessage(value: number, max: number, node?: string | null): string {
  const safeMax = Math.max(1, Math.floor(max));
  const safeValue = Math.max(0, Math.min(Math.floor(value), safeMax));
  const percent = Math.round((safeValue / safeMax) * 100);
  const step = `Step ${safeValue}/${safeMax} (${percent}%)`;
  return node ? `${step} · node ${node}` : step;
}

function publish(session: BridgeSession, event: ComfyLiveBridgeEvent): void {
  for (const subscriber of session.subscribers) {
    try {
      subscriber(event);
    } catch {
      // ignore subscriber errors
    }
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function toArrayBuffer(data: ArrayBuffer | ArrayBufferView | Buffer): ArrayBuffer {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  const view = ArrayBuffer.isView(data) ? data : new Uint8Array(data);
  const copy = new Uint8Array(view.byteLength);
  copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return copy.buffer;
}

function handleBinary(session: BridgeSession, data: ArrayBuffer | ArrayBufferView | Buffer): void {
  const parsed = parseComfyPreviewBinary(toArrayBuffer(data));
  if (!parsed) {
    return;
  }
  publish(session, {
    type: 'preview',
    mimeType: parsed.mimeType,
    base64: bytesToBase64(parsed.bytes),
    promptId: parsed.promptId,
  });
}

function handleText(session: BridgeSession, raw: string): void {
  try {
    // Fast type peek — avoid full JSON.parse + oversized object graph when we only need the event kind.
    const firstBracket = raw.indexOf('{');
    if (firstBracket === -1) return;
    if (raw.length < 20) return; // too short to be meaningful

    const typeMatch = raw.slice(firstBracket).match(/"type"\s*:\s*"(\w+)"/);
    const eventType = typeMatch ? typeMatch[1] : null;

    if (eventType === 'progress') {
      // Lightweight progress parser — only extract the fields we need.
      const valueRaw = raw.slice(firstBracket).match(/"value"\s*:\s*(-?\d+\.?\d*)/);
      const maxRaw = raw.slice(firstBracket).match(/"max"\s*:\s*(\d+\.?\d*)/);
      const value = asFiniteNumber(valueRaw ? Number(valueRaw[1]) : undefined);
      const max = asFiniteNumber(maxRaw ? Number(maxRaw[1]) : undefined);
      if (value == null || max == null || max <= 0) return;
      const nodeMatch = raw.slice(firstBracket).match(/"node"\s*:\s*(?:null|"([^"]*)")/);
      const node = nodeMatch && nodeMatch[1] !== undefined ? (nodeMatch[1] ?? null) : null;
      publish(session, {
        type: 'progress',
        status: 'progress',
        promptId: undefined,
        node,
        value,
        max,
        message: formatStepMessage(value, max, node),
      });
      return;
    }

    if (eventType === 'executing') {
      const nodeMatch = raw.slice(firstBracket).match(/"node"\s*:\s*(?:null|"([^"]*)")/);
      const node = nodeMatch && nodeMatch[1] !== undefined ? (nodeMatch[1] ?? null) : null;
      const promptMatch = raw.slice(firstBracket).match(/"prompt_id"\s*:\s*"([^"]+)"/);
      publishExecuting(session, promptMatch?.[1], node);
      return;
    }

    if (eventType === 'execution_error') {
      const msgMatch = raw.slice(firstBracket).match(/"exception_message"\s*:\s*"([^"]*)"/);
      const detail = msgMatch ? msgMatch[1]?.trim() : undefined;
      publish(session, {
        type: 'progress',
        status: 'error',
        promptId: undefined,
        message: detail ? `ComfyUI error: ${detail}` : 'ComfyUI execution error',
      });
      return;
    }

    // For all other types (executed, progress_state), fall through to the full parser.
    const payload = JSON.parse(raw) as {
      type?: string;
      data?: {
        prompt_id?: string;
        node?: string | null;
        value?: number;
        max?: number;
        exception_message?: string;
        output?: {
          images?: Array<{
            filename?: string;
            subfolder?: string;
            type?: string;
          }>;
        };
        nodes?: Record<
          string,
          {
            value?: number;
            max?: number;
            state?: string;
            node_id?: string;
            real_node_id?: string;
          }
        >;
      };
    };

    if (payload.type === 'progress') {
      const value = asFiniteNumber(payload.data?.value);
      const max = asFiniteNumber(payload.data?.max);
      if (value == null || max == null || max <= 0) {
        return;
      }
      const node = payload.data?.node ?? null;
      publish(session, {
        type: 'progress',
        status: 'progress',
        promptId: payload.data?.prompt_id,
        node,
        value,
        max,
        message: formatStepMessage(value, max, node),
      });
      return;
    }

    if (payload.type === 'progress_state') {
      const nodes = payload.data?.nodes;
      if (!nodes || typeof nodes !== 'object') {
        return;
      }
      const running = Object.values(nodes).find(
        node => node?.state === 'running' && asFiniteNumber(node.max)
      );
      if (!running) {
        return;
      }
      const value = asFiniteNumber(running.value) ?? 0;
      const max = asFiniteNumber(running.max) ?? 1;
      const node = running.real_node_id ?? running.node_id ?? null;
      publish(session, {
        type: 'progress',
        status: 'progress',
        promptId: payload.data?.prompt_id,
        node,
        value,
        max,
        message: formatStepMessage(value, max, node),
      });
      return;
    }

    if (payload.type === 'executing') {
      publishExecuting(session, payload.data?.prompt_id, payload.data?.node ?? null);
      return;
    }

    if (payload.type === 'execution_error') {
      const detail = payload.data?.exception_message?.trim();
      publish(session, {
        type: 'progress',
        status: 'error',
        promptId: payload.data?.prompt_id,
        message: detail ? `ComfyUI error: ${detail}` : 'ComfyUI execution error',
      });
      return;
    }

    // PreviewImage / intermediate SaveImage outputs (works even if latent preview is off).
    if (payload.type === 'executed') {
      const images = payload.data?.output?.images;
      if (!Array.isArray(images) || images.length === 0) {
        return;
      }
      const last = images[images.length - 1];
      if (!last?.filename) {
        return;
      }
      void (async () => {
        try {
          const direct = new URL('/view', session.comfyUrl);
          direct.searchParams.set('filename', last.filename!);
          direct.searchParams.set('subfolder', last.subfolder?.trim() || '');
          direct.searchParams.set('type', last.type?.trim() || 'temp');
          const response = await fetch(direct.toString(), { cache: 'no-store' });
          if (!response.ok) {
            return;
          }
          const buffer = Buffer.from(await response.arrayBuffer());
          if (buffer.byteLength < 32) {
            return;
          }
          const contentType = response.headers.get('content-type') || '';
          const mimeType =
            contentType.includes('png') || last.filename!.toLowerCase().endsWith('.png')
              ? ('image/png' as const)
              : ('image/jpeg' as const);
          publish(session, {
            type: 'preview',
            mimeType,
            base64: buffer.toString('base64'),
            promptId: payload.data?.prompt_id,
          });
        } catch {
          // ignore preview fetch failures
        }
      })();
    }
  } catch {
    // ignore malformed frames
  }
}

function ensureSession(clientId: string, comfyUrl: string): BridgeSession {
  const key = sessionKey(clientId);
  const existing = sessions.get(key);
  if (
    existing &&
    (existing.socket.readyState === WebSocket.CONNECTING ||
      existing.socket.readyState === WebSocket.OPEN)
  ) {
    return existing;
  }

  const socket = new WebSocket(toComfyWsUrl(comfyUrl, clientId));
  try {
    socket.binaryType = 'arraybuffer';
  } catch {
    // older runtimes
  }

  const session: BridgeSession = {
    key,
    clientId,
    comfyUrl,
    socket,
    subscribers: new Set(),
    ready: false,
    graphs: new Map(),
  };

  socket.addEventListener('open', () => {
    try {
      socket.send(
        JSON.stringify({
          type: 'feature_flags',
          data: CLIENT_FEATURE_FLAGS,
        })
      );
    } catch {
      // ignore
    }
    session.ready = true;
    publish(session, {
      type: 'ready',
      comfyUrl,
      clientId,
    });
  });

  socket.addEventListener('message', event => {
    const data = event.data;
    if (typeof data === 'string') {
      handleText(session, data);
      return;
    }
    if (
      data instanceof ArrayBuffer ||
      ArrayBuffer.isView(data) ||
      (typeof Buffer !== 'undefined' && Buffer.isBuffer(data))
    ) {
      handleBinary(session, data as ArrayBuffer | ArrayBufferView | Buffer);
      return;
    }
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      void data.arrayBuffer().then(buffer => handleBinary(session, buffer));
    }
  });

  socket.addEventListener('error', () => {
    publish(session, {
      type: 'error',
      message: `ComfyUI WebSocket error (${comfyUrl})`,
    });
  });

  socket.addEventListener('close', () => {
    if (sessions.get(key) === session) {
      sessions.delete(key);
    }
    if (session.subscribers.size > 0) {
      publish(session, {
        type: 'error',
        message: 'ComfyUI WebSocket closed',
      });
    }
  });

  sessions.set(key, session);
  return session;
}

/**
 * Subscribe to a server-side ComfyUI WebSocket for the given clientId.
 * Multiple HTTP stream consumers share one upstream socket so Comfy does not
 * drop the session when the poller attaches after an early open.
 */
export function subscribeComfyLiveBridge(input: {
  clientId: string;
  comfyUrl?: string;
  onEvent: Subscriber;
}): { close: () => void; comfyUrl: string } {
  const clientId = input.clientId.trim();
  if (!clientId) {
    throw new Error('clientId is required.');
  }

  const runtime = stripEmptyComfyUiRuntime({
    apiUrl: input.comfyUrl?.trim() || undefined,
  });
  const comfyUrl = getComfyUiBaseUrl(runtime);
  const session = ensureSession(clientId, comfyUrl);
  session.subscribers.add(input.onEvent);

  if (session.ready) {
    input.onEvent({
      type: 'ready',
      comfyUrl: session.comfyUrl,
      clientId,
    });
  }

  return {
    comfyUrl: session.comfyUrl,
    close: () => {
      session.subscribers.delete(input.onEvent);
      if (session.subscribers.size === 0) {
        sessions.delete(session.key);
        if (
          session.socket.readyState === WebSocket.CONNECTING ||
          session.socket.readyState === WebSocket.OPEN
        ) {
          session.socket.close();
        }
      }
    },
  };
}
