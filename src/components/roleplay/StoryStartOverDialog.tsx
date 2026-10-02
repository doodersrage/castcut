'use client';

import { useEffect, useId } from 'react';
import { Button } from '@/components/ui/Button';
import ModalPortal from '@/components/ui/ModalPortal';
import type { StoryStartOverChoice } from '@/hooks/roleplay/useStoryStartOver';
import { roleplayRestartNotice } from '@/lib/roleplay';

/**
 * "Start the story over", asked in the page: keep the character's bible, or have a new one
 * written for the same Cast lead. A browser confirm can only say yes or no; starting over now
 * has two ways to go on.
 */
export default function StoryStartOverDialog({
  open,
  sceneCount,
  leadName,
  onResolve,
}: {
  open: boolean;
  /** Scenes in the reel that starting over clears. */
  sceneCount: number;
  /** The Cast lead, for the button labels. */
  leadName?: string;
  onResolve: (choice: StoryStartOverChoice) => void;
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onResolve('cancel');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onResolve, open]);
  if (!open) return null;
  const name = leadName?.trim();
  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--bg-base)]/70 p-4 backdrop-blur-sm"
        role="presentation"
        onClick={() => onResolve('cancel')}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-testid="story-start-over-dialog"
          className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
          onClick={event => event.stopPropagation()}
        >
          <h2 id={titleId} className="type-heading">
            Start the story over?
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            {sceneCount > 0 ? `${roleplayRestartNotice(sceneCount)} ` : ''}
            Keep {name ? `${name}’s` : 'the character’s'} bible and pick a new first scene, or have
            a new bible written for {name || 'the same Cast lead'} with the tone and settings as
            they are now — the story then opens with a new first still.
          </p>
          {/* Stacked and full width: three choices side by side wrap unevenly on a phone. */}
          <div className="grid gap-2">
            <Button
              variant="primary"
              className="w-full justify-center"
              data-testid="story-start-over-keep"
              onClick={() => onResolve('keep-bible')}
            >
              Keep the bible
            </Button>
            <Button
              variant="secondary"
              className="w-full justify-center"
              data-testid="story-start-over-new-bible"
              onClick={() => onResolve('new-bible')}
            >
              Write a new bible
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-center"
              data-testid="story-start-over-cancel"
              onClick={() => onResolve('cancel')}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
