import { generateRandomScene } from '@/lib/specialized/random-scene';
import { resolveAvoidanceOptions } from '@/lib/avoidance-options';
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

type RandomSceneRequestBody = {
  model?: string;
  detail?: string;
  genre?: string;
  includePeople?: boolean;
  wildness?: number;
  recentLocations?: string[];
  recentClothing?: string[];
  alwaysIncludeClothing?: boolean;
  seedLlmWithIngredients?: boolean;
  blockedLocations?: string[];
  lockedWardrobeId?: string;
  lockedLocation?: string;
  variationSeed?: string;
  avoidedTokens?: string[];
  avoidedTokensInstruction?: string;
};

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/random-scene');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RandomSceneRequestBody;
    const shared = normalizeSharedGenerationOptions(body);
    const avoidance = resolveAvoidanceOptions(body);

    const alwaysIncludeClothing = body.alwaysIncludeClothing === true;
    const seedLlmWithIngredients = body.seedLlmWithIngredients === true;

    const result = await generateRandomScene({
      ...shared,
      ...avoidance,
      genre: body.genre,
      includePeople: typeof body.includePeople === 'boolean' ? body.includePeople : true,
      wildness: typeof body.wildness === 'number' ? Math.min(100, Math.max(0, body.wildness)) : 65,
      recentLocations: normalizeRecentLocations(body.recentLocations),
      recentClothing: normalizeRecentClothing(body.recentClothing),
      alwaysIncludeClothing,
      seedLlmWithIngredients,
      blockedLocations: normalizeBlockedLocations(body.blockedLocations),
      lockedWardrobeId: normalizeLockedWardrobeId(body.lockedWardrobeId),
      lockedLocation: normalizeLockedLocation(body.lockedLocation),
      variationSeed: normalizeVariationSeed(body.variationSeed),
    });

    return apiJson(result);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Random scene generation failed.',
      500
    );
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
