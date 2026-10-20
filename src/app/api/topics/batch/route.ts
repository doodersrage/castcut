import { batchGenerateFromTopics, type BatchFromTopicsTarget } from '@/lib/batch/from-topics';
import { resolveAvoidanceOptions } from '@/lib/prompt/avoidance-options';
import { parseLlmRequestOptions } from '@/lib/llm/request-options';
import {
  normalizeRecentClothing,
  normalizeLockedWardrobeId,
  normalizeLockedLocation,
  normalizeVariationSeed,
  normalizeSharedGenerationOptions,
} from '@/lib/specialized/normalize';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { LlmBusyError } from '@/lib/llm/client';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const BATCH_TARGETS: BatchFromTopicsTarget[] = [
  'generate',
  'duo',
  'character',
  'pet',
  'fantasy',
  'background',
];

type TopicsBatchRequestBody = {
  topics?: string[];
  target?: BatchFromTopicsTarget;
  model?: string;
  detail?: string;
  recentClothing?: string[];
  recentLocations?: string[];
  alwaysIncludeClothing?: boolean;
  seedLlmWithIngredients?: boolean;
  distinctPeople?: boolean;
  teamKit?: boolean;
  blockedLocations?: string[];
  lockedWardrobeId?: string;
  lockedLocation?: string;
  variationSeed?: string;
  llmTemperature?: number;
  allowTemplateFallback?: boolean;
  llmModel?: string;
  llmVisionModel?: string;
  llmEnabled?: boolean;
  avoidedTokens?: string[];
  avoidedTokensInstruction?: string;
};

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/topics/batch');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TopicsBatchRequestBody;
    const topics = body.topics?.map(entry => entry.trim()).filter(Boolean) ?? [];

    if (topics.length === 0) {
      return apiError('At least one topic is required.', 400);
    }

    const shared = normalizeSharedGenerationOptions(body);
    const avoidance = resolveAvoidanceOptions(body);
    const target = BATCH_TARGETS.includes(body.target ?? 'generate')
      ? (body.target ?? 'generate')
      : 'generate';

    const result = await batchGenerateFromTopics({
      topics,
      target,
      model: shared.model,
      detail: shared.detail,
      ...avoidance,
      lockedWardrobeId: normalizeLockedWardrobeId(body.lockedWardrobeId),
      lockedLocation: normalizeLockedLocation(body.lockedLocation),
      variationSeed: normalizeVariationSeed(body.variationSeed),
      recentClothing: normalizeRecentClothing(body.recentClothing),
      recentLocations: body.recentLocations,
      blockedLocations: body.blockedLocations,
      alwaysIncludeClothing: body.alwaysIncludeClothing,
      seedLlmWithIngredients: body.seedLlmWithIngredients,
      distinctPeople: body.distinctPeople,
      teamKit: body.teamKit,
      llm: parseLlmRequestOptions(body),
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
    return apiError(error instanceof Error ? error.message : 'Topics batch failed.', 500);
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
