'use client';

import { Button } from '@/components/ui/Button';
import type { CutMarker } from '@/lib/film/cut-markers';
import { reviewTimeLabel } from '@/lib/film/review-notes';

/**
 * Cut → Notes → Your markers: the marks you dropped with M (or Add marker), each a jump, a note
 * and Remove. Kept with the cut — Undo and a reload keep them.
 */
export default function CutMarkers({
  markers,
  time,
  disabled,
  onAdd,
  onSeek,
  onNote,
  onRemove,
}: {
  markers: CutMarker[];
  time: number;
  disabled?: boolean;
  onAdd: () => void;
  onSeek: (timeSec: number) => void;
  onNote: (id: string, note: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="space-y-2" data-testid="cut-markers">
      <div className="flex items-center justify-between gap-2">
        <p className="type-caption text-[var(--text-muted)]">
          {markers.length
            ? `Your markers · ${markers.length}`
            : 'Your markers — press M at the playhead to drop one.'}
        </p>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled}
          data-testid="cut-marker-add"
          onClick={onAdd}
        >
          + Marker at {reviewTimeLabel(time)}
        </Button>
      </div>
      {markers.length ? (
        <ul className="space-y-1.5">
          {markers.map(marker => (
            <li
              key={marker.id}
              className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] p-1.5"
              data-testid="cut-marker"
            >
              <Button
                variant="underline"
                className="type-caption shrink-0 tabular-nums text-[var(--tint-warning-text)]"
                data-testid="cut-marker-jump"
                onClick={() => onSeek(marker.timeSec)}
              >
                {reviewTimeLabel(marker.timeSec)}
              </Button>
              <input
                className="ui-input h-7 min-w-0 flex-1 text-sm"
                placeholder="A note — fix this, music hits here…"
                defaultValue={marker.note}
                disabled={disabled}
                aria-label={`Note for the marker at ${reviewTimeLabel(marker.timeSec)}`}
                data-testid="cut-marker-note"
                onBlur={event => {
                  if (event.target.value !== marker.note) onNote(marker.id, event.target.value);
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                aria-label={`Remove the marker at ${reviewTimeLabel(marker.timeSec)}`}
                data-testid="cut-marker-remove"
                onClick={() => onRemove(marker.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
