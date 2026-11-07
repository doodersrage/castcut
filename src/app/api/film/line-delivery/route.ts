import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { isNsfwGeneratorEnabledServer } from '@/lib/adult/nsfw-generator-env';
import { DELIVERY_BATCH, normalizeDelivery, type LineDeliveryAsk } from '@/lib/film/line-delivery';
import { writeLineDeliveries } from '@/lib/film/line-delivery-server';
import { parseLlmRequestOptions } from '@/lib/llm/request-options';

export const runtime = 'nodejs';

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** How each read line is said: { lines: [{ id, speaker, text, note?, context? }] } → { deliveries }. */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  const asks: LineDeliveryAsk[] = (Array.isArray(body.lines) ? body.lines : [])
    .slice(0, DELIVERY_BATCH)
    .flatMap(entry => {
      if (!entry || typeof entry !== 'object') return [];
      const raw = entry as Record<string, unknown>;
      const id = text(raw.id, 120);
      const line = text(raw.text, 400);
      if (!id || !line) return [];
      const note = normalizeDelivery(raw.note);
      const context = text(raw.context, 400);
      return [
        {
          id,
          speaker: text(raw.speaker, 80) || 'Someone',
          text: line,
          ...(note ? { note } : {}),
          ...(context ? { context } : {}),
        },
      ];
    });
  if (!asks.length) return apiJson({ deliveries: {} });
  // An adult script's lines go to the LLM only where the server allows adult content (as the writer).
  const adult = body.adult === true;
  if (adult && !isNsfwGeneratorEnabledServer()) return apiJson({ deliveries: {} });
  try {
    return apiJson({
      deliveries: await writeLineDeliveries(asks, parseLlmRequestOptions(body), { adult }),
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'The LLM could not direct the lines.',
      502
    );
  }
}

export function GET() {
  return apiMethodNotAllowed(['POST'], '/api/film/line-delivery');
}
