import { batchGenerateCharacter } from '@/lib/batch-generate';
import { resolveAvoidanceOptions } from '@/lib/avoidance-options';
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
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type BatchRequestBody = {
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
  count?: number;
  blockedLocations?: string[];
  lockedWardrobeId?: string;
  lockedLocation?: string;
  variationSeed?: string;
  avoidedTokens?: string[];
  avoidedTokensInstruction?: string;
};

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/batch');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BatchRequestBody;
    const shared = normalizeSharedGenerationOptions(body);
    const avoidance = resolveAvoidanceOptions(body);

    const portraitStyle =
      body.portraitStyle === 'full-body' ||
      body.portraitStyle === 'action' ||
      body.portraitStyle === 'portrait'
        ? body.portraitStyle
        : 'action';

    const result = await batchGenerateCharacter({
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
      alwaysIncludeClothing: body.alwaysIncludeClothing === true,
      seedLlmWithIngredients: body.seedLlmWithIngredients === true,
      teamKit: body.teamKit === true,
      count: typeof body.count === 'number' ? body.count : 3,
      blockedLocations: normalizeBlockedLocations(body.blockedLocations),
      lockedWardrobeId: normalizeLockedWardrobeId(body.lockedWardrobeId),
      lockedLocation: normalizeLockedLocation(body.lockedLocation),
      variationSeed: normalizeVariationSeed(body.variationSeed),
    });

    return apiJson(result);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Batch generation failed.', 500);
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
