'use client';

import { Button } from '@/components/ui/Button';
import type { RoleplayCastSectionProps } from '@/components/roleplay/roleplay-cast-section-types';

export function RoleplayCastActionsSection({
  busy,
  bioLoading,
  bio,
  story,
  storyPhase,
  autoQueue,
  beatOutput,
  photoReady,
  onWriteBio,
  onOwnBibleOpenChange,
  onClearBio,
  onRestartStory,
}: Pick<
  RoleplayCastSectionProps,
  | 'busy'
  | 'bioLoading'
  | 'bio'
  | 'story'
  | 'storyPhase'
  | 'autoQueue'
  | 'beatOutput'
  | 'photoReady'
  | 'onWriteBio'
  | 'onOwnBibleOpenChange'
  | 'onClearBio'
  | 'onRestartStory'
>) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="primary"
        loading={bioLoading}
        loadingLabel={
          autoQueue
            ? beatOutput === 'clip'
              ? 'Writing bio and queueing clip'
              : 'Writing bio and queueing still'
            : 'Writing bio and still'
        }
        disabled={(busy && !bioLoading) || !photoReady}
        onClick={() => void onWriteBio()}
      >
        {bio ? 'Rewrite bio' : 'Write my bio'}
      </Button>
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => onOwnBibleOpenChange(open => !open)}
      >
        {bio ? 'Edit bible' : 'Use my own bible'}
      </Button>
      {bio ? (
        <Button variant="ghost" disabled={busy} onClick={onClearBio}>
          Clear bio
        </Button>
      ) : null}
      {story.length > 0 && storyPhase !== 'complete' ? (
        <Button variant="ghost" disabled={busy} onClick={onRestartStory}>
          Restart story
        </Button>
      ) : null}
    </div>
  );
}
