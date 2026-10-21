'use client';

import { useMemo, useState } from 'react';
import { ChipButton } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import {
  formatQueueSizeQualityExplain,
  resolveQueueQualityProfile,
  type QueueQualityProfile,
} from '@/lib/queue/quality-profile';
import type { ResolutionOrientation, ResolutionSizeTier } from '@/lib/model/resolution-defaults';
import {
  applyToolQualityRecipe,
  formatToolQualityRecipeHint,
  recipesForTool,
  type ToolQualityRecipe,
} from '@/lib/app/tool-quality-recipes';
import {
  applySessionRecipeShared,
  buildSessionRecipeFromShared,
  deleteSessionRecipe,
  formatSessionRecipeSubtitle,
  loadSessionRecipes,
  pushSessionRecipe,
  type SessionRecipe,
} from '@/lib/prompt/session-recipes';
import {
  loadSettingsCache,
  saveSharedSettings,
  type SharedToolSettings,
} from '@/lib/settings/cache';

export function toolLikelyHasInputImage(toolId?: string): boolean {
  // Video I2V (init image) counts as an edit-with-image context for size explain.
  return /^(compose|refine|inpaint|outpaint|controlnet|imagePrompt|image-prompt|video)$/i.test(
    toolId ?? ''
  );
}

type QueueRecipesPanelProps = {
  toolId?: string;
  shared: SharedToolSettings;
  qualityProfile: QueueQualityProfile;
  orientation: ResolutionOrientation;
  sizeTier: ResolutionSizeTier;
  systemWorkflowSource?: 'pack' | 'scaffold';
  hasInputImage?: boolean;
  onApplied: (next: SharedToolSettings) => void;
};

export default function QueueRecipesPanel({
  toolId,
  shared,
  qualityProfile,
  orientation,
  sizeTier,
  systemWorkflowSource,
  hasInputImage,
  onApplied,
}: QueueRecipesPanelProps) {
  const [sessionRecipes, setSessionRecipes] = useState<SessionRecipe[]>(() =>
    typeof window === 'undefined' ? [] : loadSessionRecipes()
  );
  const [status, setStatus] = useState<string | null>(null);

  const effectiveProfile = resolveQueueQualityProfile({
    tool: toolId,
    global: qualityProfile,
    toolProfiles: shared.toolQueueQualityProfiles,
    model: shared.model,
  });

  const explain = useMemo(
    () =>
      formatQueueSizeQualityExplain({
        model: shared.model,
        qualityProfile: effectiveProfile,
        orientation,
        sizeTier,
        hasInputImage: hasInputImage ?? toolLikelyHasInputImage(toolId),
        systemWorkflowSource,
        // Edit packs historically shipped EmptyFlux2 — queue prep converts to EmptySD3.
        latentConvertedFrom: /qwen-image-edit/i.test(shared.model) ? 'EmptyFlux2' : undefined,
      }),
    [
      effectiveProfile,
      hasInputImage,
      orientation,
      shared.model,
      sizeTier,
      systemWorkflowSource,
      toolId,
    ]
  );

  const recipes = useMemo(
    () => recipesForTool(shared.toolQualityRecipes ?? [], toolId),
    [shared.toolQualityRecipes, toolId]
  );

  function currentShared(): SharedToolSettings {
    return {
      ...loadSettingsCache().shared,
      ...shared,
      queueQualityProfile: qualityProfile,
      modelResolutionOrientation: orientation,
      modelResolutionSizeTier: sizeTier,
    };
  }

  function persist(next: SharedToolSettings, message: string) {
    saveSharedSettings(next);
    onApplied(next);
    setStatus(message);
  }

  function handleApplyRecipe(recipe: ToolQualityRecipe) {
    const next = applyToolQualityRecipe(currentShared(), recipe, toolId);
    persist(next, `Applied “${recipe.label}”`);
  }

  function handleSaveSession() {
    const recipe = buildSessionRecipeFromShared({
      shared: currentShared(),
      toolId,
    });
    setSessionRecipes(pushSessionRecipe(recipe));
    setStatus(`Saved “${recipe.label}”`);
  }

  function handleRestoreSession(recipe: SessionRecipe) {
    const next = applySessionRecipeShared(currentShared(), recipe);
    persist(next, `Restored “${recipe.label}”`);
  }

  function handleDeleteSession(id: string) {
    setSessionRecipes(deleteSessionRecipe(id));
    setStatus('Session snapshot removed');
  }

  return (
    <div className="ui-recipe-shell space-y-3">
      <div className="min-w-0 space-y-1">
        <p className="type-caption text-[var(--accent-text)]">Size &amp; quality path</p>
        <p
          className="break-words font-mono text-2xs leading-relaxed text-[var(--accent-text)]/90"
          title={explain}
        >
          {explain}
        </p>
      </div>

      {recipes.length > 0 ? (
        <div className="space-y-1.5">
          <p className="type-caption text-[var(--accent-text)]">Quality recipes</p>
          <div className="flex flex-wrap gap-1.5">
            {recipes.map(recipe => (
              <ChipButton
                key={recipe.id}
                active={false}
                title={formatToolQualityRecipeHint(recipe, toolId)}
                onClick={() => handleApplyRecipe(recipe)}
                className="px-2.5"
              >
                {recipe.label}
              </ChipButton>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="type-caption text-[var(--accent-text)]">Session snapshots</p>
          <Button
            type="button"
            variant="secondary"
            className="h-7 px-2.5 text-2xs"
            onClick={handleSaveSession}
          >
            Save session
          </Button>
        </div>
        {sessionRecipes.length === 0 ? (
          <p className="text-2xs leading-relaxed text-[var(--text-muted)]">
            Snapshot model, quality, LoRAs, and sampler/resolution for one-click restore.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {sessionRecipes.slice(0, 5).map(recipe => (
              <li
                key={recipe.id}
                className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--border-subtle)]/70 bg-[var(--bg-base)]/40 px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-[var(--text-primary)]">{recipe.label}</p>
                  <p className="truncate text-3xs text-[var(--text-muted)]">
                    {formatSessionRecipeSubtitle(recipe)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-7 shrink-0 px-2 text-2xs"
                  onClick={() => handleRestoreSession(recipe)}
                >
                  Restore
                </Button>
                <button
                  type="button"
                  className="shrink-0 rounded-md px-1.5 py-1 text-3xs text-[var(--text-muted)] transition hover:bg-[var(--bg-muted)]/80 hover:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                  onClick={() => handleDeleteSession(recipe.id)}
                  aria-label={`Delete ${recipe.label}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {status ? (
        <p className="text-2xs text-[var(--accent-text)]" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
