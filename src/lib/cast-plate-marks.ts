'use client';

/** Whether a look's plate is missing the Cast's marks (glasses, tattoos) — the vision check. */

import { checkableMarks, marksCheckVerdict } from './cast-marks-check';
import { checkStillMarks } from './cast-marks-check-client';
import { getCharacter, looksOf } from './character-os';
import { loadComfyUiSettings } from './comfyui-settings';
import { lookPlateFaceUrl } from './likeness-measure-client';
import { loadSettingsCache } from './settings-cache';

export async function lookPlateMissesMarks(characterId: string, lookId: string): Promise<boolean> {
  const character = getCharacter(characterId);
  const look = character ? looksOf(character).find(entry => entry.id === lookId) : undefined;
  const plate = look ? lookPlateFaceUrl(look) : null;
  if (!character || !plate) return false;
  // A plate is the base layer: every mark should show.
  const expected = checkableMarks(character.marks, { undressed: true });
  if (!expected.length) return false;
  const result = await checkStillMarks({
    imageUrl: plate,
    shared: loadSettingsCache().shared,
    comfyUrl: loadComfyUiSettings().apiUrl?.trim() || undefined,
  }).catch(() => null);
  if (!result || 'unavailable' in result) return false;
  return marksCheckVerdict(result.reading, expected, character.marks).issues.length > 0;
}
