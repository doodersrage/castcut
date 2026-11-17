'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { CutPreviewLoaded } from '@/hooks/useCutPreview';
import { cutRoomToneBeds, makeRoomTones } from '@/lib/film/room-tone-client';
import type { CutEffect } from '@/lib/video/cut-sound';

/**
 * Cut → Room tone by scene (room-tone.ts): one bed of each script scene's own sound, looped under
 * the whole scene — so its shots sound like one place, not clips each with its own room.
 */
export default function CutRoomTone({
  loaded,
  disabled,
  onAdd,
  onReplace,
}: {
  loaded: CutPreviewLoaded | null;
  disabled?: boolean;
  onAdd: (id: string, effect: Partial<CutEffect>) => void;
  /** The beds made before taken off, once the first new one is ready. */
  onReplace?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const beds = useMemo(() => (loaded ? cutRoomToneBeds(loaded) : []), [loaded]);
  if (!loaded || !beds.length) return null;
  const makeAll = async () => {
    setError(null);
    setDone(null);
    const result = await makeRoomTones(beds, onAdd, setBusy, onReplace);
    if (result.error) setError(result.error);
    else setDone(result.made);
    setBusy(null);
  };
  return (
    <section className="mt-3 space-y-1.5" data-testid="cut-room-tone">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-caption font-medium">Room tone by scene · {beds.length} scenes</p>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || busy !== null}
          data-testid="cut-room-tone-make"
          title="Each scene's own sound (Make a sound), looped quietly under the whole scene"
          onClick={() => void makeAll()}
        >
          {busy ?? 'Make the room tones'}
        </Button>
      </div>
      {done !== null ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="cut-room-tone-done">
          {done} room tone{done === 1 ? '' : 's'} placed under their scenes.
        </p>
      ) : null}
      {error ? (
        <p className="type-caption text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
