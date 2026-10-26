'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import type { useScenePage } from '@/hooks/day-planner/useScenePage';
import { waitForGalleryPromptIds } from '@/lib/best-of-n/vision-queue';
import { loadComfyGallery } from '@/lib/gallery/comfyui-gallery';
import { scheduleComfyGalleryPoll } from '@/lib/gallery/comfyui-gallery-poller';
import {
  nextRunStep,
  pausedAfterReload,
  withRunLog,
  withRunOutcome,
  type SceneRun,
} from '@/lib/day/scene-run';

type DayEngineView = ReturnType<typeof useDayPlannerToolOrchestration>;
type ScenePage = ReturnType<typeof useScenePage>;

/** How long a take may take to render, and its checks after it. */
const RENDER_TIMEOUT_MS = 30 * 60_000;
const CHECKS_TIMEOUT_MS = 5 * 60_000;
const OPEN_TIMEOUT_MS = 20_000;
const QUEUE_TIMEOUT_MS = 60_000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Wait until `ready()` (checked every 250 ms), or the time runs out: false. */
async function until(ready: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!ready()) {
    if (Date.now() > deadline) return false;
    await sleep(250);
  }
  return true;
}

/**
 * Runs a prepared run on the Scene page (M5 W4, scene-run.ts): one Scene at a time — open it,
 * queue its take with the page's own Render (`queueSlot`), wait for it to land and its checks to
 * finish — then the next; a failure stops it. Pause stops after the take in flight, Cancel too
 * (nothing else is queued). The run record keeps the take in flight, so after a reload it is
 * waited for, not queued again. It never keeps a take.
 */
export function useSceneRun(vm: DayEngineView, page: ScenePage) {
  const runRef = useRef<SceneRun | undefined>(page.run);
  const pageRef = useRef(page);
  const vmRef = useRef(vm);
  useEffect(() => {
    runRef.current = page.run;
    pageRef.current = page;
    vmRef.current = vm;
  });
  const loopingRef = useRef(false);
  const stopRef = useRef<'pause' | 'cancel' | null>(null);
  const [looping, setLooping] = useState(false);
  /** Pause or Cancel asked for, waiting for the take in flight. */
  const [stopping, setStopping] = useState<'pause' | 'cancel' | null>(null);

  const save = useCallback((next: SceneRun) => {
    runRef.current = next;
    pageRef.current.updateRun(next);
  }, []);

  // A run left "running" when the page closed has nothing running it now: it shows as paused.
  const checkedReloadRef = useRef(false);
  useEffect(() => {
    if (checkedReloadRef.current || !page.run || loopingRef.current) return;
    checkedReloadRef.current = true;
    if (page.run.state === 'running') save(pausedAfterReload(page.run));
  }, [page.run, save]);

  const loop = useCallback(async () => {
    if (loopingRef.current) return;
    loopingRef.current = true;
    setLooping(true);
    try {
      for (;;) {
        const run = runRef.current;
        if (!run || run.state !== 'running') return;
        if (stopRef.current) {
          const cancel = stopRef.current === 'cancel';
          stopRef.current = null;
          save(
            withRunLog(
              { ...run, state: cancel ? 'cancelled' : 'paused' },
              { at: Date.now(), event: cancel ? 'cancelled' : 'paused', detail: 'by you' }
            )
          );
          return;
        }
        const step = nextRunStep(run, pageRef.current.castScenes);
        if (step.kind === 'done') {
          const detail =
            step.reason === 'take-limit'
              ? 'the take limit was reached'
              : step.reason === 'time-limit'
                ? 'the time limit was reached'
                : 'every Scene in it has had its take';
          save(withRunLog({ ...run, state: 'done' }, { at: Date.now(), event: 'done', detail }));
          return;
        }
        const sceneId = step.sceneId;
        const scene = pageRef.current.castScenes.find(entry => entry.id === sceneId);
        if (!scene) {
          save(withRunOutcome(run, sceneId, 'skipped', 'the Scene is gone'));
          continue;
        }

        // Open it (the page's own Open), unless it is open.
        if (pageRef.current.active?.id !== sceneId) {
          pageRef.current.openScene(sceneId);
          const opened = await until(() => pageRef.current.active?.id === sceneId, OPEN_TIMEOUT_MS);
          if (!opened) {
            save(
              withRunLog(
                {
                  ...withRunOutcome(run, sceneId, 'skipped', 'it could not be opened'),
                  state: 'paused',
                  stopReason: `Couldn’t open ${scene.name} — a take may be rendering on the card.`,
                },
                { at: Date.now(), sceneId, event: 'paused', detail: 'could not open the Scene' }
              )
            );
            return;
          }
        }

        // Its take: the one in flight (a restart, or one already on the card) — never a second.
        let promptId = run.current?.sceneId === sceneId ? run.current.promptId : undefined;
        if (!promptId && pageRef.current.inFlight && pageRef.current.still?.promptId) {
          promptId = pageRef.current.still.promptId;
          save(
            withRunLog(
              { ...run, current: { sceneId, promptId, at: Date.now() } },
              {
                at: Date.now(),
                sceneId,
                event: 'skipped',
                detail: 'a take was already rendering — waiting for it instead',
              }
            )
          );
        }
        if (!promptId) {
          const before = pageRef.current.still?.promptId;
          save({ ...run, current: { sceneId, at: Date.now() } });
          await vmRef.current.queueSlot(pageRef.current.slot, { byPlayer: true });
          const queued = await until(() => {
            const id = pageRef.current.still?.promptId;
            return Boolean(id && id !== before);
          }, QUEUE_TIMEOUT_MS);
          promptId = queued ? pageRef.current.still?.promptId : undefined;
          const latest = runRef.current ?? run;
          if (!promptId) {
            save(
              withRunLog(
                {
                  ...withRunOutcome(latest, sceneId, 'failed', 'its take wasn’t queued'),
                  state: 'paused',
                  stopReason: `${scene.name}’s take wasn’t queued — see the note on the card.`,
                },
                { at: Date.now(), sceneId, event: 'paused', detail: 'a take was not queued' }
              )
            );
            return;
          }
          save(
            withRunLog(
              { ...latest, current: { sceneId, promptId, at: Date.now() } },
              { at: Date.now(), sceneId, event: 'queued', detail: promptId }
            )
          );
        }

        // Wait for it to land, then for its checks (the card is free again). Its poll is
        // (re)started first: after a reload nothing else may be asking about it (as R8 does).
        const known = loadComfyGallery().find(item => item.promptId === promptId);
        void scheduleComfyGalleryPoll(promptId, { comfyUrl: known?.comfyUrl });
        const [entry] = await waitForGalleryPromptIds([promptId], {
          timeoutMs: RENDER_TIMEOUT_MS,
          pollMs: 3_000,
        });
        await until(() => !pageRef.current.inFlight, CHECKS_TIMEOUT_MS);
        const latest = runRef.current ?? run;
        if (entry?.status === 'completed') {
          save(withRunOutcome(latest, sceneId, 'landed', `${scene.name}: a take landed`));
        } else {
          const why = entry?.statusMessage?.trim() || (entry ? entry.status : 'it timed out');
          save({
            ...withRunOutcome(latest, sceneId, 'failed', `${scene.name}: ${why}`),
            state: 'paused',
            stopReason: `${scene.name}’s take failed (${why}) — the run stopped there.`,
          });
          return;
        }
      }
    } finally {
      loopingRef.current = false;
      setLooping(false);
      setStopping(null);
    }
  }, [save]);

  const start = useCallback(() => {
    const run = runRef.current;
    if (!run || run.state === 'running' || run.state === 'done' || run.state === 'cancelled')
      return;
    stopRef.current = null;
    const now = Date.now();
    const { stopReason: _reason, ...rest } = run;
    save(
      withRunLog(
        { ...rest, state: 'running', startedAt: run.startedAt ?? now },
        { at: now, event: 'resumed', detail: run.state === 'prepared' ? 'started' : 'resumed' }
      )
    );
    void loop();
  }, [loop, save]);

  /** Stop after the take in flight (Pause), or stop for good after it (Cancel). */
  const stop = useCallback(
    (how: 'pause' | 'cancel') => {
      const run = runRef.current;
      if (!run) return;
      if (loopingRef.current) {
        stopRef.current = how;
        setStopping(how);
        return;
      }
      if (run.state === 'running' || run.state === 'paused' || run.state === 'prepared') {
        save(
          withRunLog(
            { ...run, state: how === 'cancel' ? 'cancelled' : 'paused' },
            { at: Date.now(), event: how === 'cancel' ? 'cancelled' : 'paused', detail: 'by you' }
          )
        );
      }
    },
    [save]
  );

  return { looping, start, stop, stopping };
}
