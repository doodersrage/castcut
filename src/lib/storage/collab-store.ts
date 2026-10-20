import {
  pruneStalePeers,
  type CollabDraftPayload,
  type CollabPresencePeer,
} from './collab-presence';
import { isServerStorageEnabled } from './server-storage';
import { loadCollabRoom, saveCollabRoom } from '../sqlite/tables';

export type CollabRoomState = {
  peers: CollabPresencePeer[];
  draft?: CollabDraftPayload;
};

type CollabSseSend = (event: string, data: unknown) => void;

const memoryRooms = new Map<string, CollabRoomState>();
const sseSubscribers = new Map<string, Set<CollabSseSend>>();

const REDIS_KEY_PREFIX = 'cps:collab:room:';
const REDIS_CHANNEL = 'cps:collab:events';

let redisInitPromise: Promise<void> | null = null;
let redisClient: {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  publish(channel: string, message: string): Promise<unknown>;
  subscribe(channel: string, listener: (message: string) => void): Promise<unknown>;
} | null = null;

function roomKey(projectId: string): string {
  return projectId.trim() || 'default';
}

function emptyRoom(): CollabRoomState {
  return { peers: [] };
}

function readPersistedRoom(projectId: string): CollabRoomState | null {
  if (!isServerStorageEnabled()) {
    return null;
  }
  return loadCollabRoom(projectId);
}

function writePersistedRoom(projectId: string, room: CollabRoomState): void {
  if (!isServerStorageEnabled()) {
    return;
  }
  saveCollabRoom(projectId, room);
}

async function initRedis(): Promise<void> {
  const url = process.env.COLLAB_REDIS_URL?.trim();
  if (!url || redisClient) {
    return;
  }
  try {
    const ioredis = await import('ioredis');
    const Redis = ioredis.default ?? ioredis;
    const client = new Redis(url);
    const subscriber = new Redis(url);

    subscriber.on('message', (_channel, message) => {
      try {
        const parsed = JSON.parse(message) as {
          projectId?: string;
          event?: string;
          data?: unknown;
        };
        if (!parsed.projectId || !parsed.event) {
          return;
        }
        if (parsed.event === 'room') {
          const room = parsed.data as CollabRoomState;
          memoryRooms.set(roomKey(parsed.projectId), room);
        }
        broadcastCollabRoomLocal(parsed.projectId, parsed.event, parsed.data);
      } catch {
        // ignore malformed pub/sub payloads
      }
    });
    await subscriber.subscribe(REDIS_CHANNEL);

    redisClient = {
      get: key => client.get(key),
      set: (key, value) => client.set(key, value),
      publish: (channel, message) => client.publish(channel, message),
      subscribe: async () => undefined,
    };
  } catch {
    redisClient = null;
  }
}

async function ensureRedis(): Promise<void> {
  if (!process.env.COLLAB_REDIS_URL?.trim()) {
    return;
  }
  if (!redisInitPromise) {
    redisInitPromise = initRedis();
  }
  await redisInitPromise;
}

async function loadRoomFromRedis(projectId: string): Promise<CollabRoomState | null> {
  await ensureRedis();
  if (!redisClient) {
    return null;
  }
  try {
    const raw = await redisClient.get(`${REDIS_KEY_PREFIX}${roomKey(projectId)}`);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as CollabRoomState;
  } catch {
    return null;
  }
}

async function persistRoom(projectId: string, room: CollabRoomState): Promise<void> {
  const key = roomKey(projectId);
  memoryRooms.set(key, room);
  writePersistedRoom(key, room);

  await ensureRedis();
  if (redisClient) {
    try {
      const payload = JSON.stringify(room);
      await redisClient.set(`${REDIS_KEY_PREFIX}${key}`, payload);
      await redisClient.publish(
        REDIS_CHANNEL,
        JSON.stringify({ projectId: key, event: 'room', data: room })
      );
    } catch {
      // Redis optional — file/memory still updated
    }
  }
}

export async function getCollabRoom(projectId: string): Promise<CollabRoomState> {
  const key = roomKey(projectId);
  const cached = memoryRooms.get(key);
  if (cached) {
    return {
      peers: pruneStalePeers(cached.peers),
      draft: cached.draft,
    };
  }

  const fromRedis = await loadRoomFromRedis(projectId);
  if (fromRedis) {
    memoryRooms.set(key, fromRedis);
    return {
      peers: pruneStalePeers(fromRedis.peers),
      draft: fromRedis.draft,
    };
  }

  const fromFile = readPersistedRoom(key);
  if (fromFile) {
    memoryRooms.set(key, fromFile);
    return {
      peers: pruneStalePeers(fromFile.peers),
      draft: fromFile.draft,
    };
  }

  return emptyRoom();
}

export async function updateCollabRoom(
  projectId: string,
  updater: (room: CollabRoomState) => CollabRoomState
): Promise<CollabRoomState> {
  const current = await getCollabRoom(projectId);
  const next = updater(current);
  await persistRoom(projectId, next);
  return next;
}

function broadcastCollabRoomLocal(projectId: string, event: string, data: unknown): void {
  const key = roomKey(projectId);
  const subscribers = sseSubscribers.get(key);
  if (!subscribers?.size) {
    return;
  }
  for (const send of subscribers) {
    try {
      send(event, data);
    } catch {
      // ignore broken SSE connections
    }
  }
}

export function broadcastCollabRoom(projectId: string, event: string, data: unknown): void {
  broadcastCollabRoomLocal(projectId, event, data);
  void ensureRedis().then(() => {
    if (!redisClient || event === 'room') {
      return;
    }
    void redisClient.publish(
      REDIS_CHANNEL,
      JSON.stringify({ projectId: roomKey(projectId), event, data })
    );
  });
}

export function subscribeCollabRoom(projectId: string, send: CollabSseSend): () => void {
  const key = roomKey(projectId);
  let set = sseSubscribers.get(key);
  if (!set) {
    set = new Set();
    sseSubscribers.set(key, set);
  }
  set.add(send);
  return () => {
    set?.delete(send);
    if (set && set.size === 0) {
      sseSubscribers.delete(key);
    }
  };
}

export type CollabBackendStatus = {
  redisConfigured: boolean;
  redisConnected: boolean;
  filePersistence: boolean;
  backend: 'redis' | 'sqlite' | 'memory';
};

/** Summarizes collab persistence backend for health/observability surfaces. */
export async function getCollabBackendStatus(): Promise<CollabBackendStatus> {
  const redisConfigured = Boolean(process.env.COLLAB_REDIS_URL?.trim());
  const filePersistence = isServerStorageEnabled();
  await ensureRedis();
  const redisConnected = Boolean(redisClient);
  const backend: CollabBackendStatus['backend'] = redisConnected
    ? 'redis'
    : filePersistence
      ? 'sqlite'
      : 'memory';
  return { redisConfigured, redisConnected, filePersistence, backend };
}
