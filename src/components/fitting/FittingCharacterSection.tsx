'use client';

import CharacterOsPicker from '@/components/CharacterOsPicker';
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
      description="Same Character OS id as Cast and Story — try-ons stamp that record."
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
