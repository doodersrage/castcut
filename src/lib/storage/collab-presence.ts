/**
 * Shared-project live presence + draft broadcast (collab-lite).
 * Transport: BroadcastChannel locally + optional SSE fan-out via /api/collab.
 */

export type CollabPresencePeer = {
  peerId: string;
  displayName: string;
  projectId: string;
  tool?: string;
  lastSeenAt: number;
};

/** Structured fields for field-level collab sync (v2). */
export type CollabDraftFields = {
  hints?: string;
  model?: string;
  detail?: string;
  instruction?: string;
  positive?: string;
  negative?: string;
};

export type CollabDraftPayload = {
  projectId: string;
  peerId: string;
  tool?: string;
  /** Legacy whole-text draft — still used when fields are absent. */
  draft: string;
  /** Structured field patches (preferred when present). */
  fields?: CollabDraftFields;
  changedFields?: (keyof CollabDraftFields)[];
  updatedAt: number;
};

export type CollabRoomEvent =
  | { type: 'presence'; peers: CollabPresencePeer[] }
  | { type: 'draft'; payload: CollabDraftPayload }
  | { type: 'ping'; at: number };

const CHANNEL_PREFIX = 'cps-collab-';

export function collabChannelName(projectId: string): string {
  return `${CHANNEL_PREFIX}${projectId.trim() || 'default'}`;
}

export function normalizeCollabProjectId(projectId: string | null | undefined): string {
  return projectId?.trim() || 'default';
}

/** Room id from `?project=` (same param gallery uses for project filter). */
export function readCollabProjectIdFromSearch(search: string, fallback?: string | null): string {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const fromUrl = new URLSearchParams(raw).get('project')?.trim();
  return normalizeCollabProjectId(fromUrl || fallback);
}

export function buildCollabShareUrl(
  href: string,
  projectId: string,
  origin = 'http://localhost'
): string {
  const url = new URL(href, origin);
  const room = normalizeCollabProjectId(projectId);
  if (room === 'default') {
    url.searchParams.delete('project');
  } else {
    url.searchParams.set('project', room);
  }
  return url.toString();
}

const TAB_PEER_ID_KEY = 'comfy-collab-peer-id-v1';

/**
 * One peer id per browser tab. A fresh id per page mount left the previous page's presence
 * alive for the 15 s TTL, so Character → Compose showed "You · character" as a collaborator.
 */
export function tabCollabPeerId(): string {
  try {
    const existing = window.sessionStorage.getItem(TAB_PEER_ID_KEY);
    if (existing) {
      return existing;
    }
    const next = createCollabPeerId();
    window.sessionStorage.setItem(TAB_PEER_ID_KEY, next);
    return next;
  } catch {
    return createCollabPeerId();
  }
}

export function createCollabPeerId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `peer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function pruneStalePeers(
  peers: CollabPresencePeer[],
  now = Date.now(),
  ttlMs = 15_000
): CollabPresencePeer[] {
  return peers.filter(peer => now - peer.lastSeenAt <= ttlMs);
}

export function upsertPresencePeer(
  peers: CollabPresencePeer[],
  next: CollabPresencePeer
): CollabPresencePeer[] {
  const without = peers.filter(peer => peer.peerId !== next.peerId);
  return pruneStalePeers([...without, next]);
}

export function shouldWarnRemoteDraft(
  localUpdatedAt: number | undefined,
  remote: CollabDraftPayload,
  selfPeerId: string
): boolean {
  if (remote.peerId === selfPeerId) {
    return false;
  }
  if (!localUpdatedAt) {
    return true;
  }
  return remote.updatedAt > localUpdatedAt + 250;
}

/** Resolve a collab field, falling back to the legacy draft string when appropriate. */
export function resolveCollabFieldValue(
  payload: CollabDraftPayload,
  field: keyof CollabDraftFields
): string | undefined {
  const fromFields = payload.fields?.[field]?.trim();
  if (fromFields) {
    return fromFields;
  }
  if (field === 'hints' || field === 'instruction' || field === 'positive') {
    return payload.draft?.trim() || undefined;
  }
  return undefined;
}

export function mergeCollabDraftFields(
  base: CollabDraftFields | undefined,
  patch: CollabDraftFields
): CollabDraftFields {
  return { ...base, ...patch };
}
