'use client';

import { Button } from '@/components/ui/Button';
import {
  CUT_TRACK_LABELS,
  cutTrackGain,
  type CutSoundOptions,
  type CutTrack,
} from '@/lib/video/cut-sound';

/**
 * A sound track's header at the start of its lane on Cut's timeline (M4 F4): its name, mute
 * (silent in the monitor and left out of the encode, saved with the cut) and solo (hear only it
 * in the monitor; never saved, never encoded).
 */
export function CutTrackHeader({
  track,
  sound,
  solo,
  disabled,
  onMute,
  onSolo,
}: {
  track: CutTrack;
  sound: CutSoundOptions | null | undefined;
  solo: CutTrack | null;
  disabled?: boolean;
  onMute: (track: CutTrack, muted: boolean) => void;
  onSolo: (track: CutTrack | null) => void;
}) {
  const muted = Boolean(sound?.mutedTracks?.includes(track));
  const audible = cutTrackGain(sound, track, solo) === 1;
  return (
    <span
      className={`flex h-full items-center justify-between gap-1 text-xs ${audible ? '' : 'text-[var(--text-muted)]'}`}
      data-testid={`cut-track-${track}`}
      data-audible={audible}
    >
      <span className="truncate">{CUT_TRACK_LABELS[track]}</span>
      <span className="flex shrink-0 items-center">
        <Button
          size="sm"
          variant={muted ? 'secondary' : 'ghost'}
          className="!h-6 !min-h-0 !px-1.5"
          aria-pressed={muted}
          aria-label={`Mute ${CUT_TRACK_LABELS[track]}`}
          disabled={disabled}
          title={
            muted
              ? 'Unmute: back in the monitor and the cut'
              : 'Mute: silent here and left out of the cut'
          }
          data-testid={`cut-track-mute-${track}`}
          onClick={() => onMute(track, !muted)}
        >
          M
        </Button>
        <Button
          size="sm"
          variant={solo === track ? 'secondary' : 'ghost'}
          className="!h-6 !min-h-0 !px-1.5"
          aria-pressed={solo === track}
          aria-label={`Solo ${CUT_TRACK_LABELS[track]}`}
          disabled={disabled}
          title={solo === track ? 'Hear every track again' : 'Hear only this track in the monitor'}
          data-testid={`cut-track-solo-${track}`}
          onClick={() => onSolo(solo === track ? null : track)}
        >
          S
        </Button>
      </span>
    </span>
  );
}

/** Said under the timeline while a track is muted. */
export function CutTracksNote({ sound }: { sound: CutSoundOptions | null | undefined }) {
  return sound?.mutedTracks?.length ? (
    <p className="type-caption text-[var(--text-muted)]" data-testid="cut-tracks-note">
      Muted tracks are left out of the cut.
    </p>
  ) : null;
}
