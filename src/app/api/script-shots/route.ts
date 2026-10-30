import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { writeShotDraft } from '@/lib/day/script-shots-server';
import { parseLlmRequestOptions } from '@/lib/llm/request-options';
import type { ScriptElement, ScriptElementKind, ScriptScene } from '@/lib/script/parse';

export const runtime = 'nodejs';

const KINDS: readonly ScriptElementKind[] = ['action', 'dialogue'];
const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.slice(0, max) : '';

/** The scene as sent, held to what the draft reads (its action and dialogue, bounded). */
function sceneFromBody(value: unknown): ScriptScene | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = text(raw.id, 120).trim();
  if (!id) return null;
  const elements: ScriptElement[] = (Array.isArray(raw.elements) ? raw.elements : [])
    .slice(0, 400)
    .flatMap(entry => {
      if (!entry || typeof entry !== 'object') return [];
      const element = entry as Record<string, unknown>;
      const kind = element.kind as ScriptElementKind;
      if (!KINDS.includes(kind)) return [];
      const speaker = text(element.speaker, 80).trim();
      return [
        {
          kind,
          text: text(element.text, 1200),
          from: 0,
          to: 0,
          ...(kind === 'dialogue' && speaker ? { speaker } : {}),
        },
      ];
    });
  return {
    id,
    heading: text(raw.heading, 200),
    place: text(raw.place, 120),
    elements,
    speakers: (Array.isArray(raw.speakers) ? raw.speakers : [])
      .filter((name): name is string => typeof name === 'string')
      .map(name => name.slice(0, 80))
      .slice(0, 20),
    from: 0,
    to: 0,
  };
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/script-shots');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const scene = sceneFromBody(body.scene);
    if (!scene) return apiError('Send the script scene to draft.', 400);
    if (!scene.elements.length) return apiError('This scene has no action or lines to draft.', 400);
    const shots = await writeShotDraft(scene, parseLlmRequestOptions(body));
    return apiJson({ shots });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The LLM draft failed.';
    return apiError(message, /needs the LLM/i.test(message) ? 400 : 500);
  }
}
