import { generateBackgroundPrompt } from '@/lib/specialized/background-generator';
import { resolveAvoidanceOptions } from '@/lib/prompt/avoidance-options';
import {
  normalizeSharedGenerationOptions,
  normalizeRecentLocations,
  normalizeBlockedLocations,
} from '@/lib/specialized/normalize';
import {
  normalizeBackgroundPresetOptions,
  type BackgroundPresetOptions,
} from '@/lib/scene/background-options';
import { apiError, apiJson, apiMethodNotAllowed, apiOptions } from '@/lib/api/response';

export const runtime = 'nodejs';

type BackgroundRequestBody = {
  model?: string;
  detail?: string;
  settingType?: string;
  timeOfDay?: string;
  mood?: string;
  presetOptions?: Partial<Record<keyof BackgroundPresetOptions, string | string[]>>;
  recentLocations?: string[];
  blockedLocations?: string[];
  avoidedTokens?: string[];
  avoidedTokensInstruction?: string;
};

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/background');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BackgroundRequestBody;
    const shared = normalizeSharedGenerationOptions(body);
    const avoidance = resolveAvoidanceOptions(body);

    const result = await generateBackgroundPrompt({
      ...shared,
      ...avoidance,
      settingType: body.settingType?.trim(),
      timeOfDay: body.timeOfDay?.trim(),
      mood: body.mood?.trim(),
      presetOptions: normalizeBackgroundPresetOptions(body.presetOptions),
      recentLocations: normalizeRecentLocations(body.recentLocations),
      blockedLocations: normalizeBlockedLocations(body.blockedLocations),
    });

    return apiJson(result);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Background generation failed.', 500);
  }
}

export function OPTIONS() {
  return apiOptions();
}
