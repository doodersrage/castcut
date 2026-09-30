import { generateBackgroundPrompt } from '@/lib/specialized/background-generator';
import { generateCharacterPrompt } from '@/lib/specialized/character-generator';
import { enrichGenerateResult } from '@/lib/generation-diagnostics';
import {
  normalizeCharacterPresetOptions,
  type CharacterPresetOptions,
} from '@/lib/character-options';
import {
  normalizeBackgroundPresetOptions,
  type BackgroundPresetOptions,
} from '@/lib/background-options';
import {
  normalizeSharedGenerationOptions,
  normalizeRecentLocations,
  normalizeRecentClothing,
  normalizeBlockedLocations,
  normalizeLockedWardrobeId,
  normalizeLockedLocation,
  normalizeVariationSeed,
} from '@/lib/specialized/normalize';
import { resolveAvoidanceOptions } from '@/lib/avoidance-options';
import { composeScenePrompt, type ComposeSceneStyle } from '@/lib/scene-composer';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type ComposeRequestBody = {
  model?: string;
  detail?: string;
  subjectMode?: 'character' | 'duo';
  hints?: string;
  portraitStyle?: 'portrait' | 'full-body' | 'action';
  variationStrength?: number;
  presetOptions?: Partial<Record<keyof CharacterPresetOptions, string>>;
  background?: {
    settingType?: string;
    timeOfDay?: string;
    mood?: string;
    presetOptions?: Partial<Record<keyof BackgroundPresetOptions, string>>;
  };
  composeStyle?: ComposeSceneStyle;
  recentLocations?: string[];
  recentClothing?: string[];
  blockedLocations?: string[];
  lockedWardrobeId?: string;
  lockedLocation?: string;
  variationSeed?: string;
  alwaysIncludeClothing?: boolean;
  seedLlmWithIngredients?: boolean;
  teamKit?: boolean;
  avoidedTokens?: string[];
  avoidedTokensInstruction?: string;
};

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/compose');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ComposeRequestBody;
    const shared = normalizeSharedGenerationOptions(body);
    const avoidance = resolveAvoidanceOptions(body);
    const subjectMode = body.subjectMode === 'duo' ? 'duo' : 'character';
    const hints = body.hints?.trim() ?? '';
    const composeStyle = body.composeStyle === 'inline' ? 'inline' : 'layered';

    const portraitStyle =
      body.portraitStyle === 'full-body' ||
      body.portraitStyle === 'action' ||
      body.portraitStyle === 'portrait'
        ? body.portraitStyle
        : subjectMode === 'duo'
          ? 'action'
          : 'portrait';

    const presetOptions = normalizeCharacterPresetOptions({
      ...body.presetOptions,
      headcount: subjectMode === 'duo' ? 'duo' : undefined,
    });

    const [backgroundResult, subjectResult] = await Promise.all([
      generateBackgroundPrompt({
        ...shared,
        ...avoidance,
        settingType: body.background?.settingType,
        timeOfDay: body.background?.timeOfDay,
        mood: body.background?.mood,
        presetOptions: normalizeBackgroundPresetOptions(body.background?.presetOptions),
        recentLocations: normalizeRecentLocations(body.recentLocations),
        blockedLocations: normalizeBlockedLocations(body.blockedLocations),
      }),
      generateCharacterPrompt({
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
        teamKit: body.teamKit === true,
        blockedLocations: normalizeBlockedLocations(body.blockedLocations),
        lockedWardrobeId: normalizeLockedWardrobeId(body.lockedWardrobeId),
        lockedLocation: normalizeLockedLocation(body.lockedLocation),
        variationSeed: normalizeVariationSeed(body.variationSeed),
      }),
    ]);

    const composedPrompt = composeScenePrompt({
      backgroundPrompt: backgroundResult.prompt,
      subjectPrompt: subjectResult.prompt,
      style: composeStyle,
    });

    const enriched = enrichGenerateResult(
      {
        ...subjectResult,
        prompt: composedPrompt,
        metadata: {
          ...subjectResult.metadata,
          composeStyle,
          backgroundPrompt: backgroundResult.prompt,
          subjectPrompt: subjectResult.prompt,
        },
      },
      hints,
      { teamKit: body.teamKit === true }
    );

    return apiJson(enriched);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Scene composition failed.', 500);
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
