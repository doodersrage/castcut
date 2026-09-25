'use client';

import { Button, ButtonLink } from '@/components/ui/Button';
import { ToolActionRow } from '@/components/ui/ToolPageShell';
import type { useCharacterHomeOrchestration } from '@/hooks/useCharacterHomeOrchestration';

type CharacterHomeActionRowProps = Pick<
  ReturnType<typeof useCharacterHomeOrchestration>,
  'character' | 'go' | 'playCampaignHref' | 'removeFromCast' | 'continueRoleplay'
>;

export default function CharacterHomeActionRow({
  character,
  go,
  playCampaignHref,
  removeFromCast,
  continueRoleplay,
}: CharacterHomeActionRowProps) {
  if (!character) {
    return null;
  }

  return (
    <div className="space-y-3" data-testid="character-home-actions">
      <ToolActionRow>
        <Button
          size="sm"
          variant="primary"
          data-testid="character-home-start-film"
          onClick={() => go(playCampaignHref(character.id))}
        >
          Start a film
        </Button>
      </ToolActionRow>
      <div data-testid="character-home-continue">
        <p className="type-caption mb-2 text-[var(--text-muted)]">
          Continue with this character in
        </p>
        <ToolActionRow>
          <Button
            size="sm"
            variant="secondary"
            data-testid="character-home-look"
            onClick={() => go(`/moodboard?character=${character.id}`)}
          >
            Open Look
          </Button>
          <Button
            size="sm"
            variant="secondary"
            data-testid="character-home-outfit"
            onClick={() => go(`/fitting?character=${character.id}`)}
          >
            Outfit
          </Button>
          <Button
            size="sm"
            variant="secondary"
            data-testid="character-home-day"
            onClick={() => go(`/day?character=${character.id}`)}
          >
            Open Day
          </Button>
          <Button
            size="sm"
            variant="secondary"
            data-testid="character-home-story"
            onClick={continueRoleplay}
          >
            Story
          </Button>
        </ToolActionRow>
      </div>
      <details>
        <summary className="type-caption cursor-pointer text-[var(--text-muted)]">More</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => go('/character')}>
            Generate
          </Button>
          <Button size="sm" variant="ghost" onClick={() => go('/video')}>
            Video
          </Button>
          <ButtonLink href={`/gallery?character=${encodeURIComponent(character.id)}`} size="sm">
            Open in Gallery
          </ButtonLink>
          <ButtonLink href="/characters" size="sm" variant="ghost">
            All characters
          </ButtonLink>
          <Button size="sm" variant="ghost" onClick={removeFromCast}>
            Remove from cast
          </Button>
        </div>
      </details>
    </div>
  );
}
