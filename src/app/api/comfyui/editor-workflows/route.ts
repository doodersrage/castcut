import { NextResponse } from 'next/server';
import { apiError, apiJson } from '@/lib/api/response';
import { getComfyUiBaseUrl } from '@/lib/comfyui-client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui-config';
import {
  apiPromptClassTypes,
  apiPromptToUiWorkflow,
  isApiPromptGraph,
  isUiWorkflow,
  readCastcutEditorMeta,
  uiWorkflowToApiPrompt,
} from '@/lib/comfy-editor-graph';
import {
  CASTCUT_EDITOR_DIR,
  editorWorkflowFileName,
  fetchComfyNodeDefs,
  listComfyEditorWorkflows,
  readComfyEditorWorkflow,
  saveComfyEditorWorkflow,
  stageCastcutEditorTemplate,
} from '@/lib/comfy-editor-workflows-server';

export const runtime = 'nodejs';

/** A still graph is a few dozen nodes; anything far bigger is not one. */
const MAX_PROMPT_CHARS = 2_000_000;

function resolveBaseUrl(comfyUrl: string | null | undefined): string | NextResponse {
  try {
    return getComfyUiBaseUrl(stripEmptyComfyUiRuntime({ apiUrl: comfyUrl ?? undefined })).replace(
      /\/+$/,
      ''
    );
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }
}

/**
 * GET — list `workflows/Castcut/*` on ComfyUI, or (with `file`) read one back as the editor
 * saved it, plus the API-shaped graph and Castcut's baseline for diffing.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const baseUrl = resolveBaseUrl(searchParams.get('comfyUrl'));
  if (typeof baseUrl !== 'string') return baseUrl;

  const file = searchParams.get('file')?.trim();
  if (!file) {
    const listed = await listComfyEditorWorkflows(baseUrl);
    if (!listed.ok) return apiError(listed.error, 502);
    return apiJson({ ok: true, comfyUrl: baseUrl, dir: CASTCUT_EDITOR_DIR, files: listed.files });
  }

  const read = await readComfyEditorWorkflow(baseUrl, file);
  if (!read.ok) return apiError(read.error, read.status ?? 502);
  if (!isUiWorkflow(read.workflow)) {
    return apiError('Not a ComfyUI editor workflow (no nodes).', 422);
  }
  const classTypes = [
    ...new Set(
      read.workflow.nodes
        .map(node => (node as { type?: unknown }).type)
        .filter((type): type is string => typeof type === 'string')
    ),
  ];
  const defs = await fetchComfyNodeDefs(baseUrl, classTypes);
  const meta = readCastcutEditorMeta(read.workflow);
  return apiJson({
    ok: true,
    comfyUrl: baseUrl,
    file,
    edited: uiWorkflowToApiPrompt(read.workflow, defs),
    castcut: meta,
  });
}

type SaveBody = {
  comfyUrl?: string;
  prompt?: unknown;
  tool?: string;
  model?: string;
  galleryEntryId?: string;
  promptId?: string;
};

/** POST — convert a queued API graph to the editor's format and save it under workflows/Castcut. */
export async function POST(request: Request) {
  let body: SaveBody;
  try {
    const text = await request.text();
    if (text.length > MAX_PROMPT_CHARS) return apiError('Workflow is too large.', 413);
    body = JSON.parse(text) as SaveBody;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  if (!isApiPromptGraph(body.prompt)) {
    return apiError('prompt must be an API-format ComfyUI graph.', 400);
  }
  const baseUrl = resolveBaseUrl(body.comfyUrl);
  if (typeof baseUrl !== 'string') return baseUrl;

  const prompt = body.prompt;
  const defs = await fetchComfyNodeDefs(baseUrl, apiPromptClassTypes(prompt));
  const workflow = apiPromptToUiWorkflow(prompt, defs, {
    tool: body.tool?.slice(0, 40),
    model: body.model?.slice(0, 120),
    galleryEntryId: body.galleryEntryId?.slice(0, 120),
    promptId: body.promptId?.slice(0, 120),
  });
  const file = editorWorkflowFileName({
    tool: body.tool,
    id: body.promptId || body.galleryEntryId,
  });
  const saved = await saveComfyEditorWorkflow(baseUrl, file, workflow);
  if (!saved.ok) return apiError(saved.error, 502);
  const missingNodeTypes = apiPromptClassTypes(prompt).filter(type => !defs[type]);
  // Castcut nodes 1.5.0+ (installed as a folder) stage it as a template too, which the editor
  // opens from the URL — straight onto the canvas instead of via the Workflows sidebar.
  const staged = await stageCastcutEditorTemplate(baseUrl, file.replace(/\.json$/i, ''), workflow);
  return apiJson({
    ok: true,
    comfyUrl: baseUrl,
    ...(staged.openUrl ? { openUrl: staged.openUrl } : {}),
    ...(staged.reason ? { directOpen: staged.reason } : {}),
    file,
    path: saved.path,
    nodes: workflow.nodes.length,
    links: workflow.links.length,
    missingNodeTypes,
  });
}
