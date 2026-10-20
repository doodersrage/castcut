import { generateNsfwPrompt } from '@/lib/specialized/nsfw-generator';
import { resolveAvoidanceOptions } from '@/lib/prompt/avoidance-options';
import { isNsfwGeneratorEnabledServer } from '@/lib/adult/nsfw-generator-env';
import { normalizeSharedGenerationOptions } from '@/lib/specialized/normalize';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type NsfwGenerateRequestBody = {
  model?: string;
  detail?: string;
  hints?: string;
  wildness?: number;
  presetId?: string;
  avoidedTokens?: string[];
  avoidedTokensInstruction?: string;
};

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/nsfw-generate');
}

export async function POST(request: Request) {
  if (!isNsfwGeneratorEnabledServer()) {
    return apiJson({ error: 'Adult generator is not enabled on this server.' }, { status: 404 });
  }

  try {
    const body = (await request.json()) as NsfwGenerateRequestBody;
    const shared = normalizeSharedGenerationOptions(body);
    const avoidance = resolveAvoidanceOptions(body);

    const result = await generateNsfwPrompt({
      ...shared,
      ...avoidance,
      hints: body.hints?.trim(),
      wildness: body.wildness,
      presetId: body.presetId?.trim(),
    });

    return apiJson(result);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Adult generation failed.', 500);
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
