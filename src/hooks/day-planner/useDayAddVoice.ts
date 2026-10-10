'use client';

import { keepClipInGallery } from '@/lib/clip-gallery-keep';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import { clipUrlIsAnimatedImage } from '@/lib/clip-media-kind';
import { requestClipVoice } from '@/lib/clip-voice';
import { dayPartnerNoun } from '@/lib/day-partner';
import { upsertDaySlotStill, type DaySlot } from '@/lib/day-planner';
import { spokenLineHeat } from '@/lib/spoken-line';

/**
 * Day "Add voice": a finished silent clip (two-person adult clips render on WAN, which makes no
 * sound) gets LTX-2.5's soundtrack — the slot's line if it has one — with the picture unchanged.
 * The voiced MP4 replaces the slot's clip (the silent one stays in the Gallery).
 */
export function useDayAddVoice(ctx: DayPlannerToolOrchestrationCore) {
  const { character, stillsRef, toolSettings, updateToolSettings } = ctx;
  const dayMood = toolSettings.dayMood;
  // The slot being voiced (by a tap or automatically): the board disables Add voice there.
  const [voicingSlotId, setVoicingSlotId] = useState<string | null>(null);
  const voicingRef = useRef<string | null>(null);
  const addVoiceToSlot = useCallback(
    async (slot: DaySlot): Promise<string | null> => {
      const still = stillsRef.current.find(entry => entry.slotId === slot.id);
      const clipUrl = still?.clipStatus === 'completed' ? still.clipUrl?.trim() : '';
      if (!still || !clipUrl) return 'This slot has no finished clip.';
      if (voicingRef.current) return 'Already adding a voice — one clip at a time.';
      voicingRef.current = slot.id;
      setVoicingSlotId(slot.id);
      try {
        const url = await requestClipVoice({
          clipUrl,
          scene: slot.sceneHints?.trim() || slot.label,
          line: slot.line,
          heat: spokenLineHeat(dayMood),
          lead: dayPartnerNoun(character ?? {}) === 'man' ? 'man' : 'woman',
        });
        // Latest stills: other slots may have landed during the minute this took.
        const latest = stillsRef.current.find(entry => entry.slotId === slot.id);
        // Same clip = same clip job (the gallery sync may rewrite the URL of the same clip).
        const same = still.clipPromptId?.trim()
          ? latest?.clipPromptId?.trim() === still.clipPromptId.trim()
          : latest?.clipUrl?.trim() === clipUrl;
        if (!latest || !same) {
          return 'The clip changed while its voice was being made — try again.';
        }
        // Kept in the Gallery (not only as a ComfyUI input file).
        const kept = await keepClipInGallery({
          url,
          kind: 'voice',
          prompt: `Add voice · ${slot.label}`,
          tool: 'day',
          sourcePromptId: latest.clipPromptId,
        });
        const now = stillsRef.current.find(entry => entry.slotId === slot.id) ?? latest;
        updateToolSettings({
          stills: upsertDaySlotStill(stillsRef.current, {
            ...now,
            clipUrl: kept.url,
            // The kept copy's entry: the gallery sync used to put the silent clip back.
            clipPromptId: kept.promptId,
            clipRenderPromptId: now.clipRenderPromptId ?? now.clipPromptId,
          }),
        });
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : 'Add voice failed.';
      } finally {
        voicingRef.current = null;
        setVoicingSlotId(null);
      }
    },
    [character, dayMood, stillsRef, updateToolSettings]
  );
  // A slot with a line whose clip came back silent (WAN): add the voice without a tap — the line
  // says the player wants them to talk. Once per clip, one at a time.
  const { slots, stills } = ctx;
  const triedRef = useRef(new Set<string>());
  useEffect(() => {
    if (voicingSlotId) return;
    for (const slot of slots) {
      if (!slot.line?.trim()) continue;
      const still = stills.find(entry => entry.slotId === slot.id);
      const clipUrl = still?.clipStatus === 'completed' ? still.clipUrl?.trim() : '';
      if (!clipUrl || triedRef.current.has(clipUrl)) continue;
      if (still?.extendJobId) continue;
      if (!clipUrlIsAnimatedImage(clipUrl, { promptId: still?.clipPromptId })) continue;
      triedRef.current.add(clipUrl);
      void addVoiceToSlot(slot);
      return;
    }
  }, [addVoiceToSlot, slots, stills, voicingSlotId]);
  return { addVoiceToSlot, voicingSlotId };
}
