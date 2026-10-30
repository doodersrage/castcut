'use client';

/**
 * Generate a shot from words (cut-generate.ts): a missing shot or B-roll, rendered in the cut's
 * shape and placed after the picked shot. Shots still rendering (or that failed) are listed.
 * With the Cast (Phantom, video/phantom.ts, when ComfyUI has it): a clip of her made straight from
 * her pictures.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ToolActionRow } from '@/components/ui/ToolPageShell';
import { cutGeneratedTitle } from '@/lib/video/cut-generate';
import type { CutExtra } from '@/lib/film/cut-room';

export default function CutGeneratePanel({
  extras,
  busy,
  disabled,
  afterTitle,
  withCast,
  onGenerate,
  onRemove,
}: {
  extras: ReadonlyArray<CutExtra>;
  busy: boolean;
  disabled?: boolean;
  /** The shot the new one goes after (null: the end of the film). */
  afterTitle: string | null;
  /** The Cast a shot can be made with (Phantom is installed and she has pictures), else null. */
  withCast?: { name: string } | null;
  onGenerate: (prompt: string, shotKind: 'still' | 'clip', withCast: boolean) => void;
  onRemove: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [shotKind, setShotKind] = useState<'still' | 'clip'>('clip');
  const [castOn, setCastOn] = useState(true);
  const cast = Boolean(withCast && castOn);
  const pending = extras.filter(
    (extra): extra is Extract<CutExtra, { kind: 'generated' }> =>
      extra.kind === 'generated' && extra.status !== 'ready'
  );
  return (
    <div className="mb-2 space-y-1.5">
      {open ? (
        <form
          className="space-y-1.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] p-2"
          data-testid="cut-generate-form"
          onSubmit={event => {
            event.preventDefault();
            if (!prompt.trim()) return;
            onGenerate(prompt, cast ? 'clip' : shotKind, cast);
            setPrompt('');
            setOpen(false);
          }}
        >
          <label className="flex flex-col gap-1 type-caption text-[var(--text-muted)]">
            <span>
              Describe the shot — it goes{' '}
              {afterTitle ? `after ${afterTitle}` : 'at the end of the film'}
            </span>
            <input
              autoFocus
              type="text"
              maxLength={400}
              disabled={disabled || busy}
              placeholder="Rain running down a café window at night, city lights blurred behind"
              className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1.5 type-body text-[var(--text-primary)]"
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
              data-testid="cut-generate-prompt"
            />
          </label>
          {withCast ? (
            <label className="flex items-center gap-1.5 type-caption">
              <input
                type="checkbox"
                checked={castOn}
                disabled={disabled || busy}
                onChange={event => setCastOn(event.target.checked)}
                data-testid="cut-generate-with-cast"
              />
              With {withCast.name} — a clip of her made from her pictures (Phantom, about 2 min)
            </label>
          ) : null}
          <ToolActionRow>
            <select
              aria-label="Picture or clip"
              disabled={disabled || busy || cast}
              className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-1 type-caption text-[var(--text-primary)]"
              value={cast ? 'clip' : shotKind}
              onChange={event => setShotKind(event.target.value === 'still' ? 'still' : 'clip')}
              data-testid="cut-generate-kind"
            >
              <option value="clip">Moving clip (~5 s, a few minutes)</option>
              <option value="still">Picture (under a minute)</option>
            </select>
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={disabled || busy || !prompt.trim()}
              loading={busy}
              loadingLabel="Queueing"
              data-testid="cut-generate-go"
            >
              Generate
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </ToolActionRow>
        </form>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || busy}
          title="A missing shot or B-roll from words, rendered in this film's shape and placed after the picked shot"
          onClick={() => setOpen(true)}
          data-testid="cut-generate"
        >
          Generate a shot…
        </Button>
      )}
      {pending.length > 0 ? (
        <ul className="type-caption space-y-1" data-testid="cut-generated">
          {pending.map(extra => (
            <li key={extra.key} className="flex flex-wrap items-center gap-2">
              <span
                className={
                  extra.status === 'failed' ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'
                }
              >
                “{cutGeneratedTitle(extra.prompt)}”:{' '}
                {extra.status === 'failed'
                  ? 'did not render.'
                  : extra.stage === 'clip'
                    ? 'picture done, animating… it joins the film when ready.'
                    : 'rendering… it joins the film when ready.'}
              </span>
              <Button
                variant="quiet"
                type="button"
                className="text-2xs hover:underline"
                onClick={() => onRemove(extra.key)}
              >
                {extra.status === 'failed' ? 'Remove' : 'Cancel'}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
