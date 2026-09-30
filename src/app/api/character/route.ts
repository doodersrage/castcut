import { generateCharacterPrompt } from '@/lib/specialized/character-generator';
import { resolveAvoidanceOptions } from '@/lib/avoidance-options';
import { enrichGenerateResult } from '@/lib/generation-diagnostics';
import {
  normalizeSharedGenerationOptions,
  normalizeRecentLocations,
  normalizeRecentClothing,
  normalizeBlockedLocations,
  normalizeLockedWardrobeId,
  normalizeLockedLocation,
  normalizeVariationSeed,
} from '@/lib/specialized/normalize';
import {
  normalizeCharacterPresetOptions,
  type CharacterPresetOptions,
} from '@/lib/character-options';
import { apiError, apiJson, apiMethodNotAllowed, apiOptions } from '@/lib/api/response';

export const runtime = 'nodejs';

type CharacterRequestBody = {
  model?: string;
  detail?: string;
  hints?: string;
  portraitStyle?: 'portrait' | 'full-body' | 'action';
  variationStrength?: number;
  presetOptions?: Partial<Record<keyof CharacterPresetOptions, string>>;
  recentLocations?: string[];
  recentClothing?: string[];
  alwaysIncludeClothing?: boolean;
  seedLlmWithIngredients?: boolean;
  teamKit?: boolean;
  blockedLocations?: string[];
  lockedWardrobeId?: string;
  lockedLocation?: string;
  variationSeed?: string;
  activeCharacterDescriptor?: string;
  avoidedTokens?: string[];
  avoidedTokensInstruction?: string;
};

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/character');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CharacterRequestBody;
    const shared = normalizeSharedGenerationOptions(body);
    const avoidance = resolveAvoidanceOptions(body);

    const portraitStyle =
      body.portraitStyle === 'full-body' ||
      body.portraitStyle === 'action' ||
      body.portraitStyle === 'portrait'
        ? body.portraitStyle
        : 'portrait';

    const alwaysIncludeClothing = body.alwaysIncludeClothing === true;
    const seedLlmWithIngredients = body.seedLlmWithIngredients === true;

    const result = await generateCharacterPrompt({
      ...shared,
      ...avoidance,
      hints: body.hints?.trim(),
      portraitStyle,
      variationStrength:
        typeof body.variationStrength === 'number'
          ? Math.min(100, Math.max(0, body.variationStrength))
          : 50,
      presetOptions: normalizeCharacterPresetOptions(body.presetOptions),
      recentLocations: normalizeRecentLocations(body.recentLocations),
      recentClothing: normalizeRecentClothing(body.recentClothing),
      alwaysIncludeClothing,
      seedLlmWithIngredients,
      teamKit: body.teamKit === true,
      blockedLocations: normalizeBlockedLocations(body.blockedLocations),
      lockedWardrobeId: normalizeLockedWardrobeId(body.lockedWardrobeId),
      lockedLocation: normalizeLockedLocation(body.lockedLocation),
      variationSeed: normalizeVariationSeed(body.variationSeed),
      activeCharacterDescriptor: body.activeCharacterDescriptor?.trim() || undefined,
    });

    return apiJson(
      enrichGenerateResult(result, body.hints?.trim(), {
        teamKit: body.teamKit === true,
      })
    );
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Character generation failed.', 500);
  }
}

export function OPTIONS() {
  return apiOptions();
}
