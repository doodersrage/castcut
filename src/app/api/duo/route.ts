import { resolveAvoidanceOptions } from '@/lib/avoidance-options';
import { generateCharacterPrompt } from '@/lib/specialized/character-generator';
import { enrichGenerateResult } from '@/lib/generation-diagnostics';
import {
  normalizeCharacterPresetOptions,
  type CharacterPresetOptions,
} from '@/lib/character-options';
import {
  normalizeSharedGenerationOptions,
  normalizeRecentLocations,
  normalizeRecentClothing,
  normalizeBlockedLocations,
  normalizeLockedWardrobeId,
  normalizeLockedLocation,
  normalizeVariationSeed,
} from '@/lib/specialized/normalize';
import { getSportPreset } from '@/lib/sport-presets';
import { apiError, apiJson, apiMethodNotAllowed, apiOptions } from '@/lib/api/response';

export const runtime = 'nodejs';

type DuoRequestBody = {
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
  sportPresetId?: string;
  blockedLocations?: string[];
  lockedWardrobeId?: string;
  lockedLocation?: string;
  variationSeed?: string;
  activeCharacterDescriptor?: string;
  avoidedTokens?: string[];
  avoidedTokensInstruction?: string;
};

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/duo');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DuoRequestBody;
    const shared = normalizeSharedGenerationOptions(body);
    const avoidance = resolveAvoidanceOptions(body);
    const preset = body.sportPresetId ? getSportPreset(body.sportPresetId) : undefined;

    const hints = (body.hints?.trim() || preset?.hints || '').trim();
    if (!hints) {
      return apiError('Hints or sportPresetId is required.', 400);
    }

    const portraitStyle =
      body.portraitStyle === 'full-body' ||
      body.portraitStyle === 'action' ||
      body.portraitStyle === 'portrait'
        ? body.portraitStyle
        : (preset?.portraitStyle ?? 'action');

    const presetOptions = normalizeCharacterPresetOptions({
      ...body.presetOptions,
      headcount: 'duo',
    });

    const result = await generateCharacterPrompt({
      ...shared,
      ...avoidance,
      hints,
      portraitStyle,
      variationStrength:
        typeof body.variationStrength === 'number'
          ? Math.min(100, Math.max(0, body.variationStrength))
          : 50,
      presetOptions,
      recentLocations: normalizeRecentLocations(body.recentLocations),
      recentClothing: normalizeRecentClothing(body.recentClothing),
      alwaysIncludeClothing: body.alwaysIncludeClothing === true,
      seedLlmWithIngredients: body.seedLlmWithIngredients === true,
      teamKit: body.teamKit ?? preset?.teamKit ?? false,
      blockedLocations: normalizeBlockedLocations(body.blockedLocations),
      lockedWardrobeId: normalizeLockedWardrobeId(body.lockedWardrobeId),
      lockedLocation: normalizeLockedLocation(body.lockedLocation),
      variationSeed: normalizeVariationSeed(body.variationSeed),
      activeCharacterDescriptor: body.activeCharacterDescriptor?.trim() || undefined,
    });

    return apiJson(
      enrichGenerateResult(result, hints, {
        teamKit: body.teamKit ?? preset?.teamKit ?? false,
      })
    );
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Duo generation failed.', 500);
  }
}

export function OPTIONS() {
  return apiOptions();
}
