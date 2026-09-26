import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { checkEngineKey, KEY_CHECK_ENGINES, type KeyCheckEngine } from '@/lib/engine-key-check';

export const runtime = 'nodejs';

/** Settings → Inference engine "Check key": one authenticated no-cost request to the provider. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { engine?: string; key?: string } | null;
  const engine = body?.engine as KeyCheckEngine | undefined;
  if (!engine || !KEY_CHECK_ENGINES.includes(engine)) {
    return apiError('Unknown engine.', 400);
  }
  const key = typeof body?.key === 'string' ? body.key.trim().slice(0, 512) : undefined;
  return apiJson(await checkEngineKey(engine, key));
}

export function GET() {
  return apiMethodNotAllowed(['POST'], '/api/engines/check-key');
}
