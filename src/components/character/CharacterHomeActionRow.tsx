'use client';

import { useEffect, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { loadPlayCampaignState } from '@/lib/play/campaign';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import { CastExportButton } from '@/components/cast/CastTransferControls';
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
  // A film already under way with this Cast: carry on with it ("Start a film" sat under a
  // header saying "Continue to Short").
  const [filmUnderWay, setFilmUnderWay] = useState(false);
  const characterId = character?.id;
  useEffect(() => {
    scheduleAfterCommit(() => {
      const campaign = loadPlayCampaignState();
      setFilmUnderWay(
        Boolean(campaign && campaign.characterId === characterId && !campaign.completedAt)
      );
    });
  }, [characterId]);
  if (!character) {
    return null;
  }

  return (
    // One row: the film, then this character's pages, then More — three stacked rows before
    // (a button, a caption, four buttons) under a checklist already marking the next step.
    <div className="space-y-2" data-testid="character-home-actions">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          data-testid="character-home-start-film"
          onClick={() => go(playCampaignHref(character.id))}
        >
          {filmUnderWay ? 'Continue the film' : 'Start a film'}
        </Button>
        <div
          className="flex flex-wrap items-center gap-2"
          data-testid="character-home-continue"
          role="group"
          aria-label="Open with this character"
        >
          <span className="type-caption ml-1 text-[var(--text-muted)]">or open in</span>
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
            Day
          </Button>
          <Button
            size="sm"
            variant="secondary"
            data-testid="character-home-scene"
            title="One shot, exactly as you want it — optional, outside the film's steps"
            onClick={() => go(`/scene?character=${character.id}`)}
          >
            Scene
          </Button>
          <Button
            size="sm"
            variant="secondary"
            data-testid="character-home-story"
            onClick={continueRoleplay}
          >
            Story
          </Button>
        </div>
      </div>
      <details>
        <summary className="type-caption cursor-pointer text-[var(--text-muted)]">More</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => go('/character')}>
            Character stills
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
          <CastExportButton characterId={character.id} />
          <Button size="sm" variant="ghost" onClick={removeFromCast}>
            Remove from cast
          </Button>
        </div>
      </details>
    </div>
  );
}
