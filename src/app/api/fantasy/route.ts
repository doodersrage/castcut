import { generateFantasyPrompt } from '@/lib/specialized/fantasy-generator';
import { resolveAvoidanceOptions } from '@/lib/prompt/avoidance-options';
import {
  normalizeFantasyPresetOptions,
  type FantasyPresetOptions,
  type FantasyShotFraming,
} from '@/lib/scene/fantasy-options';
import {
  normalizeBlockedLocations,
  normalizeRecentLocations,
  normalizeSharedGenerationOptions,
} from '@/lib/specialized/normalize';
import { apiError, apiJson, apiMethodNotAllowed, apiOptions } from '@/lib/api/response';

export const runtime = 'nodejs';

type FantasyRequestBody = {
  model?: string;
  detail?: string;
  hints?: string;
  portraitStyle?: FantasyShotFraming;
  wildness?: number;
  variationStrength?: number;
  presetOptions?: Partial<Record<keyof FantasyPresetOptions, string>>;
  recentLocations?: string[];
  recentClothing?: string[];
  blockedLocations?: string[];
  lockedLocation?: string;
  lockedWardrobeId?: string;
  variationSeed?: string;
  alwaysIncludeClothing?: boolean;
  seedLlmWithIngredients?: boolean;
  avoidedTokens?: string[];
  avoidedTokensInstruction?: string;
};

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/fantasy');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FantasyRequestBody;
    const shared = normalizeSharedGenerationOptions(body);
    const avoidance = resolveAvoidanceOptions(body);

    const result = await generateFantasyPrompt({
      ...shared,
      ...avoidance,
      hints: body.hints?.trim(),
      portraitStyle: body.portraitStyle,
      wildness: body.wildness,
      variationStrength: body.variationStrength,
      presetOptions: normalizeFantasyPresetOptions(body.presetOptions),
      recentLocations: normalizeRecentLocations(body.recentLocations),
      recentClothing: body.recentClothing,
      blockedLocations: normalizeBlockedLocations(body.blockedLocations),
      lockedLocation: body.lockedLocation?.trim(),
      lockedWardrobeId: body.lockedWardrobeId?.trim(),
      variationSeed: body.variationSeed?.trim(),
      alwaysIncludeClothing: body.alwaysIncludeClothing,
      seedLlmWithIngredients: body.seedLlmWithIngredients,
    });

    return apiJson(result);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Fantasy generation failed.', 500);
  }
}

export function OPTIONS() {
  return apiOptions();
}
