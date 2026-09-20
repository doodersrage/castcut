'use client';

import { Button } from '@/components/ui/Button';
import { SelectInput } from '@/components/ui/Field';
import { DAY_THEMES } from '@/lib/play-remix';

export type DayRemixMenuProps = {
  onNewOutfit: () => void;
  onTheme: (themeId: string) => void;
  /** Full-width stacked layout for the phone Day tool. */
  stacked?: boolean;
  disabled?: boolean;
  /** Prefix for data-testids so celebrate and standard placements stay distinct. */
  testIdPrefix: string;
};

/**
 * Extra remix options next to "Same look, new Day": keep this Day's plan with a new Outfit, or
 * re-run the same look with a themed Setting + Beat set.
 */
export default function DayRemixMenu({
  onNewOutfit,
  onTheme,
  stacked = false,
  disabled = false,
  testIdPrefix,
}: DayRemixMenuProps) {
  return (
    <>
      <Button
        size={stacked ? undefined : 'sm'}
        variant="secondary"
        className={stacked ? 'w-full justify-center' : undefined}
        disabled={disabled}
        data-testid={`${testIdPrefix}-new-outfit`}
        title="Keep this Day's settings and beats, then pick a new outfit on Outfit"
        onClick={onNewOutfit}
      >
        Same Day, new outfit
      </Button>
      <SelectInput
        aria-label="Themed day"
        className={stacked ? 'w-full' : 'w-auto'}
        disabled={disabled}
        data-testid={`${testIdPrefix}-theme`}
        value=""
        onChange={event => {
          const themeId = event.target.value;
          if (themeId) {
            onTheme(themeId);
          }
        }}
      >
        <option value="">Themed day…</option>
        {DAY_THEMES.map(theme => (
          <option key={theme.id} value={theme.id}>
            {theme.label} — {theme.hint}
          </option>
        ))}
      </SelectInput>
    </>
  );
}
