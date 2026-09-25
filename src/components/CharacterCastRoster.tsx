'use client';

import { castPlateThumbUrl } from '@/lib/cast-plate-thumb';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/ViewState';
import { ToolBadge, ToolLayout, ToolSection } from '@/components/ui/ToolPageShell';
import { whenBrowserStorageReady } from '@/lib/browser-storage';
import {
  applyCharacterRecord,
  characterHomeHref,
  getCharactersSnapshot,
  getServerCharactersSnapshot,
  looksOf,
  loraTriggerFromCharacter,
  forgetCharacterRecord,
  migrateCharactersFromLegacy,
  subscribeCharacters,
  type CharacterRecord,
} from '@/lib/character-os';
import { castRosterReadinessLine } from '@/lib/cast-home-status';
import {
  listSavedIdentityBundles,
  loadSettingsCache,
  saveSharedSettings,
} from '@/lib/settings-cache';
import {
  deleteRoleplayLibrarySession,
  roleplaySessionsForCharacterSync,
} from '@/lib/roleplay-library';

function applyCharacter(character: CharacterRecord) {
  saveSharedSettings({
    ...loadSettingsCache().shared,
    ...applyCharacterRecord(character),
  });
}

export default function CharacterCastRoster() {
  const router = useRouter();
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const characters = useSyncExternalStore(
    subscribeCharacters,
    getCharactersSnapshot,
    getServerCharactersSnapshot
  );

  useEffect(() => {
    let cancelled = false;
    void whenBrowserStorageReady().then(() => {
      if (cancelled) {
        return;
      }
      migrateCharactersFromLegacy({
        bundles: listSavedIdentityBundles(),
        roleplaySessions: roleplaySessionsForCharacterSync(),
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const forgetCharacter = (id: string) => {
    const character = characters.find(entry => entry.id === id);
    const name = character?.name?.trim() || 'this character';
    if (
      !window.confirm(
        `Remove ${name} from the cast? Looks on this record go with it. Gallery stills stay in the gallery.`
      )
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
      width="wide"
      badge={<ToolBadge accent="sky">Cast</ToolBadge>}
      title="Characters"
      description="The character is the project. Open a home for looks, stills, clips, and LoRA — or start a film."
    >
      {characters.length > 0 ? (
        <ToolSection title="Film loop" description="Guided Look → Outfit → Day → Story.">
          <ButtonLink href="/play" size="sm" variant="primary">
            Start a film
          </ButtonLink>
        </ToolSection>
      ) : null}
      {characters.length === 0 ? (
        <EmptyState
          icon="catalog"
          title="No characters yet"
          description="Create a Cast lead on Film to start the loop. Story Save to Cast and Generate looks remain optional paths; identity bundles migrate in automatically."
          action={{ label: 'Create on Film', href: '/play' }}
        />
      ) : (
        <ToolSection title="Roster" description={`${characters.length} saved`}>
          <ul className="grid gap-3 sm:grid-cols-2">
            {characters.map(character => {
              const looks = looksOf(character);
              const trigger = loraTriggerFromCharacter(character);
              const detailsOpen = detailsId === character.id;
              const plateUrl = castPlateThumbUrl(character);
              const readiness = castRosterReadinessLine({
                lookCount: looks.length,
                hasPlate: Boolean(plateUrl),
                trigger,
                loraCount: character.loraLibraryIds?.length ?? 0,
              });
              return (
                <li key={character.id} className="ui-card space-y-3 p-[var(--card-padding)]">
                  <div className="flex gap-3">
                    {plateUrl ? (
                      <div
                        className="h-20 w-16 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40"
                        data-testid={`cast-roster-plate-${character.id}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- cast identity plate preview */}
                        <img
                          src={plateUrl}
                          alt=""
                          className="h-full w-full object-cover object-top"
                        />
                      </div>
                    ) : (
                      <div
                        className="flex h-20 w-16 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 px-1 text-center"
                        data-testid={`cast-roster-no-plate-${character.id}`}
                      >
                        <span className="type-caption text-[var(--tint-warning-text,var(--text-muted))]">
                          No plate
                        </span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="type-heading">{character.name}</p>
                      <p
                        className={
                          readiness.noPlate
                            ? 'type-caption text-[var(--tint-warning-text,var(--text-muted))]'
                            : 'type-caption text-[var(--text-muted)]'
                        }
                        data-testid={`cast-roster-readiness-${character.id}`}
                      >
                        {readiness.line}
                      </p>
                      {character.descriptor && !detailsOpen ? (
                        <p className="type-caption line-clamp-2">{character.descriptor}</p>
                      ) : null}
                    </div>
                  </div>
                  {detailsOpen ? (
                    <div
                      className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 px-3 py-2"
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
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      data-testid={`cast-roster-open-home-${character.id}`}
                      onClick={() => applyAndOpenHome(character.id)}
                    >
                      Open home
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => applyAndTryOn(character.id)}
                    >
                      Outfit
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => applyAndPlanDay(character.id)}
                    >
                      Open Day
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => applyAndGenerate(character.id)}
                    >
                      Generate
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      data-testid={`cast-roster-details-toggle-${character.id}`}
                      aria-expanded={detailsOpen}
                      onClick={() =>
                        setDetailsId(current => (current === character.id ? null : character.id))
                      }
                    >
                      {detailsOpen ? 'Hide details' : 'Details'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => forgetCharacter(character.id)}>
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </ToolSection>
      )}
    </ToolLayout>
  );
}
