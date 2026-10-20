export type PromptDiffSegment = {
  type: 'same' | 'remove' | 'add';
  text: string;
};

export type PromptDiffSummary = {
  beforeChars: number;
  afterChars: number;
  changed: boolean;
  segments: PromptDiffSegment[];
};

function tokenize(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/** Word-level diff for side-by-side prompt comparison in Studio. */
export function diffPromptWords(before: string, after: string): PromptDiffSummary {
  const left = tokenize(before);
  const right = tokenize(after);
  const segments: PromptDiffSegment[] = [];

  let indexLeft = 0;
  let indexRight = 0;

  while (indexLeft < left.length || indexRight < right.length) {
    const wordLeft = left[indexLeft];
    const wordRight = right[indexRight];

    if (wordLeft === wordRight && wordLeft != null) {
      const last = segments[segments.length - 1];
      if (last?.type === 'same') {
        last.text = `${last.text} ${wordLeft}`;
      } else {
        segments.push({ type: 'same', text: wordLeft });
      }
      indexLeft += 1;
      indexRight += 1;
      continue;
    }

    const nextLeftInRight = wordLeft != null ? right.indexOf(wordLeft, indexRight) : -1;
    const nextRightInLeft = wordRight != null ? left.indexOf(wordRight, indexLeft) : -1;

    if (
      wordRight != null &&
      (nextLeftInRight === -1 ||
        (nextRightInLeft !== -1 && nextRightInLeft - indexLeft <= nextLeftInRight - indexRight))
    ) {
      if (wordLeft != null) {
        segments.push({ type: 'remove', text: wordLeft });
        indexLeft += 1;
        continue;
      }
    }

    if (wordRight != null) {
      segments.push({ type: 'add', text: wordRight });
      indexRight += 1;
      continue;
    }

    if (wordLeft != null) {
      segments.push({ type: 'remove', text: wordLeft });
      indexLeft += 1;
    }
  }

  return {
    beforeChars: before.trim().length,
    afterChars: after.trim().length,
    changed: before.trim() !== after.trim(),
    segments,
  };
}
