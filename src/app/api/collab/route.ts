import { NextResponse } from 'next/server';
import {
  pruneStalePeers,
  upsertPresencePeer,
  type CollabDraftFields,
  type CollabDraftPayload,
  type CollabPresencePeer,
} from '@/lib/storage/collab-presence';
import {
  broadcastCollabRoom,
  getCollabRoom,
  subscribeCollabRoom,
  updateCollabRoom,
} from '@/lib/storage/collab-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET SSE stream — presence snapshots every few seconds + draft pushes. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId')?.trim() || 'default';
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const room = await getCollabRoom(projectId);
      send('presence', { peers: pruneStalePeers(room.peers) });
      if (room.draft) {
        send('draft', room.draft);
      }

      const unsubscribe = subscribeCollabRoom(projectId, send);

      const timer = setInterval(async () => {
        const current = await getCollabRoom(projectId);
        send('presence', { peers: pruneStalePeers(current.peers) });
        send('ping', { at: Date.now() });
      }, 4000);

      request.signal.addEventListener('abort', () => {
        clearInterval(timer);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // ignore
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

/** POST presence heartbeat or draft update. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  const projectId =
    typeof record.projectId === 'string' && record.projectId.trim()
      ? record.projectId.trim()
      : 'default';

  if (record.type === 'presence' && record.peer && typeof record.peer === 'object') {
    const peer = record.peer as CollabPresencePeer;
    if (peer.peerId && peer.displayName) {
      const room = await updateCollabRoom(projectId, current => ({
        ...current,
        peers: upsertPresencePeer(current.peers, {
          ...peer,
          projectId,
          lastSeenAt: Date.now(),
        }),
      }));
      broadcastCollabRoom(projectId, 'presence', { peers: room.peers });
      return NextResponse.json({ ok: true, peers: room.peers });
    }
  }

  if (record.type === 'draft' && typeof record.draft === 'string') {
    const fields =
      record.fields && typeof record.fields === 'object'
        ? (record.fields as CollabDraftFields)
        : undefined;
    const changedFields = Array.isArray(record.changedFields)
      ? record.changedFields.filter(
          (entry): entry is keyof CollabDraftFields => typeof entry === 'string'
        )
      : undefined;
    const payload: CollabDraftPayload = {
      projectId,
      peerId: typeof record.peerId === 'string' ? record.peerId : 'unknown',
      tool: typeof record.tool === 'string' ? record.tool : undefined,
      draft: record.draft.slice(0, 20_000),
      ...(fields ? { fields } : {}),
      ...(changedFields?.length ? { changedFields } : {}),
      updatedAt: Date.now(),
    };
    await updateCollabRoom(projectId, current => ({
      ...current,
      draft: payload,
    }));
    broadcastCollabRoom(projectId, 'draft', payload);
    return NextResponse.json({ ok: true, draft: payload });
  }

  return NextResponse.json({ ok: false, error: 'Unknown event' }, { status: 400 });
}
