'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextArea, TextInput } from '@/components/ui/Field';
import {
  MAX_ROLEPLAY_SCENE_BLURB,
  MAX_ROLEPLAY_SCENE_TITLE,
  normalizeRoleplaySceneText,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';

/**
 * Inline editor for a scene already in the reel: its title and what happens. A scene could only
 * be taken back and picked again, which loses its place in the story and everything after it.
 */
export default function StoryBeatTextEditor({
  beat,
  disabled = false,
  onSave,
  onCancel,
}: {
  beat: Pick<RoleplayStoryBeat, 'title' | 'blurb'>;
  /** The scene is being written or queued — its text cannot change under the job. */
  disabled?: boolean;
  /** False keeps the editor open (the save was refused). */
  onSave: (text: { title: string; blurb: string }) => boolean;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(beat.title);
  const [blurb, setBlurb] = useState(beat.blurb);
  const next = normalizeRoleplaySceneText({ title, blurb }, beat.title);
  return (
    <form
      className="space-y-2"
      data-testid="story-beat-editor"
      onSubmit={event => {
        event.preventDefault();
        if (next && !disabled && onSave(next)) {
          onCancel();
        }
      }}
    >
      <TextInput
        value={title}
        disabled={disabled}
        maxLength={MAX_ROLEPLAY_SCENE_TITLE}
        aria-label="Scene title"
        data-testid="story-beat-edit-title"
        onChange={event => setTitle(event.target.value)}
      />
      <TextArea
        rows={3}
        value={blurb}
        disabled={disabled}
        maxLength={MAX_ROLEPLAY_SCENE_BLURB}
        aria-label="What happens in this scene"
        data-testid="story-beat-edit-text"
        onChange={event => setBlurb(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          size="sm"
          variant="primary"
          disabled={disabled || !next}
          data-testid="story-beat-edit-save"
        >
          Save scene
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          data-testid="story-beat-edit-cancel"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
      <p className="type-caption text-[var(--text-muted)]">
        Say what she does and where. The still is written again from this text; the one you have
        stays as a take.
      </p>
    </form>
  );
}
