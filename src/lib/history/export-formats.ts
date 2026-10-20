import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';
import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery';

export function exportHistoryJsonl(entries: PromptHistoryEntry[]): string {
  return entries.map(entry => JSON.stringify(entry)).join('\n');
}

export function exportHistoryCsv(entries: PromptHistoryEntry[]): string {
  const header = ['id', 'tool', 'model', 'timestamp', 'rating', 'favorite', 'prompt', 'hints'];
  const rows = entries.map(entry =>
    [
      entry.id,
      entry.tool,
      entry.model,
      new Date(entry.timestamp).toISOString(),
      entry.rating ?? '',
      entry.favorite ? '1' : '0',
      csvEscape(entry.prompt),
      csvEscape(entry.hints ?? ''),
    ].join(',')
  );
  return [header.join(','), ...rows].join('\n');
}

export function exportGalleryJsonl(entries: ComfyGalleryEntry[]): string {
  return entries.map(entry => JSON.stringify(entry)).join('\n');
}

export function exportGalleryCsv(entries: ComfyGalleryEntry[]): string {
  const header = [
    'id',
    'promptId',
    'tool',
    'model',
    'status',
    'reviewRating',
    'favorite',
    'prompt',
    'negativePrompt',
    'seed',
  ];
  const rows = entries.map(entry =>
    [
      entry.id,
      entry.promptId,
      entry.tool,
      entry.model ?? '',
      entry.status,
      entry.reviewRating ?? '',
      entry.favorite ? '1' : '0',
      csvEscape(entry.prompt),
      csvEscape(entry.negativePrompt ?? ''),
      entry.queueParams?.seed ?? '',
    ].join(',')
  );
  return [header.join(','), ...rows].join('\n');
}

export function downloadTextFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
