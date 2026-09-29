'use client';

import { setComfyLivePreviewUrl } from './comfyui-live-preview-store';

export type ComfyUiWebSocketProgress = {
  promptId: string;
  node?: string | null;
  status: 'executing' | 'progress' | 'finished' | 'error' | 'preview';
  message?: string;
  value?: number;
  max?: number;
  /** Object URL for the latest latent preview frame (caller/store should revoke prior). */
  previewUrl?: string;
};

export type ComfyUiWebSocketSubscription = {
  close: () => void;
  /** Resolves once the live bridge is ready (or settles on failure). */
  ready: Promise<void>;
  /** Update which prompt_id text progress events are accepted for. */
  setPromptId: (promptId: string) => void;
  clientId: string;
};

type LiveBridgeEvent =
  | { type: 'ready'; comfyUrl?: string; clientId?: string }
  | {
      type: 'preview';
      mimeType?: 'image/jpeg' | 'image/png';
      base64?: string;
      promptId?: string;
    }
  | {
      type: 'progress';
      promptId?: string;
      node?: string | null;
      value?: number;
      max?: number;
      message?: string;
      status?: 'executing' | 'progress' | 'finished' | 'error';
    }
  | { type: 'error'; message?: string };

type SharedLiveSession = {
  clientId: string;
  comfyUrlHint?: string;
  abort: AbortController;
  ready: Promise<void>;
  resolveReady: () => void;
  refCount: number;
  promptId: string;
  /** Latest preview URL waiting for promptId (owned here until flushed). */
  bufferedPreviewUrl: string | null;
  listeners: Set<(progress: ComfyUiWebSocketProgress) => void>;
  errorListeners: Set<(message: string) => void>;
  /** True once its /api/comfyui/live fetch has started. */
  streaming: boolean;
};

/** One browser→app live stream per clientId (server shares the Comfy WS). */
const sharedSessions = new Map<string, SharedLiveSession>();

/**
 * Browsers allow ~6 HTTP/1.1 connections per origin and each live stream holds
 * one open, so a batch queue (Day, Story) that opens a stream per job starves
 * the queue POSTs and history polls behind it. Cap the streams; extra sessions
 * wait for a free one (gallery polling still completes their jobs meanwhile).
 */
export const MAX_LIVE_STREAMS = 3;
let openStreams = 0;
const waitingSessions: SharedLiveSession[] = [];

function releaseStream(): void {
  openStreams = Math.max(0, openStreams - 1);
  while (openStreams < MAX_LIVE_STREAMS && waitingSessions.length > 0) {
    const next = waitingSessions.shift()!;
    if (sharedSessions.get(next.clientId) === next && !next.abort.signal.aborted) {
      startLiveStream(next);
    }
  }
}

export function createComfyUiClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `client${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

export function normalizeComfyUrlForWs(comfyUrl: string): string {
  const raw = comfyUrl.trim().replace(/\/+$/, '');
  try {
    const url = new URL(raw.includes('://') ? raw : `http://${raw}`);
    const host = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname;
    const port = url.port ? `:${url.port}` : '';
    return `${url.protocol}//${host}${port}`;
  } catch {
    return raw;
  }
}

function base64ToObjectUrl(base64: string, mimeType: 'image/jpeg' | 'image/png'): string | null {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  } catch {
    return null;
  }
}

function publish(shared: SharedLiveSession, progress: ComfyUiWebSocketProgress): void {
  for (const listener of shared.listeners) {
    listener(progress);
  }
}

function emitPreview(shared: SharedLiveSession, promptId: string, previewUrl: string): void {
  // Index under prompt id and client id so gallery cards can resolve either key.
  setComfyLivePreviewUrl(promptId, previewUrl, {
    alsoKeys: shared.clientId ? [shared.clientId] : [],
  });
  publish(shared, {
    promptId,
    status: 'preview',
    previewUrl,
    message: 'Live preview',
  });
}

function flushBufferedPreview(shared: SharedLiveSession): void {
  if (!shared.bufferedPreviewUrl || !shared.promptId) {
    return;
  }
  const url = shared.bufferedPreviewUrl;
  shared.bufferedPreviewUrl = null;
  emitPreview(shared, shared.promptId, url);
}

function handleBridgeEvent(shared: SharedLiveSession, event: LiveBridgeEvent): void {
  if (event.type === 'ready') {
    shared.resolveReady();
    return;
  }

  if (event.type === 'error') {
    const message = event.message?.trim() || 'ComfyUI live bridge error';
    for (const listener of shared.errorListeners) {
      listener(message);
    }
    shared.resolveReady();
    return;
  }

  if (event.type === 'preview') {
    if (!event.base64 || !event.mimeType) {
      return;
    }
    const previewUrl = base64ToObjectUrl(event.base64, event.mimeType);
    if (!previewUrl) {
      return;
    }
    const promptId = event.promptId || shared.promptId;
    if (!promptId) {
      if (shared.bufferedPreviewUrl) {
        URL.revokeObjectURL(shared.bufferedPreviewUrl);
      }
      shared.bufferedPreviewUrl = previewUrl;
      return;
    }
    if (shared.bufferedPreviewUrl) {
      URL.revokeObjectURL(shared.bufferedPreviewUrl);
      shared.bufferedPreviewUrl = null;
    }
    emitPreview(shared, promptId, previewUrl);
    return;
  }

  if (event.type === 'progress') {
    const promptId = event.promptId || shared.promptId || shared.clientId;
    if (shared.promptId && event.promptId && event.promptId !== shared.promptId) {
      return;
    }
    publish(shared, {
      promptId,
      node: event.node,
      status: event.status ?? 'progress',
      value: event.value,
      max: event.max,
      message: event.message,
    });
  }
}

async function readNdjsonStream(shared: SharedLiveSession, response: Response): Promise<void> {
  const body = response.body;
  if (!body) {
    throw new Error('Live bridge returned an empty body.');
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        try {
          handleBridgeEvent(shared, JSON.parse(line) as LiveBridgeEvent);
        } catch {
          // ignore bad lines
        }
      }
      newline = buffer.indexOf('\n');
    }
  }
}

function ensureSharedLiveSession(input: {
  clientId: string;
  comfyUrl?: string;
}): SharedLiveSession {
  const clientId = input.clientId.trim();
  const existing = sharedSessions.get(clientId);
  if (existing) {
    existing.refCount += 1;
    return existing;
  }

  let resolveReady: () => void = () => {};
  const ready = new Promise<void>(resolve => {
    resolveReady = resolve;
  });

  const abort = new AbortController();
  const shared: SharedLiveSession = {
    clientId,
    comfyUrlHint: input.comfyUrl?.trim() || undefined,
    abort,
    ready,
    resolveReady: () => {
      resolveReady();
    },
    refCount: 1,
    promptId: '',
    bufferedPreviewUrl: null,
    listeners: new Set(),
    errorListeners: new Set(),
    streaming: false,
  };

  sharedSessions.set(clientId, shared);

  if (openStreams < MAX_LIVE_STREAMS) {
    startLiveStream(shared);
  } else {
    waitingSessions.push(shared);
    // Don't hold queueing on a stream that isn't open yet.
    shared.resolveReady();
  }

  return shared;
}

function startLiveStream(shared: SharedLiveSession): void {
  const clientId = shared.clientId;
  shared.streaming = true;
  openStreams += 1;
  const abort = shared.abort;
  const params = new URLSearchParams({ clientId });
  if (shared.comfyUrlHint) {
    params.set('comfyUrl', shared.comfyUrlHint);
  }

  void fetch(`/api/comfyui/live?${params.toString()}`, {
    method: 'GET',
    signal: abort.signal,
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/x-ndjson' },
  })
    .then(async response => {
      if (!response.ok) {
        let detail = '';
        try {
          const payload = (await response.json()) as { error?: string };
          detail = payload.error?.trim() || '';
        } catch {
          detail = (await response.text().catch(() => '')).trim();
        }
        throw new Error(detail || `Live bridge failed (${response.status})`);
      }
      await readNdjsonStream(shared, response);
    })
    .catch((error: unknown) => {
      if (abort.signal.aborted) {
        shared.resolveReady();
        return;
      }
      const message =
        error instanceof Error ? error.message : 'Failed to connect live preview bridge.';
      for (const listener of shared.errorListeners) {
        listener(message);
      }
      shared.resolveReady();
    })
    .finally(() => {
      if (sharedSessions.get(clientId) === shared) {
        sharedSessions.delete(clientId);
      }
      releaseStream();
    });
}

/**
 * Subscribe to ComfyUI progress + latent previews via the same-origin
 * `/api/comfyui/live` bridge (server holds the real Comfy WebSocket).
 */
export function subscribeComfyUiWebSocket(input: {
  /** Optional hint; server resolves the real Comfy URL (Docker-safe). */
  comfyUrl?: string;
  promptId?: string;
  clientId?: string;
  onProgress: (progress: ComfyUiWebSocketProgress) => void;
  onError?: (message: string) => void;
}): ComfyUiWebSocketSubscription {
  if (typeof window === 'undefined') {
    return {
      close: () => {},
      ready: Promise.resolve(),
      setPromptId: () => {},
      clientId: input.clientId?.trim() || createComfyUiClientId(),
    };
  }

  const clientId = input.clientId?.trim() || createComfyUiClientId();
  const shared = ensureSharedLiveSession({
    clientId,
    comfyUrl: input.comfyUrl,
  });

  if (input.promptId?.trim()) {
    shared.promptId = input.promptId.trim();
    flushBufferedPreview(shared);
  }

  shared.listeners.add(input.onProgress);
  if (input.onError) {
    shared.errorListeners.add(input.onError);
  }

  let closed = false;
  return {
    clientId,
    ready: shared.ready,
    setPromptId: (promptId: string) => {
      shared.promptId = promptId.trim();
      flushBufferedPreview(shared);
    },
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      shared.listeners.delete(input.onProgress);
      if (input.onError) {
        shared.errorListeners.delete(input.onError);
      }
      shared.refCount -= 1;
      if (shared.refCount <= 0) {
        if (shared.bufferedPreviewUrl) {
          URL.revokeObjectURL(shared.bufferedPreviewUrl);
          shared.bufferedPreviewUrl = null;
        }
        sharedSessions.delete(clientId);
        shared.abort.abort();
        if (!shared.streaming) {
          const index = waitingSessions.indexOf(shared);
          if (index >= 0) waitingSessions.splice(index, 1);
        }
      }
    },
  };
}

/**
 * Open the live preview bridge before POSTing /prompt so ComfyUI can
 * associate binary preview frames with this client_id from the first step.
 */
export async function openComfyPreviewSocketBeforeQueue(input: {
  clientId: string;
  /** Optional URL hint for the server bridge (usually omitted — server env wins). */
  comfyUrl?: string;
}): Promise<ComfyUiWebSocketSubscription> {
  const subscription = subscribeComfyUiWebSocket({
    clientId: input.clientId,
    comfyUrl: input.comfyUrl,
    onProgress: () => {
      // Holder ref on the shared live session; poller attaches the real listener.
      // Previews are written to the live-preview store when promptId is known.
    },
  });
  // Wait for the server↔Comfy socket to open, but never block queueing for long.
  await Promise.race([
    subscription.ready,
    new Promise<void>(resolve => {
      window.setTimeout(resolve, 2500);
    }),
  ]);
  return subscription;
}
