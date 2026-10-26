'use client';

import { Button } from '@/components/ui/Button';
import {
  CUT_TRACK_LABELS,
  CUT_TRACKS,
  cutTrackGain,
  type CutSoundOptions,
  type CutTrack,
} from '@/lib/video/cut-sound';

/**
 * Cut's sound tracks (M4 F4): mute one (silent in the monitor and left out of the encode, saved
 * with the cut) or solo one (hear only it in the monitor; never saved, never encoded).
 */
export default function CutTracks({
  sound,
  solo,
  disabled,
  onMute,
  onSolo,
}: {
  sound: CutSoundOptions | null | undefined;
  solo: CutTrack | null;
  disabled?: boolean;
  onMute: (track: CutTrack, muted: boolean) => void;
  onSolo: (track: CutTrack | null) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1"
      role="group"
      aria-label="Sound tracks"
      data-testid="cut-tracks"
    >
      <span className="type-caption font-medium">Tracks</span>
      {CUT_TRACKS.map(track => {
        const muted = Boolean(sound?.mutedTracks?.includes(track));
        const audible = cutTrackGain(sound, track, solo) === 1;
        return (
          <span
            key={track}
            className={`flex items-center gap-1 text-sm ${audible ? '' : 'text-[var(--text-muted)]'}`}
            data-testid={`cut-track-${track}`}
            data-audible={audible}
          >
            {CUT_TRACK_LABELS[track]}
            <Button
              size="sm"
              variant={muted ? 'secondary' : 'ghost'}
              aria-pressed={muted}
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
              aria-pressed={solo === track}
              disabled={disabled}
              title={
                solo === track ? 'Hear every track again' : 'Hear only this track in the monitor'
              }
              data-testid={`cut-track-solo-${track}`}
              onClick={() => onSolo(solo === track ? null : track)}
            >
              S
            </Button>
          </span>
        );
      })}
      {sound?.mutedTracks?.length ? (
        <span className="type-caption text-[var(--text-muted)]" data-testid="cut-tracks-note">
          Muted tracks are left out of the cut.
        </span>
      ) : null}
    </div>
  );
}
