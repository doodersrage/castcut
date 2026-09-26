import { apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { freeLocalLlmVram } from '@/lib/llm-vram-free-server';

export const runtime = 'nodejs';

export function GET() {
  return apiMethodNotAllowed(['POST'], '/api/llm/free-vram');
}

/**
 * Unload the models a same-machine LLM server (LM Studio / Ollama) holds on the GPU — used before
 * retrying a ComfyUI job that ran out of memory. They reload on the next LLM request.
 */
export async function POST() {
  return apiJson(await freeLocalLlmVram());
}
