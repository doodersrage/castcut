'use client';

import CharacterOsPicker from '@/components/shared-tool-controls/CharacterOsPicker';
import { ToolSection } from '@/components/ui/ToolPageShell';
import type { SharedToolSettings } from '@/lib/settings-cache';

export type FittingCharacterSectionProps = {
  shared: SharedToolSettings;
  characterHints?: string;
  onApply: (patch: Partial<SharedToolSettings>) => void;
  onError: (message: string) => void;
};

export default function FittingCharacterSection({
  shared,
  characterHints,
  onApply,
  onError,
}: FittingCharacterSectionProps) {
  return (
    <ToolSection
      title="Character"
      description="Who tries the clothes on — the same Cast member as Day and Story."
      data-testid="fitting-character"
    >
      <CharacterOsPicker
        shared={shared}
        hints={characterHints}
        onApply={patch => {
          try {
            onApply(patch);
          } catch (err) {
            onError(err instanceof Error ? err.message : 'Could not apply that character.');
          }
        }}
      />
    </ToolSection>
  );
}
