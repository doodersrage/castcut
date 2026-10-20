import { apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import type { PluginQueueHookPayload } from '@/lib/plugin/queue-hooks';

export const runtime = 'nodejs';

/**
 * Example privileged queue hook used by `examples/queue-rewrite-plugin.json`.
 * - queue-preflight: softens denoise; may stamp a workflow token when a graph is present
 * - queue-post: acknowledges completion (no rewrite)
 */
export async function POST(request: Request) {
  let body: Partial<PluginQueueHookPayload> = {};
  try {
    body = (await request.json()) as Partial<PluginQueueHookPayload>;
  } catch {
    body = {};
  }

  if (body.event === 'queue-post') {
    return apiJson({
      ok: true,
      message: `queue-rewrite-plugin: post ok=${body.ok !== false} promptId=${body.promptId ?? '—'}`,
    });
  }

  const existing =
    body.denoise != null && String(body.denoise).trim() !== '' ? Number(body.denoise) : null;

  const result: Record<string, unknown> = {
    ok: true,
    denoise: existing != null && Number.isFinite(existing) ? existing : 0.45,
    message: 'queue-rewrite-plugin: denoise set to soft img2img',
    params: {
      denoise: existing != null && Number.isFinite(existing) ? existing : 0.45,
    },
  };

  // Allowlisted workflow rewrite demo: stamp a custom note on SaveImage filename_prefix when present.
  if (body.workflow && typeof body.workflow === 'object') {
    const next = structuredClone(body.workflow) as Record<string, unknown>;
    for (const node of Object.values(next)) {
      if (!node || typeof node !== 'object') {
        continue;
      }
      const record = node as Record<string, unknown>;
      const classType = String(record.class_type ?? '');
      const inputs =
        record.inputs && typeof record.inputs === 'object'
          ? (record.inputs as Record<string, unknown>)
          : null;
      if (!inputs) {
        continue;
      }
      if (classType.includes('SaveImage') && typeof inputs.filename_prefix === 'string') {
        const prefix = inputs.filename_prefix;
        if (!prefix.includes('plugin-rewrite')) {
          inputs.filename_prefix = `${prefix}-plugin-rewrite`;
        }
      }
    }
    result.workflow = next;
    result.message = `${result.message}; workflow SaveImage prefix nudged`;
  }

  return apiJson(result);
}

export function GET() {
  return apiMethodNotAllowed(['POST'], '/api/plugin-hooks/denoise-rewrite');
}
