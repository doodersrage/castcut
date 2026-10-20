export function tokenizePrompt(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(token => token.length >= 3)
  );
}

export function promptSimilarity(a: string, b: string): number {
  const tokensA = tokenizePrompt(a);
  const tokensB = tokenizePrompt(b);
  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }
  return tokenOverlap(tokensA, tokensB) / Math.max(tokensA.size, tokensB.size);
}

function tokenOverlap(left: Set<string>, right: Set<string>): number {
  const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left];
  let overlap = 0;
  for (const token of smaller) {
    if (larger.has(token)) {
      overlap += 1;
    }
  }
  return overlap;
}

function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase().replace(/\s+/g, ' ');
}

const FUZZY_CANDIDATE_CAP = 128;

/**
 * Cluster near-duplicate prompts. Exact matches are grouped in linear time;
 * remaining unique prompts use a rare-token inverted index instead of n² compares.
 */
export function findDuplicatePrompts<T extends { id: string; prompt: string }>(
  entries: T[],
  threshold = 0.85
): Array<{ ids: string[]; similarity: number; prompt: string }> {
  const count = entries.length;
  if (count < 2) {
    return [];
  }

  const normalized: string[] = new Array(count);
  const exactBuckets = new Map<string, number[]>();
  for (let index = 0; index < count; index += 1) {
    const key = normalizePrompt(entries[index]!.prompt);
    normalized[index] = key;
    if (!key) {
      continue;
    }
    const bucket = exactBuckets.get(key);
    if (bucket) {
      bucket.push(index);
    } else {
      exactBuckets.set(key, [index]);
    }
  }

  const representatives: number[] = [];
  for (const bucket of exactBuckets.values()) {
    representatives.push(bucket[0]!);
  }

  const groups: Array<{ ids: string[]; similarity: number; prompt: string }> = [];
  const used = new Uint8Array(count);

  if (representatives.length < 2) {
    for (const bucket of exactBuckets.values()) {
      if (bucket.length > 1) {
        groups.push({
          ids: bucket.map(index => entries[index]!.id),
          similarity: 1,
          prompt: entries[bucket[0]!]!.prompt,
        });
      }
    }
    return groups.sort((left, right) => right.ids.length - left.ids.length);
  }

  const tokenSets = representatives.map(index => tokenizePrompt(entries[index]!.prompt));
  const tokensByIndex = new Map<number, Set<string>>();
  const documentFrequency = new Map<string, number>();
  for (let cursor = 0; cursor < representatives.length; cursor += 1) {
    const tokens = tokenSets[cursor]!;
    tokensByIndex.set(representatives[cursor]!, tokens);
    for (const token of tokens) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const documentFrequencyCap = Math.max(12, Math.min(64, Math.ceil(representatives.length * 0.08)));
  const invertedIndex = new Map<string, number[]>();
  for (let cursor = 0; cursor < representatives.length; cursor += 1) {
    const index = representatives[cursor]!;
    for (const token of tokenSets[cursor]!) {
      if ((documentFrequency.get(token) ?? 0) > documentFrequencyCap) {
        continue;
      }
      const posting = invertedIndex.get(token);
      if (posting) {
        posting.push(index);
      } else {
        invertedIndex.set(token, [index]);
      }
    }
  }

  for (const index of representatives) {
    if (used[index]) {
      continue;
    }

    const exact = exactBuckets.get(normalized[index]) ?? [index];
    const cluster = [...exact];
    let maxSimilarity = exact.length > 1 ? 1 : 0;

    const tokens = tokensByIndex.get(index);
    if (tokens && tokens.size > 0) {
      const overlapByCandidate = new Map<number, number>();
      for (const token of tokens) {
        if ((documentFrequency.get(token) ?? 0) > documentFrequencyCap) {
          continue;
        }
        const posting = invertedIndex.get(token);
        if (!posting) {
          continue;
        }
        for (const candidate of posting) {
          if (
            candidate === index ||
            used[candidate] ||
            normalized[candidate] === normalized[index]
          ) {
            continue;
          }
          overlapByCandidate.set(candidate, (overlapByCandidate.get(candidate) ?? 0) + 1);
        }
      }

      const ranked = [...overlapByCandidate.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, FUZZY_CANDIDATE_CAP);

      for (const [candidate] of ranked) {
        const otherTokens = tokensByIndex.get(candidate);
        if (!otherTokens || otherTokens.size === 0) {
          continue;
        }
        const similarity =
          tokenOverlap(tokens, otherTokens) / Math.max(tokens.size, otherTokens.size);
        if (similarity < threshold) {
          continue;
        }
        const otherExact = exactBuckets.get(normalized[candidate]) ?? [candidate];
        for (const member of otherExact) {
          if (!used[member]) {
            cluster.push(member);
          }
        }
        maxSimilarity = Math.max(maxSimilarity, similarity);
      }
    }

    if (cluster.length > 1) {
      for (const member of cluster) {
        used[member] = 1;
      }
      groups.push({
        ids: cluster.map(member => entries[member]!.id),
        similarity: maxSimilarity,
        prompt: entries[index]!.prompt,
      });
    }
  }

  return groups.sort((left, right) => right.ids.length - left.ids.length);
}
