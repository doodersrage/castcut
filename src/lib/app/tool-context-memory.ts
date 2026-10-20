import { COMFY_MODEL_IDS, type ComfyImageModel } from '../comfy-models/client';
import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';

const KEY = 'comfy-tool-context-memory-v1';

export type ToolContextMemoryEntry = {
  model?: ComfyImageModel;
  selectedWorkflowFileId?: string;
};

export type ToolContextMemoryMap = Partial<Record<string, ToolContextMemoryEntry>>;

export function loadToolContextMemory(): ToolContextMemoryMap {
  if (typeof window === 'undefined') {
    return {};
  }
  const raw = readBrowserValue<unknown>(KEY);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const next: ToolContextMemoryMap = {};
  for (const [tool, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!tool.trim() || !value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }
    const record = value as Record<string, unknown>;
    const entry: ToolContextMemoryEntry = {};
    if (typeof record.model === 'string' && COMFY_MODEL_IDS.has(record.model)) {
      entry.model = record.model as ComfyImageModel;
    }
    if (typeof record.selectedWorkflowFileId === 'string' && record.selectedWorkflowFileId.trim()) {
      entry.selectedWorkflowFileId = record.selectedWorkflowFileId.trim();
    }
    if (entry.model || entry.selectedWorkflowFileId) {
      next[tool.trim()] = entry;
    }
  }
  return next;
}

export function saveToolContextMemory(map: ToolContextMemoryMap): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(KEY, map);
}

export function loadToolContext(toolKey: string): ToolContextMemoryEntry | undefined {
  return loadToolContextMemory()[toolKey.trim()];
}

export function saveToolContext(toolKey: string, entry: ToolContextMemoryEntry): void {
  if (typeof window === 'undefined' || !toolKey.trim()) {
    return;
  }
  const map = loadToolContextMemory();
  const nextEntry: ToolContextMemoryEntry = {};
  if (entry.model && COMFY_MODEL_IDS.has(entry.model)) {
    nextEntry.model = entry.model;
  }
  if (entry.selectedWorkflowFileId?.trim()) {
    nextEntry.selectedWorkflowFileId = entry.selectedWorkflowFileId.trim();
  }
  if (!nextEntry.model && !nextEntry.selectedWorkflowFileId) {
    delete map[toolKey.trim()];
  } else {
    map[toolKey.trim()] = nextEntry;
  }
  writeBrowserValue(KEY, map);
}
