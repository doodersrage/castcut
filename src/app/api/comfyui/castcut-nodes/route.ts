import { apiError, apiJson } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import {
  installCastcutNodesWithManager,
  readCastcutNodesReport,
} from '@/lib/castcut-nodes-setup-server';
import { getComfyUiBaseUrl } from '@/lib/comfyui-client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui-config';

export const runtime = 'nodejs';
export const maxDuration = 180;

function resolveBaseUrl(comfyUrl: unknown): string {
  return getComfyUiBaseUrl(
    stripEmptyComfyUiRuntime({ apiUrl: typeof comfyUrl === 'string' ? comfyUrl : undefined })
  ).replace(/\/+$/, '');
}

/** Is the Castcut node pack on this ComfyUI, which version, and what can install it. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let baseUrl: string;
  try {
    baseUrl = resolveBaseUrl(searchParams.get('comfyUrl') ?? undefined);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }
  const report = await readCastcutNodesReport(baseUrl);
  return apiJson({
    ...report,
    // The file route wants the same credentials as any API call (a curl on the ComfyUI machine
    // has no session), so the commands carry an Authorization placeholder. Never the token.
    needsAuth: Boolean(process.env.PROMPT_API_TOKEN?.trim()) || isAuthEnabled(),
  });
}

/** Install through ComfyUI-Manager — runs code on the Comfy host, so admin when auth is on. */
export async function POST(request: Request) {
  if (isAuthEnabled()) {
    const user = resolveRequestUser(request);
    if (!user?.enabled || user.role !== 'admin') {
      return apiError('Admin sign-in required to install ComfyUI custom nodes.', 401);
    }
  }
  let body: { comfyUrl?: unknown; action?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  if (body.action !== 'install') {
    return apiError('action must be "install".', 400);
  }
  let baseUrl: string;
  try {
    baseUrl = resolveBaseUrl(body.comfyUrl);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }
  const result = await installCastcutNodesWithManager(baseUrl);
  if (!result.ok) {
    return apiError(result.message, result.code === 'no_manager' ? 501 : 502, {
      code: result.code,
    });
  }
  return apiJson(result);
}
