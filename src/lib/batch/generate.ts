import { generateCharacterPrompt } from '../specialized/character-generator';
import { enrichGenerateResult } from '../queue/generation-diagnostics';
import { readClothingIdsFromMetadata } from '../wardrobe/recent-clothing';
import { readSceneLocationFromMetadata } from '../scene/recent-locations';
import type { CharacterOptions, ToolGenerateResult } from '../specialized/types';

export type BatchGenerateOptions = CharacterOptions & {
  count?: number;
  teamKit?: boolean;
};

export type BatchGenerateResult = {
  results: Array<
    ToolGenerateResult & { diagnostics: ReturnType<typeof enrichGenerateResult>['diagnostics'] }
  >;
  count: number;
};

export async function batchGenerateCharacter(
  options: BatchGenerateOptions
): Promise<BatchGenerateResult> {
  const count = Math.min(Math.max(options.count ?? 3, 1), 12);
  const recentLocations = [...(options.recentLocations ?? [])];
  const recentClothing = [...(options.recentClothing ?? [])];
  const results: BatchGenerateResult['results'] = [];

  for (let index = 0; index < count; index += 1) {
    const result = await generateCharacterPrompt({
      ...options,
      recentLocations: recentLocations.length > 0 ? recentLocations : undefined,
      recentClothing: recentClothing.length > 0 ? recentClothing : undefined,
    });

    const enriched = enrichGenerateResult(result, options.hints, {
      teamKit: options.teamKit,
    });
    results.push(enriched);

    const location = readSceneLocationFromMetadata(result.metadata);
    if (location) {
      recentLocations.unshift(location);
      recentLocations.splice(24);
    }

    for (const id of readClothingIdsFromMetadata(result.metadata)) {
      recentClothing.unshift(id);
    }
    recentClothing.splice(24);
  }

  return { results, count: results.length };
}
