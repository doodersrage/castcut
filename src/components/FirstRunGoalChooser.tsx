'use client';

import Link from 'next/link';
import { FIRST_RUN_GOAL_OPTIONS, saveFirstRunGoal } from '@/lib/first-run-goal';
import { saveWorkspaceMode } from '@/lib/workspace-mode';
import { ToolSection } from '@/components/ui/ToolPageShell';

type FirstRunGoalChooserProps = {
  title?: string;
  description?: string;
  /** Persist goal + Play mode before navigation (default true). */
  persist?: boolean;
};

export default function FirstRunGoalChooser({
  title = 'What do you want to make?',
  description = 'Four paths into the studio. Play stays the flagship film loop.',
  persist = true,
}: FirstRunGoalChooserProps) {
  return (
    <ToolSection title={title} description={description} data-testid="first-run-goal-chooser">
      <div className="grid gap-2 sm:grid-cols-2">
        {FIRST_RUN_GOAL_OPTIONS.map(option => (
          <Link
            key={option.id}
            href={option.cta.href}
            data-testid={`first-run-goal-${option.id}`}
            className="ui-choice-card block text-left"
            onClick={() => {
              if (!persist) {
                return;
              }
              saveFirstRunGoal(option.id);
              if (option.id === 'character' || option.id === 'film') {
                saveWorkspaceMode('play');
              }
            }}
          >
            <span className="block text-sm font-medium text-[var(--text-primary)]">
              {option.label}
            </span>
            <span className="type-caption mt-1 block text-[var(--text-muted)]">
              {option.description}
            </span>
          </Link>
        ))}
      </div>
    </ToolSection>
  );
}
