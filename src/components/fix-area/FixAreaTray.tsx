'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { pushSystemTrayMessage } from '@/lib/system-tray-messages';
import { fixAreaSessionProgress, type FixAreaSession } from '@/lib/fix-area-session';
import { fixAreaSessionStore, useFixAreaSessions } from '@/lib/fix-area-session-store';

const FixAreaDialog = dynamic(() => import('@/components/fix-area/FixAreaDialog'), {
  ssr: false,
  loading: () => null,
});

export const FIX_AREA_OPEN_EVENT = 'fix-area-open-session';

/** Open the results of a tracked Fix in the tray's dialog (chips and the toast use this). */
export function openFixAreaSession(sessionId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(FIX_AREA_OPEN_EVENT, { detail: { sessionId } }));
}

/**
 * Mounted once in the app shell: when a Fix whose dialog was closed lands, a toast says "Fix
 * ready — compare" and "Compare" (here, or a card's chip) reopens its results. The dialog it
 * opens is the same FixAreaDialog, resumed on the tracked session.
 */
export default function FixAreaTray() {
  const sessions = useFixAreaSessions();
  const [openId, setOpenId] = useState<string | null>(null);
  const toasted = useRef(new Set<string>());

  // A landed Fix nobody is looking at: say so once.
  useEffect(() => {
    for (const session of sessions) {
      if (session.open || toasted.current.has(session.id)) continue;
      const progress = fixAreaSessionProgress(session);
      if (!progress.settled) continue;
      toasted.current.add(session.id);
      pushSystemTrayMessage({
        text:
          progress.ready > 0
            ? `Fix ready — compare${session.target.title ? ` (${session.target.title})` : ''}.`
            : `The fix${session.target.title ? ` of ${session.target.title}` : ''} failed — open it to see why.`,
        tone: progress.ready > 0 ? 'success' : 'warning',
        actionLabel: 'Compare',
        actionEvent: FIX_AREA_OPEN_EVENT,
        ttlMs: 0,
      });
    }
  }, [sessions]);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId?: string } | undefined>).detail;
      const wanted = detail?.sessionId;
      // The toast's Compare carries no id: open the newest landed session.
      const store = fixAreaSessionStore();
      const target =
        (wanted ? store.get(wanted) : null) ??
        [...store.all()]
          .reverse()
          .find(session => !session.open && fixAreaSessionProgress(session).settled) ??
        [...store.all()].reverse().find(session => !session.open) ??
        null;
      if (target) setOpenId(target.id);
    };
    window.addEventListener(FIX_AREA_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(FIX_AREA_OPEN_EVENT, onOpen);
  }, []);

  const open: FixAreaSession | null = openId
    ? (sessions.find(session => session.id === openId) ?? null)
    : null;
  // The dialog is keyed to the session so a second Compare starts it fresh on the new one.
  return open ? (
    <FixAreaDialog
      key={open.id}
      target={open.target}
      sessionId={open.id}
      onClose={() => setOpenId(null)}
    />
  ) : null;
}
