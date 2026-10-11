'use client';

import { useSyncExternalStore } from 'react';
import {
  WORKSPACE_MODE_CHANGED_EVENT,
  WORKSPACE_MODE_OPTIONS,
  hasChosenWorkspaceMode,
  saveWorkspaceMode,
  type WorkspaceMode,
} from '@/lib/workspace-mode';

function subscribeWorkspaceChosen(onChange: () => void): () => void {
  window.addEventListener(WORKSPACE_MODE_CHANGED_EVENT, onChange);
  return () => window.removeEventListener(WORKSPACE_MODE_CHANGED_EVENT, onChange);
}
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { Button } from '@/components/ui/Button';
import { APP_HAS_PLAY } from '@/lib/app-profile';

const DEFAULT_MODE: WorkspaceMode = APP_HAS_PLAY ? 'play' : 'studio';

type WorkspaceModeControlProps = {
  /** Compact chip row for the sidebar footer. */
  variant?: 'panel' | 'chips';
  onChanged?: (mode: WorkspaceMode) => void;
};

export default function WorkspaceModeControl({
  variant = 'panel',
  onChanged,
}: WorkspaceModeControlProps) {
  // Read through the store: called during render it said "chosen" on the server and "not
  // chosen" in a fresh browser, and the tip paragraph broke hydration (React #418 on Profile).
  const chosen = useSyncExternalStore(subscribeWorkspaceChosen, hasChosenWorkspaceMode, () => true);
  const mode = useWorkspaceMode();

  function apply(next: WorkspaceMode) {
    saveWorkspaceMode(next);
    onChanged?.(next);
  }

  if (variant === 'chips') {
    return (
      <div className="space-y-1.5 px-1">
        <p className="type-caption text-[var(--text-muted)]">Workspace</p>
        <div className="flex flex-wrap gap-1.5">
          {WORKSPACE_MODE_OPTIONS.map(option => {
            const active = mode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                title={option.description}
                aria-pressed={active}
                onClick={() => apply(option.id)}
                className={`rounded-[var(--radius-md)] px-2.5 py-1.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                  active
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {option.label}
                <span className="ml-1 opacity-70">{option.shortTag}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="type-heading">Workspace</p>
        <p className="type-caption mt-1 text-[var(--text-muted)]">
          {DEFAULT_MODE === 'play'
            ? 'Film for making, Studio for more control — and inside Studio, More tools for specialist tools and workflow graphs. Your film carries across.'
            : 'Make · Control · Build — how much of the app shows in the sidebar and shared controls.'}
        </p>
      </div>
      <div className="grid gap-2">
        {WORKSPACE_MODE_OPTIONS.map(option => {
          const active = mode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => apply(option.id)}
              className={`rounded-[var(--radius-lg)] border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                active
                  ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] shadow-[var(--shadow-soft)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              <span className="block text-sm font-medium text-[var(--text-primary)]">
                {option.label}
                <span className="type-caption ml-2 font-normal text-[var(--text-muted)]">
                  {option.shortTag}
                </span>
              </span>
              <span className="type-caption mt-1 block text-[var(--text-muted)]">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
      {!chosen ? (
        <p className="type-caption text-[var(--text-muted)]">
          Tip: pick once here — you can change anytime from the sidebar or Profile.
        </p>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="!px-0"
        onClick={() => apply(DEFAULT_MODE)}
      >
        {DEFAULT_MODE === 'play' ? 'Back to Film (the default)' : 'Reset to Studio'}
      </Button>
    </div>
  );
}
