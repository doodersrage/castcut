'use client';

import { useEffect, useState } from 'react';
import { ChipButton } from '@/components/ui/Field';
import {
  fetchComfyObjectInfoCached,
  readCachedComfyObjectInfoModels,
} from '@/lib/comfyui/object-info-cache';
import { loadComfyUiSettings } from '@/lib/comfyui/settings';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import {
  embeddingStem,
  modelSupportsTextualInversion,
  toggleEmbeddingName,
} from '@/lib/lora/textual-inversion';

export default function EmbeddingSessionChips({
  model,
  selected,
  onChange,
}: {
  model?: string;
  selected: string[];
  onChange: (names: string[]) => void;
}) {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    if (!modelSupportsTextualInversion(model)) {
      return;
    }
    scheduleAfterCommit(() => {
      const cached = readCachedComfyObjectInfoModels()?.embeddings ?? [];
      if (cached.length > 0) {
        setNames(cached);
        return;
      }
      void fetchComfyObjectInfoCached({
        comfyUrl: loadComfyUiSettings().apiUrl,
      }).then(payload => {
        setNames(payload?.models.embeddings ?? []);
      });
    });
  }, [model]);

  if (!modelSupportsTextualInversion(model)) {
    return null;
  }
  if (names.length === 0) {
    return (
      <p className="type-caption text-[var(--text-muted)]">
        No embeddings found on this ComfyUI host.
      </p>
    );
  }

  const selectedStems = new Set(selected.map(embeddingStem).map(stem => stem.toLowerCase()));

  return (
    <div className="space-y-2">
      <p className="type-caption text-[var(--text-muted)]">
        Textual inversion embeddings — appended as <code>embedding:name</code> at queue time.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {names.slice(0, 24).map(name => {
          const stem = embeddingStem(name);
          const active = selectedStems.has(stem.toLowerCase());
          return (
            <ChipButton
              key={name}
              active={active}
              onClick={() => onChange(toggleEmbeddingName(selected, stem))}
            >
              {stem}
            </ChipButton>
          );
        })}
      </div>
    </div>
  );
}
