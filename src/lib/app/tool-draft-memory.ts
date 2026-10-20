import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';

const KEY = 'comfy-last-tool-draft-v1';
const MIN_CHARS = 3;

export type ToolDraftSummary = {
  toolKey: string;
  label: string;
  href: string;
  preview: string;
  updatedAt: number;
};

export function loadLastToolDraft(): ToolDraftSummary | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = readBrowserValue<unknown>(KEY);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const toolKey = typeof record.toolKey === 'string' ? record.toolKey.trim() : '';
  const label = typeof record.label === 'string' ? record.label.trim() : '';
  const href = typeof record.href === 'string' ? record.href.trim() : '';
  const preview = typeof record.preview === 'string' ? record.preview.trim() : '';
  const updatedAt =
    typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : 0;
  if (!toolKey || !label || !href.startsWith('/') || !preview || updatedAt <= 0) {
    return null;
  }
  return { toolKey, label, href, preview, updatedAt };
}

/** Remember the latest non-trivial draft so the command palette can resume it. */
export function rememberToolDraft(input: {
  toolKey: string;
  label: string;
  href: string;
  text: string;
}): void {
  if (typeof window === 'undefined') {
    return;
  }
  const text = input.text.trim();
  if (text.length < MIN_CHARS) {
    return;
  }
  const entry: ToolDraftSummary = {
    toolKey: input.toolKey.trim(),
    label: input.label.trim(),
    href: input.href.trim(),
    preview: text.length > 96 ? `${text.slice(0, 96)}…` : text,
    updatedAt: Date.now(),
  };
  if (!entry.toolKey || !entry.label || !entry.href.startsWith('/')) {
    return;
  }
  writeBrowserValue(KEY, entry);
}

export function clearLastToolDraft(): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(KEY, null);
}
