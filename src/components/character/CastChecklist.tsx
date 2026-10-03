'use client';

import UiIcon from '@/components/ui/UiIcon';
import type {
  CastChecklist as CastChecklistModel,
  CastChecklistTarget,
} from '@/lib/cast-checklist';

type CastChecklistProps = {
  checklist: CastChecklistModel;
  /** Open a tab on this Cast home. */
  onTab: (tab: Extract<CastChecklistTarget, { kind: 'tab' }>['tab']) => void;
  /** Go to another page (the Cast is applied first). */
  go: (href: string) => void;
};

/**
 * "What's next" on the Cast home: each step of making a film with this Cast, done or not, the
 * first one not done marked Next. Folds to one line once everything is done.
 */
export default function CastChecklist({ checklist, onTab, go }: CastChecklistProps) {
  const { items, doneCount, nextId, allDone } = checklist;
  const open = (target: CastChecklistTarget) => {
    if (target.kind === 'tab') {
      onTab(target.tab);
    } else {
      go(target.href);
    }
  };

  return (
    <details
      // A fresh element when everything gets done, so it folds then (and opens again if a step
      // is undone) without fighting the viewer's own open/close in between.
      key={allDone ? 'done' : 'todo'}
      open={!allDone}
      className="group rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-3 py-2"
      data-testid="cast-checklist"
      data-all-done={allDone ? 'true' : 'false'}
    >
      <summary className="flex cursor-pointer items-center gap-2 text-[var(--text-secondary)]">
        <span className="type-caption font-medium text-[var(--text-primary)]">What’s next</span>
        <span className="type-caption text-[var(--text-muted)]" data-testid="cast-checklist-count">
          {allDone ? `All ${items.length} done` : `${doneCount} of ${items.length} done`}
        </span>
      </summary>
      <ol className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(item => {
          const isNext = item.id === nextId;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => open(item.target)}
                className={`flex w-full min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                  isNext
                    ? 'border-[var(--accent-border)] bg-[var(--accent-muted)]'
                    : 'border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--bg-active)]'
                }`}
                aria-label={`${item.label}: ${item.done ? 'done' : 'not done'}, ${item.detail}. ${item.action}`}
                aria-current={isNext ? 'step' : undefined}
                data-testid={`cast-checklist-${item.id}`}
                data-done={item.done ? 'true' : 'false'}
                data-next={isNext ? 'true' : undefined}
              >
                <span
                  aria-hidden
                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    item.done
                      ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
                      : 'border-[var(--border-subtle)] text-transparent'
                  }`}
                >
                  {item.done ? <UiIcon name="check" size={12} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[12px] font-medium ${
                      item.done ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'
                    }`}
                  >
                    {item.label}
                  </span>
                  <span className="type-caption block truncate text-[var(--text-muted)]">
                    {item.detail}
                  </span>
                </span>
                {isNext ? (
                  <span
                    className="shrink-0 rounded-md bg-[var(--accent-text)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--bg-base,white)]"
                    data-testid="cast-checklist-next"
                  >
                    Next
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
