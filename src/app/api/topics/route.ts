import { resolveAvoidanceOptions } from '@/lib/prompt/avoidance-options';
import { normalizeRecentLocations, normalizeBlockedLocations } from '@/lib/specialized/normalize';
import { generateTopics } from '@/lib/specialized/topic-generator';
import { parseLlmRequestOptions } from '@/lib/llm/request-options';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type TopicsRequestBody = {
  seedTopic?: string;
  count?: number;
  variety?: number;
  recentLocations?: string[];
  blockedLocations?: string[];
  avoidedTokens?: string[];
  avoidedTokensInstruction?: string;
  llmTemperature?: number;
  allowTemplateFallback?: boolean;
  llmModel?: string;
  llmVisionModel?: string;
  llmEnabled?: boolean;
};

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/topics');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TopicsRequestBody;

    const seedTopic = typeof body.seedTopic === 'string' ? body.seedTopic.trim() : undefined;

    if (seedTopic && seedTopic.length > 500) {
      return apiError('seedTopic must be 500 characters or fewer.', 400);
    }

    const result = await generateTopics({
      seedTopic,
      count:
        typeof body.count === 'number' ? Math.min(24, Math.max(3, Math.round(body.count))) : 10,
      variety: typeof body.variety === 'number' ? Math.min(100, Math.max(0, body.variety)) : 50,
      recentLocations: normalizeRecentLocations(body.recentLocations),
      blockedLocations: normalizeBlockedLocations(body.blockedLocations),
      ...resolveAvoidanceOptions(body),
      llm: parseLlmRequestOptions(body),
    });

    return apiJson(result);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Topic generation failed.', 500);
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
