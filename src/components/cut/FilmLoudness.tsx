'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  LOUDNESS_TARGETS,
  loudnessNotes,
  loudnessSummary,
  type FilmLoudness as Loudness,
} from '@/lib/film/loudness';

/**
 * A film's loudness (M4 F4): measured on the server (ffmpeg ebur128) when asked, and said
 * against a target — the web's −14 LUFS or broadcast's −23 — with what to change when it is off.
 */
export default function FilmLoudness({ url, entryId }: { url: string; entryId?: string }) {
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'measuring' }
    | { kind: 'done'; loudness: Loudness }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  const [targetId, setTargetId] = useState(LOUDNESS_TARGETS[0]!.id);
  const target = LOUDNESS_TARGETS.find(entry => entry.id === targetId) ?? LOUDNESS_TARGETS[0]!;

  const measure = async () => {
    setState({ kind: 'measuring' });
    try {
      const response = await fetch('/api/film/loudness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, ...(entryId ? { entryId } : {}) }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        loudness?: Loudness;
        error?: string;
      };
      if (!response.ok || !body.loudness) {
        setState({ kind: 'error', message: body.error || 'Could not measure the loudness.' });
        return;
      }
      setState({ kind: 'done', loudness: body.loudness });
    } catch {
      setState({ kind: 'error', message: 'Could not reach the server to measure the loudness.' });
    }
  };

  const notes = state.kind === 'done' ? loudnessNotes(state.loudness, target) : [];
  return (
    <div className="space-y-1 px-2 pb-2" data-testid="film-loudness">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={state.kind === 'measuring'}
          data-testid="film-loudness-measure"
          onClick={() => void measure()}
        >
          {state.kind === 'measuring'
            ? 'Measuring…'
            : state.kind === 'done'
              ? 'Measure again'
              : 'Measure loudness'}
        </Button>
        {state.kind === 'done' ? (
          <select
            aria-label="Loudness target"
            className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5 text-xs"
            value={targetId}
            onChange={event => setTargetId(event.target.value)}
          >
            {LOUDNESS_TARGETS.map(entry => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {state.kind === 'done' ? (
        <p className="type-caption" data-testid="film-loudness-result">
          {loudnessSummary(state.loudness)}
          {' — '}
          <span className={notes.length ? 'ui-status-danger' : 'ui-status-success'}>
            {notes.length
              ? notes.join('; ')
              : `right for ${target.label.split(' (')[0]!.toLowerCase()}`}
          </span>
        </p>
      ) : state.kind === 'error' ? (
        <p className="type-caption ui-status-danger" data-testid="film-loudness-error">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
