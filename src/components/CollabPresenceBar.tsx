'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildCollabShareUrl,
  collabChannelName,
  tabCollabPeerId,
  normalizeCollabProjectId,
  readCollabProjectIdFromSearch,
  shouldWarnRemoteDraft,
  type CollabDraftFields,
  type CollabDraftPayload,
  type CollabPresencePeer,
} from '@/lib/collab-presence';
import { loadActiveProjectId, loadPromptProjects, setActiveProjectId } from '@/lib/prompt-projects';
import { Button } from '@/components/ui/Button';
import { SelectInput } from '@/components/ui/Field';

type CollabPresenceBarProps = {
  tool?: string;
  draft?: string;
  draftFields?: CollabDraftFields;
  displayName?: string;
  onApplyRemoteDraft?: (payload: CollabDraftPayload) => void;
};

/**
 * Presence strip for shared projects — BroadcastChannel + SSE /api/collab.
 */
export default function CollabPresenceBar({
  tool,
  draft,
  draftFields,
  displayName = 'You',
  onApplyRemoteDraft,
}: CollabPresenceBarProps) {
  const [peerId] = useState(() => tabCollabPeerId());
  const [peers, setPeers] = useState<CollabPresencePeer[]>([]);
  const [barOpen, setBarOpen] = useState(false);
  const [remoteDraft, setRemoteDraft] = useState<CollabDraftPayload | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [projects] = useState(() => (typeof window === 'undefined' ? [] : loadPromptProjects()));
  const [projectId, setProjectId] = useState(() => {
    if (typeof window === 'undefined') {
      return 'default';
    }
    return readCollabProjectIdFromSearch(window.location.search, loadActiveProjectId());
  });
  const localDraftAtRef = useRef<number | undefined>(undefined);

  const applyProjectId = useCallback((nextId: string) => {
    const room = normalizeCollabProjectId(nextId);
    setProjectId(room);
    setPeers([]);
    setRemoteDraft(null);
    setActiveProjectId(room === 'default' ? undefined : room);
    if (typeof window === 'undefined') {
      return;
    }
    const nextUrl = buildCollabShareUrl(
      `${window.location.pathname}${window.location.search}`,
      room,
      window.location.origin
    );
    window.history.replaceState(window.history.state, '', nextUrl);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const fromUrl = new URLSearchParams(window.location.search).get('project')?.trim();
    if (fromUrl && fromUrl !== loadActiveProjectId()) {
      setActiveProjectId(fromUrl);
    }
  }, []);

  const copyShareLink = useCallback(async () => {
    if (typeof window === 'undefined') {
      return;
    }
    const shareUrl = buildCollabShareUrl(
      `${window.location.pathname}${window.location.search}`,
      projectId,
      window.location.origin
    );
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2000);
    } catch {
      setShareCopied(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const channel = new BroadcastChannel(collabChannelName(projectId));
    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        | { type: 'presence'; peer: CollabPresencePeer }
        | { type: 'draft'; payload: CollabDraftPayload };
      if (data?.type === 'presence' && data.peer) {
        setPeers(current => {
          const without = current.filter(p => p.peerId !== data.peer.peerId);
          return [...without, data.peer];
        });
      }
      if (data?.type === 'draft' && data.payload) {
        if (shouldWarnRemoteDraft(localDraftAtRef.current, data.payload, peerId)) {
          setRemoteDraft(data.payload);
        }
      }
    };
    channel.addEventListener('message', onMessage);

    const beat = () => {
      const peer: CollabPresencePeer = {
        peerId,
        displayName,
        projectId,
        tool,
        lastSeenAt: Date.now(),
      };
      channel.postMessage({ type: 'presence', peer });
      void fetch('/api/collab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'presence', projectId, peer }),
      }).catch(() => undefined);
    };
    beat();
    const timer = window.setInterval(beat, 5000);

    const source = new EventSource(`/api/collab?projectId=${encodeURIComponent(projectId)}`);
    source.addEventListener('presence', event => {
      try {
        const parsed = JSON.parse((event as MessageEvent).data) as {
          peers?: CollabPresencePeer[];
        };
        if (parsed.peers) {
          setPeers(parsed.peers);
        }
      } catch {
        // ignore
      }
    });
    source.addEventListener('draft', event => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as CollabDraftPayload;
        if (shouldWarnRemoteDraft(localDraftAtRef.current, payload, peerId)) {
          setRemoteDraft(payload);
        }
      } catch {
        // ignore
      }
    });

    return () => {
      window.clearInterval(timer);
      channel.removeEventListener('message', onMessage);
      channel.close();
      source.close();
    };
  }, [displayName, peerId, projectId, tool]);

  useEffect(() => {
    if (draft == null && !draftFields) {
      return;
    }
    const at = Date.now();
    localDraftAtRef.current = at;
    const changedFields = draftFields
      ? (Object.keys(draftFields).filter(key =>
          draftFields[key as keyof CollabDraftFields]?.trim()
        ) as (keyof CollabDraftFields)[])
      : undefined;
    const payload: CollabDraftPayload = {
      projectId,
      peerId,
      tool,
      draft: draft ?? draftFields?.hints ?? draftFields?.instruction ?? draftFields?.positive ?? '',
      ...(draftFields ? { fields: draftFields, changedFields } : {}),
      updatedAt: at,
    };
    try {
      const channel = new BroadcastChannel(collabChannelName(projectId));
      channel.postMessage({ type: 'draft', payload });
      channel.close();
    } catch {
      // ignore
    }
    const handle = window.setTimeout(() => {
      void fetch('/api/collab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'draft',
          projectId,
          peerId,
          tool,
          draft: payload.draft,
          fields: draftFields,
          changedFields,
        }),
      }).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [draft, draftFields, peerId, projectId, tool]);

  const others = peers.filter(peer => peer.peerId !== peerId && peer.projectId === projectId);
  const roomLabel = useMemo(() => {
    if (projectId === 'default') {
      return 'default';
    }
    return projects.find(project => project.id === projectId)?.name ?? projectId;
  }, [projectId, projects]);

  // Alone in the default room: a small link, not a room picker and share bar on every visit.
  if (!barOpen && others.length === 0 && projectId === 'default' && !remoteDraft) {
    return (
      <button
        type="button"
        className="ui-text-link self-start type-caption max-md:inline-flex max-md:min-h-8 max-md:items-center"
        data-testid="collab-open"
        onClick={() => setBarOpen(true)}
      >
        Collaborate…
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/50 px-3 py-2 text-[11px] text-[var(--text-muted)]">
      <span className="font-medium text-[var(--text-secondary)]">Live</span>
      <label className="flex items-center gap-1.5">
        <span className="sr-only">Collab room</span>
        <SelectInput
          aria-label="Collab room"
          className="!min-h-7 !py-0.5 !text-[11px]"
          value={projectId}
          onChange={event => applyProjectId(event.target.value)}
        >
          <option value="default">Default room</option>
          {projects.map(project => (
            <option key={project.id} value={project.id}>
              {project.name || project.id}
            </option>
          ))}
          {projectId !== 'default' && !projects.some(project => project.id === projectId) ? (
            <option value={projectId}>{roomLabel}</option>
          ) : null}
        </SelectInput>
      </label>
      <Button
        variant="ghost"
        className="!min-h-7 px-2 text-[10px]"
        onClick={() => void copyShareLink()}
      >
        {shareCopied ? 'Link copied' : 'Copy share link'}
      </Button>
      {others.length === 0 ? (
        <span>Only you here</span>
      ) : (
        others.map(peer => (
          <span
            key={peer.peerId}
            className="rounded-full border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] px-2 py-0.5 text-[var(--tint-success-text)]"
          >
            {peer.displayName}
            {peer.tool ? ` · ${peer.tool}` : ''}
          </span>
        ))
      )}
      {remoteDraft ? (
        <span className="flex flex-wrap items-center gap-2 text-[var(--tint-warning-text)]">
          Remote draft update
          {onApplyRemoteDraft ? (
            <Button
              variant="ghost"
              className="!min-h-7 px-2 text-[10px]"
              onClick={() => {
                onApplyRemoteDraft(remoteDraft);
                setRemoteDraft(null);
                localDraftAtRef.current = remoteDraft.updatedAt;
              }}
            >
              Apply draft
            </Button>
          ) : null}
          <button
            type="button"
            className="text-[10px] underline opacity-80"
            onClick={() => setRemoteDraft(null)}
          >
            Dismiss
          </button>
        </span>
      ) : null}
    </div>
  );
}
