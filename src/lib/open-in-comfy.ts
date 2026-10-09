'use client';

/**
 * "Open in ComfyUI": send a finished still's exact graph to ComfyUI's own editor. The graph is
 * the one Castcut queued (stored on the gallery entry, else ComfyUI's history for the prompt
 * id); the server converts it to the editor's format and saves it as
 * `workflows/Castcut/<tool>-<date>-<id>.json`, and ComfyUI opens in a new tab. The editor has
 * no URL that opens a saved workflow, so the player picks it from the Workflows sidebar.
 * LoadImage nodes keep the uploaded input filenames, so the pictures resolve as they did.
 */

import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import { isApiPromptGraph, type ComfyApiPrompt } from './comfy-editor-graph';
import { PRODUCT_OUTPUT_PREFIX } from './brand';

export type OpenInComfyResult = {
  ok: boolean;
  message: string;
  /** `Castcut/day-2026-10-03-ab12cd34.json` as the Workflows sidebar shows it. */
  file?: string;
  comfyUrl?: string;
};

function parseGraph(json: string | undefined): ComfyApiPrompt | null {
  if (!json?.trim()) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    return isApiPromptGraph(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** The gallery entry behind a Day / Story still, by its ComfyUI prompt id. */
export async function findGalleryEntryByPromptId(
  promptId: string
): Promise<ComfyGalleryEntry | undefined> {
  const id = promptId.trim();
  if (!id) return undefined;
  const { getGalleryCache } = await import('./gallery-db-store');
  return getGalleryCache().find(entry => entry.promptId === id);
}

/** The exact graph queued for an entry: stored copy first, then ComfyUI history. */
export async function resolveQueuedGraph(
  entry: Pick<ComfyGalleryEntry, 'id' | 'promptId' | 'comfyUrl' | 'workflowJson'>
): Promise<ComfyApiPrompt | null> {
  const inline = parseGraph(entry.workflowJson);
  if (inline) return inline;
  const { getGalleryEntryById } = await import('./gallery-db-store');
  const stored = parseGraph(getGalleryEntryById(entry.id)?.workflowJson);
  if (stored) return stored;
  const promptId = entry.promptId?.trim();
  if (!promptId) return null;
  const params = new URLSearchParams({ promptId });
  if (entry.comfyUrl?.trim()) params.set('comfyUrl', entry.comfyUrl.trim());
  try {
    const response = await fetch(`/api/comfyui/history/workflow?${params.toString()}`);
    if (!response.ok) return null;
    const data = (await response.json()) as { workflow?: unknown };
    return isApiPromptGraph(data.workflow) ? data.workflow : null;
  } catch {
    return null;
  }
}

/** Why the graph could not open on the canvas by itself, and what would make it. */
const OPEN_DIRECT_HINT: Record<'no-pack' | 'single-file' | 'restart', string> = {
  'no-pack':
    ' To open it straight onto the canvas, install Castcut nodes 1.5.0+ (Settings → ComfyUI → Castcut nodes).',
  'single-file':
    ' To open it straight onto the canvas, install Castcut nodes as a folder (Comfy Registry or git), not the single file.',
  restart: ' Restart ComfyUI once and it will open straight onto the canvas.',
};

/**
 * The ComfyUI link as this browser can reach it: a loopback address is the server's own view,
 * so from another device it becomes the host this page was loaded from.
 */
export function browserComfyUrl(url: string, pageHost?: string): string {
  try {
    const parsed = new URL(url);
    const host = pageHost ?? (typeof window !== 'undefined' ? window.location.hostname : '');
    const loopback = /^(?:127\.0\.0\.1|localhost|\[::1\])$/i;
    if (host && loopback.test(parsed.hostname) && !loopback.test(host)) {
      parsed.hostname = host;
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export async function saveGraphForComfyEditor(input: {
  prompt: ComfyApiPrompt;
  comfyUrl?: string;
  tool?: string;
  model?: string;
  galleryEntryId?: string;
  promptId?: string;
}): Promise<OpenInComfyResult> {
  try {
    const response = await fetch('/api/comfyui/editor-workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = (await response.json().catch(() => null)) as {
      file?: string;
      comfyUrl?: string;
      openUrl?: string;
      directOpen?: 'no-pack' | 'single-file' | 'restart';
      missingNodeTypes?: string[];
      error?: string;
    } | null;
    if (!response.ok || !data?.file) {
      return {
        ok: false,
        message: data?.error ?? `Could not save to ComfyUI (HTTP ${response.status}).`,
      };
    }
    const missing = data.missingNodeTypes ?? [];
    const missingNote =
      missing.length > 0 ? ` This ComfyUI is missing: ${missing.join(', ')}.` : '';
    return {
      ok: true,
      file: `${PRODUCT_OUTPUT_PREFIX}/${data.file}`,
      comfyUrl: data.openUrl || data.comfyUrl,
      message: data.openUrl
        ? `Opened in ComfyUI (also saved as ${PRODUCT_OUTPUT_PREFIX}/${data.file}).${missingNote}`
        : `Saved ${PRODUCT_OUTPUT_PREFIX}/${data.file} — open it from ComfyUI's Workflows sidebar.${
            OPEN_DIRECT_HINT[data.directOpen ?? 'no-pack']
          }${missingNote}`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not save to ComfyUI.',
    };
  }
}

/**
 * Save the entry's graph for the editor and open ComfyUI in a new tab. Call from the click
 * itself: the tab is opened before the save so the browser does not block it.
 */
export function openGalleryEntryInComfy(entry: EditorEntry): Promise<OpenInComfyResult> {
  return openInComfyWithTab(openPendingTab(), async () => entry);
}

/** Day / Story cards know the still's prompt id, not its gallery entry. */
export function openPromptInComfy(promptId: string): Promise<OpenInComfyResult> {
  return openInComfyWithTab(openPendingTab(), async () => {
    const entry = await findGalleryEntryByPromptId(promptId);
    return entry ?? { id: '', promptId: promptId.trim(), comfyUrl: '' };
  });
}

type EditorEntry = Pick<
  ComfyGalleryEntry,
  'id' | 'promptId' | 'comfyUrl' | 'workflowJson' | 'tool' | 'model'
>;

/** A blank tab opened during the click, so the browser does not block it after the save. */
function openPendingTab(): Window | null {
  return typeof window !== 'undefined' ? window.open('', '_blank') : null;
}

async function openInComfyWithTab(
  tab: Window | null,
  loadEntry: () => Promise<EditorEntry>
): Promise<OpenInComfyResult> {
  const fail = (message: string): OpenInComfyResult => {
    tab?.close();
    return { ok: false, message };
  };
  const entry = await loadEntry();
  const prompt = await resolveQueuedGraph(entry);
  if (!prompt) {
    return fail(
      'No queued graph for this still — it is not stored and ComfyUI history no longer has it.'
    );
  }
  const result = await saveGraphForComfyEditor({
    prompt,
    comfyUrl: entry.comfyUrl?.trim() || undefined,
    tool: entry.tool,
    model: entry.model,
    galleryEntryId: entry.id || undefined,
    promptId: entry.promptId || undefined,
  });
  if (!result.ok || !result.comfyUrl) return fail(result.message);
  const target = browserComfyUrl(result.comfyUrl);
  if (tab) {
    tab.opener = null;
    tab.location.href = target;
  } else {
    window.open(target, '_blank', 'noopener');
  }
  return result;
}
