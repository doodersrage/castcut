import {
  buildAvoidedTokensInstructionFromList,
  filterAvoidedCandidatesFromList,
  promptContainsAvoidedTokensFromList,
  tokenizeForAvoidance,
} from './avoidance-options';
import { readBrowserValue, removeBrowserKey, writeBrowserValue } from '../storage/browser-storage';

export const AVOIDED_TOKENS_KEY = 'comfy-prompt-avoided-tokens-v1';
export const AVOIDED_TOKENS_UPDATED_EVENT = 'avoided-tokens-updated';

const MAX_AVOIDED_TOKENS = 80;

// Cached versioned token snapshot so repeated reads don't re-parse or rebuild the Set.
export const AVOIDED_TOKENS_SNAPSHOT_KEY = '__comfyui_avoided_tokens_snapshot';
let _snapshotTokens: string[] | null = null;
let _requestBodyCache: {
  tokenKey: string;
  value: ReturnType<typeof avoidedTokensRequestBody>;
} | null = null;

function invalidateAvoidedTokensSnapshot(next: string[] | null = null): void {
  _snapshotTokens = next;
  _requestBodyCache = null;
  if (typeof window === 'undefined') {
    return;
  }
  if (next) {
    writeBrowserValue(AVOIDED_TOKENS_SNAPSHOT_KEY, next);
  } else {
    removeBrowserKey(AVOIDED_TOKENS_SNAPSHOT_KEY);
  }
}

export function invalidateAvoidedTokensCache(): void {
  invalidateAvoidedTokensSnapshot(null);
}

function persistAvoidedTokens(tokens: Iterable<string>): void {
  if (typeof window === 'undefined') {
    return;
  }
  const list = [
    ...new Set([...tokens].map(token => token.trim().toLowerCase()).filter(Boolean)),
  ].slice(-MAX_AVOIDED_TOKENS);
  writeBrowserValue(AVOIDED_TOKENS_KEY, list);
  invalidateAvoidedTokensSnapshot(list);
  void import('../storage/tab-sync').then(({ broadcastTabSync }) =>
    broadcastTabSync({ type: 'avoided-tokens-updated' })
  );
  window.dispatchEvent(new CustomEvent(AVOIDED_TOKENS_UPDATED_EVENT));
}

export function saveAvoidedTokens(tokens: string[]): void {
  persistAvoidedTokens(tokens);
}

export function addAvoidedToken(token: string): void {
  const trimmed = token.trim().toLowerCase();
  if (!trimmed) {
    return;
  }
  const existing = loadAvoidedTokens();
  existing.add(trimmed);
  persistAvoidedTokens(existing);
}

export function addAvoidedTokens(tokens: readonly string[]): number {
  const existing = loadAvoidedTokens();
  let added = 0;
  for (const token of tokens) {
    const trimmed = token.trim().toLowerCase();
    if (!trimmed || existing.has(trimmed)) {
      continue;
    }
    existing.add(trimmed);
    added += 1;
  }
  persistAvoidedTokens(existing);
  return added;
}

export function removeAvoidedToken(token: string): void {
  const existing = loadAvoidedTokens();
  existing.delete(token.trim().toLowerCase());
  persistAvoidedTokens(existing);
}

export function clearAvoidedTokens(): void {
  if (typeof window === 'undefined') {
    return;
  }
  removeBrowserKey(AVOIDED_TOKENS_KEY);
  invalidateAvoidedTokensSnapshot(null);
  void import('../storage/tab-sync').then(({ broadcastTabSync }) =>
    broadcastTabSync({ type: 'avoided-tokens-updated' })
  );
  window.dispatchEvent(new CustomEvent(AVOIDED_TOKENS_UPDATED_EVENT));
}

export function loadAvoidedTokens(): Set<string> {
  if (typeof window === 'undefined') {
    return new Set();
  }
  // Return cached snapshot when available.
  try {
    const raw = readBrowserValue<string[]>(AVOIDED_TOKENS_SNAPSHOT_KEY);
    if (Array.isArray(raw) && _snapshotTokens !== null) {
      return new Set(_snapshotTokens);
    }
    if (Array.isArray(raw)) {
      // On first hit, also cache in-memory for this render cycle.
      _snapshotTokens = raw;
      return new Set(raw);
    }
  } catch {}

  try {
    const list = readBrowserValue<string[]>(AVOIDED_TOKENS_KEY);
    if (!list) {
      return new Set();
    }
    _snapshotTokens = list;
    // Persist a snapshot so subsequent calls avoid re-parsing the source.
    try {
      writeBrowserValue(AVOIDED_TOKENS_SNAPSHOT_KEY, list);
    } catch {}
    return new Set(list);
  } catch {
    return new Set();
  }
}

export function downloadAvoidedTokensExport(filename = 'avoided-tokens.json'): void {
  const payload = exportAvoidedTokensJson();
  const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportAvoidedTokensJson(): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      tokens: exportAvoidedTokenList(),
    },
    null,
    2
  );
}

export function importAvoidedTokensJson(raw: string, mode: 'merge' | 'replace' = 'merge'): number {
  const parsed = JSON.parse(raw) as { tokens?: unknown };
  if (!Array.isArray(parsed.tokens)) {
    throw new Error('Invalid avoided tokens file.');
  }
  // Single pass: filter strings, trim/lowercase, and drop blanks.
  const tokens = parsed.tokens
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .map(item => item.trim().toLowerCase());
  if (mode === 'replace') {
    saveAvoidedTokens(tokens);
    return tokens.length;
  }
  return addAvoidedTokens(tokens);
}

export function recordAvoidedTokensFromPrompt(prompt: string): void {
  if (typeof window === 'undefined' || !prompt.trim()) {
    return;
  }
  const tokens = tokenizeForAvoidance(prompt).slice(0, 12);
  const existing = loadAvoidedTokens();
  for (const token of tokens) {
    existing.add(token);
  }
  persistAvoidedTokens(existing);
}

export function recordAvoidedTokensFromGalleryEntry(input: {
  prompt: string;
  visionTags?: string[];
}): number {
  if (typeof window === 'undefined') {
    return 0;
  }
  const existing = loadAvoidedTokens();
  const before = existing.size;
  for (const token of tokenizeForAvoidance(input.prompt).slice(0, 12)) {
    existing.add(token);
  }
  for (const tag of input.visionTags ?? []) {
    const normalized = tag.trim().toLowerCase();
    if (normalized) {
      existing.add(normalized);
    }
  }
  persistAvoidedTokens(existing);
  return existing.size - before;
}

export function exportAvoidedTokenList(): string[] {
  return [...loadAvoidedTokens()].slice(-80);
}

export function avoidedTokensRequestBody(): {
  avoidedTokens?: string[];
  avoidedTokensInstruction?: string;
} {
  const tokens = loadAvoidedTokens();
  if (tokens.size === 0) {
    // Fast-path: always return empty object when no tokens.
    return {};
  }
  const sliced = [...tokens].slice(-80);
  const tokenKey = sliced.join('\0');
  // Check cached result (same token set this render cycle).
  if (_requestBodyCache?.tokenKey === tokenKey) {
    return _requestBodyCache.value;
  }
  const instruction = buildAvoidedTokensInstructionFromList(sliced);
  const value = {
    avoidedTokens: sliced,
    ...(instruction ? { avoidedTokensInstruction: instruction } : {}),
  };
  // Update cache.
  _requestBodyCache = { tokenKey, value };
  return value;
}

export function promptContainsAvoidedTokens(text: string, avoided = loadAvoidedTokens()): boolean {
  return promptContainsAvoidedTokensFromList(text, [...avoided]);
}

export function filterAvoidedCandidates(candidates: string[]): string[] {
  return filterAvoidedCandidatesFromList(candidates, [...loadAvoidedTokens()]);
}

export function buildAvoidedTokensInstruction(): string | undefined {
  return buildAvoidedTokensInstructionFromList([...loadAvoidedTokens()]);
}
