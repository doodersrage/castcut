'use client';

/** "↶ Undo Afternoon's beat · ↷ Redo" beside the Day plan (day-plan-history.ts). */
export default function DayPlanUndo({
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onUndo,
  onRedo,
}: {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;
  onUndo: () => void;
  onRedo: () => void;
}) {
  if (!canUndo && !canRedo) return null;
  const button =
    'type-caption rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div className="flex flex-wrap items-center gap-1" data-testid="day-plan-undo">
      <button
        type="button"
        className={button}
        disabled={!canUndo}
        title={`Undo ${undoLabel}`}
        data-testid="day-plan-undo-button"
        onClick={onUndo}
      >
        <span aria-hidden>↶ </span>Undo {undoLabel}
      </button>
      {canRedo ? (
        <button
          type="button"
          className={button}
          title={`Redo ${redoLabel}`}
          data-testid="day-plan-redo-button"
          onClick={onRedo}
        >
          <span aria-hidden>↷ </span>Redo
        </button>
      ) : null}
    </div>
  );
}
