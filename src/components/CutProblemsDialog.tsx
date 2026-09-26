'use client';

import { useEffect, useId } from 'react';
import { Button } from '@/components/ui/Button';
import ModalPortal from '@/components/ui/ModalPortal';
import type { CutShotProblem } from '@/lib/film-cut-plan';

export type CutProblemsAction = 'retry' | 'leave-out' | 'cut-anyway' | 'cancel';

/**
 * Before a cut: shots Auto-review flagged or that missed their pose / face. Retry them first,
 * leave them out of this cut, or cut anyway.
 */
export default function CutProblemsDialog({
  problems,
  onResolve,
}: {
  problems: CutShotProblem[] | null;
  onResolve: (action: CutProblemsAction) => void;
}) {
  const titleId = useId();
  const open = Boolean(problems && problems.length > 0);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onResolve('cancel');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onResolve, open]);
  if (!problems || problems.length === 0) return null;
  const count = problems.length;
  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--bg-base)]/70 p-4 backdrop-blur-sm"
        role="presentation"
        onClick={() => onResolve('cancel')}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-testid="cut-problems"
          className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
          onClick={event => event.stopPropagation()}
        >
          <h2 id={titleId} className="type-heading">
            {count === 1 ? '1 shot needs a look' : `${count} shots need a look`}
          </h2>
          <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
            {problems.map(problem => (
              <li key={problem.key} data-testid={`cut-problem-${problem.key}`}>
                <span className="font-medium text-[var(--text-primary)]">{problem.title}</span> —{' '}
                {problem.reasons.join(', ')}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              data-testid="cut-problems-retry"
              onClick={() => onResolve('retry')}
            >
              Retry {count === 1 ? 'it' : 'them'} first
            </Button>
            <Button
              size="sm"
              variant="secondary"
              data-testid="cut-problems-leave-out"
              onClick={() => onResolve('leave-out')}
            >
              Leave {count === 1 ? 'it' : 'them'} out
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-testid="cut-problems-cut-anyway"
              onClick={() => onResolve('cut-anyway')}
            >
              Cut anyway
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
