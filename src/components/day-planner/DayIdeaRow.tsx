'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { DAY_PREMISE_MAX_LENGTH, dayPremiseAvailable } from '@/lib/day-premise';

/**
 * Day from an idea: one line in, one beat + room per slot out (day-premise.ts). Clothed moods
 * only; a slot the LLM wrote nothing usable for keeps its beat.
 */
export default function DayIdeaRow({
  dayMood,
  busy,
  slotCount,
  onWrite,
  className = '',
}: {
  dayMood: string | null | undefined;
  busy?: boolean;
  slotCount: number;
  onWrite: (premise: string) => Promise<number>;
  className?: string;
}) {
  const [premise, setPremise] = useState('');
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!dayPremiseAvailable(dayMood)) return null;

  const write = async () => {
    const text = premise.trim();
    if (!text || writing) return;
    setWriting(true);
    setNote(null);
    try {
      const written = await onWrite(text);
      setNote(
        written >= slotCount
          ? 'Every slot now follows the idea — edit any beat before Queue day.'
          : `${written} of ${slotCount} slots follow the idea; the rest kept their beat.`
      );
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Day from an idea failed.');
    } finally {
      setWriting(false);
    }
  };

  return (
    <form
      className={`flex flex-col gap-1.5 ${className}`}
      data-testid="day-idea"
      onSubmit={event => {
        event.preventDefault();
        void write();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          value={premise}
          maxLength={DAY_PREMISE_MAX_LENGTH}
          disabled={busy || writing}
          placeholder="Day from an idea — e.g. a rainy Saturday that ends at a gallery opening"
          aria-label="Day from an idea"
          data-testid="day-idea-input"
          className="min-w-0 flex-1"
          onChange={event => setPremise(event.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={busy || writing || !premise.trim()}
          data-testid="day-idea-write"
          title="The LLM writes a beat and a place for every slot, morning to night"
        >
          {writing ? 'Writing…' : 'Write the day'}
        </Button>
      </div>
      {note ? (
        <p
          className="type-caption text-[var(--text-muted)]"
          role="status"
          data-testid="day-idea-note"
        >
          {note}
        </p>
      ) : null}
    </form>
  );
}
