'use client';

import { Button } from '@/components/ui/Button';
import { ToolSection } from '@/components/ui/ToolPageShell';
import type { useCharacterHomeOrchestration } from '@/hooks/useCharacterHomeOrchestration';

type CharacterLooksSectionProps = Pick<
  ReturnType<typeof useCharacterHomeOrchestration>,
  | 'character'
  | 'looks'
  | 'lookName'
  | 'setLookName'
  | 'persistApply'
  | 'activateLook'
  | 'removeLook'
  | 'addLookFromShared'
  | 'loadSettingsCache'
>;

export default function CharacterLooksSection({
  character,
  looks,
  lookName,
  setLookName,
  persistApply,
  activateLook,
  removeLook,
  addLookFromShared,
  loadSettingsCache,
}: CharacterLooksSectionProps) {
  if (!character) {
    return null;
  }

  return (
    <ToolSection
      title="Looks"
      description="Switching a look keeps the others. Save the current settings as a new look."
    >
      <ul className="ui-list">
        {looks.map(look => {
          const active = look.id === character.activeLookId;
          return (
            <li key={look.id} className="ui-list-row items-center">
              <div className="ui-list-primary min-w-0">
                <p className="type-heading">
                  {look.name}
                  {active ? ' · active' : ''}
                </p>
                <p className="type-caption line-clamp-2 text-[var(--text-muted)]">
                  {look.descriptor || look.hints || look.lockedWardrobeId || 'Session lock'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {active ? null : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const next = activateLook(character.id, look.id);
                      persistApply(next);
                    }}
                  >
                    Use
                  </Button>
                )}
                {looks.length > 1 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const next = removeLook(character.id, look.id);
                      persistApply(next);
                    }}
                  >
                    Drop
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <input
          value={lookName}
          onChange={event => setLookName(event.target.value)}
          placeholder="New look name — bob, winter coat…"
          className="ui-input min-w-[12rem] flex-1 px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
          aria-label="New look name"
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            const next = addLookFromShared(
              character.id,
              loadSettingsCache().shared,
              lookName.trim() || `Look ${looks.length + 1}`
            );
            persistApply(next);
            setLookName('');
          }}
        >
          Save current as look
        </Button>
      </div>
    </ToolSection>
  );
}
