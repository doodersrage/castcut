'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useLocations } from '@/components/location/useLocations';
import { uploadComfyInputImage } from '@/lib/comfyui/image-upload';
import type { DaySlot, DaySlotId } from '@/lib/day/planner';
import { emptyPlacePhoto } from '@/lib/location/empty-photo-client';
import { locationFromSetting, saveLocation } from '@/lib/location/records';

/**
 * A photo of the place beside the Setting (Day and Scene): kept on the shot's location — a new
 * one named from the Setting's words when the shot isn't set in one — so the still is built
 * around it (the room photo the queue already sends) and other shots can be set there too.
 */
export default function SettingPhotoField({
  slot,
  updateSlot,
  disabled,
}: {
  slot: Pick<DaySlot, 'id' | 'location' | 'locationId'>;
  updateSlot: (slotId: DaySlotId, patch: Partial<DaySlot>) => void;
  disabled?: boolean;
}) {
  const locations = useLocations();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const location = slot.locationId
    ? locations.find(entry => entry.id === slot.locationId)
    : undefined;

  const add = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const uploaded = await uploadComfyInputImage({ file });
      // Anyone in it taken out first: a still drew the photo's person in place of the Cast.
      const kept = await emptyPlacePhoto({ photo: uploaded.name, file, onStatus: setStatus });
      setNote(
        kept.note ??
          (kept.emptied ? 'The people in the photo were taken out — only the place is kept.' : null)
      );
      if (location) {
        // Every shot set there gets the new photo (the place's picture, as in Locations).
        saveLocation({ ...location, photo: kept.photo });
      } else {
        const created = saveLocation(locationFromSetting(slot.location, kept.photo, locations));
        if (!created) throw new Error('The place could not be kept.');
        updateSlot(slot.id, {
          locationId: created.id,
          ...(slot.location?.trim() ? {} : { location: created.name }),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The photo could not be added.');
    } finally {
      setBusy(false);
      setStatus(null);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="space-y-1.5" data-testid="day-slot-setting-photo">
      <div className="flex flex-wrap items-center gap-3">
        {location?.photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- a ComfyUI input
          <img
            src={`/api/comfyui/view?${new URLSearchParams({ filename: location.photo, type: 'input' }).toString()}`}
            alt={`${location.name}, as it looks`}
            className="aspect-[4/3] w-24 rounded-[var(--radius-sm)] object-cover"
            data-testid="day-slot-setting-photo-thumb"
          />
        ) : null}
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={event => void add(event.target.files?.[0])}
          data-testid="day-slot-setting-photo-input"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled || busy}
          loading={busy}
          loadingLabel="Adding"
          onClick={() => input.current?.click()}
          data-testid="day-slot-setting-photo-add"
        >
          {location?.photo ? 'Replace photo' : 'Add a photo of the place'}
        </Button>
        {location?.photo ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled || busy}
            title={`This shot stops being set at ${location.name}; the place and its photo stay in Locations`}
            onClick={() => updateSlot(slot.id, { locationId: undefined })}
            data-testid="day-slot-setting-photo-remove"
          >
            Remove
          </Button>
        ) : null}
      </div>
      <p className="type-caption text-[var(--text-muted)]">
        {location?.photo
          ? `Set at ${location.name} — stills are built around this photo. Replacing it changes every shot set there.`
          : location
            ? `A photo of ${location.name}, no people in it — stills set there are built around it.`
            : 'A photo of the place, no people in it — the still is built around it, and it is kept in Locations for other shots.'}
      </p>
      {status ? (
        <p className="type-caption text-[var(--text-muted)]" role="status">
          {status}
        </p>
      ) : null}
      {note ? (
        <p
          className="type-caption text-[var(--text-muted)]"
          data-testid="day-slot-setting-photo-note"
        >
          {note}
        </p>
      ) : null}
      {error ? (
        <p className="type-caption ui-status-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
