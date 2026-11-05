'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { formatCutTimecode } from '@/lib/film/cut-preview';
import {
  chapterListText,
  FILM_RANGE_MIN_SEC,
  type FilmChapter,
  type FilmRange,
} from '@/lib/video/film-finish';

/**
 * Cut → Export: render just a part of the film — From / To set at the playhead, or the monitor's
 * loop — as a quick review copy (downloaded, not kept). And the last film's chapters as a list to
 * paste into a video description.
 */
export default function CutPartRender({
  time,
  total,
  loop,
  chapters,
  chapterMarkers,
  disabled,
  onRender,
  onMaster,
}: {
  time: number;
  total: number;
  /** The monitor's loop range, when one is on. */
  loop: { from: number; to: number } | null;
  /** The last film's chapters (file seconds), when it had any. */
  chapters: FilmChapter[] | null;
  /** How many markers are chapters (Notes → Your markers). */
  chapterMarkers: number;
  disabled?: boolean;
  onRender: (part: FilmRange) => void;
  /** Render the whole film as a ProRes master (.mov), downloaded. */
  onMaster?: () => void;
}) {
  const [range, setRange] = useState<FilmRange | null>(null);
  const [copied, setCopied] = useState(false);
  const from = range?.fromSec ?? 0;
  const to = Math.min(total, range?.toSec ?? total);
  const valid = to - from >= FILM_RANGE_MIN_SEC;
  return (
    <div className="space-y-1.5" data-testid="cut-part">
      <details>
        <summary className="type-caption cursor-pointer font-medium">Render just a part</summary>
        <div className="mt-1.5 space-y-1.5">
          <p className="type-caption text-[var(--text-muted)]">
            A quick review copy of one scene — the same mix and look, downloaded, not kept on the
            Cast.
          </p>
          <div className="flex flex-wrap items-center gap-1.5 type-caption">
            <span className="tabular-nums" data-testid="cut-part-range">
              {formatCutTimecode(from)} → {formatCutTimecode(to)}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              data-testid="cut-part-from"
              onClick={() => setRange({ fromSec: Math.min(time, to), toSec: to })}
            >
              From the playhead
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              data-testid="cut-part-to"
              onClick={() =>
                setRange({ fromSec: Math.min(from, time), toSec: Math.max(time, from) })
              }
            >
              To the playhead
            </Button>
            {loop ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                data-testid="cut-part-loop"
                onClick={() => setRange({ fromSec: loop.from, toSec: loop.to })}
              >
                The loop
              </Button>
            ) : null}
            {range ? (
              <Button
                size="sm"
                variant="underline"
                disabled={disabled}
                onClick={() => setRange(null)}
              >
                Whole film
              </Button>
            ) : null}
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || !valid || !range}
            data-testid="cut-part-render"
            title={!range ? 'Set From or To first' : undefined}
            onClick={() => onRender({ fromSec: from, toSec: to })}
          >
            Render this part ({Math.round(to - from)} s)
          </Button>
        </div>
      </details>
      {onMaster ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            data-testid="cut-master"
            title="The whole film as ProRes 422 HQ (10-bit) with 24-bit sound, in a .mov — for a colourist, a broadcaster or a festival. Large; downloaded, not kept on the Cast"
            onClick={onMaster}
          >
            Render a ProRes master
          </Button>
        </div>
      ) : null}
      {chapterMarkers > 0 || chapters?.length ? (
        <div className="flex flex-wrap items-center gap-1.5 type-caption text-[var(--text-muted)]">
          <span data-testid="cut-chapters-note">
            {chapters?.length
              ? `The last film has ${chapters.length} chapters.`
              : `${chapterMarkers} chapter marker${chapterMarkers === 1 ? '' : 's'} — written into the film when you cut it.`}
          </span>
          {chapters?.length ? (
            <Button
              size="sm"
              variant="underline"
              data-testid="cut-chapters-copy"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(chapterListText(chapters))
                  .then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  })
                  .catch(() => undefined);
              }}
            >
              {copied ? 'Copied' : 'Copy the chapter list'}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
