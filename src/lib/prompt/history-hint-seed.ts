import { loadPromptHistoryStore, type PromptHistoryEntry } from './history';
import type { HistorySeedScope, HistorySeedTool } from '../scene/hint-source';
import { semanticRelevanceScore } from '../search/semantic-search';

export type HistoryHintSeedResult = {
  hints: string;
  entryId: string;
  entryTool: string;
  label: string;
};

const RELATED_TOOLS: Record<HistorySeedTool, readonly string[]> = {
  generate: ['generate', 'randomScene', 'character', 'background', 'pet', 'fantasy'],
  character: ['character', 'generate', 'duo', 'compose', 'scene-compose'],
  duo: ['duo', 'character', 'generate', 'compose', 'scene-compose'],
  compose: [
    'compose',
    'scene-compose',
    'character',
    'duo',
    'generate',
    'background',
    'refine',
    'inpaint',
    'outpaint',
  ],
  background: ['background', 'generate', 'fantasy', 'compose', 'scene-compose'],
  pet: ['pet', 'generate', 'character'],
  fantasy: ['fantasy', 'generate', 'character', 'background'],
  refine: ['refine', 'compose', 'inpaint', 'outpaint', 'generate', 'character'],
  inpaint: ['inpaint', 'outpaint', 'refine', 'compose', 'imagePrompt'],
  outpaint: ['outpaint', 'inpaint', 'refine', 'compose', 'generate'],
  video: ['video', 'generate', 'character', 'compose', 'imagePrompt'],
  controlnet: ['controlnet', 'compose', 'refine', 'inpaint', 'generate'],
  imagePrompt: ['imagePrompt', 'refine', 'compose', 'generate', 'character'],
};

const STOPWORDS = new Set([
  'with',
  'and',
  'the',
  'for',
  'from',
  'that',
  'this',
  'into',
  'over',
  'under',
  'through',
  'their',
  'there',
  'while',
  'where',
  'when',
  'very',
  'soft',
  'warm',
  'cool',
  'light',
  'lighting',
  'scene',
  'image',
  'photo',
  'photograph',
  'portrait',
  'detailed',
  'natural',
  'realistic',
  'cinematic',
]);

export function loadPromptHistoryEntries(): PromptHistoryEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    return loadPromptHistoryStore();
  } catch {
    return [];
  }
}

export function filterHistoryForSeed(
  entries: PromptHistoryEntry[],
  tool: HistorySeedTool,
  scope: HistorySeedScope
): PromptHistoryEntry[] {
  const allowedTools =
    scope === 'tool' ? new Set([tool]) : scope === 'related' ? new Set(RELATED_TOOLS[tool]) : null;

  return entries.filter(entry => {
    if (allowedTools && !allowedTools.has(entry.tool)) {
      return false;
    }
    if (scope === 'favorites' && !entry.favorite) {
      return false;
    }
    if (scope === 'top-rated' && (entry.rating ?? 0) < 4) {
      return false;
    }
    const seedText = entry.hints?.trim() || entry.prompt?.trim();
    return Boolean(seedText);
  });
}

function scoreHistoryEntry(
  entry: PromptHistoryEntry,
  index: number,
  total: number,
  referenceHints?: string
): number {
  let score = 0;
  if (typeof entry.rating === 'number') {
    score += entry.rating * 2;
  }
  if (entry.favorite) {
    score += 5;
  }
  score += (1 - index / Math.max(total, 1)) * 4;

  if (referenceHints?.trim()) {
    const corpus = [entry.hints, entry.prompt].filter(Boolean).join('\n');
    score += semanticRelevanceScore(referenceHints, corpus) * 6;
  }

  return score;
}

export function compressHintSeed(text: string, maxLength = 160): string {
  const withoutLocation = text.replace(/\blocation:\s*[^,;]+/gi, '').trim();
  const clauses = withoutLocation
    .split(/[,;]/)
    .map(part => part.trim())
    .filter(Boolean);

  if (clauses.length === 0) {
    return withoutLocation.slice(0, maxLength).trim();
  }

  let combined = '';
  for (const clause of clauses) {
    const next = combined ? `${combined}, ${clause}` : clause;
    if (next.length > maxLength) {
      break;
    }
    combined = next;
  }

  return combined || clauses[0]!.slice(0, maxLength);
}

export function extractKeywordsFromPrompt(prompt: string, maxLength = 160): string {
  const cleaned = prompt
    .replace(/\blocation:\s*[^,;]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const compressed = compressHintSeed(cleaned, maxLength);
  if (compressed.length >= 24) {
    return compressed;
  }

  const tokens = cleaned
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 3 && !STOPWORDS.has(token));

  const unique: string[] = [];
  for (const token of tokens) {
    if (!unique.includes(token)) {
      unique.push(token);
    }
    if (unique.length >= 8) {
      break;
    }
  }

  return unique.join(', ').slice(0, maxLength);
}

export function extractHintSeedFromEntry(entry: PromptHistoryEntry): string {
  if (entry.hints?.trim()) {
    return compressHintSeed(entry.hints.trim());
  }
  return extractKeywordsFromPrompt(entry.prompt);
}

function formatSeedLabel(entry: PromptHistoryEntry): string {
  const parts = [entry.tool];
  if (entry.favorite) {
    parts.push('favorite');
  }
  if (typeof entry.rating === 'number') {
    parts.push(`${entry.rating}★`);
  }
  return parts.join(' · ');
}

function pickWeightedEntry(
  ranked: Array<{ entry: PromptHistoryEntry; score: number }>,
  excludeEntryId?: string
): PromptHistoryEntry | null {
  const pool = ranked.filter(item => !excludeEntryId || item.entry.id !== excludeEntryId);
  if (pool.length === 0) {
    return ranked[0]?.entry ?? null;
  }

  const top = pool.slice(0, Math.min(8, pool.length));
  const totalWeight = top.reduce((sum, item) => sum + item.score + 1, 0);
  let roll = Math.random() * totalWeight;

  for (const item of top) {
    roll -= item.score + 1;
    if (roll <= 0) {
      return item.entry;
    }
  }

  return top[top.length - 1]!.entry;
}

export function rankHistoryForSeed(
  entries: PromptHistoryEntry[],
  referenceHints?: string
): Array<{ entry: PromptHistoryEntry; score: number }> {
  return entries
    .map((entry, index) => ({
      entry,
      score: scoreHistoryEntry(entry, index, entries.length, referenceHints),
    }))
    .sort((a, b) => b.score - a.score);
}

export function pickHistoryHintSeed(options: {
  tool: HistorySeedTool;
  scope: HistorySeedScope;
  entries?: PromptHistoryEntry[];
  excludeEntryId?: string;
  referenceHints?: string;
}): HistoryHintSeedResult | null {
  const entries =
    options.entries ??
    filterHistoryForSeed(loadPromptHistoryEntries(), options.tool, options.scope);

  if (entries.length === 0) {
    return null;
  }

  const ranked = rankHistoryForSeed(entries, options.referenceHints);
  const entry = pickWeightedEntry(ranked, options.excludeEntryId);
  if (!entry) {
    return null;
  }

  const hints = extractHintSeedFromEntry(entry);
  if (!hints.trim()) {
    return null;
  }

  return {
    hints,
    entryId: entry.id,
    entryTool: entry.tool,
    label: formatSeedLabel(entry),
  };
}

export function listHistoryHintSuggestions(options: {
  tool: HistorySeedTool;
  scope: HistorySeedScope;
  limit?: number;
  referenceHints?: string;
}): HistoryHintSeedResult[] {
  const entries = filterHistoryForSeed(loadPromptHistoryEntries(), options.tool, options.scope);
  const ranked = rankHistoryForSeed(entries, options.referenceHints);
  const limit = options.limit ?? 4;
  const seen = new Set<string>();

  const suggestions: HistoryHintSeedResult[] = [];
  for (const { entry } of ranked) {
    const hints = extractHintSeedFromEntry(entry);
    const key = hints.toLowerCase();
    if (!hints.trim() || seen.has(key)) {
      continue;
    }
    seen.add(key);
    suggestions.push({
      hints,
      entryId: entry.id,
      entryTool: entry.tool,
      label: formatSeedLabel(entry),
    });
    if (suggestions.length >= limit) {
      break;
    }
  }

  return suggestions;
}

export function countHistorySeedCandidates(tool: HistorySeedTool, scope: HistorySeedScope): number {
  return filterHistoryForSeed(loadPromptHistoryEntries(), tool, scope).length;
}

export function splitBackgroundHintSeed(seed: string): {
  settingType: string;
  timeOfDay: string;
  mood: string;
} {
  const parts = seed
    .split(/[,;]/)
    .map(part => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { settingType: seed.trim(), timeOfDay: '', mood: '' };
  }

  return {
    settingType: parts[0] ?? '',
    timeOfDay: parts[1] ?? '',
    mood: parts.slice(2).join(', '),
  };
}
