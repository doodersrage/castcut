import { apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { getLlmConfig } from '@/lib/llm-client';
import { discoverComfyUi, discoverLlm } from '@/lib/service-discovery';

export const runtime = 'nodejs';

/** Local ComfyUI / LLM servers answering at their usual addresses (see service-discovery). */
export async function GET() {
  const [comfy, llm] = await Promise.all([discoverComfyUi(), discoverLlm()]);
  return apiJson({ comfy, llm, llmBaseUrl: getLlmConfig().baseUrl });
}

export function POST() {
  return apiMethodNotAllowed(['GET'], '/api/discover-services');
}
