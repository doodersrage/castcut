export const LINEAGE_PARENT_KEY = 'prompt-lineage-parent-v1';

export type LineageParentContext = {
  parentHistoryId?: string;
  sourcePrompt?: string;
  sourceTool?: string;
  savedAt: number;
};

export function setLineageParent(context: Omit<LineageParentContext, 'savedAt'>): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.setItem(
    LINEAGE_PARENT_KEY,
    JSON.stringify({ ...context, savedAt: Date.now() } satisfies LineageParentContext)
  );
}

export function loadLineageParent(): LineageParentContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(LINEAGE_PARENT_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as LineageParentContext;
    if (Date.now() - parsed.savedAt > 60 * 60 * 1000) {
      clearLineageParent();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearLineageParent(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.removeItem(LINEAGE_PARENT_KEY);
}

export function resolveParentHistoryId(explicit?: string): string | undefined {
  if (explicit?.trim()) {
    return explicit.trim();
  }
  return loadLineageParent()?.parentHistoryId;
}
