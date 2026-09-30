import { generatePrompt, type PromptMode } from '@/lib/prompt-generator';
import { resolveAvoidanceOptions } from '@/lib/avoidance-options';
import { applyLockedLocation } from '@/lib/locked-location';
import { normalizeGenerationSettings } from '@/lib/generation-settings';
import {
  normalizeRecentClothing,
  normalizeLockedWardrobeId,
  normalizeLockedLocation,
  normalizeVariationSeed,
} from '@/lib/specialized/normalize';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { parseLlmRequestOptions, resolveRequestLlmEnabled } from '@/lib/llm-request-options';
import { isLlmBusy, LlmBusyError } from '@/lib/llm-client';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type GenerateRequestBody = {
  input?: string;
  mode?: PromptMode;
  variation?: {
    enabled?: boolean;
    strength?: number;
  };
  detail?: string;
  distinctPeople?: boolean;
  alwaysIncludeClothing?: boolean;
  seedLlmWithIngredients?: boolean;
  recentClothing?: string[];
  lockedWardrobeId?: string;
  lockedLocation?: string;
  variationSeed?: string;
  model?: string;
  avoidedTokens?: string[];
  avoidedTokensInstruction?: string;
  llmTemperature?: number;
  allowTemplateFallback?: boolean;
  llmModel?: string;
  llmVisionModel?: string;
  llmEnabled?: boolean;
};

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/generate');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateRequestBody;
    const avoidance = resolveAvoidanceOptions(body);
    const rawInput = body.input?.trim();
    const mode: PromptMode = body.mode === 'negative' ? 'negative' : 'positive';
    const settings = normalizeGenerationSettings({
      variation: body.variation,
      distinctPeople: body.distinctPeople,
      alwaysIncludeClothing: body.alwaysIncludeClothing,
      seedLlmWithIngredients: body.seedLlmWithIngredients,
      detail: body.detail,
      model: body.model,
    });

    if (!rawInput) {
      return apiError('Input is required.', 400);
    }

    const lockedLocation = normalizeLockedLocation(body.lockedLocation);
    const effectiveInput =
      mode === 'positive' && settings.seedLlmWithIngredients === true
        ? (applyLockedLocation(rawInput, lockedLocation) ?? rawInput)
        : rawInput;

    if (effectiveInput.length > 4000) {
      return apiError('Input must be 4000 characters or fewer.', 400);
    }

    const llm = parseLlmRequestOptions(body);
    if (resolveRequestLlmEnabled(llm) && isLlmBusy()) {
      return apiError(
        'LLM is busy handling other requests.',
        429,
        {
          busy: true,
          retryAfter: 2,
        },
        { 'Retry-After': '2' }
      );
    }

    const result = await generatePrompt(effectiveInput, mode, settings, {
      recentClothing: normalizeRecentClothing(body.recentClothing),
      lockedWardrobeId: normalizeLockedWardrobeId(body.lockedWardrobeId),
      variationSeed: normalizeVariationSeed(body.variationSeed),
      avoidedTokens: avoidance.avoidedTokens,
      avoidedTokensInstruction: avoidance.avoidedTokensInstruction,
      tool: 'generate',
      llm,
    });

    return apiJson(result);
  } catch (error) {
    if (error instanceof LlmBusyError) {
      return apiError(
        error.message,
        429,
        {
          busy: true,
          retryAfter: error.retryAfterSeconds,
        },
        { 'Retry-After': String(error.retryAfterSeconds) }
      );
    }

    const message = error instanceof Error ? error.message : 'Failed to generate prompt.';

    return apiError(message, 500);
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
