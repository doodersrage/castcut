'use client';

import { Button } from '@/components/ui/Button';
import { CLIP_CAMERA_MOVES, type ClipCameraMove } from '@/lib/video/camera-move';

/**
 * Pick a clip's camera move by sight (camera-move.ts): each tile plays the move on the shot's own
 * still, so "orbit" or "rise" needs no explaining. Still is the default — the clip templates'
 * locked-off camera.
 */
export default function CameraMovePicker({
  stillUrl,
  value,
  disabled,
  onChange,
  testIdPrefix = 'camera-move',
}: {
  stillUrl?: string;
  value: ClipCameraMove;
  disabled?: boolean;
  onChange: (move: ClipCameraMove) => void;
  testIdPrefix?: string;
}) {
  return (
    <div className="space-y-1.5" data-testid={testIdPrefix}>
      <span className="type-caption block text-[var(--text-muted)]">Camera</span>
      <div role="radiogroup" aria-label="Camera move" className="grid grid-cols-4 gap-1.5">
        {CLIP_CAMERA_MOVES.map(move => {
          const picked = move.id === value;
          return (
            <Button
              key={move.id}
              variant="plain"
              role="radio"
              aria-checked={picked}
              disabled={disabled}
              title={
                move.words || 'The camera stays still (locked off), as the clip templates have it'
              }
              data-testid={`${testIdPrefix}-${move.id}`}
              onClick={() => onChange(move.id)}
              className={`overflow-hidden rounded-[var(--radius-sm)] border text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                picked
                  ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]'
                  : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]'
              }`}
            >
              <span className="relative block aspect-[4/3] overflow-hidden bg-[var(--bg-muted)]">
                {stillUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a ComfyUI view URL, animated
                  <img
                    src={stillUrl}
                    alt=""
                    draggable={false}
                    className={`h-full w-full object-cover ${move.id === 'still' ? '' : 'cam-move-preview'}`}
                    data-move={move.id}
                    style={move.id === 'still' ? undefined : { animationName: `cam-${move.id}` }}
                  />
                ) : null}
              </span>
              <span
                className={`type-caption block px-1.5 py-0.5 ${picked ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
              >
                {move.label}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
