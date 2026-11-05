'use client';

import { Button } from '@/components/ui/Button';
import { reviewTimeLabel } from '@/lib/film/review-notes';
import type { CutSubtitleRow } from '@/components/cut/CutSubtitles';

/**
 * Cut → Transcript: the cut read as text — every shot's spoken line (or narration) in film order,
 * so the film can be edited the way a script is: click a line to jump to it, Cut to leave its
 * shot out (Undo or the Shots tab bring it back). One line is one shot; the words themselves are
 * edited under Subtitles.
 */
export default function CutTranscript({
  rows,
  activeKey,
  disabled,
  onSeek,
  onLeaveOut,
}: {
  rows: CutSubtitleRow[];
  activeKey: string | null;
  disabled?: boolean;
  onSeek: (timeSec: number) => void;
  onLeaveOut: (key: string) => void;
}) {
  const spoken = rows.filter(row => (row.set.text ?? row.text).trim()).length;
  if (!rows.length) {
    return <p className="type-caption text-[var(--text-muted)]">No shots in the cut yet.</p>;
  }
  return (
    <div className="space-y-2" data-testid="cut-transcript">
      <p className="type-caption text-[var(--text-muted)]">
        {spoken} of {rows.length} shots have words. Click a line to jump there; Cut leaves its shot
        out.
      </p>
      <ol className="space-y-1">
        {rows.map(row => {
          const words = (row.set.text ?? row.text).trim();
          return (
            <li
              key={row.key}
              className={`group flex items-start gap-2 rounded-[var(--radius-sm)] px-2 py-1 ${row.key === activeKey ? 'bg-[var(--accent-muted)]' : 'hover:bg-[var(--bg-hover)]'}`}
              data-testid={`cut-transcript-line-${row.key}`}
            >
              <Button
                variant="plain"
                className="min-w-0 flex-1 text-left text-sm"
                onClick={() => onSeek(row.startSec)}
              >
                <span className="type-caption mr-2 tabular-nums text-[var(--text-muted)]">
                  {reviewTimeLabel(row.startSec)}
                </span>
                {words ? (
                  <span className="text-[var(--text-primary)]">{words}</span>
                ) : (
                  <span className="italic text-[var(--text-muted)]">{row.title} — no words</span>
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                className="opacity-60 group-hover:opacity-100"
                aria-label={`Cut “${words || row.title}”`}
                data-testid={`cut-transcript-cut-${row.key}`}
                onClick={() => onLeaveOut(row.key)}
              >
                Cut
              </Button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
