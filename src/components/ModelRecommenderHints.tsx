'use client';

import { useEffect, useMemo, useState } from 'react';
import { recommendModels, type ModelRecommendation } from '@/lib/model/recommender';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { Button } from '@/components/ui/Button';

type ModelRecommenderHintsProps = {
  text: string;
  currentModel: ComfyImageModel;
  onApplyModel?: (model: ComfyImageModel) => void;
  /** Prefer server route for CLI parity; falls back to client rules. */
  preferServer?: boolean;
};

const RECOMMEND_DEBOUNCE_MS = 400;

export default function ModelRecommenderHints({
  text,
  currentModel,
  onApplyModel,
  preferServer = true,
}: ModelRecommenderHintsProps) {
  const [debouncedText, setDebouncedText] = useState(text);
  const [serverSuggestions, setServerSuggestions] = useState<ModelRecommendation[] | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedText(text), RECOMMEND_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text]);

  const localSuggestions = useMemo((): ModelRecommendation[] => {
    const trimmed = debouncedText.trim();
    if (trimmed.length < 8) {
      return [];
    }
    return recommendModels(trimmed, 3);
  }, [debouncedText]);

  useEffect(() => {
    const trimmed = debouncedText.trim();
    if (!preferServer || trimmed.length < 8) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/models/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: trimmed, limit: 3 }),
        });
        const data = (await response.json()) as { recommendations?: ModelRecommendation[] };
        if (!cancelled && response.ok && Array.isArray(data.recommendations)) {
          setServerSuggestions(data.recommendations);
        }
      } catch {
        // fall back to localSuggestions in render
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedText, preferServer]);

  const suggestions = useMemo(() => {
    const trimmed = debouncedText.trim();
    if (trimmed.length < 8) {
      return [];
    }
    if (preferServer && serverSuggestions?.length) {
      return serverSuggestions;
    }
    return localSuggestions;
  }, [debouncedText, localSuggestions, preferServer, serverSuggestions]);

  if (!text.trim() || suggestions.length === 0 || !onApplyModel) {
    return null;
  }

  return (
    <div className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-2">
      <p className="type-caption text-[var(--accent-text)]/80">Suggested models</p>
      <ul className="mt-2 space-y-1.5">
        {suggestions.map(item => {
          const def = getComfyModelDefinition(item.model as ComfyImageModel);
          const active = item.model === currentModel;
          return (
            <li key={item.model} className="flex flex-wrap items-center gap-2 text-xs">
              <Button
                variant="tint"
                type="button"
                disabled={active}
                onClick={() => onApplyModel(item.model as ComfyImageModel)}
                className="rounded-full bg-[var(--bg-base)]/40 px-2.5 py-0.5 transition disabled:cursor-default disabled:opacity-60"
              >
                {def.label}
                {active ? ' · current' : ''}
              </Button>
              <span className="text-[var(--text-muted)]">{item.reason}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
