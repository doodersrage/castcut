'use client';

import { useCallback, useState } from 'react';
import { aestheticScoreFromVisionRating } from '@/lib/aesthetic-score';
import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery';
import { updateComfyGalleryEntryById } from '@/lib/gallery/comfyui-gallery';

type InboxResult = {
  suggestedRating: number;
  tags: string[];
  critique: string;
};

type GalleryVisionInboxProps = {
  queue: ComfyGalleryEntry[];
  previewUrl: (entry: ComfyGalleryEntry) => string | null;
  onApplyRating: (entryId: string, rating: 1 | 2 | 3 | 4 | 5) => void;
  onSkip: () => void;
  onClose: () => void;
};

async function imageToDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Could not load preview.');
  }
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Could not encode preview.'));
    reader.readAsDataURL(blob);
  });
}

export default function GalleryVisionInbox({
  queue,
  previewUrl,
  onApplyRating,
  onSkip,
  onClose,
}: GalleryVisionInboxProps) {
  const current = queue[0] ?? null;
  if (!current) {
    return null;
  }

  return (
    <VisionInboxItem
      key={current.id}
      entry={current}
      remaining={queue.length}
      previewUrl={previewUrl}
      onApplyRating={onApplyRating}
      onSkip={onSkip}
      onClose={onClose}
    />
  );
}

function VisionInboxItem({
  entry,
  remaining,
  previewUrl,
  onApplyRating,
  onSkip,
  onClose,
}: {
  entry: ComfyGalleryEntry;
  remaining: number;
  previewUrl: (entry: ComfyGalleryEntry) => string | null;
  onApplyRating: (entryId: string, rating: 1 | 2 | 3 | 4 | 5) => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InboxResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const thumb = previewUrl(entry);

  const runReview = useCallback(async () => {
    const url = previewUrl(entry);
    if (!url) {
      setError('No still preview for this entry.');
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const imageDataUrl = await imageToDataUrl(url);
      const response = await fetch('/api/gallery/vision-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl, prompt: entry.prompt }),
      });
      const data = (await response.json()) as InboxResult & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? 'Vision review failed.');
      }
      setResult({
        suggestedRating: data.suggestedRating ?? 3,
        tags: data.tags ?? [],
        critique: data.critique ?? '',
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Vision review failed.');
    } finally {
      setLoading(false);
    }
  }, [entry, previewUrl]);

  const suggested =
    result && result.suggestedRating >= 1 && result.suggestedRating <= 5
      ? (result.suggestedRating as 1 | 2 | 3 | 4 | 5)
      : null;

  return (
    <div
      data-testid="gallery-vision-inbox"
      className="space-y-3 rounded-2xl border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] px-4 py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--tint-info-text)]">
            Vision inbox · {remaining} untagged
          </p>
          <p className="type-caption truncate text-[var(--text-secondary)]">{entry.prompt}</p>
        </div>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
        ) : null}
        <button type="button" className="ui-btn-ghost ui-btn-sm text-xs" onClick={onClose}>
          Close
        </button>
      </div>
      {loading ? <p className="text-xs text-[var(--text-muted)]">Analyzing still…</p> : null}
      {error ? <p className="text-xs text-[var(--tint-danger-text)]">{error}</p> : null}
      {result ? (
        <div className="space-y-2 text-xs text-[var(--text-secondary)]">
          {suggested ? (
            <p className="font-medium text-[var(--tint-info-text)]">Suggested {suggested}★</p>
          ) : null}
          {result.critique ? <p>{result.critique}</p> : null}
          {result.tags.length > 0 ? (
            <p className="text-[var(--text-muted)]">{result.tags.join(' · ')}</p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="ui-btn-secondary ui-btn-sm text-xs"
          disabled={loading}
          onClick={() => void runReview()}
        >
          {result ? 'Re-analyze' : 'Analyze'}
        </button>
        <button
          type="button"
          className="ui-btn-secondary ui-btn-sm text-xs"
          disabled={!suggested || loading}
          onClick={() => {
            if (!suggested) {
              return;
            }
            onApplyRating(entry.id, suggested);
            if (result?.tags.length) {
              updateComfyGalleryEntryById(entry.id, {
                visionTags: result.tags,
                aestheticScore: aestheticScoreFromVisionRating(suggested),
                aestheticScoreMethod: 'vision',
              });
            } else {
              updateComfyGalleryEntryById(entry.id, {
                aestheticScore: aestheticScoreFromVisionRating(suggested),
                aestheticScoreMethod: 'vision',
              });
            }
          }}
        >
          Apply suggestion
        </button>
        <button type="button" className="ui-btn-ghost ui-btn-sm text-xs" onClick={onSkip}>
          Skip
        </button>
      </div>
    </div>
  );
}
