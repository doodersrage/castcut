'use client';

import { Button } from '@/components/ui/Button';
import type { RoleplayCastSectionProps } from '@/components/roleplay/roleplay-cast-section-types';

/** Story actions that stay on Story — bible rewrite/edit/clear live on Cast. */
export function RoleplayCastActionsSection({
  busy,
  story,
  storyPhase,
  onRestartStory,
}: Pick<RoleplayCastSectionProps, 'busy' | 'story' | 'storyPhase' | 'onRestartStory'>) {
  if (story.length === 0 || storyPhase === 'complete') {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="ghost" disabled={busy} onClick={onRestartStory}>
        Restart story
      </Button>
    </div>
  );
}
