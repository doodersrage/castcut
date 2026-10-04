'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  RoleplayBeatQueueCore,
  UseRoleplayBeatQueueOptions,
} from '@/hooks/roleplay/useRoleplayBeatQueueCore';
import {
  ADULT_GATE_REQUEUE_MESSAGE,
  ADULT_GATE_WITHHELD_MESSAGE,
} from '@/lib/adult-appearance-gate';
import {
  galleryEntryPrimaryViewUrl,
  loadComfyGallery,
  setGalleryAdultCheck,
} from '@/lib/comfyui-gallery';
import { persistCompletedGalleryMedia } from '@/lib/comfyui-gallery-client';
import { roleplayStillTakes } from '@/lib/roleplay-gallery-takes';
import { pushSystemTrayMessage } from '@/lib/system-tray-messages';

/**
 * The adult-appearance gate on Story (adult-appearance-gate.ts): a still on a Suggestive /
 * Sultry / Explicit / Raunchy story is held until the vision model says all people shown clearly
 * look like adults over 21. A take that does not is withheld for good and the scene is redone
 * once with the stronger age sentence; a second withheld take stops with a message on the card.
 * Always on, one check at a time.
 */
export function useStoryAdultGate(
  options: UseRoleplayBeatQueueOptions,
  core: Pick<RoleplayBeatQueueCore, 'queueBeat'>
): { adultGateStatus: string | null } {
  const { toolSettings, shared } = options;
  const { queueBeat } = core;
  const [adultGateStatus, setAdultGateStatus] = useState<string | null>(null);
  const runningRef = useRef(false);
  const decidedRef = useRef<Set<string>>(new Set());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (runningRef.current) return;
    let target: { beatIndex: number; promptId: string } | null = null;
    const story = toolSettings.story ?? [];
    for (let beatIndex = 0; beatIndex < story.length && !target; beatIndex += 1) {
      for (const take of roleplayStillTakes(story[beatIndex]!)) {
        const promptId = take.promptId?.trim();
        if (take.adultHold === 'checking' && promptId && !decidedRef.current.has(promptId)) {
          target = { beatIndex, promptId };
          break;
        }
      }
    }
    if (!target) return;
    const { promptId } = target;
    const beat = story[target.beatIndex]!;
    const entry = loadComfyGallery().find(galleryEntry => galleryEntry.promptId === promptId);
    const imageUrl = entry ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
    if (!entry || entry.status !== 'completed' || !imageUrl) return;
    runningRef.current = true;
    const label = beat.title || 'A scene';
    setAdultGateStatus(`Checking ${label}…`);
    void (async () => {
      try {
        const strongTake = entry.adultCheck?.strong === true;
        const { checkStillAdultAppearance } = await import('@/lib/adult-appearance-gate-client');
        const decision = await checkStillAdultAppearance({ imageUrl, strongTake, shared });
        decidedRef.current.add(promptId);
        if (decision.verdict === 'pass' || decision.verdict === 'unchecked') {
          setGalleryAdultCheck(promptId, {
            state: decision.verdict === 'pass' ? 'passed' : 'unchecked',
            reason: decision.reason,
            ...(strongTake ? { strong: true } : {}),
          });
          void persistCompletedGalleryMedia(entry);
          setAdultGateStatus(null);
          return;
        }
        setGalleryAdultCheck(promptId, {
          state: 'withheld',
          reason: decision.reason,
          ...(strongTake ? { strong: true } : {}),
        });
        console.warn('Adult check withheld a Story still:', label, decision.reason);
        if (decision.verdict === 'requeue') {
          pushSystemTrayMessage({
            text: `${label}: ${ADULT_GATE_REQUEUE_MESSAGE}`,
            tone: 'warning',
          });
          await queueBeat(beat, { retry: true, strongAgeLine: true });
        } else {
          pushSystemTrayMessage({
            text: `${label}: ${ADULT_GATE_WITHHELD_MESSAGE}.`,
            tone: 'warning',
            ttlMs: 20_000,
          });
        }
        setAdultGateStatus(null);
      } finally {
        runningRef.current = false;
        setTick(value => value + 1);
      }
    })();
  }, [queueBeat, shared, tick, toolSettings.story]);

  return { adultGateStatus };
}
