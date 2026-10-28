'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';
import {
  LOCATION_LOOK_MAX,
  LOCATION_NAME_MAX,
  deleteLocation,
  loadLocations,
  newLocationId,
  saveLocation,
  subscribeLocations,
  type LocationRecord,
} from '@/lib/location/records';

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
  // Read after mount (browser storage): the server render has none.
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  useEffect(() => {
    const read = () => setLocations(loadLocations());
    read();
    return subscribeLocations(read);
  }, []);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [newName, setNewName] = useState('');
  const [refused, setRefused] = useState<{ id: string; usedBy: string[] } | null>(null);

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
