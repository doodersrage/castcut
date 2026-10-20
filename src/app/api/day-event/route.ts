import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { writeDayEventPlan } from '@/lib/day/event-server';
import { parseLlmRequestOptions } from '@/lib/llm/request-options';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/day-event');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      event?: string;
      count?: number;
      llmTemperature?: number;
      allowTemplateFallback?: boolean;
      llmModel?: string;
      llmVisionModel?: string;
      llmEnabled?: boolean;
      llmProvider?: string;
      llmApiKey?: string;
    };
    const count = Math.max(0, Math.min(8, Math.floor(Number(body.count) || 0)));
    const plan = await writeDayEventPlan({
      event: typeof body.event === 'string' ? body.event : '',
      count,
      llm: parseLlmRequestOptions(body),
    });
    return apiJson({ plan });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'One event failed.';
    return apiError(message, /first|at least|needs the LLM/i.test(message) ? 400 : 500);
  }
}
