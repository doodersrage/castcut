'use client';

import { useCallback, useRef, useState } from 'react';
import { getCharacter, loadCharacters, type CharacterRecord } from '@/lib/character/os';
import { DEFAULT_SCENE_TOOL_CACHE, type DayToolCache } from '@/lib/play/settings';
import { loadSettingsCache, loadToolSettings, saveToolSettings } from '@/lib/settings/cache';
import { loadDayBoard } from '@/lib/day/day-board-client';
import { sharedLlmRequestBody } from '@/lib/llm/request-options';
import { dayShortFingerprint } from '@/lib/day/day-as-short';
import { episodeSceneTail } from '@/lib/day/episode-writer';
import { normalizeSavedScenes, upsertScene } from '@/lib/day/scenes';
import { addScriptPatch } from '@/lib/day/scene-scripts';
import { scriptsCacheOf } from '@/lib/day/scene-script-store';
import { applySceneScriptsPatch, loadSceneScriptStore } from '@/lib/day/scene-script-store-client';
import { saveDayAsShort } from '@/lib/day/scene-links';
import { normalizeDaySlots } from '@/lib/day/planner';
import {
  momentDialogueOutline,
  momentPeople,
  withMomentDialogue,
  type MomentPerson,
} from '@/lib/day/short-dialogue';

/** Writing the moments' scenes: how far, and what went wrong. */
export type ShortDialogueState = {
  writing: { done: number; of: number } | null;
  note: string | null;
};

const asPerson = (member: CharacterRecord | null | undefined): MomentPerson | null =>
  member?.name?.trim()
    ? {
        name: member.name.trim(),
        castId: member.id,
        ...(member.traits?.sex ? { sex: member.traits.sex } : {}),
      }
    : null;

/**
 * Write it, with dialogue (Step 5c): after the cards have their beats, each moment's scene is
 * written by the episode writer and put in its place in the short (short-dialogue.ts) — one at a
 * time, each kept as it lands, so Stop keeps what is written. The short is brought up to the
 * board first, so the scenes written are the cards'.
 */
export function useShortDialogue(input: {
  character: CharacterRecord | null | undefined;
  updateDay: (patch: Partial<DayToolCache>) => void;
}) {
  const { character, updateDay } = input;
  const [state, setState] = useState<ShortDialogueState>({ writing: null, note: null });
  const stopRef = useRef(false);

  const write = useCallback(
    async (premise: string) => {
      const castId = character?.id ?? '';
      const leadName = character?.name?.trim() ?? '';
      if (!castId || !leadName) return;
      stopRef.current = false;
      // The board as Write it left it, its short brought up to it.
      let day = loadDayBoard();
      const synced = saveDayAsShort({
        day,
        castId,
        leadName,
        ...(day.shortLink ? { link: day.shortLink } : {}),
      });
      if (!('link' in synced)) {
        setState({
          writing: null,
          note:
            'choose' in synced
              ? `Its dialogue wasn't written: ${synced.choose}`
              : `Its dialogue wasn't written: ${synced.error}`,
        });
        return;
      }
      let link = synced.link;
      updateDay({ shortLink: link });
      day = { ...day, shortLink: link };
      const companions = day.allowCompanions === true;
      const partner = asPerson(
        day.partnerCharacterId ? getCharacter(day.partnerCharacterId) : null
      );
      const cast = loadCharacters();
      const castById = (id: string) => asPerson(cast.find(member => member.id === id)) ?? undefined;
      const peopleOf = (slot: Parameters<typeof momentPeople>[0]) =>
        momentPeople(slot, { companions, partner, castById });
      const script0 = loadSceneScriptStore().scripts.find(entry => entry.id === link.scriptId);
      const { outline, slotIds } = momentDialogueOutline({
        day,
        title: script0?.name ?? `${leadName}’s day`,
        logline: premise,
        peopleOf,
      });
      const castList = [
        ...new Map(
          slotIds
            .flatMap(id =>
              peopleOf(normalizeDaySlots(day.slots, day.dayLength).find(slot => slot.id === id)!)
            )
            .map(person => [
              person.name,
              { name: person.name, ...(person.sex ? { sex: person.sex } : {}) },
            ])
        ).values(),
      ];
      const llmBody = sharedLlmRequestBody(loadSettingsCache().shared);
      let before = '';
      let failed = 0;
      for (let index = 0; index < slotIds.length; index += 1) {
        if (stopRef.current) break;
        setState({ writing: { done: index, of: slotIds.length }, note: null });
        const slotId = slotIds[index]!;
        let text: string | null = null;
        try {
          const response = await fetch('/api/script-episode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
              step: 'scene',
              outline,
              index,
              lead: leadName,
              cast: castList,
              before,
              ...llmBody,
            }),
          });
          const data = (await response.json().catch(() => ({}))) as {
            text?: string;
            error?: string;
          };
          if (!response.ok || !data.text)
            throw new Error(data.error ?? 'The LLM could not write it.');
          text = data.text;
        } catch (error) {
          failed += 1;
          setState(current => ({
            ...current,
            note: error instanceof Error ? error.message : 'The LLM could not write it.',
          }));
          continue;
        }
        // Kept as it lands, on the short as it is now (an edit made meanwhile included).
        const script = loadSceneScriptStore().scripts.find(entry => entry.id === link.scriptId);
        const sceneCache = loadToolSettings('scene', DEFAULT_SCENE_TOOL_CACHE);
        const scenes = normalizeSavedScenes(sceneCache.scenes);
        const slot = normalizeDaySlots(day.slots, day.dayLength).find(
          entry => entry.id === slotId
        )!;
        const result = script
          ? withMomentDialogue({
              script,
              scenes,
              slotId,
              written: text,
              castId,
              leadName,
              people: peopleOf(slot),
            })
          : null;
        if (!result) {
          failed += 1;
          continue;
        }
        applySceneScriptsPatch(
          addScriptPatch(scriptsCacheOf(loadSceneScriptStore()), result.script)
        );
        saveToolSettings('scene', {
          ...sceneCache,
          scenes: result.scenes.reduce((all, scene) => upsertScene(all, scene), scenes),
        });
        // The card says her first line; the link moves with it, so the board doesn't write the
        // scene back over itself.
        day = loadDayBoard();
        const slots = normalizeDaySlots(day.slots, day.dayLength).map(entry =>
          entry.id === slotId ? { ...entry, line: result.line } : entry
        );
        link = {
          ...link,
          fingerprint: dayShortFingerprint({ ...day, slots }),
          syncedAt: result.script.updatedAt,
        };
        updateDay({ slots, shortLink: link });
        day = { ...day, slots, shortLink: link };
        before = episodeSceneTail(text);
      }
      const stopped = stopRef.current;
      setState({
        writing: null,
        note: failed
          ? `${failed} moment${failed === 1 ? '' : 's'} kept without dialogue — Write it again, or write ${failed === 1 ? 'it' : 'them'} on Script.`
          : stopped
            ? 'Stopped — the moments written so far keep their dialogue.'
            : null,
      });
    },
    [character, updateDay]
  );

  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);

  return { ...state, write, stop };
}
