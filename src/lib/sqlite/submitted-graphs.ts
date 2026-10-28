/**
 * The graph each render was submitted with (M7 T4), keyed by its ComfyUI prompt id. A take used to
 * keep only its template and parameters, and the template filled in again on replay; the filled
 * graph was in ComfyUI's history (memory: gone on a restart) and in the one browser that queued it
 * (M6 D19: it never syncs). Kept here, every device can replay a take exactly, and say which input
 * is missing when one is. Best-effort: a render never fails for want of this row.
 */
import { isServerStorageEnabled } from '@/lib/storage/server-storage';
import { getStudioDb } from './studio-db';

/** ComfyUI's own history keeps 10 000 by default; this keeps twice that, oldest out first. */
export const SUBMITTED_GRAPH_LIMIT = 20_000;
/** A graph larger than this (an inlined image, say) isn't kept. */
export const SUBMITTED_GRAPH_MAX_CHARS = 512 * 1024;

export type SubmittedGraph = {
  promptId: string;
  comfyUrl?: string;
  model?: string;
  graph: Record<string, unknown>;
  createdAt: number;
};

export function recordSubmittedGraph(input: {
  promptId: string | undefined;
  comfyUrl?: string;
  model?: string;
  graph: unknown;
  now?: number;
  /** Rows kept (tests); default {@link SUBMITTED_GRAPH_LIMIT}. */
  limit?: number;
}): boolean {
  const promptId = input.promptId?.trim();
  if (!promptId || !isServerStorageEnabled()) return false;
  if (!input.graph || typeof input.graph !== 'object' || Array.isArray(input.graph)) return false;
  const json = JSON.stringify(input.graph);
  if (json.length > SUBMITTED_GRAPH_MAX_CHARS) return false;
  const db = getStudioDb();
  db.prepare(
    `INSERT OR REPLACE INTO submitted_graphs (prompt_id, comfy_url, model, graph, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(promptId, input.comfyUrl ?? null, input.model ?? null, json, input.now ?? Date.now());
  db.prepare(
    `DELETE FROM submitted_graphs WHERE prompt_id IN (
       SELECT prompt_id FROM submitted_graphs ORDER BY created_at DESC LIMIT -1 OFFSET ?
     )`
  ).run(input.limit ?? SUBMITTED_GRAPH_LIMIT);
  return true;
}

export function readSubmittedGraph(promptId: string | undefined): SubmittedGraph | null {
  const id = promptId?.trim();
  if (!id || !isServerStorageEnabled()) return null;
  const row = getStudioDb()
    .prepare(
      'SELECT prompt_id, comfy_url, model, graph, created_at FROM submitted_graphs WHERE prompt_id = ?'
    )
    .get(id) as
    | {
        prompt_id: string;
        comfy_url: string | null;
        model: string | null;
        graph: string;
        created_at: number;
      }
    | undefined;
  if (!row) return null;
  try {
    const graph = JSON.parse(row.graph) as unknown;
    if (!graph || typeof graph !== 'object' || Array.isArray(graph)) return null;
    return {
      promptId: row.prompt_id,
      ...(row.comfy_url ? { comfyUrl: row.comfy_url } : {}),
      ...(row.model ? { model: row.model } : {}),
      graph: graph as Record<string, unknown>,
      createdAt: row.created_at,
    };
  } catch {
    return null;
  }
}
