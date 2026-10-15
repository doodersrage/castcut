'use client';

import { useEffect, useRef } from 'react';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { prepareCastPlate, type CastPlatePrepareOptions } from '@/lib/cast-plate-prepare';
import { activeLook, getCharacter } from '@/lib/character-os';
import { dayPartnerNoun } from '@/lib/day-partner';
import { resolveFittingPlateFromCharacter } from '@/lib/character-plate';
import { loadSettingsCache } from '@/lib/settings-cache';

/**
 * Fixes the active look's new plate once with Cast home's Prepare plate: paints on the Cast's
 * marks when the marks check found them missing, or shaves a Clean-shaven Cast's first plate.
 * Mounted only for that job — it owns a ComfyUI queue hook the app shell never needs otherwise.
 */
export default function LookPlateMarksRepair({
  characterId,
  lookId,
  options = { stand: false, baseLayer: false, whiteBackground: false, marks: true },
  onDone,
}: {
  characterId: string;
  lookId: string;
  options?: CastPlatePrepareOptions;
  onDone: (result: 'painted' | 'skipped' | 'failed', note?: string) => void;
}) {
  const model = loadSettingsCache().shared.model;
  const actions = usePromptResultActions({ tool: 'fitting', model });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const character = getCharacter(characterId);
    const plate = character ? resolveFittingPlateFromCharacter(character) : null;
    if (!character || !plate || activeLook(character).id !== lookId) {
      onDone('skipped');
      return;
    }
    prepareCastPlate({
      characterId,
      lookId,
      plate,
      options,
      noun: dayPartnerNoun(character),
      model,
      sendComfyUi: actions.sendComfyUi,
    })
      .then(() => onDone('painted'))
      .catch(error => onDone('failed', error instanceof Error ? error.message : String(error)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one run per mount
  }, [actions.sendComfyUi, characterId, lookId, model, onDone]);

  return null;
}
