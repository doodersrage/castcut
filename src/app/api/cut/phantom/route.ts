import { apiError, apiJson } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import {
  phantomReadinessIn,
  phantomShotStatus,
  queuePhantomShot,
} from '@/lib/video/phantom-server';
import { PHANTOM_MAX_REFERENCES, type PhantomShape } from '@/lib/video/phantom';

export const runtime = 'nodejs';
export const maxDuration = 60;

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/**
 * GET ?ready=1 → { available, fast }: whether ComfyUI can generate a shot with the Cast.
 * GET ?promptId= → { status, url?, error? }: where a queued shot stands.
 */
export async function GET(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) return apiError('Authentication required.', 401);
  const params = new URL(request.url).searchParams;
  const comfyUrl = text(params.get('comfyUrl'), 300) || undefined;
  try {
    if (params.get('ready')) return apiJson(await phantomReadinessIn(comfyUrl));
    const promptId = text(params.get('promptId'), 80);
    if (!promptId) return apiError('promptId is required.', 400);
    return apiJson(await phantomShotStatus(promptId, comfyUrl));
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'ComfyUI did not answer.', 502);
  }
}

/**
 * POST { words, references: string[], shape, castName?, look?, comfyUrl? } → { promptId }: a
 * shot from words with the Cast in it (Phantom, video/phantom.ts), queued on ComfyUI.
 */
export async function POST(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) return apiError('Authentication required.', 401);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  const words = text(body.words, 600);
  if (!words) return apiError('Say what happens in the shot.', 400);
  const references = (Array.isArray(body.references) ? body.references : [])
    .map(url => text(url, 2000))
    .filter(Boolean)
    .slice(0, PHANTOM_MAX_REFERENCES);
  if (!references.length) return apiError('The Cast has no pictures to make the shot from.', 400);
  const shape: PhantomShape =
    body.shape === 'vertical' || body.shape === 'square' ? body.shape : 'wide';
  try {
    const promptId = await queuePhantomShot({
      words,
      references,
      shape,
      cast: {
        ...(text(body.castName, 80) ? { name: text(body.castName, 80) } : {}),
        ...(text(body.look, 400) ? { look: text(body.look, 400) } : {}),
      },
      comfyUrl: text(body.comfyUrl, 300) || undefined,
      requestOrigin: new URL(request.url).origin,
      userId: user?.id ?? null,
    });
    return apiJson({ promptId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not queue the shot.';
    return apiError(message, /does not have Phantom|could be read/i.test(message) ? 400 : 502);
  }
}
