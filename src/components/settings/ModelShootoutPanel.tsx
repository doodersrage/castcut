'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { DEFAULT_SHOOTOUT_MODELS, queueSameSeedShootout } from '@/lib/experiment/model-shootout';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';

export default function ModelShootoutPanel() {
  const [prompt, setPrompt] = useState('');
  const [seed, setSeed] = useState('0');
  const [models, setModels] = useState<string[]>(DEFAULT_SHOOTOUT_MODELS.map(entry => entry.model));
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setSeed(String(Math.floor(Math.random() * 1_000_000)));
    });
  }, []);

  function toggleModel(model: string) {
    setModels(previous =>
      previous.includes(model) ? previous.filter(entry => entry !== model) : [...previous, model]
    );
  }

  return (
    <ToolSection title="Same-seed model shootout">
      <p className="mb-3 text-sm text-[var(--text-muted)]">
        Queue the same prompt and seed across multiple models for a fair comparison.
      </p>
      <textarea
        value={prompt}
        onChange={event => setPrompt(event.target.value)}
        rows={3}
        placeholder="Prompt to compare…"
        className="ui-input mb-3 w-full"
      />
      <div className="mb-3 flex flex-wrap gap-2">
        {DEFAULT_SHOOTOUT_MODELS.map(entry => (
          <button
            key={entry.model}
            type="button"
            onClick={() => toggleModel(entry.model)}
            data-active={models.includes(entry.model) ? 'true' : 'false'}
            className="ui-chip"
          >
            {entry.label}
          </button>
        ))}
      </div>
      <label className="mb-3 block space-y-1 text-sm">
        <span className="type-caption text-[var(--text-muted)]">Seed</span>
        <input
          value={seed}
          onChange={event => setSeed(event.target.value)}
          className="ui-input w-full max-w-xs"
        />
      </label>
      <Button
        variant="secondary"
        disabled={!prompt.trim() || models.length === 0}
        onClick={() => {
          void queueSameSeedShootout({
            prompt: prompt.trim(),
            models,
            seed: Number(seed) || 0,
          }).then(result => {
            if (result.held > 0) {
              void import('@/lib/app/toast').then(({ toastHeldMax }) =>
                toastHeldMax({
                  text: 'Max shootout jobs held until ComfyUI is idle',
                  count: result.held,
                })
              );
            }
            setStatus(
              [
                `Queued ${result.queued}`,
                result.held > 0 ? `held ${result.held} Max` : null,
                result.errors.length > 0 ? result.errors.join(' · ') : 'Check Gallery.',
              ]
                .filter(Boolean)
                .join(' · ')
            );
          });
        }}
      >
        Queue shootout
      </Button>
      {status ? <p className="mt-2 text-sm text-[var(--tint-success-text)]">{status}</p> : null}
    </ToolSection>
  );
}
