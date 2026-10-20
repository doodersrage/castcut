'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { loadPromptRecipes, upsertPromptRecipe, type PromptRecipeStep } from '@/lib/prompt/recipes';

const STEP_OPTIONS: PromptRecipeStep[] = ['lint', 'fix', 'compact', 'queue'];

export default function PromptRecipesPanel() {
  const [recipes, setRecipes] = useState(() => loadPromptRecipes());
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<PromptRecipeStep[]>(['lint', 'fix', 'queue']);
  const [samplePrompt, setSamplePrompt] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  function toggleStep(step: PromptRecipeStep) {
    setSteps(previous =>
      previous.includes(step) ? previous.filter(entry => entry !== step) : [...previous, step]
    );
  }

  return (
    <ToolSection title="Prompt recipes">
      <p className="mb-3 text-sm text-[var(--text-muted)]">
        Chain lint, fix, compact, and queue steps into reusable pipelines.
      </p>
      <div className="space-y-3">
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="Recipe name"
          className="ui-input w-full"
        />
        <div className="flex flex-wrap gap-2">
          {STEP_OPTIONS.map(step => (
            <button
              key={step}
              type="button"
              onClick={() => toggleStep(step)}
              data-active={steps.includes(step) ? 'true' : 'false'}
              className="ui-chip capitalize"
            >
              {step}
            </button>
          ))}
        </div>
        <Button
          variant="secondary"
          disabled={!name.trim() || steps.length === 0}
          onClick={() => {
            upsertPromptRecipe({
              id: `recipe-${Date.now().toString(36)}`,
              name: name.trim(),
              steps,
            });
            setRecipes(loadPromptRecipes());
            setName('');
            setStatus(`Saved recipe “${name.trim()}”.`);
          }}
        >
          Save recipe
        </Button>
      </div>

      {recipes.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {recipes.map(recipe => (
            <li
              key={recipe.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/40 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-[var(--text-primary)]">{recipe.name}</p>
                <p className="text-xs text-[var(--text-muted)]">{recipe.steps.join(' → ')}</p>
              </div>
              <Button
                variant="ghost"
                className="!min-h-8"
                onClick={() => {
                  if (!samplePrompt.trim()) {
                    setStatus('Enter a sample prompt below to run a recipe.');
                    return;
                  }
                  void fetch('/api/recipes/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      prompt: samplePrompt,
                      model: 'sdxl',
                      steps: recipe.steps,
                    }),
                  })
                    .then(async response => {
                      const result = (await response.json()) as {
                        log?: string[];
                        error?: string;
                      };
                      if (!response.ok) {
                        throw new Error(result.error ?? 'Recipe run failed.');
                      }
                      setStatus((result.log ?? []).join(' · ') || 'Recipe finished.');
                    })
                    .catch(error => {
                      setStatus(error instanceof Error ? error.message : 'Recipe run failed.');
                    });
                }}
              >
                Run
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <textarea
        value={samplePrompt}
        onChange={event => setSamplePrompt(event.target.value)}
        rows={3}
        placeholder="Sample prompt to test a recipe…"
        className="ui-input mt-4 w-full"
      />
      {status ? <p className="mt-2 text-sm text-[var(--tint-success-text)]">{status}</p> : null}
    </ToolSection>
  );
}
