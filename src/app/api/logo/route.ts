import { generateLogoPrompt } from '@/lib/specialized/logo-generator';
import { resolveAvoidanceOptions } from '@/lib/prompt/avoidance-options';
import { normalizeSharedGenerationOptions } from '@/lib/specialized/normalize';
import type { LogoMotifId, LogoStylePresetId } from '@/lib/app/logo-presets';
import { apiError, apiJson, apiMethodNotAllowed, apiOptions } from '@/lib/api/response';

export const runtime = 'nodejs';

type LogoRequestBody = {
  model?: string;
  detail?: string;
  brandName?: string;
  tagline?: string;
  industry?: string;
  stylePreset?: LogoStylePresetId;
  motif?: LogoMotifId;
  includeWordmark?: boolean;
  extraNotes?: string;
  avoidedTokens?: string[];
  avoidedTokensInstruction?: string;
};

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/logo');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LogoRequestBody;
    const shared = normalizeSharedGenerationOptions(body);
    const avoidance = resolveAvoidanceOptions(body);

    const result = await generateLogoPrompt({
      ...shared,
      ...avoidance,
      brandName: body.brandName?.trim(),
      tagline: body.tagline?.trim(),
      industry: body.industry?.trim(),
      stylePreset: body.stylePreset,
      motif: body.motif,
      includeWordmark: body.includeWordmark,
      extraNotes: body.extraNotes?.trim(),
    });

    return apiJson(result);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Logo prompt generation failed.', 500);
  }
}

export function OPTIONS() {
  return apiOptions();
}
