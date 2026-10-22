'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

type Props = {
  imageDataUrl: string;
  prompt: string;
  onApplyRating?: (rating: 1 | 2 | 3 | 4 | 5) => void;
};

export default function GalleryVisionReviewButton({ imageDataUrl, prompt, onApplyRating }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    suggestedRating: number;
    tags: string[];
    critique: string;
  } | null>(null);

  async function runReview() {
    setLoading(true);
    try {
      const response = await fetch('/api/gallery/vision-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl, prompt }),
      });
      const data = (await response.json()) as {
        suggestedRating?: number;
        tags?: string[];
        critique?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? 'Vision review failed.');
      }
      setResult({
        suggestedRating: data.suggestedRating ?? 3,
        tags: data.tags ?? [],
        critique: data.critique ?? '',
      });
    } catch (error) {
      setResult({
        suggestedRating: 0,
        tags: [],
        critique: error instanceof Error ? error.message : 'Vision review failed.',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={loading}
        onClick={() => void runReview()}
        className={`ui-btn-secondary min-h-11 rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-elevated)] transition hover:bg-[var(--accent-muted)] hover:border-[var(--accent-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] text-[var(--accent-text)] disabled:opacity-50`}
      >
        {loading ? 'Analyzing…' : 'Vision review'}
      </button>
      {result ? (
        <div
          className={`rounded-xl border-[var(--border-subtle)]/60 bg-[var(--bg-elevated)] p-3 text-xs transition hover:border-[var(--accent-border)]`}
        >
          {result.suggestedRating > 0 ? (
            <p className="text-[var(--accent-text)]">Suggested: {result.suggestedRating}★</p>
          ) : null}
          <p className="mt-1">{result.critique}</p>
          {result.tags.length > 0 ? (
            <p className="mt-1 text-[var(--text-muted)]">{result.tags.join(' · ')}</p>
          ) : null}
          {result.suggestedRating >= 1 && result.suggestedRating <= 5 && onApplyRating ? (
            <Button
              variant="tint"
              type="button"
              className={`mt-2 rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] `}
              onClick={() => onApplyRating(result.suggestedRating as 1 | 2 | 3 | 4 | 5)}
            >
              Apply {result.suggestedRating}★
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
