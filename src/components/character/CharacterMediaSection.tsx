'use client';

import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/ViewState';
import { SegmentedControl, ToolActionRow, ToolSection } from '@/components/ui/ToolPageShell';
import { FieldError } from '@/components/ui/Field';
import { galleryEntryPrimaryMediaKind } from '@/lib/comfyui-gallery';
import { remixDayFilmHref } from '@/lib/play-starter';
import { isGalleryClipEntry } from '@/lib/roleplay-film';
import CharacterMediaTile from '@/components/character/CharacterMediaTile';
import type { useCharacterHomeOrchestration } from '@/hooks/useCharacterHomeOrchestration';

type CharacterMediaSectionProps = Pick<
  ReturnType<typeof useCharacterHomeOrchestration>,
  | 'character'
  | 'mediaTab'
  | 'setMediaTab'
  | 'entries'
  | 'stillEntries'
  | 'clipEntries'
  | 'filmEntries'
  | 'keepers'
  | 'visible'
  | 'lastClip'
  | 'currentLook'
  | 'continueError'
  | 'go'
  | 'extendReel'
  | 'continueRoleplay'
  | 'animateStill'
  | 'toggleKeeper'
  | 'removeFromCharacter'
  | 'continueClipActionLabel'
  | 'loadEngineSettings'
  | 'galleryEntryPrimaryViewUrl'
>;

export default function CharacterMediaSection({
  character,
  mediaTab,
  setMediaTab,
  entries,
  stillEntries,
  clipEntries,
  filmEntries,
  keepers,
  visible,
  lastClip,
  currentLook,
  continueError,
  go,
  extendReel,
  continueRoleplay,
  animateStill,
  toggleKeeper,
  removeFromCharacter,
  continueClipActionLabel,
  loadEngineSettings,
  galleryEntryPrimaryViewUrl,
}: CharacterMediaSectionProps) {
  if (!character) {
    return null;
  }

  return (
    <ToolSection
      title="Media"
      description={
        mediaTab === 'clips'
          ? 'Playable reel. Continue labels Extend / last-frame / Stitch by engine.'
          : mediaTab === 'films'
            ? 'Assembled Day / Story films stamped on this character.'
            : 'Jobs stamped with this character.'
      }
      data-testid="cast-media"
    >
      <SegmentedControl
        aria-label="Character media"
        value={mediaTab}
        onChange={setMediaTab}
        options={[
          { value: 'all', label: `All (${entries.length})` },
          {
            value: 'stills',
            label: `Stills (${stillEntries.length})`,
          },
          {
            value: 'clips',
            label: `Clips (${clipEntries.length})`,
          },
          {
            value: 'films',
            label: `Films (${filmEntries.length})`,
          },
          { value: 'keepers', label: `Keepers (${keepers.length})` },
        ]}
      />
      {mediaTab === 'clips' || mediaTab === 'films' || mediaTab === 'all' ? (
        <ToolActionRow>
          {mediaTab === 'films' ? (
            <ButtonLink
              href="#character-film-studio"
              size="sm"
              variant="secondary"
              data-testid="cast-open-film-studio"
            >
              Open Film studio
            </ButtonLink>
          ) : null}
          {mediaTab !== 'films' && lastClip ? (
            <Button size="sm" variant="primary" onClick={extendReel}>
              {(() => {
                const label = continueClipActionLabel({
                  parentUrl: galleryEntryPrimaryViewUrl(lastClip),
                  engine: loadEngineSettings().engine,
                });
                if (label === 'Extend clip') return 'Extend reel';
                if (label === 'Stitch continue') return 'Stitch continue reel';
                return 'Continue reel';
              })()}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            data-testid="cast-continue-roleplay"
            onClick={continueRoleplay}
          >
            Continue in Story
          </Button>
        </ToolActionRow>
      ) : null}
      {continueError ? <FieldError>{continueError}</FieldError> : null}
      {visible.length === 0 ? (
        mediaTab === 'films' ? (
          <div className="space-y-3" data-testid="cast-films-empty">
            <EmptyState
              compact
              icon="inbox"
              title="No films yet"
              description="Cut a Day film for this cast, or remix the same look with fresh stills."
              action={{
                label: 'Same look, new Day',
                href: remixDayFilmHref(character.id),
              }}
            />
            <ToolActionRow>
              <ButtonLink
                href={`/day?character=${encodeURIComponent(character.id)}`}
                size="sm"
                variant="secondary"
              >
                Open Day
              </ButtonLink>
              <ButtonLink href="#character-film-studio" size="sm" variant="ghost">
                Open Film studio
              </ButtonLink>
            </ToolActionRow>
          </div>
        ) : (
          <EmptyState
            compact
            icon="inbox"
            title="Nothing stamped yet"
            description="Queue from Generate, Story, or Video with this character active. Older stills stay untagged."
            action={{ label: 'Generate as this character', onClick: () => go('/character') }}
          />
        )
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {visible.map(entry => (
            <CharacterMediaTile
              key={entry.id}
              entry={entry}
              characterId={character.id}
              kept={keepers.some(keeper => keeper.id === entry.id)}
              onToggleKeeper={currentLook ? () => toggleKeeper(entry.id) : undefined}
              onAnimateStill={
                !isGalleryClipEntry({
                  ...entry,
                  mediaKind: galleryEntryPrimaryMediaKind(entry),
                }) && entry.status === 'completed'
                  ? () => animateStill(entry)
                  : undefined
              }
              onRemoveFromCharacter={() => removeFromCharacter(entry)}
            />
          ))}
        </ul>
      )}
    </ToolSection>
  );
}
