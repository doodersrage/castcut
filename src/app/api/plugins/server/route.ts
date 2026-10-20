import { apiError, apiJson, apiMethodNotAllowed, apiOptions } from '@/lib/api/response';
import { readSessionFromRequest } from '@/lib/auth/session';
import { findUserById, isAuthEnabled } from '@/lib/auth/store';
import { isServerStorageEnabled } from '@/lib/storage/server-storage';
import {
  getPluginHmacSecret,
  installServerPluginFromManifest,
  installServerPluginFromUrl,
  installServerPluginFromZip,
  isServerPluginRegistryEnabled,
  listServerPlugins,
  removeServerPlugin,
  setServerPluginEnabled,
  toClientPluginManifest,
  verifyPluginInstallSignature,
  MAX_PLUGIN_ZIP_BYTES,
} from '@/lib/plugin/server-plugin-registry';

export const runtime = 'nodejs';

/** Install / mutate server plugins — admin when auth is on; feature gate via /api/plugins/server. */
function requireAdminWhenAuth(request: Request) {
  if (!isAuthEnabled()) {
    return null;
  }
  const session = readSessionFromRequest(request);
  const user = session ? findUserById(session.userId) : null;
  if (!user?.enabled || user.role !== 'admin') {
    return apiError('Admin sign-in required to manage server plugins.', 401);
  }
  return null;
}

export async function GET() {
  if (!isServerPluginRegistryEnabled()) {
    return apiJson({
      enabled: false,
      hmacRequired: Boolean(getPluginHmacSecret()),
      plugins: [],
      message: 'Set PROMPT_DATA_DIR to enable the server plugin registry.',
    });
  }
  const plugins = listServerPlugins().map(toClientPluginManifest);
  return apiJson({
    enabled: true,
    hmacRequired: Boolean(getPluginHmacSecret()),
    plugins,
  });
}

export async function POST(request: Request) {
  const denied = requireAdminWhenAuth(request);
  if (denied) {
    return denied;
  }
  if (!isServerStorageEnabled()) {
    return apiError('Server plugin registry requires PROMPT_DATA_DIR.', 503);
  }

  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  const signature = request.headers.get('x-prompt-plugin-signature');

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const action = String(form.get('action') ?? 'install').trim();
      if (action === 'enable' || action === 'disable') {
        const id = String(form.get('id') ?? '').trim();
        if (!id) {
          return apiError('id is required.', 400);
        }
        const updated = setServerPluginEnabled(id, action === 'enable');
        if (!updated) {
          return apiError('Plugin not found.', 404);
        }
        return apiJson({ ok: true, plugin: toClientPluginManifest(updated) });
      }
      if (action === 'remove') {
        const id = String(form.get('id') ?? '').trim();
        if (!id) {
          return apiError('id is required.', 400);
        }
        const removed = removeServerPlugin(id);
        if (!removed) {
          return apiError('Plugin not found.', 404);
        }
        return apiJson({ ok: true, removed: id });
      }

      const file = form.get('file');
      if (!(file instanceof File)) {
        return apiError('Multipart install requires a file field (ZIP or JSON).', 400);
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      if (bytes.length > MAX_PLUGIN_ZIP_BYTES) {
        return apiError(`File exceeds ${MAX_PLUGIN_ZIP_BYTES} byte limit.`, 400);
      }
      const verified = verifyPluginInstallSignature(bytes, signature);
      if (!verified.ok) {
        return apiError(verified.error, 401);
      }
      const name = file.name.toLowerCase();
      if (name.endsWith('.json') || file.type.includes('json')) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(bytes.toString('utf8')) as unknown;
        } catch {
          return apiError('Invalid JSON manifest.', 400);
        }
        const plugin = installServerPluginFromManifest(parsed);
        return apiJson({ ok: true, plugin: toClientPluginManifest(plugin) });
      }
      const plugin = installServerPluginFromZip(bytes);
      return apiJson({ ok: true, plugin: toClientPluginManifest(plugin) });
    }

    const rawText = await request.text();
    const verified = verifyPluginInstallSignature(rawText, signature);
    if (!verified.ok) {
      return apiError(verified.error, 401);
    }

    let body: {
      action?: string;
      id?: string;
      url?: string;
      manifest?: unknown;
      enabled?: boolean;
    } = {};
    try {
      body = rawText ? (JSON.parse(rawText) as typeof body) : {};
    } catch {
      return apiError('Invalid JSON body.', 400);
    }

    const action = (body.action ?? 'install').trim();

    if (action === 'enable' || action === 'disable') {
      const id = body.id?.trim();
      if (!id) {
        return apiError('id is required.', 400);
      }
      const updated = setServerPluginEnabled(id, action === 'enable' || body.enabled === true);
      if (!updated) {
        return apiError('Plugin not found.', 404);
      }
      return apiJson({ ok: true, plugin: toClientPluginManifest(updated) });
    }

    if (action === 'remove') {
      const id = body.id?.trim();
      if (!id) {
        return apiError('id is required.', 400);
      }
      const removed = removeServerPlugin(id);
      if (!removed) {
        return apiError('Plugin not found.', 404);
      }
      return apiJson({ ok: true, removed: id });
    }

    if (action === 'install' || action === 'sync') {
      if (body.url?.trim()) {
        const plugin = await installServerPluginFromUrl(body.url.trim());
        return apiJson({ ok: true, plugin: toClientPluginManifest(plugin) });
      }
      if (body.manifest != null) {
        const plugin = installServerPluginFromManifest(body.manifest);
        return apiJson({ ok: true, plugin: toClientPluginManifest(plugin) });
      }
      return apiError('Provide url or manifest to install.', 400);
    }

    return apiError(`Unknown action "${action}".`, 400);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Plugin install failed.', 400);
  }
}

export async function DELETE(request: Request) {
  const denied = requireAdminWhenAuth(request);
  if (denied) {
    return denied;
  }
  if (!isServerStorageEnabled()) {
    return apiError('Server plugin registry requires PROMPT_DATA_DIR.', 503);
  }
  const url = new URL(request.url);
  const id = url.searchParams.get('id')?.trim();
  if (!id) {
    return apiError('id query param is required.', 400);
  }
  const removed = removeServerPlugin(id);
  if (!removed) {
    return apiError('Plugin not found.', 404);
  }
  return apiJson({ ok: true, removed: id });
}

export function OPTIONS() {
  return apiOptions(
    'GET, POST, DELETE, OPTIONS',
    'Content-Type, Authorization, X-Prompt-Plugin-Signature'
  );
}

export function PUT() {
  return apiMethodNotAllowed(['GET', 'POST', 'DELETE'], '/api/plugins/server');
}
