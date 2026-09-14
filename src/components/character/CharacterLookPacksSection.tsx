'use client';

import { Button, ButtonLink } from '@/components/ui/Button';
import { ToolSection } from '@/components/ui/ToolPageShell';
import type { useCharacterHomeOrchestration } from '@/hooks/useCharacterHomeOrchestration';

type CharacterLookPacksSectionProps = Pick<
  ReturnType<typeof useCharacterHomeOrchestration>,
  | 'character'
  | 'savedLookPacks'
  | 'lookPackFileRef'
  | 'lookPackStatus'
  | 'importLookPack'
  | 'playCampaignHref'
  | 'go'
  | 'saveLookPack'
  | 'lookPackFittingHref'
  | 'lookPackDayHref'
  | 'downloadLookPackFile'
  | 'removeCharacterLookPack'
>;

export default function CharacterLookPacksSection({
  character,
  savedLookPacks,
  lookPackFileRef,
  lookPackStatus,
  importLookPack,
  playCampaignHref,
  go,
  saveLookPack,
  lookPackFittingHref,
  lookPackDayHref,
  downloadLookPackFile,
  removeCharacterLookPack,
}: CharacterLookPacksSectionProps) {
  if (!character) {
    return null;
  }

  return (
    <ToolSection
      title="Saved look packs"
      description="Reuse Look vibes without re-running vision extract. Export JSON to share a look."
    >
      <input
        ref={lookPackFileRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) {
            importLookPack(file);
          }
        }}
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => lookPackFileRef.current?.click()}>
          Import look pack
        </Button>
        <ButtonLink href={playCampaignHref(character.id)} size="sm" variant="ghost">
          Start a film
        </ButtonLink>
      </div>
      {lookPackStatus ? (
        <p className="type-caption mb-3 text-[var(--text-muted)]">{lookPackStatus}</p>
      ) : null}
      {savedLookPacks.length === 0 ? (
        <p className="type-caption text-[var(--text-muted)]">
          No saved packs yet — extract a look on Look and Save on Cast, or import JSON.
        </p>
      ) : (
        <ul className="ui-list">
          {savedLookPacks.map(entry => (
            <li key={entry.id} className="ui-list-row items-center">
              <div className="ui-list-primary min-w-0">
                <p className="type-heading">{entry.name}</p>
                <p className="type-caption text-[var(--text-muted)]">
                  {new Date(entry.savedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    saveLookPack(entry.pack);
                    go(lookPackFittingHref(entry.pack));
                  }}
                >
                  Outfit
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    saveLookPack(entry.pack);
                    go(lookPackDayHref(entry.pack));
                  }}
                >
                  Day
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    downloadLookPackFile({
                      pack: entry.pack,
                      name: entry.name,
                      id: entry.id,
                    })
                  }
                >
                  Export
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeCharacterLookPack(character.id, entry.id)}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </ToolSection>
  );
}
