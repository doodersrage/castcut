'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Field';
import { DAY_SCRIPT_MAX_CARDS, parseDayScript, type DayScript } from '@/lib/day-script-import';

/**
 * "Import a script…" under Day's idea row: paste (or open) a Fountain screenplay or a plain
 * outline, see the cards it makes, then use them — each scene a card with its place, beat and
 * the lead's line, all editable before anything renders (day-script-import.ts).
 */
export default function DayScriptImport({
  busy,
  stillCount = 0,
  onImport,
  className = '',
}: {
  busy?: boolean;
  /** Stills on the board now — they leave the cards (kept in the Gallery); asked first. */
  stillCount?: number;
  onImport: (script: DayScript) => { used: number; dropped: number };
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const script = useMemo(() => (text.trim() ? parseDayScript(text) : null), [text]);
  const shown = script?.scenes.slice(0, DAY_SCRIPT_MAX_CARDS) ?? [];

  if (!open) {
    return (
      <div className={className}>
        <button
          type="button"
          className="ui-text-link type-caption"
          disabled={busy}
          data-testid="day-script-open"
          onClick={() => setOpen(true)}
        >
          Import a script…
        </button>
        {note ? (
          <p className="type-caption mt-1 text-[var(--text-muted)]" role="status">
            {note}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div className={`space-y-2 ${className}`} data-testid="day-script-import">
      <p className="type-caption text-[var(--text-muted)]">
        Paste a screenplay (Fountain: <code>INT. KITCHEN - MORNING</code>, action, an uppercase name
        over each line of dialogue) or a plain outline, one scene per line or paragraph. Each scene
        becomes a card — up to {DAY_SCRIPT_MAX_CARDS}.
      </p>
      <TextArea
        rows={6}
        value={text}
        placeholder={
          'INT. KITCHEN - MORNING\n\nShe pours coffee, still half asleep.\n\nEXT. PARK - AFTERNOON\n\nShe reads on a bench in the sun.'
        }
        data-testid="day-script-text"
        onChange={event => setText(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="ui-text-link type-caption cursor-pointer">
          Open a file…
          <input
            type="file"
            accept=".fountain,.txt,.md,text/plain"
            className="sr-only"
            data-testid="day-script-file"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void file.text().then(setText);
            }}
          />
        </label>
        {script ? (
          <span className="type-caption text-[var(--text-muted)]">
            {script.format === 'fountain' ? 'Screenplay' : 'Outline'} · {script.scenes.length} scene
            {script.scenes.length === 1 ? '' : 's'}
            {script.scenes.length > DAY_SCRIPT_MAX_CARDS
              ? ` — the first ${DAY_SCRIPT_MAX_CARDS} become cards`
              : ''}
          </span>
        ) : null}
      </div>
      {shown.length > 0 ? (
        <ol className="space-y-1" data-testid="day-script-preview">
          {shown.map((scene, index) => (
            <li key={index} className="type-caption text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--text-primary)]">{index + 1}.</span>{' '}
              {scene.place ? (
                <span className="text-[var(--text-muted)]">{scene.place} — </span>
              ) : null}
              {scene.beat || <em>no action</em>}
              {scene.line ? (
                <span className="text-[var(--text-muted)]"> · “{scene.line}”</span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={busy || shown.length === 0}
          data-testid="day-script-use"
          onClick={() => {
            if (!script) return;
            if (
              stillCount > 0 &&
              !window.confirm(
                `Use the script as this Day? Its ${stillCount} still${stillCount === 1 ? '' : 's'} leave the cards — they stay in the Gallery.`
              )
            ) {
              return;
            }
            const { used, dropped } = onImport(script);
            setNote(
              `${used} card${used === 1 ? '' : 's'} from the script — edit any of them, then Queue day.` +
                (dropped
                  ? ` ${dropped} more scene${dropped === 1 ? '' : 's'} left out (a Day holds ${DAY_SCRIPT_MAX_CARDS}).`
                  : '')
            );
            setOpen(false);
            setText('');
          }}
        >
          Use these {shown.length || ''} cards
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
