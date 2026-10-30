'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import type { useScenePage } from '@/hooks/day-planner/useScenePage';
import { waitForGalleryPromptIds } from '@/lib/best-of-n/vision-queue';
import { COMFYUI_GALLERY_UPDATED_EVENT, loadComfyGallery } from '@/lib/gallery/comfyui-gallery';
import { scheduleComfyGalleryPoll } from '@/lib/gallery/comfyui-gallery-poller';
import { cancelComfyGalleryJob } from '@/lib/comfyui/queue-cancel';
import { typicalRenderMs } from '@/lib/queue/eta';
import {
  nextRunStep,
  pausedAfterReload,
  runQueue,
  runTakeSettled,
  runTakesHanded,
  settleHandedRun,
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
/**
 * How long a take may take to be queued. The first take in an outfit dresses the plate first (an
 * Edit pass or two): on a fresh install that took about 3 minutes (M7 T5, D25), and a 60 s wait
 * paused every run on its first Scene while the take was still on its way.
 */
const QUEUE_TIMEOUT_MS = 5 * 60_000;

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
 *
 * Queue all (M5 hand-off, IMPLEMENTATION_PLAN Part 14 A) puts together each Scene's take the same
 * way but hands it to ComfyUI and opens the next at once: once every take is queued the page can
 * close. Each lands on its own Scene (SavedScene.renderingTakeIds) and the run settles from the
 * Gallery; Cancel then takes the jobs not started yet out of ComfyUI's queue.
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

  // Takes handed to ComfyUI: their polls (re)started once, then settled as the Gallery hears.
  const polledRef = useRef(new Set<string>());
  const handedKey = page.run
    ? runTakesHanded(page.run)
        .map(([, id]) => id)
        .join(',')
    : '';
  useEffect(() => {
    if (!handedKey) return;
    const gallery = loadComfyGallery();
    for (const promptId of handedKey.split(',')) {
      if (polledRef.current.has(promptId)) continue;
      polledRef.current.add(promptId);
      const known = gallery.find(item => item.promptId === promptId);
      if (known?.status === 'pending' || known?.status === 'running' || !known) {
        void scheduleComfyGalleryPoll(promptId, { comfyUrl: known?.comfyUrl });
      }
    }
    const settle = () => {
      const run = runRef.current;
      if (!run) return;
      const nameOf = (id: string) =>
        pageRef.current.castScenes.find(scene => scene.id === id)?.name ?? 'A Scene';
      const next = settleHandedRun(run, loadComfyGallery(), nameOf);
      if (next !== run) save(next);
    };
    settle();
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, settle);
    return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, settle);
  }, [handedKey, save]);

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
        if (step.kind === 'done' && run.handOff) {
          const handed = runTakesHanded(run).length;
          save(
            handed
              ? withRunLog(
                  { ...run, state: 'handed' },
                  {
                    at: Date.now(),
                    event: 'handed',
                    detail: `${handed} take${handed === 1 ? ' is' : 's are'} in ComfyUI’s queue — the page can close`,
                  }
                )
              : settleHandedRun({ ...run, state: 'handed' }, loadComfyGallery(), id => id)
          );
          return;
        }
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
          pageRef.current.openScene(sceneId, { carryOn: Boolean(run.handOff) });
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

        // Queue all: handed to ComfyUI — it lands on its Scene; the next is put together now.
        if (run.handOff) {
          const latest = runRef.current ?? run;
          const { current: _current, ...rest } = latest;
          save(
            withRunLog(
              {
                ...rest,
                handOff: {
                  ...run.handOff,
                  handed: { ...(latest.handOff?.handed ?? {}), [sceneId]: promptId },
                },
              },
              { at: Date.now(), sceneId, event: 'handed', detail: promptId }
            )
          );
          continue;
        }

        // Wait for it to land, then for its checks (the card is free again). Its poll is
        // (re)started first: after a reload nothing else may be asking about it (as R8 does).
        const known = loadComfyGallery().find(item => item.promptId === promptId);
        void scheduleComfyGalleryPoll(promptId, { comfyUrl: known?.comfyUrl });
        const [entry] = await waitForGalleryPromptIds([promptId], {
          timeoutMs: RENDER_TIMEOUT_MS,
          pollMs: 3_000,
        });
        if (entry?.status === 'completed') {
          await until(
            () =>
              runTakeSettled({
                still: pageRef.current.still,
                promptId,
                inFlight: pageRef.current.inFlight,
                checksPending: vmRef.current.afterChecksPending,
                reviewPending: vmRef.current.autoReviewPending,
                isRedo: still => {
                  const redo = vmRef.current.poseRedoOf(pageRef.current.slot.id);
                  return Boolean(
                    redo &&
                    redo.missedTake === promptId &&
                    (!redo.redoTake || redo.redoTake === still.promptId)
                  );
                },
              }),
            CHECKS_TIMEOUT_MS
          );
        } else {
          await until(() => !pageRef.current.inFlight, CHECKS_TIMEOUT_MS);
        }
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

  /** Start a prepared run as Queue all: the Scenes the limits allow now, each handed once. */
  const queueAll = useCallback(() => {
    const run = runRef.current;
    if (!run || run.state !== 'prepared') return;
    const typicalSec = typicalRenderMs(loadComfyGallery()) / 1000;
    const sceneIds = runQueue(run, pageRef.current.castScenes, typicalSec).queued.map(
      entry => entry.sceneId
    );
    if (!sceneIds.length) return;
    stopRef.current = null;
    const now = Date.now();
    save(
      withRunLog(
        { ...run, state: 'running', startedAt: now, handOff: { sceneIds, handed: {} } },
        { at: now, event: 'resumed', detail: `queue all: ${sceneIds.length} takes` }
      )
    );
    void loop();
  }, [loop, save]);

  /**
   * Stop after the take in flight (Pause), or stop for good after it (Cancel). Cancel also takes
   * the handed takes ComfyUI hasn't started out of its queue (one rendering finishes).
   */
  const stop = useCallback(
    (how: 'pause' | 'cancel') => {
      const run = runRef.current;
      if (!run) return;
      if (how === 'cancel') void cancelHanded(run);
      if (loopingRef.current) {
        stopRef.current = how;
        setStopping(how);
        return;
      }
      if (
        run.state === 'running' ||
        run.state === 'paused' ||
        run.state === 'prepared' ||
        (run.state === 'handed' && how === 'cancel')
      ) {
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

  return { looping, start, queueAll, stop, stopping };
}

/** The run's handed takes still waiting in ComfyUI's queue, cancelled (Gallery entries too). */
async function cancelHanded(run: SceneRun): Promise<void> {
  const handed = new Set(runTakesHanded(run).map(([, promptId]) => promptId));
  if (!handed.size) return;
  const waiting = loadComfyGallery().filter(
    entry => handed.has(entry.promptId?.trim() ?? '') && entry.status === 'pending'
  );
  for (const entry of waiting) await cancelComfyGalleryJob(entry).catch(() => undefined);
}
