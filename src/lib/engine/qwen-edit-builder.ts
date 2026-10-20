export type QwenEditSegmentKind = 'keep' | 'replace' | 'add' | 'remove';

export type QwenEditSegment = {
  kind: QwenEditSegmentKind;
  text: string;
};

export function parseQwenEditSegments(raw: string): QwenEditSegment[] {
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^(keep|replace|add|remove)\s*:\s*(.+)$/i);
      if (!match) {
        return { kind: 'add' as const, text: line };
      }
      return {
        kind: match[1].toLowerCase() as QwenEditSegmentKind,
        text: match[2].trim(),
      };
    })
    .filter(segment => segment.text.length > 0);
}

export function buildQwenEditPrompt(segments: QwenEditSegment[]): string {
  const keep = segments.filter(segment => segment.kind === 'keep');
  const replace = segments.filter(segment => segment.kind === 'replace');
  const add = segments.filter(segment => segment.kind === 'add');
  const remove = segments.filter(segment => segment.kind === 'remove');

  const parts: string[] = [];

  if (keep.length > 0) {
    parts.push(`Keep unchanged: ${keep.map(segment => segment.text).join('; ')}.`);
  }
  if (replace.length > 0) {
    parts.push(`Replace with: ${replace.map(segment => segment.text).join('; ')}.`);
  }
  if (remove.length > 0) {
    parts.push(`Remove: ${remove.map(segment => segment.text).join('; ')}.`);
  }
  if (add.length > 0) {
    parts.push(`Add: ${add.map(segment => segment.text).join('; ')}.`);
  }

  return parts.join(' ').trim();
}

export function qwenEditTemplate(): string {
  return [
    'keep: subject face, pose, and proportions',
    'replace: background with a rainy neon alley at night',
    'add: steam rising from sidewalk grates',
    'remove: visible logos and text',
  ].join('\n');
}
