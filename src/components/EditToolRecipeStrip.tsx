'use client';

import { useMemo, useState } from 'react';
import { ChipButton } from '@/components/ui/Field';
import {
  applyToolQualityRecipe,
  formatToolQualityRecipeHint,
  recipesForTool,
} from '@/lib/app/tool-quality-recipes';
import {
  applySessionRecipeShared,
  formatSessionRecipeSubtitle,
  loadSessionRecipes,
} from '@/lib/prompt/session-recipes';
import {
  loadSettingsCache,
  saveSharedSettings,
  type SharedToolSettings,
} from '@/lib/settings/cache';
import {
  normalizeQueueQualityProfile,
  type QueueQualityProfile,
} from '@/lib/queue/quality-profile';
import {
  normalizeResolutionOrientation,
  normalizeResolutionSizeTier,
} from '@/lib/model/resolution-defaults';

type EditToolRecipeStripProps = {
  toolId: string;
  shared: SharedToolSettings;
  onApplied: (next: SharedToolSettings) => void;
  /** Compact sticky-bar variant hides session restore list. */
  compact?: boolean;
};

/** Sticky/main-column quality recipe chips for edit tools (Compose/Inpaint/Outpaint/Refine). */
export default function EditToolRecipeStrip({
  toolId,
  shared,
  onApplied,
  compact = false,
}: EditToolRecipeStripProps) {
  const [sessionRecipes] = useState(() =>
    typeof window === 'undefined' ? [] : loadSessionRecipes()
  );
  const [status, setStatus] = useState<string | null>(null);

  const recipes = useMemo(
    () => recipesForTool(shared.toolQualityRecipes ?? [], toolId),
    [shared.toolQualityRecipes, toolId]
  );

  const qualityProfile = normalizeQueueQualityProfile(shared.queueQualityProfile);
  const orientation = normalizeResolutionOrientation(shared.modelResolutionOrientation);
  const sizeTier = normalizeResolutionSizeTier(shared.modelResolutionSizeTier);

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

  if (recipes.length === 0 && sessionRecipes.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="edit-tool-recipe-strip"
      className="ui-recipe-shell flex flex-wrap items-center gap-2"
    >
      <span className="type-caption shrink-0 text-[var(--accent-text)]">Recipes</span>
      {recipes.map(recipe => (
        <ChipButton
          key={recipe.id}
          active={false}
          title={formatToolQualityRecipeHint(recipe, toolId)}
          onClick={() => {
            const next = applyToolQualityRecipe(currentShared(), recipe, toolId);
            persist(next, `Applied “${recipe.label}”`);
          }}
          className="px-2.5"
        >
          {recipe.label}
        </ChipButton>
      ))}
      {!compact
        ? sessionRecipes.slice(0, 3).map(recipe => (
            <ChipButton
              key={recipe.id}
              active={false}
              title={formatSessionRecipeSubtitle(recipe)}
              onClick={() => {
                const next = applySessionRecipeShared(currentShared(), recipe);
                persist(next, `Restored “${recipe.label}”`);
              }}
              className="px-2.5"
            >
              {recipe.label}
            </ChipButton>
          ))
        : null}
      {status ? (
        <span className="type-caption text-[var(--accent-text)]" role="status">
          {status}
        </span>
      ) : null}
    </div>
  );
}

/** Effective quality label for seed/clarity readouts. */
export function formatEffectiveQueueQualityLabel(profile: QueueQualityProfile): string {
  if (profile === 'followSettings') {
    return 'Follow sidebar';
  }
  if (profile === 'draft') {
    return 'Draft';
  }
  if (profile === 'final') {
    return 'Final';
  }
  return 'Max';
}
