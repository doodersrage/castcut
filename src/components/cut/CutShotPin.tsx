'use client';

import { Button } from '@/components/ui/Button';
import type { CutPinState } from '@/lib/film/cut-pins';

/**
 * A shot's pin on its Cut card (R5, cut-pins.ts): following its source, pinned (click to let it
 * follow again), a new take offered (use it here / for every copy / keep this one), or its
 * source gone (it plays on from its pin).
 */
export default function CutShotPin({
  shotKey,
  state,
  hasCopies,
  disabled,
  onToggle,
  onUse,
  onKeep,
  onBack,
}: {
  shotKey: string;
  state: CutPinState | undefined;
  /** The shot has copies in this edit ("Use for every copy" then means something). */
  hasCopies: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onUse: (everywhere: boolean) => void;
  onKeep: () => void;
  /** "Back to the earlier take" (M4 F2): shown when the shot took a new take with Use it here. */
  onBack?: () => void;
}) {
  if (!state) return null;
  const testId = `cut-pin-${shotKey}`;
  if (state.state === 'follows') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-2xs text-[var(--text-muted)]">
        <span data-testid={testId} data-pin="follows">
          Follows its source — a new kept take shows here
        </span>
        <Button
          variant="quiet"
          type="button"
          className="text-2xs hover:underline"
          disabled={disabled}
          data-testid={`${testId}-toggle`}
          title="Keep this picture or clip in the cut, whatever its source keeps next"
          onClick={onToggle}
        >
          Pin
        </Button>
      </div>
    );
  }
  if (state.state === 'pinned' || state.state === 'source-gone') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-2xs text-[var(--text-muted)]">
        <span data-testid={testId} data-pin={state.state}>
          {state.state === 'pinned'
            ? 'Pinned to the take it was cut with'
            : 'Its source is gone — playing the take it was cut with'}
        </span>
        <Button
          variant="quiet"
          type="button"
          className="text-2xs hover:underline"
          disabled={disabled}
          data-testid={`${testId}-toggle`}
          title={
            state.state === 'pinned'
              ? 'Let this shot follow its source again (its newest kept take)'
              : 'Let it go: with its source gone, the shot leaves the cut'
          }
          onClick={onToggle}
        >
          Unpin
        </Button>
        {state.state === 'pinned' && state.earlier && onBack ? (
          <Button
            variant="quiet"
            type="button"
            className="text-2xs hover:underline"
            disabled={disabled}
            data-testid={`${testId}-back`}
            title="Play the take this shot had before, with the trim it had then"
            onClick={onBack}
          >
            Back to the earlier take
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--accent-border)] px-2 py-1 text-2xs"
      role="group"
      aria-label="A new take is available"
      data-testid={testId}
      data-pin="new-take"
    >
      <span className="font-medium text-[var(--accent-text)]">New take available</span>
      <Button
        variant="quiet"
        type="button"
        className="text-2xs hover:underline"
        disabled={disabled}
        data-testid={`${testId}-use`}
        title="This shot plays the new take (a clip's trim stays when it fits the new clip; you can go back)"
        onClick={() => onUse(false)}
      >
        Use it here
      </Button>
      {hasCopies ? (
        <Button
          variant="quiet"
          type="button"
          className="text-2xs hover:underline"
          disabled={disabled}
          data-testid={`${testId}-use-all`}
          title="This shot and its copies in this edit play the new take (saved versions keep theirs)"
          onClick={() => onUse(true)}
        >
          Use for every copy
        </Button>
      ) : null}
      <Button
        variant="quiet"
        type="button"
        className="text-2xs hover:underline"
        disabled={disabled}
        data-testid={`${testId}-keep`}
        title="Keep the take this shot was cut with"
        onClick={onKeep}
      >
        Keep this one
      </Button>
    </div>
  );
}
