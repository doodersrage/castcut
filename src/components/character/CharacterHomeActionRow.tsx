'use client';

import { Button, ButtonLink } from '@/components/ui/Button';
import { ToolActionRow } from '@/components/ui/ToolPageShell';
import type { useCharacterHomeOrchestration } from '@/hooks/useCharacterHomeOrchestration';

type CharacterHomeActionRowProps = Pick<
  ReturnType<typeof useCharacterHomeOrchestration>,
  'character' | 'go' | 'playCampaignHref' | 'removeFromCast'
>;

export default function CharacterHomeActionRow({
  character,
  go,
  playCampaignHref,
  removeFromCast,
}: CharacterHomeActionRowProps) {
  if (!character) {
    return null;
  }

  return (
    <ToolActionRow>
      <Button size="sm" variant="primary" onClick={() => go(playCampaignHref(character.id))}>
        Start a film
      </Button>
      <Button size="sm" variant="primary" onClick={() => go('/character')}>
        Generate
      </Button>
      <Button size="sm" variant="secondary" onClick={() => go('/roleplay')}>
        Story
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => go(`/fitting?character=${character.id}`)}
      >
        Outfit
      </Button>
      <Button size="sm" variant="secondary" onClick={() => go(`/day?character=${character.id}`)}>
        Plan a day
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => go(`/moodboard?character=${character.id}`)}
      >
        Set look
      </Button>
      <Button size="sm" variant="secondary" onClick={() => go('/video')}>
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
    </ToolActionRow>
  );
}
