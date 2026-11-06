'use client';

import { useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
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
  soundOf,
  fixHrefOf,
}: {
  rows: CutSubtitleRow[];
  /**
   * The dialogue pass: who says a shot's words and whether its sound is there — a talking clip,
   * a line on a still (no sound until it is animated), or a voice-over.
   */
  soundOf?: (
    key: string
  ) => { speaker?: string; state: 'talking' | 'silent' | 'voice-over' } | null;
  /** Where a line is changed and said again (its Day slot, its Scene, its Story). */
  fixHrefOf?: (key: string) => string | null;
  activeKey: string | null;
  disabled?: boolean;
  onSeek: (timeSec: number) => void;
  onLeaveOut: (key: string) => void;
}) {
  const spoken = rows.filter(row => (row.set.text ?? row.text).trim()).length;
  // The pass: only the lines whose sound is missing (a line on a still).
  const [onlySilent, setOnlySilent] = useState(false);
  const silent = soundOf ? rows.filter(row => soundOf(row.key)?.state === 'silent').length : 0;
  const shown =
    onlySilent && soundOf ? rows.filter(row => soundOf(row.key)?.state === 'silent') : rows;
  if (!rows.length) {
    return <p className="type-caption text-[var(--text-muted)]">No shots in the cut yet.</p>;
  }
  return (
    <div className="space-y-2" data-testid="cut-transcript">
      <p className="type-caption text-[var(--text-muted)]">
        {spoken} of {rows.length} shots have words. Click a line to jump there; Cut leaves its shot
        out.
      </p>
      {silent > 0 ? (
        <label className="type-caption flex items-center gap-1.5 text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={onlySilent}
            data-testid="cut-transcript-only-silent"
            onChange={event => setOnlySilent(event.target.checked)}
          />
          Only the {silent} line{silent === 1 ? '' : 's'} with no sound yet (on a still — animate
          it)
        </label>
      ) : null}
      <ol className="space-y-1">
        {shown.map(row => {
          const words = (row.set.text ?? row.text).trim();
          const sound = words ? soundOf?.(row.key) : null;
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
                {sound?.speaker ? (
                  <span className="type-caption mr-1.5 font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                    {sound.speaker}
                    {sound.state === 'voice-over' ? ' (V.O.)' : ''}
                  </span>
                ) : null}
                {words ? (
                  <span className="text-[var(--text-primary)]">{words}</span>
                ) : (
                  <span className="italic text-[var(--text-muted)]">{row.title} — no words</span>
                )}
              </Button>
              {sound ? (
                <span
                  className={`type-caption shrink-0 rounded px-1.5 ${
                    sound.state === 'silent'
                      ? 'bg-[var(--tint-warning-bg,var(--bg-muted))] text-[var(--tint-warning-text)]'
                      : 'text-[var(--text-muted)]'
                  }`}
                  data-testid={`cut-transcript-sound-${row.key}`}
                  data-state={sound.state}
                  title={
                    sound.state === 'silent'
                      ? 'A line on a still: no sound until the shot is animated (a talking clip)'
                      : sound.state === 'talking'
                        ? 'A talking clip: said in the Cast’s voice'
                        : 'A voice-over: recorded when the film is cut'
                  }
                >
                  {sound.state === 'silent'
                    ? 'No sound yet'
                    : sound.state === 'talking'
                      ? 'Talking clip'
                      : 'Voice-over'}
                </span>
              ) : null}
              {sound && fixHrefOf?.(row.key) ? (
                <ButtonLink
                  href={fixHrefOf(row.key)!}
                  size="sm"
                  variant="ghost"
                  className="opacity-60 group-hover:opacity-100"
                  data-testid={`cut-transcript-fix-${row.key}`}
                >
                  Fix the line
                </ButtonLink>
              ) : null}
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
