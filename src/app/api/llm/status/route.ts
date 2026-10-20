import { getLlmInflightCount, getLlmMaxInflight, isLlmBusy, isLlmEnabled } from '@/lib/llm/client';
import { apiJson, apiMethodNotAllowed } from '@/lib/api/response';

export const runtime = 'nodejs';

export async function GET() {
  return apiJson({
    enabled: isLlmEnabled(),
    inFlight: getLlmInflightCount(),
    maxInflight: getLlmMaxInflight(),
    busy: isLlmBusy(),
  });
}

export function POST() {
  return apiMethodNotAllowed(['GET'], '/api/llm/status');
}
