'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { SegmentedControl } from '@/components/ui/ToolPageShell';
import { DAY_EVENT_MAX_LENGTH, type DayEvent } from '@/lib/day-event';
import { DAY_PREMISE_MAX_LENGTH, dayPremiseAvailable } from '@/lib/day-premise';

type IdeaMode = 'day' | 'event';

/**
 * Day from an idea: one line in, one beat + room per slot out (day-premise.ts) — or One event:
 * every slot a moment of one event in one place, joined into one video (day-event.ts). Clothed
 * moods only; a slot the LLM wrote nothing usable for keeps its beat (whole day).
 */
export default function DayIdeaRow({
  dayMood,
  busy,
  slotCount,
  onWrite,
  event,
  onWriteEvent,
  onLeaveEvent,
  className = '',
}: {
  dayMood: string | null | undefined;
  busy?: boolean;
  slotCount: number;
  onWrite: (premise: string) => Promise<number>;
  /** The event this Day follows, when it is one. */
  event?: DayEvent;
  onWriteEvent?: (event: string) => Promise<number>;
  onLeaveEvent?: () => void;
  className?: string;
}) {
  const [mode, setMode] = useState<IdeaMode>(event ? 'event' : 'day');
  const [premise, setPremise] = useState('');
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!dayPremiseAvailable(dayMood)) return null;
  const eventMode = mode === 'event' && Boolean(onWriteEvent);

  const write = async () => {
    const text = premise.trim();
    if (!text || writing) return;
    setWriting(true);
    setNote(null);
    try {
      if (eventMode && onWriteEvent) {
        const written = await onWriteEvent(text);
        setNote(
          `${written} moments of one event — edit any of them, then Queue day. Each moment after the first is made from the one before, and Animate joins the clips.`
        );
      } else {
        const written = await onWrite(text);
        setNote(
          written >= slotCount
            ? 'Every slot now follows the idea — edit any beat before Queue day.'
            : `${written} of ${slotCount} slots follow the idea; the rest kept their beat.`
        );
      }
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
      onSubmit={formEvent => {
        formEvent.preventDefault();
        void write();
      }}
    >
      {onWriteEvent ? (
        <SegmentedControl<IdeaMode>
          aria-label="Plan the Day as"
          value={mode}
          onChange={next => {
            setMode(next);
            setNote(null);
          }}
          options={[
            { value: 'day', label: 'Whole day' },
            { value: 'event', label: 'One event' },
          ]}
        />
      ) : null}
      {event ? (
        <div
          className="flex flex-wrap items-center gap-2 type-caption text-[var(--text-muted)]"
          data-testid="day-event-current"
        >
          <span className="min-w-0 flex-1">
            One event: <strong className="text-[var(--text)]">{event.text}</strong> — {event.place},{' '}
            {event.time.toLowerCase()}. Clips run into each other in Cut.
          </span>
          {onLeaveEvent ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy || writing}
              data-testid="day-event-leave"
              onClick={() => {
                onLeaveEvent();
                setMode('day');
                setNote(null);
              }}
            >
              Back to a whole day
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          value={premise}
          maxLength={eventMode ? DAY_EVENT_MAX_LENGTH : DAY_PREMISE_MAX_LENGTH}
          disabled={busy || writing}
          placeholder={
            eventMode
              ? 'One event — e.g. a dinner date at a candlelit trattoria'
              : 'Day from an idea — e.g. a rainy Saturday that ends at a gallery opening'
          }
          aria-label={eventMode ? 'One event' : 'Day from an idea'}
          data-testid="day-idea-input"
          className="min-w-0 flex-1"
          onChange={changeEvent => setPremise(changeEvent.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={busy || writing || !premise.trim()}
          data-testid="day-idea-write"
          title={
            eventMode
              ? 'The LLM writes the event as consecutive moments in one place — one per slot'
              : 'The LLM writes a beat and a place for every slot, morning to night'
          }
        >
          {writing ? 'Writing…' : eventMode ? 'Write the event' : 'Write the day'}
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
