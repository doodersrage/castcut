'use client';

import ActionMenu, {
  ACTION_MENU_DANGER_ITEM_CLASS,
  ACTION_MENU_ITEM_CLASS,
} from '@/components/ui/ActionMenu';
import { castPlateThumbUrl } from '@/lib/character/plate-thumb';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/ViewState';
import { CastImportButton } from '@/components/cast/CastTransferControls';
import { ToolLayout } from '@/components/ui/ToolPageShell';
import { whenBrowserStorageReady } from '@/lib/storage/browser-storage';
import {
  applyCharacterRecord,
  characterHomeHref,
  getCharactersSnapshot,
  getServerCharactersSnapshot,
  looksOf,
  loraTriggerFromCharacter,
  forgetCharacterRecord,
  subscribeCharacters,
  type CharacterRecord,
} from '@/lib/character/os';
import { migrateCharactersFromLegacy } from '@/lib/play/cast';
import { NEW_CAST_MEMBER_HREF, putDownActiveCast } from '@/lib/play/command-actions';
import { castRosterReadinessLine } from '@/lib/cast/home-status';
import { playCampaignHref, rosterFilmLead } from '@/lib/play/campaign';
import {
  listSavedIdentityBundles,
  loadSettingsCache,
  saveSharedSettings,
  SETTINGS_CACHE_UPDATED_EVENT,
} from '@/lib/settings/cache';
import {
  deleteRoleplayLibrarySession,
  roleplaySessionsForCharacterSync,
} from '@/lib/story/roleplay-library';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { TextInput } from '@/components/ui/Field';
import { BROWSER_STORAGE_HEALTH_EVENT } from '@/lib/storage/browser-storage';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  getGalleryCache,
  initGalleryStore,
} from '@/lib/gallery/comfyui-gallery';

const EMPTY_GALLERY: ReturnType<typeof getGalleryCache> = [];

function subscribeGallery(onChange: () => void): () => void {
  window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onChange);
  window.addEventListener(BROWSER_STORAGE_HEALTH_EVENT, onChange);
  return () => {
    window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onChange);
    window.removeEventListener(BROWSER_STORAGE_HEALTH_EVENT, onChange);
  };
}

function applyCharacter(character: CharacterRecord) {
  saveSharedSettings({
    ...loadSettingsCache().shared,
    ...applyCharacterRecord(character),
  });
}

export default function CharacterCastRoster() {
  const router = useRouter();
  const [detailsId, setDetailsId] = useState<string | null>(null);
  // Plates whose file is gone (deleted media, another machine's copy) — shown as "No plate".
  const [missingPlates, setMissingPlates] = useState<ReadonlySet<string>>(() => new Set());
  const [activeCharacterId, setActiveCharacterId] = useState('');
  const characters = useSyncExternalStore(
    subscribeCharacters,
    getCharactersSnapshot,
    getServerCharactersSnapshot
  );

  useEffect(() => {
    let cancelled = false;
    const readActive = () =>
      setActiveCharacterId(loadSettingsCache().shared.activeCharacterId || '');
    void whenBrowserStorageReady().then(() => {
      if (cancelled) {
        return;
      }
      migrateCharactersFromLegacy({
        bundles: listSavedIdentityBundles(),
        roleplaySessions: roleplaySessionsForCharacterSync(),
      });
      readActive();
    });
    window.addEventListener(SETTINGS_CACHE_UPDATED_EVENT, readActive);
    return () => {
      cancelled = true;
      window.removeEventListener(SETTINGS_CACHE_UPDATED_EVENT, readActive);
    };
  }, []);

  const filmLead = rosterFilmLead(characters, activeCharacterId);

  // Each Cast's films (a badge on the card) — from the Gallery, read once it's loaded.
  const gallery = useSyncExternalStore(subscribeGallery, getGalleryCache, () => EMPTY_GALLERY);
  useEffect(() => {
    void initGalleryStore();
  }, []);
  const filmCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of gallery) {
      if (entry.derivedKind === 'film' && entry.status === 'completed' && entry.characterId) {
        counts.set(entry.characterId, (counts.get(entry.characterId) ?? 0) + 1);
      }
    }
    return counts;
  }, [gallery]);

  // Search and sort once the roster is more than a glance.
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');
  const searchable = characters.length > 4;
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = needle
      ? characters.filter(character =>
          [character.name, character.descriptor].some(text => text?.toLowerCase().includes(needle))
        )
      : [...characters];
    return matching.sort((a, b) =>
      sort === 'name'
        ? (a.name ?? '').localeCompare(b.name ?? '')
        : (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    );
  }, [characters, query, sort]);

  const forgetCharacter = async (id: string) => {
    const character = characters.find(entry => entry.id === id);
    const name = character?.name?.trim() || 'this character';
    if (
      !(await confirmAction({
        title: `Remove ${name} from the cast?`,
        body: 'Their looks go with them. Gallery stills stay in the Gallery.',
        confirmLabel: 'Remove',
        tone: 'danger',
      }))
    ) {
      return;
    }
    const { roleplaySessionId } = forgetCharacterRecord(id);
    if (roleplaySessionId) {
      deleteRoleplayLibrarySession(roleplaySessionId);
    }
    if (detailsId === id) {
      setDetailsId(null);
    }
  };

  // Film's create form shows while no Cast is picked: put the current one down and open it there.
  const startNewCharacter = () => {
    putDownActiveCast();
    router.push(NEW_CAST_MEMBER_HREF);
  };

  const applyAndStartFilm = (id: string) => {
    const character = characters.find(entry => entry.id === id);
    if (!character) {
      return;
    }
    applyCharacter(character);
    router.push(playCampaignHref(id));
  };

  const applyAndOpenHome = (id: string) => {
    const character = characters.find(entry => entry.id === id);
    if (!character) {
      return;
    }
    applyCharacter(character);
    router.push(characterHomeHref(id));
  };

  const applyAndTryOn = (id: string) => {
    const character = characters.find(entry => entry.id === id);
    if (!character) {
      return;
    }
    applyCharacter(character);
    router.push(`/fitting?character=${encodeURIComponent(id)}`);
  };

  const applyAndPlanDay = (id: string) => {
    const character = characters.find(entry => entry.id === id);
    if (!character) {
      return;
    }
    applyCharacter(character);
    router.push(`/day?character=${encodeURIComponent(id)}`);
  };

  const applyAndGenerate = (id: string) => {
    const character = characters.find(entry => entry.id === id);
    if (!character) {
      return;
    }
    applyCharacter(character);
    router.push('/character');
  };

  return (
    <ToolLayout
      accent="sky"
      width="full"
      title="Characters"
      description="Everyone you make films with."
      // The page's own actions in its header (they were a "Film loop" card and a "Cast files"
      // section of their own — 2026-11-05).
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          {filmLead ? (
            <Button
              size="sm"
              variant="primary"
              data-testid="cast-roster-start-film"
              onClick={() => applyAndStartFilm(filmLead.id)}
            >
              {`Start a film with ${filmLead.name?.trim() || 'this character'}`}
            </Button>
          ) : null}
          {characters.length > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              data-testid="cast-roster-new-character"
              onClick={startNewCharacter}
            >
              New character
            </Button>
          ) : null}
          <CastImportButton />
        </div>
      }
    >
      {characters.length === 0 ? (
        <EmptyState
          icon="catalog"
          title="No characters yet"
          description="A Cast lead is the person your films follow. Create one on Film — or save one from Story."
          action={{ label: 'Create a Cast lead', href: '/play?new=1' }}
        />
      ) : (
        <section className="space-y-3" data-testid="cast-roster" aria-label="Roster">
          {searchable ? (
            <div className="flex flex-wrap items-center gap-2">
              <TextInput
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={`Search ${characters.length} characters`}
                aria-label="Search characters"
                className="max-w-xs"
                data-testid="cast-roster-search"
              />
              <select
                className="ui-select h-9 w-auto"
                value={sort}
                aria-label="Sort characters"
                data-testid="cast-roster-sort"
                onChange={event => setSort(event.target.value === 'name' ? 'name' : 'recent')}
              >
                <option value="recent">Recently changed</option>
                <option value="name">Name</option>
              </select>
            </div>
          ) : null}
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {shown.map(character => {
              const looks = looksOf(character);
              const trigger = loraTriggerFromCharacter(character);
              const detailsOpen = detailsId === character.id;
              const plateUrl = missingPlates.has(character.id)
                ? undefined
                : castPlateThumbUrl(character);
              const films = filmCounts.get(character.id) ?? 0;
              const readiness = castRosterReadinessLine({
                lookCount: looks.length,
                hasPlate: Boolean(plateUrl),
                trigger,
                loraCount: character.loraLibraryIds?.length ?? 0,
              });
              return (
                <li
                  key={character.id}
                  className="ui-card flex min-w-0 flex-col overflow-hidden"
                  data-testid={`cast-roster-card-${character.id}`}
                >
                  {/* The plate fills the card; a click opens their page. */}
                  <Button
                    variant="plain"
                    aria-label={`Open ${character.name}`}
                    className="relative block aspect-[3/4] w-full overflow-hidden bg-[var(--bg-muted)]"
                    onClick={() => applyAndOpenHome(character.id)}
                  >
                    {plateUrl ? (
                      <span
                        className="block h-full w-full"
                        data-testid={`cast-roster-plate-${character.id}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- cast identity plate preview */}
                        <img
                          src={plateUrl}
                          alt=""
                          className="h-full w-full object-cover object-top"
                          onError={() =>
                            setMissingPlates(previous => new Set(previous).add(character.id))
                          }
                        />
                      </span>
                    ) : (
                      <span
                        className="flex h-full w-full flex-col items-center justify-center gap-1 border-b border-dashed border-[var(--border-subtle)] text-center"
                        data-testid={`cast-roster-no-plate-${character.id}`}
                      >
                        <span className="text-3xl font-semibold text-[var(--text-muted)]">
                          {(character.name?.trim() || '?').slice(0, 1).toUpperCase()}
                        </span>
                        <span className="type-caption text-[var(--tint-warning-text,var(--text-muted))]">
                          No plate
                        </span>
                      </span>
                    )}
                    {films ? (
                      <span
                        className="absolute bottom-1.5 left-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[11px] text-white"
                        data-testid={`cast-roster-films-${character.id}`}
                      >
                        ▶ {films} {films === 1 ? 'film' : 'films'}
                      </span>
                    ) : null}
                    {character.id === activeCharacterId ? (
                      <span className="absolute right-1.5 top-1.5 rounded bg-[var(--accent)] px-1.5 py-0.5 text-[11px] font-medium text-white">
                        On Film
                      </span>
                    ) : null}
                  </Button>
                  <div className="min-w-0 flex-1 space-y-0.5 px-3 pt-2">
                    <p className="type-heading truncate">{character.name}</p>
                    <p
                      className={
                        readiness.noPlate
                          ? 'type-caption truncate text-[var(--tint-warning-text,var(--text-muted))]'
                          : 'type-caption truncate text-[var(--text-muted)]'
                      }
                      data-testid={`cast-roster-readiness-${character.id}`}
                    >
                      {readiness.line}
                    </p>
                    {character.descriptor && !detailsOpen ? (
                      <p className="type-caption line-clamp-1" title={character.descriptor}>
                        {character.descriptor}
                      </p>
                    ) : null}
                  </div>
                  {detailsOpen ? (
                    <div
                      className="mx-3 mt-2 space-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 px-3 py-2"
                      data-testid={`cast-roster-details-${character.id}`}
                    >
                      {character.descriptor ? (
                        <div>
                          <p className="type-overline text-[var(--text-muted)]">Look</p>
                          <p className="type-caption text-[var(--text-secondary)]">
                            {character.descriptor}
                          </p>
                        </div>
                      ) : null}
                      {character.hints?.trim() ? (
                        <div>
                          <p className="type-overline text-[var(--text-muted)]">Hints</p>
                          <p className="type-caption text-[var(--text-secondary)]">
                            {character.hints.trim()}
                          </p>
                        </div>
                      ) : null}
                      {character.bio?.personality?.trim() || character.bio?.look?.trim() ? (
                        <div>
                          <p className="type-overline text-[var(--text-muted)]">Story bio</p>
                          <p className="type-caption text-[var(--text-secondary)]">
                            {[character.bio?.look?.trim(), character.bio?.personality?.trim()]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                      ) : null}
                      {character.lockedWardrobeId?.trim() ? (
                        <p className="type-caption text-[var(--text-muted)]">
                          Wardrobe lock · {character.lockedWardrobeId.trim()}
                        </p>
                      ) : null}
                      {!character.descriptor &&
                      !character.hints?.trim() &&
                      !character.bio?.personality?.trim() &&
                      !character.bio?.look?.trim() &&
                      !character.lockedWardrobeId?.trim() ? (
                        <p className="type-caption text-[var(--text-muted)]">
                          No identity notes yet — open home to add looks and plates.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-1.5 p-3 pt-2">
                    <Button
                      size="sm"
                      variant="primary"
                      data-testid={`cast-roster-open-home-${character.id}`}
                      onClick={() => applyAndOpenHome(character.id)}
                    >
                      Open
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      data-testid={`cast-roster-start-film-${character.id}`}
                      onClick={() => applyAndStartFilm(character.id)}
                    >
                      Start a film
                    </Button>
                    {/* One clear action plus the next step; the rest in a menu (7 buttons per
                        card read as clutter — UI review 2026-10-15). */}
                    <ActionMenu
                      label="⋯"
                      caret={false}
                      summaryAriaLabel={`More for ${character.name}`}
                      summaryClassName="ui-btn-ghost ui-btn-sm"
                      testId={`cast-roster-more-${character.id}`}
                    >
                      <button
                        type="button"
                        className={ACTION_MENU_ITEM_CLASS}
                        onClick={() => applyAndTryOn(character.id)}
                      >
                        Try on outfits
                      </button>
                      <button
                        type="button"
                        className={ACTION_MENU_ITEM_CLASS}
                        onClick={() => applyAndPlanDay(character.id)}
                      >
                        Open Short
                      </button>
                      <button
                        type="button"
                        className={ACTION_MENU_ITEM_CLASS}
                        onClick={() => applyAndGenerate(character.id)}
                      >
                        Generate a picture
                      </button>
                      <button
                        type="button"
                        className={ACTION_MENU_ITEM_CLASS}
                        data-testid={`cast-roster-details-toggle-${character.id}`}
                        aria-expanded={detailsOpen}
                        onClick={() =>
                          setDetailsId(current => (current === character.id ? null : character.id))
                        }
                      >
                        {detailsOpen ? 'Hide details' : 'Details'}
                      </button>
                      <button
                        type="button"
                        className={ACTION_MENU_DANGER_ITEM_CLASS}
                        onClick={() => forgetCharacter(character.id)}
                      >
                        Remove from cast…
                      </button>
                    </ActionMenu>
                  </div>
                </li>
              );
            })}
            <li>
              <Button
                variant="plain"
                className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--accent-border)] hover:text-[var(--text-primary)]"
                data-testid="cast-roster-new-card"
                onClick={startNewCharacter}
              >
                <span aria-hidden className="text-3xl">
                  +
                </span>
                <span className="type-label">New character</span>
              </Button>
            </li>
          </ul>
          {shown.length === 0 ? (
            <p className="type-caption text-[var(--text-muted)]">No one matches “{query}”.</p>
          ) : null}
          <p className="type-caption text-[var(--text-muted)]">
            Import moves a character from another install, or brings back a backup (Export is on
            each character&apos;s page) — picture, looks, bible, story and Day plan; stills stay in
            the gallery they were made in.
          </p>
        </section>
      )}
    </ToolLayout>
  );
}
