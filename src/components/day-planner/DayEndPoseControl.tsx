'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import PortraitTileStrip from '@/components/ui/PortraitTileStrip';
import {
  dayEndPoseCandidates,
  dayEndPoseFramingWarning,
  type DayEndPose,
} from '@/lib/day-end-pose';
import {
  dayStillShownImage,
  type DaySlot,
  type DaySlotId,
  type DaySlotStill,
} from '@/lib/day-planner';

/**
 * "End pose" beside Animate: the slot's clip starts on its still and lands on a second picture —
 * another finished still of this Day, or a same-camera re-pose of this one. Rendered only when
 * the server can pin a last frame on the clip's engine.
 */
export default function DayEndPoseControl({
  slot,
  slots,
  stills,
  endPose,
  busy,
  reposing,
  status,
  onPick,
  onRepose,
  onClear,
}: {
  slot: DaySlot;
  slots: DaySlot[];
  stills: DaySlotStill[];
  endPose: DayEndPose | undefined;
  busy: boolean;
  reposing: boolean;
  status: string | null;
  onPick: (fromSlotId: DaySlotId) => void;
  onRepose: (poseWords: string) => void;
  onClear: () => void;
}) {
  const [words, setWords] = useState('');
  const start = stills.find(entry => entry.slotId === slot.id);
  const startUrl = start?.status === 'completed' ? dayStillShownImage(start) : '';
  if (!startUrl) return null;
  const labelFor = (id: string) => slots.find(entry => entry.id === id)?.label ?? id;
  const tiles = dayEndPoseCandidates(stills, slot.id).map(still => ({
    id: still.slotId,
    label: labelFor(still.slotId),
    thumb: dayStillShownImage(still) || still.imageUrl,
  }));
  const warning = dayEndPoseFramingWarning(slot.id, endPose);
  const disabled = busy || reposing;
  return (
    <div
      className="mt-3 space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3"
      data-testid="day-end-pose"
    >
      <p className="type-caption font-medium text-[var(--text-secondary)]">
        End pose · {slot.label}
      </p>
      <p className="type-caption text-[var(--text-muted)]">
        The clip moves from this still into a second picture — pick a still, or re-pose this one
        with the same camera.
      </p>
      {endPose ? (
        <div data-testid="day-end-pose-preview">
          <div className="flex items-center gap-2">
            {[
              { label: 'Start', url: startUrl },
              { label: 'End', url: endPose.imageUrl },
            ].map((frame, index) => (
              <div key={frame.label} className="flex items-center gap-2">
                {index > 0 ? (
                  <span aria-hidden className="text-[var(--text-muted)]">
                    →
                  </span>
                ) : null}
                <figure className="w-16">
                  <div className="aspect-[3/4] overflow-hidden rounded-[var(--radius-md)] bg-[var(--bg-muted)]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- gallery still preview */}
                    <img
                      src={frame.url}
                      alt={`${slot.label} clip ${frame.label.toLowerCase()} frame`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <figcaption className="type-caption mt-1 text-[var(--text-muted)]">
                    {frame.label}
                  </figcaption>
                </figure>
              </div>
            ))}
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              data-testid="day-end-pose-clear"
              onClick={onClear}
            >
              Clear
            </Button>
          </div>
          {warning ? (
            <p className="type-caption mt-1 text-[var(--tint-warning-text)]" role="note">
              {warning}
            </p>
          ) : null}
        </div>
      ) : null}
      {tiles.length > 0 ? (
        <PortraitTileStrip
          label="End on another still"
          value={endPose?.source === 'still' ? (endPose.fromSlotId ?? '') : ''}
          tiles={tiles}
          disabled={disabled}
          onChange={id => onPick(id as DaySlotId)}
          testIdPrefix="day-end-pose-still"
        />
      ) : null}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={event => {
          event.preventDefault();
          if (words.trim()) onRepose(words);
        }}
      >
        <TextInput
          aria-label="Pose to end on"
          placeholder="Pose to end on, e.g. arms raised, laughing"
          value={words}
          maxLength={160}
          disabled={disabled}
          data-testid="day-end-pose-words"
          onChange={event => setWords(event.target.value)}
          className="min-w-0 flex-1"
        />
        <Button
          size="sm"
          variant="secondary"
          type="submit"
          disabled={disabled || !words.trim()}
          data-testid="day-end-pose-repose"
        >
          {reposing ? 'Re-posing…' : 'Re-pose this still'}
        </Button>
      </form>
      {status ? (
        <p className="type-caption text-[var(--text-muted)]" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
