'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Field';
import type { RoleplayScene } from '@/lib/roleplay';

/** A typed scene as a scene card: the first words are its title. */
export function ownSceneFromText(text: string): RoleplayScene | null {
  const blurb = text.replace(/\s+/g, ' ').trim();
  if (blurb.length < 4) return null;
  const words = blurb
    .replace(/[.!?…]+$/, '')
    .split(' ')
    .slice(0, 6)
    .join(' ');
  const title = `${words[0]!.toUpperCase()}${words.slice(1)}${blurb.split(' ').length > 6 ? '…' : ''}`;
  return { id: `own-${Date.now().toString(36)}`, title, blurb };
}

/**
 * "Or write what happens next" under the four scene cards. The cards were the only way forward:
 * a story could only go where the writer offered.
 */
export default function StoryOwnScene({
  disabled,
  ending,
  onPlay,
}: {
  disabled?: boolean;
  /** The story is at its ending: the typed scene closes it. */
  ending?: boolean;
  onPlay: (scene: RoleplayScene) => void;
}) {
  const [text, setText] = useState('');
  const scene = ownSceneFromText(text);
  return (
    <details
      className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2"
      data-testid="story-own-scene"
    >
      <summary className="flex min-h-8 cursor-pointer items-center text-sm text-[var(--text-secondary)]">
        {ending ? 'Or write your own ending' : 'Or write what happens next'}
      </summary>
      <div className="mt-2 space-y-2">
        <TextArea
          rows={2}
          value={text}
          disabled={disabled}
          maxLength={300}
          aria-label={ending ? 'Your own ending' : 'Your own scene'}
          data-testid="story-own-scene-text"
          placeholder="e.g. she misses the last ferry and talks her way onto a fishing boat"
          onChange={event => setText(event.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            disabled={disabled || !scene}
            data-testid="story-own-scene-play"
            onClick={() => {
              if (!scene) return;
              onPlay(scene);
              setText('');
            }}
          >
            {ending ? 'End the story this way' : 'Play this scene'}
          </Button>
          <span className="type-caption text-[var(--text-muted)]">
            One sentence is enough — say what she does and where.
          </span>
        </div>
      </div>
    </details>
  );
}
