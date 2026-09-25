'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { DEFAULT_MIN_FACE_MATCH, FACE_MATCH_WARN_BELOW } from '@/lib/face-match';
import { DEFAULT_MIN_POSE_MATCH } from '@/lib/pose-score';
import type { RoleplayStoryBeat } from '@/lib/roleplay';
import { storyFlaggedBeats } from '@/lib/roleplay-pose-check';

/**
 * "Retry N flagged": redo every beat whose still failed or missed its pose / face check, in reel
 * order — the beat cards already suggest Retry for each; this does them all in one tap.
 */
export default function StoryRetryFlagged({
  story,
  busy = false,
  fullWidth = false,
  onRetry,
}: {
  story: RoleplayStoryBeat[];
  busy?: boolean;
  fullWidth?: boolean;
  onRetry: (beat: RoleplayStoryBeat) => Promise<unknown>;
}) {
  const [running, setRunning] = useState(false);
  const flagged = storyFlaggedBeats(story, {
    minPose: DEFAULT_MIN_POSE_MATCH,
    minFace: DEFAULT_MIN_FACE_MATCH,
    warnFace: FACE_MATCH_WARN_BELOW,
  });
  if (flagged.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="story-retry-flagged">
      <Button
        size="sm"
        variant="secondary"
        disabled={busy || running}
        loading={running}
        loadingLabel="Retrying"
        className={fullWidth ? 'w-full justify-center' : undefined}
        data-testid="story-retry-flagged-button"
        onClick={() => {
          setRunning(true);
          void (async () => {
            try {
              // Sequential — the queue is single-flight.
              for (const beat of flagged) {
                await onRetry(beat);
              }
            } finally {
              setRunning(false);
            }
          })();
        }}
      >
        Retry {flagged.length} flagged
      </Button>
      <p className="type-caption text-[var(--text-muted)]">
        Failed stills and pose or face misses — each gets a fresh take.
      </p>
    </div>
  );
}
