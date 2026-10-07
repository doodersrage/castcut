import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { writeDayPremiseBeats } from '@/lib/day-premise-server';
import { parseLlmRequestOptions } from '@/lib/llm-request-options';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/day-premise');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      premise?: string;
      slotIds?: unknown;
      companions?: boolean;
      previousBeats?: unknown;
      llmTemperature?: number;
      allowTemplateFallback?: boolean;
      llmModel?: string;
      llmVisionModel?: string;
      llmEnabled?: boolean;
      llmProvider?: string;
      llmApiKey?: string;
    };
    const slotIds = Array.isArray(body.slotIds)
      ? body.slotIds
          .filter((id): id is string => typeof id === 'string' && /^[a-z]+(?:-\d+)?$/.test(id))
          .slice(0, 12)
      : [];
    const beats = await writeDayPremiseBeats({
      premise: typeof body.premise === 'string' ? body.premise : '',
      slotIds,
      companions: body.companions === true,
      previousBeats: Array.isArray(body.previousBeats)
        ? body.previousBeats
            .filter((beat): beat is string => typeof beat === 'string')
            .map(beat => beat.slice(0, 260))
            .slice(0, 8)
        : undefined,
      llm: parseLlmRequestOptions(body),
    });
    return apiJson({ beats });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Day from an idea failed.';
    return apiError(message, /first|no slots|needs the LLM/i.test(message) ? 400 : 500);
  }
}
