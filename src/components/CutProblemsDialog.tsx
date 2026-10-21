'use client';

import { Button } from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import type { CutShotProblem } from '@/lib/film/cut-plan';

export type CutProblemsAction = 'retry' | 'leave-out' | 'cut-anyway' | 'cancel';

/**
 * Before a cut: shots Auto-review flagged or that missed their pose / face. Retry them first,
 * leave them out of this cut, or cut anyway. Escape, the backdrop and ✕ cancel.
 */
export default function CutProblemsDialog({
  problems,
  onResolve,
}: {
  problems: CutShotProblem[] | null;
  onResolve: (action: CutProblemsAction) => void;
}) {
  const open = Boolean(problems && problems.length > 0);
  const count = problems?.length ?? 0;
  return (
    <Dialog
      open={open}
      onClose={() => onResolve('cancel')}
      title={count === 1 ? '1 shot needs a look' : `${count} shots need a look`}
      testId="cut-problems"
      footer={
        <>
          <Button
            size="sm"
            variant="ghost"
            data-testid="cut-problems-cut-anyway"
            onClick={() => onResolve('cut-anyway')}
          >
            Cut anyway
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
            variant="primary"
            data-testid="cut-problems-retry"
            onClick={() => onResolve('retry')}
          >
            Retry {count === 1 ? 'it' : 'them'} first
          </Button>
        </>
      }
    >
      <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
        {(problems ?? []).map(problem => (
          <li key={problem.key} data-testid={`cut-problem-${problem.key}`}>
            <span className="font-medium text-[var(--text-primary)]">{problem.title}</span> —{' '}
            {problem.reasons.join(', ')}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
