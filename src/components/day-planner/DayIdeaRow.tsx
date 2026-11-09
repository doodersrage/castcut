'use client';

import { useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { useNsfwGeneratorEnabled } from '@/hooks/useNsfwGeneratorEnabled';
import { TextInput } from '@/components/ui/Field';
import { SegmentedControl } from '@/components/ui/ToolPageShell';
import { DAY_EVENT_MAX_LENGTH, type DayEvent } from '@/lib/day/event';
import { DAY_PREMISE_MAX_LENGTH, dayPremiseAvailable } from '@/lib/day/premise';
import { dayShortMoodAvailable, dayShortSeed, episodeWriteHref } from '@/lib/day/episode-writer';

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
  onSwitchToWholeDay,
  castId,
  dialogue,
  className = '',
}: {
  /**
   * Write it with dialogue (Step 5c): after the beats, each moment's scene is written with its
   * lines (useShortDialogue) — on unless switched off here.
   */
  dialogue?: {
    write: (premise: string) => Promise<void>;
    stop: () => void;
    writing: { done: number; of: number } | null;
    note: string | null;
  };
  /** The Cast the Day is for: offers the idea as a short (a script on the Scene page). */
  castId?: string;
  dayMood: string | null | undefined;
  busy?: boolean;
  slotCount: number;
  onWrite: (premise: string) => Promise<number>;
  /** The event this Day follows, when it is one. */
  event?: DayEvent;
  onWriteEvent?: (event: string) => Promise<number>;
  onLeaveEvent?: () => void;
  /** Whole day picked while an event runs: fresh whole-day scenes, the event left (as Suggest day). */
  onSwitchToWholeDay?: () => void;
  className?: string;
}) {
  // Unset until the player picks: follows the Day (an event loads after the first render).
  const [pickedMode, setMode] = useState<IdeaMode | null>(null);
  const mode: IdeaMode = pickedMode ?? (event ? 'event' : 'day');
  const [premise, setPremise] = useState('');
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [withDialogue, setWithDialogue] = useState(true);
  // A failed write is said as one, not in the same grey as the help line.
  const [noteFailed, setNoteFailed] = useState(false);
  // Intimate's short is written by the LLM only where the server allows adult content.
  const adultAllowed = useNsfwGeneratorEnabled();
  // Write the day is Everyday's and Vacation's; a short (the script road) is every clothed mood's.
  const writeDay = dayPremiseAvailable(dayMood);
  const shortOnly =
    !writeDay && Boolean(castId) && dayShortMoodAvailable(dayMood, { adult: adultAllowed });
  if (!writeDay && !shortOnly) return null;
  const eventMode = writeDay && mode === 'event' && Boolean(onWriteEvent);

  const write = async () => {
    const text = premise.trim();
    // A mood with no Write the day (Sport, Suggestive): Enter doesn't write one.
    if (!text || writing || !writeDay) return;
    setWriting(true);
    setNote(null);
    setNoteFailed(false);
    try {
      if (eventMode && onWriteEvent) {
        const written = await onWriteEvent(text);
        setNote(
          `${written} moments of one event — edit any of them, then Render the short (or Quick stills). Each moment after the first is made from the one before, and Animate joins the clips.`
        );
      } else {
        const written = await onWrite(text);
        setNote(
          written >= slotCount
            ? 'Every moment now follows the idea — check them below, then Render the short (or Quick stills).'
            : `${written} of ${slotCount} moments follow the idea; the rest kept their beat. Render the short (or Quick stills) renders them.`
        );
        // Then each moment's scene, with its lines (the cards first: they're its outline).
        if (dialogue && withDialogue) await dialogue.write(text);
      }
      // Written on the moment cards, below: show them (it looked as if nothing had happened).
      document
        .querySelector('[data-testid^="day-progress-"]')
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Day from an idea failed.');
      setNoteFailed(true);
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
      {onWriteEvent && writeDay ? (
        <SegmentedControl<IdeaMode>
          aria-label="Plan the Day as"
          value={mode}
          onChange={next => {
            setMode(next);
            setNote(null);
            // Leaving the event with the toggle, not only with Back to a whole day: kept, it ran on
            // under the whole day's cards (each made as an edit of the one before).
            if (next === 'day' && event && onSwitchToWholeDay) {
              onSwitchToWholeDay();
              setNote('A whole day again — new scenes on every card.');
            }
          }}
          options={[
            { value: 'day', label: 'A short' },
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
              : shortOnly
                ? 'A short from an idea — e.g. the last match of the season'
                : 'An idea — e.g. a rainy Saturday that ends at a gallery opening'
          }
          aria-label={
            eventMode ? 'One event' : shortOnly ? 'A short from an idea' : 'Day from an idea'
          }
          data-testid="day-idea-input"
          // A line of its own on a phone: two buttons beside it left it a sliver.
          className="min-w-0 flex-1 max-sm:basis-full"
          onChange={changeEvent => setPremise(changeEvent.target.value)}
        />
        {writeDay ? (
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
            {writing ? 'Writing…' : eventMode ? 'Write the event' : 'Write it'}
          </Button>
        ) : null}
        {writeDay && dialogue && !eventMode ? (
          <label
            className="type-caption inline-flex items-center gap-1"
            title="Write each moment's scene with its lines — who is in it says them. Takes a minute or two."
          >
            <input
              type="checkbox"
              checked={withDialogue}
              disabled={writing}
              data-testid="day-idea-dialogue"
              onChange={changeEvent => setWithDialogue(changeEvent.target.checked)}
            />
            With dialogue
          </label>
        ) : null}
        {castId &&
        !eventMode &&
        (shortOnly || dayShortMoodAvailable(dayMood, { adult: adultAllowed })) ? (
          // The idea as a script: Scene's Write an episode, a scene per moment (as many as you
          // like there), then its run and Cut — or Make the whole episode for me. Beside Write
          // the day, the same kind of button: the same idea, written another way.
          premise.trim() ? (
            <ButtonLink
              size="sm"
              variant="secondary"
              href={episodeWriteHref(
                castId,
                dayShortSeed({ premise, mood: dayMood, moments: slotCount, adult: adultAllowed })
              )}
              data-testid="day-idea-short"
            >
              Write it as a script →
            </ButtonLink>
          ) : (
            <Button type="button" size="sm" variant="secondary" disabled>
              Write it as a script →
            </Button>
          )
        ) : null}
      </div>
      {dialogue?.writing ? (
        <p
          className="type-caption flex items-center gap-2"
          role="status"
          data-testid="day-idea-dialogue-progress"
        >
          Writing the dialogue — moment {dialogue.writing.done + 1} of {dialogue.writing.of}…
          <Button
            type="button"
            size="sm"
            variant="link"
            onClick={dialogue.stop}
            data-testid="day-idea-dialogue-stop"
          >
            Stop
          </Button>
        </p>
      ) : dialogue?.note ? (
        <p
          className="type-caption text-[var(--text-muted)]"
          role="status"
          data-testid="day-idea-dialogue-note"
        >
          {dialogue.note}
        </p>
      ) : null}
      {castId && !eventMode ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="day-idea-hint">
          {writeDay
            ? dialogue
              ? 'Write it: a beat and a place on each moment here, and (With dialogue) each moment’s scene with its lines. Write it as a script: any number of scenes, on Script.'
              : 'Write it: a beat and a place on each moment here. Write it as a script: scenes with lines, any length, on Script.'
            : 'Write it as a script: scenes with lines, any length, on Scene — rendered and cut from there.'}
        </p>
      ) : null}
      {note ? (
        <p
          className={`type-caption font-medium ${noteFailed ? 'text-[var(--tint-warning-text)]' : 'text-[var(--accent-text)]'}`}
          role="status"
          data-testid="day-idea-note"
        >
          {note}
        </p>
      ) : null}
    </form>
  );
}
