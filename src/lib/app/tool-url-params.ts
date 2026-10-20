import { splitBackgroundHintSeed } from '../prompt/history-hint-seed';
import { normalizeSceneHintSource } from '../scene/hint-source';

export function applyHintSourceFromSearchParams(
  params: URLSearchParams,
  updateToolSettings: (patch: Record<string, unknown>) => void
): void {
  const hintSource = normalizeSceneHintSource(params.get('hintSource') ?? undefined);
  if (params.has('hintSource')) {
    updateToolSettings({
      hintSource,
      ...(hintSource === 'random' ? { generateSource: 'random' } : { generateSource: 'keywords' }),
    });
  }
}

export function applyBackgroundHintsFromSearchParams(
  params: URLSearchParams,
  updateToolSettings: (patch: Record<string, unknown>) => void
): void {
  const hints = params.get('hints');
  if (!hints?.trim()) {
    return;
  }
  const tags = splitBackgroundHintSeed(hints.trim());
  updateToolSettings({
    settingType: tags.settingType,
    timeOfDay: tags.timeOfDay,
    mood: tags.mood,
    hintSource: 'manual',
  });
}
