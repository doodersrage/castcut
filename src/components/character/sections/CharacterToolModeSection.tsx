'use client';

import SceneFamilySwitcher from '@/components/SceneFamilySwitcher';
import { FieldDivider, FieldLabel } from '@/components/ui/Field';
import { ChipButton } from '@/components/ui/Field';
import { CHARACTER_SCENE_MODE_OPTIONS } from '@/hooks/useCharacterToolOrchestration';
import type { CharacterSceneMode } from '@/lib/settings/cache';

function defaultPortraitStyle(mode: CharacterSceneMode): 'portrait' | 'full-body' | 'action' {
  return mode === 'solo' ? 'portrait' : 'action';
}

type Props = {
  sceneMode: CharacterSceneMode;
  updateToolSettings: (patch: {
    sceneMode: CharacterSceneMode;
    portraitStyle: 'portrait' | 'full-body' | 'action';
  }) => void;
};

export function CharacterToolModeSection({ sceneMode, updateToolSettings }: Props) {
  return (
    <>
      <FieldLabel>Scene family</FieldLabel>
      <SceneFamilySwitcher />
      <FieldLabel>Scene mode</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {CHARACTER_SCENE_MODE_OPTIONS.map(option => (
          <ChipButton
            key={option.value}
            active={sceneMode === option.value}
            onClick={() =>
              updateToolSettings({
                sceneMode: option.value,
                portraitStyle: defaultPortraitStyle(option.value),
              })
            }
          >
            {option.label}
          </ChipButton>
        ))}
      </div>
      <FieldDivider />
    </>
  );
}
