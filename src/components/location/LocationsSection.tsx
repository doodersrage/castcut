'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { uploadComfyInputImage } from '@/lib/comfyui/image-upload';
import { waitForGalleryPromptIds } from '@/lib/best-of-n/vision-queue';
import { galleryEntryPrimaryViewUrl } from '@/lib/gallery/comfyui-gallery';
import {
  LOCATION_PICTURE_MODEL,
  LOCATION_PICTURE_NEGATIVE,
  locationPictureGraph,
  locationPicturePrompt,
} from '@/lib/location/picture';
import {
  LOCATION_LOOK_MAX,
  LOCATION_NAME_MAX,
  deleteLocation,
  newLocationId,
  saveLocation,
  type LocationRecord,
} from '@/lib/location/records';
import { useLocations } from './useLocations';

type Draft = Partial<Pick<LocationRecord, 'name' | 'look' | 'setting'>> & { aliases?: string };

/**
 * Locations (M8 T1): the places the film goes back to, each described once — every Scene set
 * there will draw the same room (T2). Shared by the whole film, not one Cast. A location a Scene
 * is set in can't be deleted until the Scene is set elsewhere.
 */
export default function LocationsSection({
  scenes,
}: {
  /** Every Cast's Scenes: what a delete would leave without a place. */
  scenes: ReadonlyArray<{ name: string; slot?: { locationId?: string } | null }>;
}) {
  const locations = useLocations();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [newName, setNewName] = useState('');
  const [refused, setRefused] = useState<{ id: string; usedBy: string[] } | null>(null);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<{ id: string; message: string } | null>(null);
  // "Make its picture" (M8 T3): the empty place rendered from its words, kept as its photo.
  const [rendering, setRendering] = useState<{ id: string; status: string } | null>(null);
  const makePicture = async (location: LocationRecord) => {
    setPhotoError(null);
    setRendering({ id: location.id, status: 'Rendering its picture…' });
    try {
      const { requeueComfyJob } = await import('@/lib/comfyui/requeue');
      const queued = await requeueComfyJob({
        prompt: locationPicturePrompt(location),
        negativePrompt: LOCATION_PICTURE_NEGATIVE,
        model: LOCATION_PICTURE_MODEL,
        tool: 'scene',
        workflowJson: JSON.stringify(
          locationPictureGraph(location, Math.floor(Math.random() * 2 ** 31))
        ),
        workflowFinal: true,
      });
      if (!queued.ok || !queued.promptId) {
        throw new Error(queued.error ?? 'ComfyUI did not take the render — is it running?');
      }
      const [entry] = await waitForGalleryPromptIds([queued.promptId], {
        timeoutMs: 5 * 60_000,
        pollMs: 2_500,
      });
      const url = entry ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
      if (!url) throw new Error('The picture did not finish (it needs Qwen-Image 2.1 Turbo).');
      setRendering({ id: location.id, status: 'Keeping it…' });
      const response = await fetch(url, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('The picture could not be read back.');
      const file = new File([await response.blob()], `location-${location.id}.png`, {
        type: 'image/png',
      });
      const uploaded = await uploadComfyInputImage({ file });
      saveLocation({ ...location, photo: uploaded.name });
    } catch (error) {
      setPhotoError({
        id: location.id,
        message: error instanceof Error ? error.message : 'The picture could not be made.',
      });
    } finally {
      setRendering(null);
    }
  };
  // Its picture (M8 T3): a photo of the empty place, sent to ComfyUI's inputs like a room photo.
  const setPhoto = async (location: LocationRecord, file: File | null) => {
    setPhotoError(null);
    if (!file) {
      saveLocation({ ...location, photo: undefined });
      return;
    }
    setPhotoBusy(location.id);
    try {
      const uploaded = await uploadComfyInputImage({ file });
      saveLocation({ ...location, photo: uploaded.name });
    } catch (error) {
      setPhotoError({
        id: location.id,
        message: error instanceof Error ? error.message : 'The photo could not be added.',
      });
    } finally {
      setPhotoBusy(null);
    }
  };

  const draftOf = (location: LocationRecord) => ({
    name: location.name,
    look: location.look,
    setting: location.setting,
    aliases: location.aliases.join(', '),
    ...drafts[location.id],
  });
  const edit = (id: string, patch: Draft) =>
    setDrafts(previous => ({ ...previous, [id]: { ...previous[id], ...patch } }));
  const commit = (location: LocationRecord) => {
    const draft = drafts[location.id];
    if (!draft) return;
    // An emptied name is put back rather than saved (a location always has one).
    saveLocation({
      ...location,
      ...(draft.name?.trim() ? { name: draft.name } : {}),
      ...(draft.look !== undefined ? { look: draft.look } : {}),
      ...(draft.setting ? { setting: draft.setting } : {}),
      ...(draft.aliases !== undefined ? { aliases: draft.aliases.split(',') } : {}),
    });
    setDrafts(({ [location.id]: _dropped, ...rest }) => rest);
  };
  const add = () => {
    const name = newName.trim();
    if (!name) return;
    saveLocation({ id: newLocationId(), name, look: '', aliases: [name] });
    setNewName('');
  };
  const remove = async (location: LocationRecord) => {
    setRefused(null);
    const users = scenes.filter(scene => scene.slot?.locationId === location.id);
    if (users.length) {
      setRefused({ id: location.id, usedBy: users.map(scene => scene.name) });
      return;
    }
    const ok = await confirmAction({
      title: `Delete ${location.name}?`,
      body: 'Its description and picture go; no Scene is set there.',
      confirmLabel: 'Delete location',
      tone: 'danger',
    });
    if (!ok) return;
    const result = deleteLocation(location.id, scenes);
    if (!result.deleted && result.usedBy.length)
      setRefused({ id: location.id, usedBy: result.usedBy });
  };

  return (
    <ToolSection
      title="Locations"
      description="Places the film goes back to — the corner café, her sister's flat. Describe one once and every Scene set there shows the same room."
      data-testid="locations-section"
    >
      <div className="space-y-4">
        {locations.length === 0 ? (
          <p className="type-caption text-[var(--text-muted)]" data-testid="locations-empty">
            No locations yet. A place more than one shot goes to is worth one: without it, each shot
            draws its own version.
          </p>
        ) : null}
        {locations.map(location => {
          const draft = draftOf(location);
          return (
            <div
              key={location.id}
              className="space-y-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] p-3"
              data-testid={`location-${location.id}`}
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
                <TextInput
                  className="min-w-0"
                  aria-label="Location name"
                  data-testid="location-name"
                  maxLength={LOCATION_NAME_MAX}
                  value={draft.name}
                  onChange={event => edit(location.id, { name: event.target.value })}
                  onBlur={() => commit(location)}
                />
                <SelectInput
                  aria-label={`${location.name}: inside or outdoors`}
                  data-testid="location-setting"
                  value={draft.setting}
                  onChange={event => {
                    const setting = event.target.value === 'EXT' ? 'EXT' : 'INT';
                    saveLocation({ ...location, setting });
                  }}
                >
                  <option value="INT">Inside</option>
                  <option value="EXT">Outdoors</option>
                </SelectInput>
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="location-delete"
                  onClick={() => void remove(location)}
                >
                  Delete
                </Button>
              </div>
              <TextArea
                rows={2}
                aria-label={`What ${location.name} looks like`}
                data-testid="location-look"
                placeholder="What every shot of it shares: walls, floor, windows, the pieces that make it this place"
                maxLength={LOCATION_LOOK_MAX}
                value={draft.look}
                onChange={event => edit(location.id, { look: event.target.value })}
                onBlur={() => commit(location)}
              />
              <TextInput
                aria-label={`Script places that mean ${location.name}`}
                data-testid="location-aliases"
                placeholder="Script places that mean it, comma separated (cafe, the corner cafe)"
                value={draft.aliases}
                onChange={event => edit(location.id, { aliases: event.target.value })}
                onBlur={() => commit(location)}
              />
              <div className="flex flex-wrap items-center gap-3" data-testid="location-photo">
                {location.photo ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a ComfyUI input */}
                    <img
                      src={`/api/comfyui/view?${new URLSearchParams({ filename: location.photo, type: 'input' }).toString()}`}
                      alt={`${location.name}, as it looks`}
                      className="aspect-[4/3] w-32 rounded-[var(--radius-sm)] object-cover"
                    />
                    <button
                      type="button"
                      className="ui-chip"
                      data-testid="location-photo-remove"
                      onClick={() => void setPhoto(location, null)}
                    >
                      Remove picture
                    </button>
                    <button
                      type="button"
                      className="ui-chip"
                      data-testid="location-picture-again"
                      disabled={rendering !== null || !location.look.trim()}
                      onClick={() => void makePicture(location)}
                    >
                      Make another
                    </button>
                  </>
                ) : (
                  <label className="type-caption space-y-1 text-[var(--text-muted)]">
                    <span className="block">
                      A photo of it, no people in it — shots set here are built around it
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={photoBusy !== null}
                      aria-label={`A photo of ${location.name}`}
                      data-testid="location-photo-input"
                      className="block w-full text-xs"
                      onChange={event => void setPhoto(location, event.target.files?.[0] ?? null)}
                    />
                  </label>
                )}
                {!location.photo ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    data-testid="location-picture-make"
                    disabled={rendering !== null || !location.look.trim()}
                    title={
                      location.look.trim()
                        ? 'Render the empty place from its words (Qwen-Image 2.1 Turbo, about 30 s)'
                        : 'Describe it first — the picture is made from its words'
                    }
                    onClick={() => void makePicture(location)}
                  >
                    Make its picture
                  </Button>
                ) : null}
                {photoBusy === location.id ? (
                  <span className="type-caption text-[var(--text-muted)]">Adding…</span>
                ) : null}
                {rendering?.id === location.id ? (
                  <span className="type-caption text-[var(--text-muted)]" role="status">
                    {rendering.status}
                  </span>
                ) : null}
              </div>
              {photoError?.id === location.id ? (
                <p className="type-caption ui-status-danger" role="alert">
                  {photoError.message}
                </p>
              ) : null}
              {refused?.id === location.id ? (
                <p
                  className="type-caption text-[var(--tint-warning-text,var(--accent-text))]"
                  role="status"
                  data-testid="location-delete-refused"
                >
                  {`Not deleted: ${refused.usedBy.join(', ')} ${refused.usedBy.length === 1 ? 'is' : 'are'} set here. Set ${refused.usedBy.length === 1 ? 'it' : 'them'} somewhere else first.`}
                </p>
              ) : null}
            </div>
          );
        })}
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={event => {
            event.preventDefault();
            add();
          }}
        >
          <TextInput
            className="min-w-0 flex-1"
            aria-label="New location's name"
            data-testid="location-new-name"
            placeholder="New location — e.g. Corner café"
            maxLength={LOCATION_NAME_MAX}
            value={newName}
            onChange={event => setNewName(event.target.value)}
          />
          <Button size="sm" type="submit" disabled={!newName.trim()} data-testid="location-add">
            Add location
          </Button>
        </form>
      </div>
    </ToolSection>
  );
}
