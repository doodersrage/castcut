'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';
import { loadPromptRecipes, type PromptRecipe } from '@/lib/prompt/recipes';
import { toastQueueOutcome } from '@/lib/app/toast';
import {
  queueSameSeedShootout,
  queueFamilySameSeedShootout,
  DEFAULT_SHOOTOUT_MODELS,
} from '@/lib/experiment/model-shootout';
import { modelsInSameFamily } from '@/lib/model/workflow-map';
import { toastHeldMax } from '@/lib/app/toast';

type ResultQuickActionsProps = {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  seed?: number;
};

export default function ResultQuickActions({
  prompt,
  negativePrompt,
  model = 'sdxl',
  seed,
}: ResultQuickActionsProps) {
  const [status, setStatus] = useState<string | null>(null);
  const recipes = loadPromptRecipes().slice(0, 8);

  if (!prompt.trim()) {
    return null;
  }

  async function runRecipe(recipe: PromptRecipe) {
    setStatus(`Running ${recipe.name}…`);
    try {
      const response = await fetch('/api/recipes/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model, steps: recipe.steps }),
      });
      const result = (await response.json()) as { prompt?: string; log?: string[]; error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? 'Recipe run failed.');
      }
      const summary = (result.log ?? []).join(' · ') || 'Recipe finished';
      setStatus(summary);
      toastQueueOutcome({ ok: true, text: `${recipe.name} · ${summary}`, href: '/gallery' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Recipe run failed.';
      setStatus(message);
      toastQueueOutcome({ ok: false, text: message });
    }
  }

  async function runShootout() {
    setStatus('Queueing model shootout…');
    const resolvedSeed = seed ?? Math.floor(Math.random() * 1_000_000);
    const result = await queueSameSeedShootout({
      prompt: prompt.trim(),
      negativePrompt,
      models: DEFAULT_SHOOTOUT_MODELS.map(entry => entry.model),
      seed: resolvedSeed,
    });
    if (result.held > 0) {
      toastHeldMax({
        text: 'Max shootout jobs held until ComfyUI is idle',
        count: result.held,
      });
    }
    setStatus(
      [
        `Queued ${result.queued}`,
        result.held > 0 ? `held ${result.held}` : null,
        result.errors.length > 0 ? result.errors[0] : `seed ${resolvedSeed}`,
      ]
        .filter(Boolean)
        .join(' · ')
    );
  }

  async function runFamilyShootout() {
    setStatus('Queueing family shootout…');
    const resolvedSeed = seed ?? Math.floor(Math.random() * 1_000_000);
    const result = await queueFamilySameSeedShootout({
      prompt: prompt.trim(),
      negativePrompt,
      model,
      seed: resolvedSeed,
    });
    if (result.held > 0) {
      toastHeldMax({
        text: 'Max family shootout held until ComfyUI is idle',
        count: result.held,
      });
    }
    setStatus(
      [
        `Queued ${result.queued}`,
        result.held > 0 ? `held ${result.held}` : null,
        result.errors.length > 0 ? result.errors[0] : `seed ${resolvedSeed}`,
      ]
        .filter(Boolean)
        .join(' · ')
    );
  }

  const familyPeerCount = modelsInSameFamily(model).length;

  return (
    <CollapsibleSection
      title="Recipes & shootout"
      summary="Same-seed model shootout and prompt recipe shortcuts."
      defaultOpen={false}
      persistKey="result-recipes-shootout"
      className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-[var(--space-4)] py-[var(--space-3)]"
    >
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => void runShootout()}>
          Same-seed shootout
        </Button>
        {familyPeerCount > 1 ? (
          <Button variant="secondary" size="sm" onClick={() => void runFamilyShootout()}>
            Family shootout
          </Button>
        ) : null}
        {recipes.map(recipe => (
          <Button key={recipe.id} variant="ghost" size="sm" onClick={() => void runRecipe(recipe)}>
            {recipe.name}
          </Button>
        ))}
      </div>
      {status ? <p className="type-caption text-[var(--tint-success-text)]">{status}</p> : null}
    </CollapsibleSection>
  );
}
