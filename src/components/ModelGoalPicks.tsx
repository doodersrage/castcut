'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { MODEL_GOAL_OPTIONS, resolveModelForGoal, type ModelGoalId } from '@/lib/model-goals';
import type { ComfyImageModel } from '@/lib/comfy-models/client';

type ModelGoalPicksProps = {
  currentModel: ComfyImageModel;
  allowedModels?: readonly ComfyImageModel[];
  onApplyModel: (model: ComfyImageModel) => void;
};

export default function ModelGoalPicks({
  currentModel,
  allowedModels,
  onApplyModel,
}: ModelGoalPicksProps) {
  const apply = (goalId: ModelGoalId) => {
    const option = MODEL_GOAL_OPTIONS.find(entry => entry.id === goalId);
    if (!option) {
      return;
    }
    if (option.href && (goalId === 'video' || goalId === 'edit')) {
      // Navigation handled by Link; still apply model when staying on-tool.
      if (goalId === 'edit') {
        const model = resolveModelForGoal(goalId, allowedModels);
        if (model) {
          onApplyModel(model);
        }
      }
      return;
    }
    const model = resolveModelForGoal(goalId, allowedModels);
    if (model) {
      onApplyModel(model);
    }
  };

  return (
    <div className="space-y-2" data-testid="model-goal-picks">
      <p className="type-caption text-[var(--text-muted)]">
        Choose a goal — full model list stays under the picker.
      </p>
      <div className="flex flex-wrap gap-2">
        {MODEL_GOAL_OPTIONS.map(option => {
          const resolved = resolveModelForGoal(option.id, allowedModels);
          const active = resolved === currentModel;
          if (option.href && (option.id === 'video' || option.id === 'edit')) {
            return (
              <Link
                key={option.id}
                href={option.href}
                className="ui-btn-secondary inline-flex h-8 items-center rounded-[var(--radius-md)] px-3 text-xs"
                title={option.description}
                data-testid={`model-goal-${option.id}`}
                onClick={() => apply(option.id)}
              >
                {option.label}
              </Link>
            );
          }
          return (
            <Button
              key={option.id}
              type="button"
              size="sm"
              variant={active ? 'primary' : 'secondary'}
              title={option.description}
              data-testid={`model-goal-${option.id}`}
              onClick={() => apply(option.id)}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
