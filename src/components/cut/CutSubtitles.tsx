'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import UploadButton from '@/components/ui/UploadButton';
import { cuesToSrt } from '@/lib/video/cut-subtitles';
import type { ShotSubtitleCue } from '@/lib/media/kind';
import {
  cleanSubtitleCues,
  filmSubtitleCues,
  joinSubtitleCues,
  matchSrtToShots,
  parseSrt,
  splitShotSubtitle,
  splitSubtitleCue,
  subtitleIssues,
  type ShotSubtitle,
  type SrtShotMatch,
} from '@/lib/video/cut-subtitle-track';

export type CutSubtitleRow = ShotSubtitle & {
  title: string;
  /** What it says from its source (the line or narration), shown when nothing is set. */
  sourceText: string;
  /** Set in Cut: text ('' = none) and the window, or timed cues (M10 T3). */
  set: { text?: string; fromSec?: number; toSec?: number; cues?: ShotSubtitleCue[] };
};

/** A shot's cues as its subtitle: the cues, and their text as its text. */
const withCues = (cues: readonly ShotSubtitleCue[]): CutSubtitleRow['set'] => {
  const clean = cleanSubtitleCues(cues);
  return clean.length
    ? { text: clean.map(cue => cue.text.replace(/\s*\n\s*/g, ' ')).join(' '), cues: clean }
    : {};
};

/**
 * A shot's subtitle as timed cues (M10 T3): each its text and times in the shot, Split (at its
 * sentence break, else its middle word) and Join with the next; One subtitle goes back to one.
 */
function SubtitleCueRows({
  row,
  disabled,
  onChange,
}: {
  row: CutSubtitleRow;
  disabled?: boolean;
  onChange: (key: string, set: CutSubtitleRow['set']) => void;
}) {
  const cues = row.set.cues ?? [];
  const put = (next: readonly ShotSubtitleCue[]) => onChange(row.key, withCues(next));
  const edit = (index: number, patch: Partial<ShotSubtitleCue>) =>
    put(cues.map((cue, at) => (at === index ? { ...cue, ...patch } : cue)));
  return (
    <ol className="ml-2 w-full space-y-1 border-l border-[var(--border-subtle)] pl-3 sm:ml-[8.5rem]">
      {cues.map((cue, index) => (
        <li
          key={`${index}-${cue.fromSec}-${cue.text}`}
          className="flex flex-wrap items-center gap-2"
          data-testid={`cut-subtitle-cue-${row.key}-${index}`}
        >
          <input
            aria-label={`Subtitle cue ${index + 1} of ${row.title}`}
            className={`${FIELD} min-w-[10rem] flex-1`}
            defaultValue={cue.text}
            disabled={disabled}
            data-testid={`cut-subtitle-cue-text-${row.key}-${index}`}
            onBlur={event => {
              const value = event.target.value.trim();
              if (value && value !== cue.text) edit(index, { text: value });
            }}
          />
          <label className="type-caption flex items-center gap-1">
            from
            <input
              type="number"
              min={0}
              step={0.1}
              aria-label={`Cue ${index + 1} start in ${row.title} (seconds)`}
              className={`${FIELD} w-16`}
              defaultValue={cue.fromSec}
              disabled={disabled}
              data-testid={`cut-subtitle-cue-from-${row.key}-${index}`}
              onBlur={event => {
                const value = sec(event.target.value);
                if (value !== undefined && value !== cue.fromSec) edit(index, { fromSec: value });
              }}
            />
            to
            <input
              type="number"
              min={0}
              step={0.1}
              aria-label={`Cue ${index + 1} end in ${row.title} (seconds)`}
              className={`${FIELD} w-16`}
              defaultValue={cue.toSec}
              disabled={disabled}
              data-testid={`cut-subtitle-cue-to-${row.key}-${index}`}
              onBlur={event => {
                const value = sec(event.target.value);
                if (value !== undefined && value !== cue.toSec) edit(index, { toSec: value });
              }}
            />
            s
          </label>
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled || splitSubtitleCue(cues, index).length === cues.length}
            title="Two cues: at its sentence break, else its middle word"
            data-testid={`cut-subtitle-cue-split-${row.key}-${index}`}
            onClick={() => put(splitSubtitleCue(cues, index))}
          >
            Split
          </Button>
          {index < cues.length - 1 ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              title="One cue with the next"
              data-testid={`cut-subtitle-cue-join-${row.key}-${index}`}
              onClick={() => {
                const joined = joinSubtitleCues(cues, index);
                put(joined);
              }}
            >
              Join
            </Button>
          ) : null}
        </li>
      ))}
      <li>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          title="Back to one subtitle over the shot, the cues' text"
          data-testid={`cut-subtitle-cues-one-${row.key}`}
          onClick={() => {
            const set = withCues(cues);
            onChange(row.key, {
              ...(set.text ? { text: set.text } : {}),
              ...(cues[0] ? { fromSec: cues[0].fromSec } : {}),
              ...(cues.at(-1) ? { toSec: cues.at(-1)!.toSec } : {}),
            });
          }}
        >
          One subtitle
        </Button>
      </li>
    </ol>
  );
}

const FIELD =
  'rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5 text-sm';

const sec = (value: string) => {
  const number = Number(value);
  return value.trim() === '' || !Number.isFinite(number) || number < 0 ? undefined : number;
};

/**
 * Cut's subtitle track (M4 F5): each shot's subtitle — its line or narration, or text you set —
 * and where in the shot it shows; the checks a subtitle file should pass; an .srt out at any time;
 * and an .srt in, matched to the shots by time and shown before it applies.
 */
export default function CutSubtitles({
  rows,
  disabled,
  onChange,
  onApplySrt,
  onPick,
  filename,
}: {
  rows: CutSubtitleRow[];
  disabled?: boolean;
  onChange: (key: string, set: CutSubtitleRow['set']) => void;
  onApplySrt: (matches: SrtShotMatch[]) => void;
  onPick: (key: string) => void;
  filename: string;
}) {
  const [incoming, setIncoming] = useState<{
    matches: SrtShotMatch[];
    outside: number;
    unread: number;
  } | null>(null);
  const cues = useMemo(() => filmSubtitleCues(rows), [rows]);
  const issues = useMemo(() => subtitleIssues(cues), [cues]);
  const titleOf = (key: string) => rows.find(row => row.key === key)?.title ?? key;

  const download = () => {
    const blob = new Blob([cuesToSrt(cues)], { type: 'application/x-subrip;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-2" data-testid="cut-subtitles">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="type-caption flex-1 text-[var(--text-muted)]"
          data-testid="cut-subtitles-summary"
        >
          {cues.length
            ? `${cues.length} subtitle${cues.length === 1 ? '' : 's'} on ${rows.filter(row => row.text.trim()).length} shot${rows.filter(row => row.text.trim()).length === 1 ? '' : 's'}`
            : 'No subtitles yet — a shot with a line or narration has one; or type one in.'}
          {issues.length ? ` · ${issues.length} to look at` : cues.length ? ' · all readable' : ''}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || cues.length === 0}
          data-testid="cut-subtitles-export"
          onClick={download}
        >
          Export .srt
        </Button>
        <UploadButton
          label="Import .srt…"
          accept=".srt,application/x-subrip,text/plain"
          testId="cut-subtitles-import"
          disabled={disabled}
          onFile={file =>
            void file.text().then(text => {
              const parsed = parseSrt(text);
              setIncoming({ ...matchSrtToShots(parsed.cues, rows), unread: parsed.unread });
            })
          }
        />
      </div>

      {incoming ? (
        <div
          className="space-y-1 rounded-[var(--radius-sm)] border border-[var(--accent-border)] p-2"
          data-testid="cut-subtitles-incoming"
        >
          <p className="type-caption">
            {incoming.matches.length
              ? `The file’s subtitles on ${incoming.matches.length} shot${incoming.matches.length === 1 ? '' : 's'}`
              : 'Nothing in the file lines up with a shot.'}
            {incoming.outside ? ` · ${incoming.outside} past the end of the cut, left out` : ''}
            {incoming.unread ? ` · ${incoming.unread} not readable` : ''}
          </p>
          <ul className="space-y-0.5">
            {incoming.matches.map(match => (
              <li key={match.key} className="type-caption">
                <span className="font-medium">{titleOf(match.key)}</span> (
                {match.fromSec.toFixed(1)}–{match.toSec.toFixed(1)} s): {match.text}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={disabled || incoming.matches.length === 0}
              data-testid="cut-subtitles-apply"
              onClick={() => {
                onApplySrt(incoming.matches);
                setIncoming(null);
              }}
            >
              Use these subtitles
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIncoming(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {issues.length ? (
        <ul className="space-y-0.5" data-testid="cut-subtitles-issues">
          {issues.map((issue, at) => (
            <li key={at} className="type-caption ui-status-danger">
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      <ul className="space-y-1">
        {rows.map(row => {
          const set =
            row.set.text !== undefined ||
            row.set.fromSec !== undefined ||
            row.set.toSec !== undefined;
          if (row.set.cues?.length) {
            return (
              <li
                key={row.key}
                className="flex flex-wrap items-center gap-2"
                data-testid={`cut-subtitle-${row.key}`}
              >
                <Button
                  variant="quiet"
                  type="button"
                  className="w-32 truncate text-left text-sm font-medium hover:underline"
                  onClick={() => onPick(row.key)}
                >
                  {row.title}
                </Button>
                <span className="type-caption text-[var(--text-muted)]">
                  {row.set.cues.length} timed cues in {row.durSec.toFixed(1)} s
                </span>
                <SubtitleCueRows row={row} disabled={disabled} onChange={onChange} />
              </li>
            );
          }
          const splitInto = splitShotSubtitle(row);
          return (
            <li
              key={row.key}
              className="flex flex-wrap items-center gap-2"
              data-testid={`cut-subtitle-${row.key}`}
            >
              <Button
                variant="quiet"
                type="button"
                className="w-32 truncate text-left text-sm font-medium hover:underline"
                onClick={() => onPick(row.key)}
              >
                {row.title}
              </Button>
              <input
                aria-label={`Subtitle for ${row.title}`}
                className={`${FIELD} min-w-[12rem] flex-1`}
                placeholder={row.sourceText || 'No subtitle'}
                defaultValue={row.set.text ?? ''}
                key={`${row.key}-${row.set.text ?? ''}`}
                disabled={disabled}
                data-testid={`cut-subtitle-text-${row.key}`}
                onBlur={event => {
                  const value = event.target.value.trim();
                  // Left empty after None: still none.
                  if (!value && row.set.text === '') return;
                  const next = value ? value : undefined;
                  if (next !== row.set.text) onChange(row.key, { ...row.set, text: next });
                }}
              />
              <label className="type-caption flex items-center gap-1">
                from
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  aria-label={`Subtitle start in ${row.title} (seconds)`}
                  className={`${FIELD} w-16`}
                  defaultValue={row.set.fromSec ?? ''}
                  key={`${row.key}-from-${row.set.fromSec ?? ''}`}
                  placeholder="auto"
                  disabled={disabled}
                  onBlur={event => {
                    const value = sec(event.target.value);
                    if (value !== row.set.fromSec)
                      onChange(row.key, { ...row.set, fromSec: value });
                  }}
                />
                to
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  aria-label={`Subtitle end in ${row.title} (seconds)`}
                  className={`${FIELD} w-16`}
                  defaultValue={row.set.toSec ?? ''}
                  key={`${row.key}-to-${row.set.toSec ?? ''}`}
                  placeholder="auto"
                  disabled={disabled}
                  onBlur={event => {
                    const value = sec(event.target.value);
                    if (value !== row.set.toSec) onChange(row.key, { ...row.set, toSec: value });
                  }}
                />
                s of {row.durSec.toFixed(1)}
              </label>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled || splitInto.length < 2}
                title="Timed cues: its phrases, each with its own text and times"
                data-testid={`cut-subtitle-split-${row.key}`}
                onClick={() => onChange(row.key, withCues(splitInto))}
              >
                Split into cues
              </Button>
              {set ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  title="Back to the line or narration, where it's said"
                  onClick={() => onChange(row.key, {})}
                >
                  Reset
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled || row.set.text === ''}
                title="No subtitle on this shot"
                data-testid={`cut-subtitle-none-${row.key}`}
                onClick={() => onChange(row.key, { text: '' })}
              >
                None
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
