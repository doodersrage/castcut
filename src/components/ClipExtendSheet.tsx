'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FieldError, TextArea, TextInput } from '@/components/ui/Field';
import SideSheet from '@/components/ui/SideSheet';
import {
  CLIP_EXTEND_MAX_SEGMENTS,
  requestClipExtendPlan,
  type ClipExtendRequest,
} from '@/lib/clip-extend';
import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import { loadSettingsCache } from '@/lib/settings-cache';

export type ClipExtendChoice = { direction?: string; beats?: string[]; lines?: string[] };

/**
 * "Make it 30 s" with a say in it: where the clip should go (it steers the written beats), and
 * the beats themselves — one line per part, written from the scene and the direction, each
 * editable, more parts for a longer clip. Start uses them as they stand; with no beats the
 * server writes them.
 */
export default function ClipExtendSheet({
  open,
  onClose,
  request,
  onStart,
  testId = 'clip-extend-sheet',
}: {
  open: boolean;
  onClose: () => void;
  /** The clip and its scene (direction and beats come from this sheet). */
  request: Omit<ClipExtendRequest, 'direction' | 'beats'>;
  onStart: (choice: ClipExtendChoice) => void;
  testId?: string;
}) {
  const [direction, setDirection] = useState('');
  const [beats, setBeats] = useState<string[]>([]);
  // A line per part (LTX clips lip-sync; WAN clips cannot).
  const [lines, setLines] = useState<string[]>([]);
  const [engine, setEngine] = useState<'ltx' | 'wan' | null>(null);
  const [partSec, setPartSec] = useState(4.3);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const write = async () => {
    setWriting(true);
    setError(null);
    try {
      const plan = await requestClipExtendPlan(
        { ...request, direction: direction.trim() || undefined },
        sharedLlmRequestBody(loadSettingsCache().shared)
      );
      setBeats(plan.beats);
      setLines(plan.beats.map(() => ''));
      setPartSec(plan.partSec);
      setEngine(plan.engine);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not write the beats.');
    } finally {
      setWriting(false);
    }
  };

  const keptIndexes = beats.map((beat, index) => (beat.trim() ? index : -1)).filter(i => i >= 0);
  const kept = keptIndexes.map(index => beats[index]!.trim());
  const keptLines = keptIndexes.map(index => (lines[index] ?? '').trim());
  const start = () => {
    onStart({
      direction: direction.trim() || undefined,
      beats: kept.length ? kept : undefined,
      lines: engine === 'ltx' && keptLines.some(Boolean) ? keptLines : undefined,
    });
    onClose();
  };

  return (
    <SideSheet
      open={open}
      onClose={onClose}
      title="Make it 30 s"
      description="The clip carries on in parts that continue from each other — a few minutes."
      testId={testId}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="primary"
            disabled={writing}
            onClick={start}
            data-testid={`${testId}-start`}
          >
            {kept.length ? `Make it longer · ${kept.length} parts` : 'Make it longer'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1">
          <span className="type-label">Where it goes (optional)</span>
          <TextArea
            rows={2}
            value={direction}
            maxLength={300}
            placeholder="She finishes her coffee, grabs her keys and heads for the door."
            onChange={event => setDirection(event.target.value)}
            data-testid={`${testId}-direction`}
          />
          <span className="type-caption block text-[var(--text-muted)]">
            Small steps work best: the same people and place, no cuts — the camera stays put.
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={writing}
            loading={writing}
            loadingLabel="Writing"
            onClick={() => void write()}
            data-testid={`${testId}-write`}
          >
            {beats.length ? 'Write them again' : 'Write the beats'}
          </Button>
          <span className="type-caption text-[var(--text-muted)]">
            {beats.length
              ? engine === 'wan'
                ? `About ${partSec} s each — edit any line. This clip renders on WAN, which cannot move lips to words, so its parts stay wordless.`
                : `About ${partSec} s each — edit any line, and give a part something to say if you like.`
              : 'Or start now and they are written for you.'}
          </span>
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
        {beats.length ? (
          <ol className="space-y-2" data-testid={`${testId}-beats`}>
            {beats.map((beat, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="type-caption mt-2 w-5 shrink-0 text-right text-[var(--text-muted)]">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <TextArea
                    value={beat}
                    rows={2}
                    className="py-2 type-body"
                    maxLength={240}
                    aria-label={`Part ${index + 1}`}
                    onChange={event =>
                      setBeats(list =>
                        list.map((entry, at) => (at === index ? event.target.value : entry))
                      )
                    }
                    data-testid={`${testId}-beat-${index}`}
                  />
                  {engine === 'ltx' ? (
                    <TextInput
                      value={lines[index] ?? ''}
                      maxLength={90}
                      placeholder="Says… (optional)"
                      aria-label={`Line for part ${index + 1}`}
                      onChange={event =>
                        setLines(list => {
                          const next = [...list];
                          next[index] = event.target.value;
                          return next;
                        })
                      }
                      data-testid={`${testId}-line-${index}`}
                    />
                  ) : null}
                </div>
                <button
                  type="button"
                  className="ui-chip mt-1 shrink-0"
                  aria-label={`Remove part ${index + 1}`}
                  onClick={() => {
                    setBeats(list => list.filter((_, at) => at !== index));
                    setLines(list => list.filter((_, at) => at !== index));
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
            {beats.length < CLIP_EXTEND_MAX_SEGMENTS ? (
              <li>
                <button
                  type="button"
                  className="ui-chip"
                  onClick={() => {
                    setBeats(list => [...list, '']);
                    setLines(list => [...list, '']);
                  }}
                  data-testid={`${testId}-add`}
                >
                  + Add a part
                </button>
              </li>
            ) : null}
          </ol>
        ) : null}
      </div>
    </SideSheet>
  );
}
