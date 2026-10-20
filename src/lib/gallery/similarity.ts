import type { ComfyGalleryEntry } from './comfyui-gallery';
import { tokenize, bigrams } from '../semantic-search';

export type GallerySimilarityScore = {
  entry: ComfyGalleryEntry;
  score: number;
  promptScore: number;
  paramScore: number;
  visualScore?: number;
};

// Pre-compute token sets for fast overlap checking.
function paramSimilarity(reference: ComfyGalleryEntry, candidate: ComfyGalleryEntry): number {
  const a = reference.queueParams;
  const b = candidate.queueParams;
  if (!a || !b) {
    return 0;
  }
  let matches = 0;
  let total = 0;
  for (const key of ['cfg', 'steps', 'width', 'height'] as const) {
    if (a[key] != null || b[key] != null) {
      total += 1;
      if (String(a[key] ?? '') === String(b[key] ?? '')) {
        matches += 1;
      }
    }
  }
  if (reference.model && candidate.model && reference.model === candidate.model) {
    total += 1;
    matches += 1;
  }
  return total > 0 ? matches / total : 0;
}

function tagJaccard(left?: string[], right?: string[]): number {
  const a = new Set((left ?? []).map(tag => tag.trim().toLowerCase()).filter(Boolean));
  const b = new Set((right ?? []).map(tag => tag.trim().toLowerCase()).filter(Boolean));
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const tag of a) {
    if (b.has(tag)) {
      overlap += 1;
    }
  }
  return overlap / (a.size + b.size - overlap);
}

function visualFeatureScore(reference: ComfyGalleryEntry, candidate: ComfyGalleryEntry): number {
  const tags = tagJaccard(
    [...(reference.visionTags ?? []), ...(reference.userTags ?? [])],
    [...(candidate.visionTags ?? []), ...(candidate.userTags ?? [])]
  );
  const widthA = reference.queueParams?.width;
  const widthB = candidate.queueParams?.width;
  const heightA = reference.queueParams?.height;
  const heightB = candidate.queueParams?.height;
  let size = 0;
  if (widthA != null && widthB != null && heightA != null && heightB != null) {
    const ratioA = Number(widthA) / Number(heightA);
    const ratioB = Number(widthB) / Number(heightB);
    if (Number.isFinite(ratioA) && Number.isFinite(ratioB) && ratioA > 0 && ratioB > 0) {
      size = 1 - Math.min(1, Math.abs(ratioA - ratioB) / 1.5);
    }
  }
  const aesthetic =
    reference.aestheticScore != null && candidate.aestheticScore != null
      ? 1 - Math.min(1, Math.abs(reference.aestheticScore - candidate.aestheticScore) / 100)
      : 0;
  const model = reference.model && candidate.model && reference.model === candidate.model ? 1 : 0;
  return tags * 0.55 + size * 0.15 + aesthetic * 0.15 + model * 0.15;
}

/** Fast similarity score using pre-tokenized reference corpus. */
function fastSimilarityScore(
  entryPrompt: string,
  queryTokens: Set<string>,
  queryBigrams: string[]
): number {
  const candidateTokens = tokenize(entryPrompt);
  let overlap = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) {
      overlap += 1;
    }
  }
  let score = overlap / queryTokens.size;

  // Direct string inclusion check is cheaper than re-tokenizing.
  const entryLower = entryPrompt.toLowerCase();
  for (const pair of queryBigrams) {
    if (entryLower.includes(pair)) {
      score += 0.08;
    }
  }

  return Math.min(1, score);
}

export function rankGallerySimilarity(
  entries: ComfyGalleryEntry[],
  reference: ComfyGalleryEntry
): GallerySimilarityScore[] {
  // Pre-tokenize the reference once instead of re-tokenizing per entry.
  const queryTokens = tokenize(
    [reference.prompt, reference.negativePrompt, reference.tool, reference.model]
      .filter(Boolean)
      .join(' ')
  );

  if (queryTokens.size === 0) {
    return entries
      .filter(entry => entry.id !== reference.id)
      .map(entry => ({
        entry,
        score: 0,
        promptScore: 0,
        paramScore: paramSimilarity(reference, entry),
      }));
  }

  const queryBigrams = bigrams(
    [reference.prompt, reference.negativePrompt, reference.tool, reference.model]
      .filter(Boolean)
      .join(' ')
  );

  return entries
    .filter(entry => entry.id !== reference.id)
    .map(entry => {
      const promptScore = fastSimilarityScore(entry.prompt, queryTokens, queryBigrams);
      const paramScore = paramSimilarity(reference, entry);
      const visualScore = visualFeatureScore(reference, entry);
      const score = promptScore * 0.78 + paramScore * 0.22;
      return { entry, score, promptScore, paramScore, visualScore };
    })
    .filter(item => item.score > 0.12)
    .sort((a, b) => b.score - a.score || b.promptScore - a.promptScore);
}

export function rankGalleryVisualSimilarity(
  entries: ComfyGalleryEntry[],
  reference: ComfyGalleryEntry
): GallerySimilarityScore[] {
  const promptRanked = rankGallerySimilarity(entries, reference);
  const promptById = new Map(promptRanked.map(item => [item.entry.id, item]));
  return entries
    .filter(entry => entry.id !== reference.id)
    .map(entry => {
      const promptItem = promptById.get(entry.id);
      const promptScore = promptItem?.promptScore ?? 0;
      const paramScore = promptItem?.paramScore ?? paramSimilarity(reference, entry);
      const visualScore = visualFeatureScore(reference, entry);
      const score = visualScore * 0.7 + promptScore * 0.2 + paramScore * 0.1;
      return { entry, score, promptScore, paramScore, visualScore };
    })
    .filter(item => item.score > 0.08)
    .sort((a, b) => b.score - a.score || (b.visualScore ?? 0) - (a.visualScore ?? 0));
}

export function orderGalleryByVisualSimilarity(
  entries: ComfyGalleryEntry[],
  reference: ComfyGalleryEntry
): ComfyGalleryEntry[] {
  const ranked = rankGalleryVisualSimilarity(entries, reference);
  const rankedIds = new Set(ranked.map(item => item.entry.id));
  const tail = entries.filter(entry => !rankedIds.has(entry.id) && entry.id !== reference.id);
  const ordered = [...ranked.map(item => item.entry), ...tail];
  if (entries.some(entry => entry.id === reference.id)) {
    return [reference, ...ordered];
  }
  return ordered;
}

export function galleryVisualCorpus(entry: ComfyGalleryEntry): string {
  return [
    ...(entry.visionTags ?? []),
    ...(entry.userTags ?? []),
    entry.model,
    entry.tool,
    entry.prompt,
  ]
    .filter(Boolean)
    .join('\n');
}

export function orderGalleryBySimilarity(
  entries: ComfyGalleryEntry[],
  reference: ComfyGalleryEntry
): ComfyGalleryEntry[] {
  const ranked = rankGallerySimilarity(entries, reference);
  const rankedIds = new Set(ranked.map(item => item.entry.id));
  const tail = entries.filter(entry => !rankedIds.has(entry.id) && entry.id !== reference.id);
  const ordered = [...ranked.map(item => item.entry), ...tail];
  if (entries.some(entry => entry.id === reference.id)) {
    return [reference, ...ordered];
  }
  return ordered;
}
