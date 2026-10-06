'use client';

/**
 * The app's "Fix an area" session store (fix-area-session.ts over the real ComfyUI client):
 * one per browser tab, polling on its own timer, so a Fix outlives the dialog that queued it.
 */

import { useSyncExternalStore } from 'react';
import {
  cancelFixAreaJobs,
  comfyImageViewUrl,
  pollFixAreaJob,
  type FixAreaTarget,
} from '@/lib/fix-area-client';
import {
  createFixAreaSessionStore,
  fixAreaSessionMatchesStill,
  type FixAreaGateVerdict,
  type FixAreaSession,
  type FixAreaSessionStore,
} from '@/lib/fix-area-session';

/** The adult check asks the vision model; a busy LM Studio left takes on "Checking…" forever. */
export const FIX_AREA_GATE_TIMEOUT_MS = 60_000;

async function gateCandidate(
  imageUrl: string,
  adult: NonNullable<FixAreaTarget['adult']>
): Promise<FixAreaGateVerdict> {
  const [{ checkStillAdultAppearance }, { loadSettingsCache }] = await Promise.all([
    import('@/lib/adult-appearance-gate-client'),
    import('@/lib/settings-cache'),
  ]);
  let timer: number | undefined;
  const timedOut = new Promise<null>(resolve => {
    timer = window.setTimeout(() => resolve(null), FIX_AREA_GATE_TIMEOUT_MS);
  });
  const decision = await Promise.race([
    checkStillAdultAppearance({
      imageUrl,
      // A fix is not requeued: anything but a pass is withheld.
      strongTake: true,
      clothed: adult.clothed === true,
      coveredTake: true,
      shared: loadSettingsCache().shared,
    }),
    timedOut,
  ]).finally(() => window.clearTimeout(timer));
  if (!decision) {
    return { pass: false, reason: 'the check took too long — is LM Studio busy?' };
  }
  const pass = decision.verdict === 'pass' || decision.verdict === 'unchecked';
  return {
    pass,
    reason: decision.reason,
    ...(pass ? { verdict: decision.verdict === 'pass' ? 'passed' : 'unchecked' } : {}),
  } as FixAreaGateVerdict;
}

let store: FixAreaSessionStore | null = null;

export function fixAreaSessionStore(): FixAreaSessionStore {
  if (!store) {
    store = createFixAreaSessionStore({
      poll: pollFixAreaJob,
      gate: gateCandidate,
      cancel: cancelFixAreaJobs,
      imageUrl: comfyImageViewUrl,
      schedule: (tick, ms) => {
        const timer = window.setInterval(tick, ms);
        return () => window.clearInterval(timer);
      },
    });
  }
  return store;
}

const EMPTY: readonly FixAreaSession[] = Object.freeze([]);
const serverSnapshot = () => EMPTY;

/** Every tracked Fix (rendering or landed and not yet compared). */
export function useFixAreaSessions(): readonly FixAreaSession[] {
  return useSyncExternalStore(
    listener => fixAreaSessionStore().subscribe(listener),
    () => fixAreaSessionStore().all(),
    serverSnapshot
  );
}

export function useFixAreaSession(id: string | null | undefined): FixAreaSession | null {
  const sessions = useFixAreaSessions();
  return id ? (sessions.find(session => session.id === id) ?? null) : null;
}

/** The Fix tracked for a still (its shown picture or ComfyUI output), newest first. */
export function useFixAreaSessionForStill(url: string | null | undefined): FixAreaSession | null {
  const sessions = useFixAreaSessions();
  if (!url) return null;
  for (let index = sessions.length - 1; index >= 0; index -= 1) {
    const session = sessions[index]!;
    if (fixAreaSessionMatchesStill(session, url)) return session;
  }
  return null;
}
