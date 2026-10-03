/**
 * Server half of "Open in ComfyUI" / "Import a workflow from ComfyUI": reads node definitions
 * from `/object_info/<class>`, and reads / writes workflow files through ComfyUI's userdata API
 * (`/api/userdata/workflows%2FCastcut%2F<name>.json`) — the folder the editor's Workflows
 * sidebar lists. Castcut only ever writes inside `workflows/Castcut/`.
 */

import type { ComfyNodeDef, ComfyNodeDefs } from '@/lib/comfy-editor-graph';

export const CASTCUT_EDITOR_DIR = 'workflows/Castcut';

const FETCH_TIMEOUT_MS = 8000;
const DEF_CACHE_MS = 5 * 60 * 1000;
const defCache = new Map<string, { def: ComfyNodeDef | null; at: number }>();

/** `day-2026-10-03-ab12cd34.json` — letters, digits, dot, dash, underscore, space only. */
export function isSafeEditorFileName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,120}\.json$/.test(name) && !name.includes('..');
}

function slugPart(value: string | undefined, fallback: string): string {
  const slug = (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return slug || fallback;
}

/** `<tool>-<yyyy-mm-dd>-<id>.json` for a still's graph. */
export function editorWorkflowFileName(input: { tool?: string; id?: string; date?: Date }): string {
  const date = (input.date ?? new Date()).toISOString().slice(0, 10);
  const id = slugPart(input.id, 'still').replace(/-/g, '').slice(0, 8) || 'still';
  return `${slugPart(input.tool, 'castcut')}-${date}-${id}.json`;
}

function userdataUrl(baseUrl: string, path: string, query?: Record<string, string>): string {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/api/userdata/${encodeURIComponent(path)}`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  return url.toString();
}

/** Node definitions for the given classes; missing packs come back as undefined. */
export async function fetchComfyNodeDefs(
  baseUrl: string,
  classTypes: string[]
): Promise<ComfyNodeDefs> {
  const base = baseUrl.replace(/\/+$/, '');
  const defs: ComfyNodeDefs = {};
  await Promise.all(
    [...new Set(classTypes)].map(async classType => {
      const key = `${base}::${classType}`;
      const cached = defCache.get(key);
      if (cached && Date.now() - cached.at < DEF_CACHE_MS) {
        if (cached.def) defs[classType] = cached.def;
        return;
      }
      try {
        const response = await fetch(`${base}/object_info/${encodeURIComponent(classType)}`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          redirect: 'manual',
        });
        const payload = response.ok
          ? ((await response.json()) as Record<string, ComfyNodeDef | undefined>)
          : {};
        const def = payload[classType] ?? null;
        defCache.set(key, { def, at: Date.now() });
        if (def) defs[classType] = def;
      } catch {
        // Leave it out — the converter keeps unknown nodes as they are.
      }
    })
  );
  return defs;
}

export async function saveComfyEditorWorkflow(
  baseUrl: string,
  fileName: string,
  workflow: unknown
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  if (!isSafeEditorFileName(fileName)) {
    return { ok: false, error: 'Invalid workflow file name.' };
  }
  const path = `${CASTCUT_EDITOR_DIR}/${fileName}`;
  try {
    const response = await fetch(userdataUrl(baseUrl, path, { overwrite: 'true' }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workflow),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'manual',
    });
    if (!response.ok) {
      return { ok: false, error: `ComfyUI userdata save failed: HTTP ${response.status}.` };
    }
    return { ok: true, path };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'ComfyUI userdata save failed.',
    };
  }
}

export type ComfyEditorWorkflowFile = { name: string; size?: number; modified?: number };

export async function listComfyEditorWorkflows(
  baseUrl: string
): Promise<{ ok: true; files: ComfyEditorWorkflowFile[] } | { ok: false; error: string }> {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/api/userdata`);
  url.searchParams.set('dir', CASTCUT_EDITOR_DIR);
  url.searchParams.set('recurse', 'false');
  url.searchParams.set('full_info', 'true');
  try {
    const response = await fetch(url.toString(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'manual',
    });
    // No folder yet: nothing has been opened in ComfyUI.
    if (response.status === 404) return { ok: true, files: [] };
    if (!response.ok) {
      return { ok: false, error: `ComfyUI userdata list failed: HTTP ${response.status}.` };
    }
    const payload = (await response.json()) as unknown;
    const files: ComfyEditorWorkflowFile[] = [];
    for (const entry of Array.isArray(payload) ? payload : []) {
      const record =
        typeof entry === 'string'
          ? { path: entry }
          : (entry as { path?: unknown; size?: unknown; modified?: unknown });
      const name = typeof record.path === 'string' ? (record.path.split('/').pop() ?? '') : '';
      if (!name.endsWith('.json')) continue;
      files.push({
        name,
        ...(typeof record.size === 'number' ? { size: record.size } : {}),
        // Milliseconds on current ComfyUI; older builds reported seconds.
        ...(typeof record.modified === 'number'
          ? {
              modified: Math.round(
                record.modified < 1e12 ? record.modified * 1000 : record.modified
              ),
            }
          : {}),
      });
    }
    files.sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0) || b.name.localeCompare(a.name));
    return { ok: true, files };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'ComfyUI userdata list failed.',
    };
  }
}

export async function readComfyEditorWorkflow(
  baseUrl: string,
  fileName: string
): Promise<{ ok: true; workflow: unknown } | { ok: false; error: string; status?: number }> {
  if (!isSafeEditorFileName(fileName)) {
    return { ok: false, error: 'Invalid workflow file name.', status: 400 };
  }
  try {
    const response = await fetch(userdataUrl(baseUrl, `${CASTCUT_EDITOR_DIR}/${fileName}`), {
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'manual',
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `ComfyUI userdata read failed: HTTP ${response.status}.`,
        status: response.status === 404 ? 404 : 502,
      };
    }
    return { ok: true, workflow: (await response.json()) as unknown };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'ComfyUI userdata read failed.',
    };
  }
}
