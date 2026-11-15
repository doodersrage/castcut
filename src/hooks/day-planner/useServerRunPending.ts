'use client';

import { useEffect, useState } from 'react';
import { appliedServerSeq, fetchServerRunPatches } from '@/lib/day/run-patches-client';

/**
 * How many of a server-rendered run's steps this browser hasn't taken in yet — the Scene page
 * applies them (useSceneRun), so Cut, opened straight after a run the page was closed for, would
 * cut the Scenes as they were before it (2026-11-15: a 43-shot Final cut as the Short's 9 board
 * stills). 0 when there is no server run, or nothing new; asked again while it is still rendering.
 */
export function useServerRunPending(run: { id: string; onServer?: boolean } | undefined): number {
  const runId = run?.onServer ? run.id : '';
  const [pending, setPending] = useState({ runId: '', count: 0 });
  useEffect(() => {
    if (!runId) return;
    let stopped = false;
    let timer: number | undefined;
    const ask = async () => {
      const answer = await fetchServerRunPatches(runId, appliedServerSeq(runId));
      if (stopped) return;
      setPending({
        runId,
        count: (answer?.patches ?? []).filter(row => row.patch.scene || row.patch.takes?.length)
          .length,
      });
      if (answer?.active) timer = window.setTimeout(() => void ask(), 30_000);
    };
    void ask();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [runId]);
  return runId && pending.runId === runId ? pending.count : 0;
}
